import { useState, useMemo } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

import TerminalHeader from "@/components/TerminalHeader";
import CreateEscrow from "@/components/CreateEscrow";
import EscrowMonitor from "@/components/EscrowMonitor";
import DisputePanel from "@/components/DisputePanel";
import { LanguageProvider } from "@/lib/LanguageContext";

const Index = () => {
  const [activeTab, setActiveTab] = useState("create");

  return (
    <LanguageProvider>
      <div className="min-h-screen bg-background flex flex-col scanline">
        <TerminalHeader activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Status ticker */}
        <div className="border-b border-border bg-secondary/30 py-1 overflow-hidden">
          <div className="animate-ticker whitespace-nowrap text-[10px] text-muted-foreground tracking-wider">
            SOL/USD $187.42 ▲ 2.3% │ USDC SUPPLY $52.1B │ TPS 4,218 │ SLOT #312,847,291 │ EPOCH 724 │ PROOFPAY TVL $14.2M │ ACTIVE ESCROWS 1,247 │ DISPUTES RESOLVED 98.7%
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {activeTab === "create" && <CreateEscrow />}
          {activeTab === "monitor" && <EscrowMonitor />}
          {activeTab === "dispute" && <DisputePanel />}
        </main>

        {/* Footer */}
        <footer className="border-t border-border px-4 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>PROOFPAY PROTOCOL © 2026</span>
          <span>SOLANA MAINNET-BETA │ DEVNET AVAILABLE</span>
        </footer>
      </div>
    </LanguageProvider>
  );
};

export default Index;
