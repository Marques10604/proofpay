import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction 
} from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { toast } from "sonner";
import { Buffer } from "buffer";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/LanguageContext";

const PROGRAM_ID = new PublicKey("FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i");
const DEVNET_USDC = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
const RELEASE_MILESTONE_DISCRIMINATOR = Buffer.from([56, 2, 199, 164, 184, 108, 167, 222]);
const OPEN_DISPUTE_DISCRIMINATOR = Buffer.from([137, 25, 99, 119, 23, 223, 161, 42]);

const EscrowMonitor = ({ onOpenDispute }: { onOpenDispute?: (pda: string, id: string) => void }) => {
  const { t } = useLanguage();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [escrows, setEscrows] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

  // Dispute Flow States
  const [disputeModal, setDisputeModal] = useState<{ isOpen: boolean; escrow?: any; loading: boolean; verdict?: any; timedOut?: boolean }>({ isOpen: false, loading: false });
  const [disputeReason, setDisputeReason] = useState("");

  const callOracleWithTimeout = async (escrowIdHex: string, evidence: string, disputedBy: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch("https://proofpay-oracle.onrender.com/oracle/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrow_id: escrowIdHex, evidence, disputed_by: disputedBy }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return await res.json();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") throw new Error("ORACLE_TIMEOUT");
      throw e;
    }
  };

  const retryOracleCall = async () => {
    if (!disputeModal.escrow || !publicKey) return;
    setDisputeModal(prev => ({ ...prev, loading: true, timedOut: false }));
    toast.info("Retrying Oracle...");
    try {
      const result = await callOracleWithTimeout(
        disputeModal.escrow.escrow_id_hex,
        disputeReason,
        publicKey.toString()
      );
      setDisputeModal(prev => ({ ...prev, loading: false, verdict: result }));
      toast.success("Oracle evaluation completed!");
    } catch (e: any) {
      if (e.message === "ORACLE_TIMEOUT") {
        toast.warning("Oracle is waking up, please try again in 30 seconds");
        setDisputeModal(prev => ({ ...prev, loading: false, timedOut: true }));
      } else {
        toast.error(e.message || "Oracle error");
        setDisputeModal(prev => ({ ...prev, loading: false, timedOut: false }));
      }
    }
  };

  const handleOpenDisputeSubmit = async () => {
    if (!disputeModal.escrow || !publicKey || !signTransaction) return;
    try {
      setDisputeModal(prev => ({ ...prev, loading: true }));
      const escrowPda = new PublicKey(disputeModal.escrow.pda_address);
      
      const accountInfo = await connection.getAccountInfo(escrowPda);
      if (!accountInfo) {
        throw new Error("Escrow account not found on-chain");
      }
      
      // EscrowAccount layout offset for 'state':
      // 8 (disc) + 32*5 (id, payer, payee, oracle, mint) + 8*2 (total, released) + 4 (vec len) + 66 (m1) + 1 (cur_milestone) = 255
      const stateByte = accountInfo.data[255];
      if (stateByte !== 1) { // 1 = Funded
        const states = ["Created", "Funded", "Completed", "Refunded", "Disputed"];
        const currentState = states[stateByte] || "Unknown";
        throw new Error(`Escrow state is ${currentState}. Needs to be 'Funded' to open a dispute.`);
      }

      const reasonBuffer = Buffer.alloc(128);
      reasonBuffer.write(disputeReason.slice(0, 128), "utf8");
      const data = Buffer.concat([OPEN_DISPUTE_DISCRIMINATOR, reasonBuffer]);
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true }
        ],
        programId: PROGRAM_ID,
        data
      });
      
      const tx = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      const signed = await signTransaction(tx);
      const txid = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true, // Bypass frontend simulation as it's unreliable here
      });
      
      toast.success("Transaction sent, verifying on-chain state...");
      
      try {
        await connection.confirmTransaction(
          { signature: txid, blockhash, lastValidBlockHeight },
          'confirmed'
        );
        toast.success("Transaction confirmed on-chain.");
      } catch (confirmError) {
        console.warn("Confirmation error, checking account state directly...", confirmError);
        // If confirmation fails but account is already disputed, we proceed
        const freshInfo = await connection.getAccountInfo(escrowPda);
        if (freshInfo && freshInfo.data[255] === 4) {
          toast.success("Disputa já registrada on-chain (confirmada via estado).");
        } else {
          throw confirmError;
        }
      }

      toast.info("Invoking ProofPay AI Oracle...");

      const result = await callOracleWithTimeout(
        disputeModal.escrow.escrow_id_hex,
        disputeReason,
        publicKey.toString()
      );

      setDisputeModal(prev => ({ ...prev, loading: false, verdict: result }));
      toast.success("Oracle evaluation completed!");
    } catch (e: any) {
      console.error("Dispute Flow Error:", e);

      // If oracle timed out, show retry UI immediately — skip secondary check
      if (e.message === "ORACLE_TIMEOUT") {
        toast.warning("Oracle is waking up, please try again in 30 seconds");
        setDisputeModal(prev => ({ ...prev, loading: false, timedOut: true }));
        return;
      }

      // Secondary check: verify if the escrow is already in Disputed state (4)
      try {
        const escrowPda = new PublicKey(disputeModal.escrow.pda_address);
        const checkInfo = await connection.getAccountInfo(escrowPda);
        if (checkInfo && checkInfo.data[255] === 4) {
          toast.success("Disputa detectada no histórico. Acionando Oráculo...");

          const result = await callOracleWithTimeout(
            disputeModal.escrow.escrow_id_hex,
            disputeReason,
            publicKey.toString()
          );
          setDisputeModal(prev => ({ ...prev, loading: false, verdict: result }));
          return;
        }
      } catch (innerError: any) {
        if (innerError.message === "ORACLE_TIMEOUT") {
          toast.warning("Oracle is waking up, please try again in 30 seconds");
          setDisputeModal(prev => ({ ...prev, loading: false, timedOut: true }));
          return;
        }
        console.error("State check failed", innerError);
      }

      toast.error(e.message || "Failed to open dispute");
      setDisputeModal(prev => ({ ...prev, loading: false }));
    }
  };

  const fetchEscrows = async () => {
    try {
      setFetching(true);
      const { data, error } = await supabase
        .from("escrows")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (!error && data) {
        setEscrows(data);
      }
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchEscrows();
    const channel = supabase
      .channel("escrows-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "escrows" }, fetchEscrows)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRelease = async (escrowPdaStr: string, payeePubkeyStr: string) => {
    if (!publicKey || !signTransaction) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      setLoading(true);
      const escrowPda = new PublicKey(escrowPdaStr);
      const payeePubkey = new PublicKey(payeePubkeyStr);
      
      const vaultAta = getAssociatedTokenAddressSync(DEVNET_USDC, escrowPda, true);
      const payeeAta = getAssociatedTokenAddressSync(DEVNET_USDC, payeePubkey);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: payeePubkey, isSigner: false, isWritable: false },
          { pubkey: vaultAta, isSigner: false, isWritable: true },
          { pubkey: payeeAta, isSigner: false, isWritable: true },
          { pubkey: DEVNET_USDC, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: RELEASE_MILESTONE_DISCRIMINATOR,
      });

      const transaction = new Transaction().add(instruction);
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signed.serialize());
      
      console.log("Release Tx:", txid);
      toast.success("Milestone released and funds transferred!");
    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status.toLowerCase()) {
      case 'created': return "bg-terminal-blue/15 text-blue-400 border-blue-400/30";
      case 'funded': return "bg-terminal-green/15 text-terminal-green border-terminal-green/30";
      case 'completed': return "bg-purple-500/15 text-purple-400 border-purple-400/30";
      case 'disputed': return "bg-terminal-red/15 text-terminal-red border-terminal-red/30";
      default: return "bg-muted/15 text-muted-foreground border-muted/30";
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-primary uppercase tracking-widest terminal-glow">
            ▸ {t("CONTRACT MONITOR")}
          </span>
          {fetching && <span className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {escrows.length} RECORD(S) FOUND
        </span>
      </div>

      <div className="space-y-3">
        {escrows.length === 0 && !fetching && (
          <div className="bg-card border border-border p-8 text-center rounded-sm">
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
              NO DATA INDEXED FROM SUPABASE
            </span>
          </div>
        )}

        {escrows.map((escrow) => (
          <div
            key={escrow.pda_address}
            className="border border-border bg-card rounded-sm border-glow transition-all hover:bg-secondary/10"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground font-mono">
                  ID: {(escrow.escrow_id_hex ?? 'N/A').slice(0, 8)}...
                </span>
                <span
                  className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm border font-bold ${getStatusStyle(escrow.status)}`}
                >
                  {escrow.status}
                </span>
              </div>
              <span className="text-primary font-bold text-sm font-mono">
                ${(Number(escrow.total_amount) / 1000000).toLocaleString()} USDC
              </span>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-3 gap-4 text-[11px] font-mono">
                <div>
                  <span className="text-muted-foreground uppercase text-[9px] block mb-0.5">Payee</span>
                  <span className="text-foreground">{escrow.payee_address.slice(0,4)}...{escrow.payee_address.slice(-4)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground uppercase text-[9px] block mb-0.5">Created At</span>
                  <span className="text-foreground">
                    {format(new Date(escrow.created_at), "yyyy-MM-dd HH:mm")}
                  </span>
                </div>
                <div className="text-right">
                   <span className="text-muted-foreground uppercase text-[9px] block mb-0.5">PDA Address</span>
                   <a 
                    href={`https://solscan.io/account/${escrow.pda_address}?cluster=devnet`}
                    target="_blank"
                    className="text-primary hover:underline"
                   >
                     {escrow.pda_address.slice(0,4)}...
                   </a>
                </div>
              </div>

              {escrow.status.toLowerCase() === "funded" && (
                <div className="pt-2 flex gap-2">
                  <Button
                    onClick={() => handleRelease(escrow.pda_address, escrow.payee_address)}
                    disabled={loading}
                    className="text-[10px] uppercase tracking-widest rounded-sm h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                  >
                    {loading ? "..." : t("RELEASE MILESTONE")}
                  </Button>
                  <Button
                    onClick={() => setDisputeModal({ isOpen: true, escrow, loading: false, verdict: null })}
                    style={{ backgroundColor: "#F59E0B", color: "#000" }}
                    className="text-[10px] uppercase tracking-widest rounded-sm h-8 px-4 font-bold hover:opacity-90"
                  >
                    ⚠ ABRIR DISPUTA
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dispute Modal */}
      {disputeModal.isOpen && disputeModal.escrow && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-sm shadow-2xl border-glow flex flex-col gap-4">
            <h3 className="text-primary font-bold tracking-widest text-sm uppercase">⚠ ABRIR DISPUTA</h3>
            <p className="text-xs text-muted-foreground font-mono">
              ESCROW: {disputeModal.escrow.pda_address.slice(0, 8)}...
            </p>
            
            {disputeModal.timedOut ? (
              <div className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-sm p-4 text-center space-y-2">
                  <span className="text-yellow-400 text-xs font-bold uppercase tracking-widest block">⏳ ORACLE WARMING UP</span>
                  <p className="text-xs text-muted-foreground font-mono">
                    Oracle is waking up, please try again in 30 seconds
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setDisputeModal({ isOpen: false, loading: false })}
                    className="text-[10px] font-bold uppercase"
                  >
                    CANCELAR
                  </Button>
                  <Button
                    style={{ backgroundColor: "#F59E0B", color: "#000" }}
                    onClick={retryOracleCall}
                    disabled={disputeModal.loading}
                    className="text-[10px] font-bold uppercase hover:opacity-90 min-w-[140px]"
                  >
                    {disputeModal.loading ? "AGUARDANDO..." : "↺ TENTAR NOVAMENTE"}
                  </Button>
                </div>
              </div>
            ) : !disputeModal.verdict ? (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-bold uppercase">MOTIVO DA DISPUTA</label>
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    maxLength={128}
                    className="w-full bg-background border border-border rounded-sm p-3 text-xs font-mono text-foreground focus:outline-none focus:border-primary/50 resize-none h-24"
                    placeholder="Describe specific failure to deliver..."
                  />
                  <div className="text-[9px] text-muted-foreground text-right">{disputeReason.length}/128</div>
                </div>
                
                <div className="flex gap-2 justify-end mt-2">
                  <Button
                    variant="outline"
                    onClick={() => setDisputeModal({ isOpen: false, loading: false })}
                    className="text-[10px] font-bold uppercase"
                    disabled={disputeModal.loading}
                  >
                    CANCELAR
                  </Button>
                  <Button
                    style={{ backgroundColor: "#F59E0B", color: "#000" }}
                    onClick={handleOpenDisputeSubmit}
                    disabled={disputeModal.loading || !disputeReason}
                    className="text-[10px] font-bold uppercase hover:opacity-90 min-w-[140px]"
                  >
                    {disputeModal.loading ? "PROCESSANDO..." : "CONFIRMAR DISPUTA"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3 bg-secondary/30 p-4 border border-border rounded-sm">
                <span className="text-[10px] uppercase font-bold tracking-widest block text-primary">
                  ORACLE VERDICT
                </span>
                <div className="text-sm font-bold p-2 bg-background border border-border text-center rounded-sm text-foreground">
                  {disputeModal.verdict.verdict === "payee" ? "✅ ORACLE: LIBERAR PARA BENEFICIÁRIO" : "↩ ORACLE: DEVOLVER AO PAGADOR"}
                </div>
                <div className="space-y-1 mt-2">
                  <span className="text-[9px] text-muted-foreground uppercase">Reasoning</span>
                  <p className="text-xs font-mono text-foreground p-2 bg-background rounded-sm border border-border">
                    {disputeModal.verdict.reasoning || "No reasoning provided"}
                  </p>
                </div>
                <Button
                  onClick={() => setDisputeModal({ isOpen: false, loading: false })}
                  className="w-full text-[10px] font-bold uppercase mt-2"
                >
                  FECHAR
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EscrowMonitor;
