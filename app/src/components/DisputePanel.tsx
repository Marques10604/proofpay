import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/LanguageContext";

const DisputePanel = () => {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");

  const handleOpenDispute = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Open dispute:", { reason });
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
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              Dispute Reason
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for dispute..."
              maxLength={1000}
              rows={4}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-terminal-red/50 focus:ring-1 focus:ring-terminal-red/20 resize-none"
            />
          </div>

          <Button
            type="submit"
            variant="destructive"
            className="w-full uppercase tracking-widest text-xs py-5 rounded-sm font-bold"
          >
            ▸ {t("OPEN DISPUTE")}
          </Button>
        </form>
      </div>

      {/* Oracle verdict */}
      <div className="border border-border bg-card rounded-sm border-glow">
        <div className="px-4 py-2 border-b border-border bg-secondary/50">
          <span className="text-xs text-terminal-cyan uppercase tracking-widest">
            ▸ {t("ORACLE VERDICT")}
          </span>
        </div>

        <div className="p-4">
          <div className="border border-terminal-cyan/20 bg-terminal-cyan/5 rounded-sm p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-terminal-cyan uppercase tracking-widest font-semibold">
                Result
              </span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border font-bold bg-terminal-green/15 text-terminal-green border-terminal-green/30">
                RELEASE
              </span>
            </div>
            <p className="text-xs text-foreground leading-relaxed">
              PAYEE — Delivery verified at 94% confidence. Funds released.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisputePanel;
