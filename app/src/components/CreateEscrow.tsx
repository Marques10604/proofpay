import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/LanguageContext";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ProofPayClient } from "@proofpay/sdk";
import { toast } from "sonner";

const DEVNET_USDC = new PublicKey("4zMMC9srt5Ri5Z14GAgXBYHtdGY9AFEz4ztSYZ6yWk7");

const CreateEscrow = () => {
  const { t } = useLanguage();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
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
    
    // R6: Critical hardening - Ensure wallet is fully connected and ready
    if (!wallet || !wallet.publicKey) {
      toast.error("Please connect your Solana wallet first");
      return;
    }

    // Basic input validation
    if (!form.payee || !form.oracle || !form.amount) {
      toast.error("Please fill in all mandatory fields");
      return;
    }

    try {
      setLoading(true);
      
      // Instantiate provider AND client strictly inside the handler
      const provider = new AnchorProvider(
        connection, 
        wallet, 
        AnchorProvider.defaultOptions()
      );
      
      const client = new ProofPayClient({ provider });

      // Generate random 32-byte identity for escrow
      const escrowId = window.crypto.getRandomValues(new Uint8Array(32));

      // Validate addresses before creating PublicKeys
      let payeePubkey, oraclePubkey;
      try {
        payeePubkey = new PublicKey(form.payee);
        oraclePubkey = new PublicKey(form.oracle);
      } catch (err) {
        throw new Error("Invalid Solana address for Payer or Oracle");
      }

      const params = {
        payee: payeePubkey,
        usdcMint: DEVNET_USDC,
        oracle: oraclePubkey,
        amount: Math.floor(parseFloat(form.amount) * 1_000_000), // Ensure integer u64
        milestones: [
          {
            description: form.milestone || "Deliverable 1",
            releasePercent: 100,
          },
        ],
        timeoutDays: parseInt(form.timeout) || 30,
      };

      const tx = await client.createEscrow(escrowId, params);
      setTxHash(tx);
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
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
          <span className="text-xs text-primary uppercase tracking-widest terminal-glow">
            ▸ {t("NEW ESCROW CONTRACT")}
          </span>
          <span className="text-xs text-muted-foreground">USDC • SPL</span>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Amount */}
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

          {/* Payee */}
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
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Oracle */}
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
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Milestone */}
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
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Timeout */}
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
              className="w-32 bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-border pt-4 space-y-4">
            {txHash && (
              <div className="p-3 bg-terminal-green/10 border border-terminal-green/30 rounded-sm">
                <span className="text-[10px] text-terminal-green uppercase tracking-wider block mb-1">
                  Transaction Confirmed
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
