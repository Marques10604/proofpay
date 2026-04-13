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

const CREATE_ESCROW_DISCRIMINATOR = Buffer.from([253, 215, 165, 116, 36, 108, 68, 80]);
const FUND_ESCROW_DISCRIMINATOR = Buffer.from([155, 18, 218, 141, 182, 213, 69, 201]);

const CreateEscrow = () => {
  const { t } = useLanguage();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showSummary, setShowSummary] = useState(false);

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
      setStatus("processing");
      setErrorMsg("");
      
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
      const payerAta = getAssociatedTokenAddressSync(DEVNET_USDC, publicKey);
      const ataInfo = await connection.getAccountInfo(payerAta);
      
      if (!ataInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, payerAta, publicKey, DEVNET_USDC
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
      
      const vaultAta = getAssociatedTokenAddressSync(DEVNET_USDC, escrowPda, true);
      const vaultInfo = await connection.getAccountInfo(vaultAta);
      
      const fundData = Buffer.alloc(16);
      FUND_ESCROW_DISCRIMINATOR.copy(fundData, 0);
      fundData.writeBigUInt64LE(100000n, 8); 

      const fundTransaction = new Transaction();
      if (!vaultInfo) {
        fundTransaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, vaultAta, escrowPda, DEVNET_USDC
          )
        );
      }

      fundTransaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: escrowPda, isSigner: false, isWritable: true },
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: payerAta, isSigner: false, isWritable: true },
            { pubkey: vaultAta, isSigner: false, isWritable: true },
            { pubkey: DEVNET_USDC, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_ID,
          data: fundData,
        })
      );

      const { blockhash: fundBh } = await connection.getLatestBlockhash();
      fundTransaction.recentBlockhash = fundBh;
      fundTransaction.feePayer = publicKey;

      const signedFund = await signTransaction(fundTransaction);
      await connection.sendRawTransaction(signedFund.serialize());
      
      setStatus("success");
      toast.success("Contract initialized and funded!");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error: any) {
      console.error(error);
      setStatus("error");
      setErrorMsg(error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
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

        <form onSubmit={(e) => { e.preventDefault(); setShowSummary(true); }} className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
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
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {t("PAYEE ADDRESS")}
            </label>
            <input
              type="text"
              value={form.payee}
              onChange={(e) => handleChange("payee", e.target.value)}
              placeholder="Enter Solana address..."
              maxLength={44}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {t("ORACLE ADDRESS")}
            </label>
            <input
              type="text"
              value={form.oracle}
              onChange={(e) => handleChange("oracle", e.target.value)}
              placeholder="Enter oracle address..."
              maxLength={44}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
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
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
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

          {showSummary && (
            <div className="p-4 bg-secondary/30 border border-border rounded-sm space-y-3 animate-in fade-in slide-in-from-top-2">
              <span className="text-[10px] text-primary uppercase tracking-widest block font-bold">
                Verification Required
              </span>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AMOUNT:</span>
                  <span className="text-foreground">{form.amount} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PAYEE:</span>
                  <span className="text-foreground">{form.payee.slice(0,6)}...{form.payee.slice(-6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ORACLE:</span>
                  <span className="text-foreground">{form.oracle.slice(0,6)}...{form.oracle.slice(-6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TIMEOUT:</span>
                  <span className="text-foreground">{form.timeout} DAYS</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  onClick={handleSubmit}
                  className="flex-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest h-9"
                >
                  Confirm & Initialize
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSummary(false)}
                  className="px-4 h-9 text-[10px] font-bold uppercase tracking-widest"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-4">
            {status === "error" && (
              <div className="p-3 bg-terminal-red/10 border border-terminal-red/30 rounded-sm">
                <span className="text-[10px] text-terminal-red uppercase tracking-wider block mb-1">
                  TX FAILED ✗
                </span>
                <span className="text-xs text-foreground font-mono break-all line-clamp-2">
                  {errorMsg}
                </span>
              </div>
            )}

            {txHash && (
              <div className="p-3 bg-terminal-green/10 border border-terminal-green/30 rounded-sm">
                <span className="text-[10px] text-terminal-green uppercase tracking-wider block mb-1">
                  {status === "success" ? "CONTRACT INITIALIZED ✓" : "Transaction Sent"}
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
            
            {!showSummary && (
              <Button
                type="submit"
                disabled={loading}
                className={`w-full font-bold uppercase tracking-widest text-xs py-5 rounded-sm transition-all
                  ${status === "success" ? "bg-terminal-green text-terminal-green-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"}
                `}
              >
                {status === "processing" ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    PROCESSING...
                  </span>
                ) : status === "success" ? (
                  "CONTRACT INITIALIZED ✓"
                ) : status === "error" ? (
                  "RETRY INITIALIZATION"
                ) : (
                  `▸ ${t("INITIALIZE CONTRACT")}`
                )}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEscrow;
