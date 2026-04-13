import { useState } from "react";
import { Button } from "@/components/ui/button";

const CreateEscrow = () => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Initialize contract:", form);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="border border-border bg-card rounded-sm border-glow">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
          <span className="text-xs text-primary uppercase tracking-widest terminal-glow">
            ▸ New Escrow Contract
          </span>
          <span className="text-xs text-muted-foreground">USDC • SPL</span>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Amount */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              Amount (USDC)
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
              Payee Wallet Address
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
              Oracle Wallet Address
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
              Milestone Description
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
              Timeout (Days)
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
          <div className="border-t border-border pt-4">
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground font-bold uppercase tracking-widest text-xs py-5 hover:bg-primary/90 rounded-sm"
            >
              ▸ Initialize Contract
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEscrow;
