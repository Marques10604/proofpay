import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/LanguageContext";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { toast } from "sonner";
import { Buffer } from "buffer";

const PROGRAM_ID = new PublicKey("FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i");

interface DisputePanelProps {
  initialPda?: string;
  initialId?: string;
}

const DisputePanel = ({ initialPda = "", initialId = "" }: DisputePanelProps) => {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [escrowPda, setEscrowPda] = useState(initialPda);
  const [escrowId, setEscrowId] = useState(initialId);
  const [oracleVerdict, setOracleVerdict] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !signTransaction) {
      toast.error("Please connect your wallet");
      return;
    }
    if (!escrowPda || !escrowId || !reason) {
      toast.error("Please fill all fields");
      return;
    }

    try {
      setLoading(true);
      const pdaPubkey = new PublicKey(escrowPda);

      // Parse escrowId
      let escrowIdBytes: Uint8Array;
      if (escrowId.startsWith("[")) {
        escrowIdBytes = new Uint8Array(JSON.parse(escrowId));
      } else {
        escrowIdBytes = new Uint8Array(Buffer.from(escrowId.replace("0x", ""), "hex"));
      }

      if (escrowIdBytes.length !== 32) {
        toast.error("Escrow ID must be 32 bytes");
        return;
      }

      // Calculate discriminator
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("global:open_dispute"));
      const discriminator = new Uint8Array(hashBuffer).slice(0, 8);

      const reasonBuffer = Buffer.alloc(128);
      reasonBuffer.write(reason, 0, "utf-8");

      const data = Buffer.concat([discriminator, reasonBuffer]);
      
      console.log("Escrow PDA:", escrowPda);
      console.log("Reason:", reason);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: pdaPubkey, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: data,
      });

      const transaction = new Transaction().add(instruction);
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signed.serialize());
      
      toast.success("Dispute opened on chain! Tx: " + txid);

      // Call oracle evaluate
      const response = await fetch("https://proofpay-oracle.onrender.com/oracle/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escrow_id: Array.from(escrowIdBytes),
          evidence: reason,
          escrow_pda: escrowPda,
        }),
      });

      if (!response.ok) {
        throw new Error("Oracle failed: " + await response.text());
      }

      const result = await response.json();
      setOracleVerdict(result);
      toast.success("Oracle evaluation completed!");

    } catch (err: any) {
      console.error(err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Open dispute form */}
      <div className="border border-border bg-card rounded-sm border-glow">
        <div className="px-4 py-2 border-b border-border bg-secondary/50">
          <span className="text-xs text-terminal-red uppercase tracking-widest">
            ▸ {t("OPEN DISPUTE")}
          </span>
        </div>

        <form onSubmit={handleOpenDispute} className="p-4 space-y-4">
          <p className="text-[10px] text-muted-foreground leading-relaxed border-l-2 border-terminal-red/30 pl-3">
            {t("DISPUTE_EXPLANATION")}
          </p>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              ESCROW PDA ADDRESS
            </label>
            <input
              type="text"
              value={escrowPda}
              onChange={(e) => setEscrowPda(e.target.value)}
              placeholder="5Y2VnYs..."
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-terminal-red/50 focus:ring-1 focus:ring-terminal-red/20"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              ESCROW ID
            </label>
            <input
              type="text"
              value={escrowId}
              onChange={(e) => setEscrowId(e.target.value)}
              placeholder="Array JSON [0,1,2...] ou hex string"
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-terminal-red/50 focus:ring-1 focus:ring-terminal-red/20"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              Dispute Reason
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for dispute..."
              maxLength={100}
              rows={4}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-terminal-red/50 focus:ring-1 focus:ring-terminal-red/20 resize-none"
            />
          </div>

          <div className="flex items-center justify-between py-2 border-t border-b border-border/50 text-xs font-mono">
            <span className="text-muted-foreground">{t("DISPUTE BOND")}:</span>
            <span className="text-terminal-red font-bold">3.00 USDC</span>
          </div>

          <Button
            type="submit"
            variant="destructive"
            disabled={loading || !escrowPda || !escrowId || !reason || !publicKey}
            className="w-full uppercase tracking-widest text-xs py-5 rounded-sm font-bold disabled:opacity-50"
          >
            {loading ? "PROCESSING..." : `▸ ${t("OPEN DISPUTE")}`}
          </Button>
        </form>
      </div>

      {/* Oracle verdict */}
      {oracleVerdict && (
        <div className="border border-border bg-card rounded-sm border-glow">
          <div className="px-4 py-2 border-b border-border bg-secondary/50">
            <span className="text-xs text-terminal-cyan uppercase tracking-widest">
              ▸ {t("ORACLE VERDICT")}
            </span>
          </div>

          <div className="p-4">
            <div className={`border rounded-sm p-4 space-y-2 ${oracleVerdict.verdict === 'RELEASE' ? 'border-terminal-cyan/20 bg-terminal-cyan/5' : 'border-terminal-red/20 bg-terminal-red/5'}`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest font-semibold">
                  Result
                </span>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border font-bold ${oracleVerdict.verdict === 'RELEASE' ? 'bg-terminal-green/15 text-terminal-green border-terminal-green/30' : 'bg-terminal-red/15 text-terminal-red border-terminal-red/30'}`}>
                  {oracleVerdict.verdict || "UNKNOWN"}
                </span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">
                {oracleVerdict.reason || JSON.stringify(oracleVerdict)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisputePanel;
