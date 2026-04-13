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

const PROGRAM_ID = new PublicKey("FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i");
const DEVNET_USDC = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
const RELEASE_MILESTONE_DISCRIMINATOR = Buffer.from([56, 2, 199, 164, 184, 108, 167, 222]);

type EscrowStatus = "FUNDED" | "DISPUTED";

interface EscrowData {
  id: string;
  pda: string;
  status: EscrowStatus;
  amount: number;
  payee: string;
  payeePubkey: string;
  milestone: string;
}

const mockEscrows: EscrowData[] = [
  {
    id: "ESC-7f3a2b",
    pda: "5Y2VnYs5Q9QWDK1wwSbLHz3LhCZcAbodBnyLKL4hcDHX", // A que acabamos de usar
    status: "FUNDED",
    amount: 100, // 0.1 USDC
    payee: "2hFP... tipad",
    payeePubkey: "2hFPmWGKiTJvHNHmywFSWsPQt4pmL3NRH2g5yc2tipad",
    milestone: "Escrow initialization test",
  },
];

const statusColors: Record<EscrowStatus, string> = {
  FUNDED: "bg-terminal-green/15 text-terminal-green border-terminal-green/30",
  DISPUTED: "bg-terminal-red/15 text-terminal-red border-terminal-red/30",
};

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/LanguageContext";
import { useState } from "react";

const EscrowMonitor = () => {
  const { t } = useLanguage();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-primary uppercase tracking-widest terminal-glow">
          ▸ {t("CONTRACT MONITOR")}
        </span>
        <span className="text-xs text-muted-foreground">
          {mockEscrows.length} contracts
        </span>
      </div>

      <div className="space-y-3">
        {mockEscrows.map((escrow) => (
          <div
            key={escrow.id}
            className="border border-border bg-card rounded-sm border-glow"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground font-semibold">
                  {escrow.id}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border font-semibold ${statusColors[escrow.status]}`}
                >
                  {escrow.status}
                </span>
              </div>
              <span className="text-primary font-bold text-sm">
                ${escrow.amount.toLocaleString()} USDC
              </span>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground uppercase tracking-wider block mb-0.5">
                    Payee
                  </span>
                  <span className="text-foreground">{escrow.payee}</span>
                </div>
                <div>
                  <span className="text-muted-foreground uppercase tracking-wider block mb-0.5">
                    Milestone
                  </span>
                  <span className="text-foreground">{escrow.milestone}</span>
                </div>
              </div>

              {escrow.status === "FUNDED" && (
                <div className="pt-1 flex gap-2">
                  <Button
                    onClick={() => handleRelease(escrow.pda, escrow.payeePubkey)}
                    disabled={loading}
                    className="text-xs uppercase tracking-widest rounded-sm h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {loading ? "..." : t("RELEASE MILESTONE")}
                  </Button>
                  <Button
                    variant="destructive"
                    className="text-xs uppercase tracking-widest rounded-sm h-8 px-4"
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
