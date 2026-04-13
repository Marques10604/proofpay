import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/LanguageContext";

type EscrowStatus = "FUNDED" | "DISPUTED";

interface EscrowData {
  id: string;
  status: EscrowStatus;
  amount: number;
  payee: string;
  milestone: string;
}

const mockEscrows: EscrowData[] = [
  {
    id: "ESC-7f3a2b",
    status: "FUNDED",
    amount: 25000,
    payee: "8xHk...4rTq",
    milestone: "Smart contract audit completion",
  },
  {
    id: "ESC-1c9d4e",
    status: "DISPUTED",
    amount: 12500,
    payee: "3mPz...9wLk",
    milestone: "Frontend delivery phase 2",
  },
];

const statusColors: Record<EscrowStatus, string> = {
  FUNDED: "bg-terminal-green/15 text-terminal-green border-terminal-green/30",
  DISPUTED: "bg-terminal-red/15 text-terminal-red border-terminal-red/30",
};

const EscrowMonitor = () => {
  const { t } = useLanguage();
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
                <div className="pt-1">
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
