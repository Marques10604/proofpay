import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/LanguageContext";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction, 
  SystemProgram 
} from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountInstruction, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { toast } from "sonner";
import { Buffer } from "buffer";
import PROOFPAY_IDL from "../idl/proofpay.json";

const PROGRAM_ID = new PublicKey("FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i");
const DEVNET_USDC = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

// Discriminator: sha256("global:create_escrow").slice(0, 8)
const CREATE_ESCROW_DISCRIMINATOR = Buffer.from([170, 114, 219, 13, 246, 203, 102, 19]);

const CreateEscrow = () => {
  const { t } = useLanguage();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [form, setForm] = useState({
    amount: "",
    payee: "",
    oracle: "",
    milestone: "",
    timeout: "30",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!publicKey || !signTransaction) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!form.payee || !form.oracle || !form.amount) {
      toast.error("Please fill in all mandatory fields");
      return;
    }

    try {
      setLoading(true);
      
      // Generate random 32-byte identity for escrow
      const escrowId = window.crypto.getRandomValues(new Uint8Array(32));

      // Derive PDA: ["escrow", escrowId]
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(escrowId)],
        PROGRAM_ID
      );

      // Parse inputs
      const payeePubkey = new PublicKey(form.payee);
      const oraclePubkey = new PublicKey(form.oracle);
      const amount = BigInt(Math.floor(parseFloat(form.amount) * 1_000_000));
      const timeoutSeconds = BigInt((parseInt(form.timeout) || 30) * 86400);

      // Data Layout (Manual Borsh-ish for Anchor)
      // Disc(8) + escrowId(32) + oracle(32) + amount(8) + vec_len(4) + milestones(66) + timeout(8) = 158 bytes
      const milestoneDesc = Buffer.alloc(64);
      milestoneDesc.write(form.milestone || "Deliverable 1");
      
      const data = Buffer.alloc(158);
      let offset = 0;
      CREATE_ESCROW_DISCRIMINATOR.copy(data, offset); offset += 8;
      Buffer.from(escrowId).copy(data, offset); offset += 32;
      oraclePubkey.toBuffer().copy(data, offset); offset += 32;
      data.writeBigUInt64LE(amount, offset); offset += 8;
      data.writeUInt32LE(1, offset); offset += 4; // milestones_len=1
      milestoneDesc.copy(data, offset); offset += 64;
      data.writeUInt16LE(10000, offset); offset += 2; // 100% in basis points
      data.writeBigInt64LE(timeoutSeconds, offset); offset += 8;

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: payeePubkey, isSigner: false, isWritable: false },
          { pubkey: DEVNET_USDC, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: data,
      });

      const transaction = new Transaction();
      
      // Check if payer USDC ATA exists
      const payerAta = getAssociatedTokenAddressSync(DEVNET_USDC, publicKey);
      const ataInfo = await connection.getAccountInfo(payerAta);
      
      if (!ataInfo) {
        console.log("Adding ATA creation instruction...");
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // payer
            payerAta,
            publicKey, // owner
            DEVNET_USDC
          )
        );
      }

      transaction.add(instruction);
      
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signed.serialize());
      
      setTxHash(txid);
      toast.success("Contract initialized successfully!");
    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="border border-border bg-card rounded-sm border-glow">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
          <span className="text-xs text-primary uppercase tracking-widest terminal-glow">
            ▸ {t("NEW ESCROW CONTRACT")}
          </span>
          <span className="text-xs text-muted-foreground">USDC • SPL</span>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("AMOUNT (USDC)")}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => handleChange("amount", e.target.value)}
                placeholder="0.00"
                className="w-full bg-background border border-border rounded-sm px-3 py-2.5 pl-7 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("PAYER ADDRESS")}
            </label>
            <input
              type="text"
              value={form.payee}
              onChange={(e) => handleChange("payee", e.target.value)}
              placeholder="Enter Solana address..."
              maxLength={44}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("ORACLE ADDRESS")}
            </label>
            <input
              type="text"
              value={form.oracle}
              onChange={(e) => handleChange("oracle", e.target.value)}
              placeholder="Enter oracle address..."
              maxLength={44}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("MILESTONE DESCRIPTION")}
            </label>
            <textarea
              value={form.milestone}
              onChange={(e) => handleChange("milestone", e.target.value)}
              placeholder="Describe the deliverable..."
              maxLength={500}
              rows={3}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("TIMEOUT (DAYS)")}
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={form.timeout}
              onChange={(e) => handleChange("timeout", e.target.value)}
              className="w-32 bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            {txHash && (
              <div className="p-3 bg-terminal-green/10 border border-terminal-green/30 rounded-sm">
                <span className="text-[10px] text-terminal-green uppercase tracking-wider block mb-1">
                  Transaction Sent
                </span>
                <a
                  href={`https://solscan.io/tx/${txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-foreground hover:text-primary transition-colors underline break-all"
                >
                  {txHash}
                </a>
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-bold uppercase tracking-widest text-xs py-5 hover:bg-primary/90 rounded-sm disabled:opacity-50"
            >
              {loading ? "Processing..." : `▸ ${t("INITIALIZE CONTRACT")}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEscrow;
