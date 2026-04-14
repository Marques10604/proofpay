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

const EscrowMonitor = ({ onOpenDispute }: { onOpenDispute?: (pda: string, id: string) => void }) => {
  const { t } = useLanguage();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [escrows, setEscrows] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

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
                  ID: {escrow.escrow_id_hex.slice(0, 8)}...
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
                    variant="destructive"
                    onClick={() => onOpenDispute && onOpenDispute(escrow.pda_address, escrow.escrow_id_hex)}
                    className="text-[10px] uppercase tracking-widest rounded-sm h-8 px-4 font-bold"
                  >
                    ⚠ {t("OPEN DISPUTE")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EscrowMonitor;
