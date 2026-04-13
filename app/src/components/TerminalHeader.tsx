import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface TerminalHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "create", label: "CREATE", shortcut: "F1" },
  { id: "monitor", label: "MONITOR", shortcut: "F2" },
  { id: "dispute", label: "DISPUTE", shortcut: "F3" },
];

const TerminalHeader = ({ activeTab, onTabChange }: TerminalHeaderProps) => {
  const { connected } = useWallet();

  return (
    <header className="border-b border-border bg-card">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-primary font-bold text-sm tracking-widest terminal-glow">
            PROOFPAY
          </span>
          <span className="text-muted-foreground text-xs">
            ESCROW PROTOCOL v1.0
          </span>
          <span className="text-muted-foreground text-xs">│</span>
          <span className="text-muted-foreground text-xs">SOLANA DEVNET</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-terminal-green" : "bg-terminal-red"}`} />
            <span className="text-muted-foreground uppercase">
              {connected ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>
          <WalletMultiButton />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              px-4 py-2 text-xs uppercase tracking-wider border-b-2 transition-colors
              ${activeTab === tab.id
                ? "border-primary text-primary terminal-glow"
                : "border-transparent text-muted-foreground hover:text-foreground"
              }
            `}
          >
            <span className="text-muted-foreground mr-1.5">{tab.shortcut}</span>
            {tab.label}
          </button>
        ))}
        <div className="ml-auto text-xs text-muted-foreground">
          {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC
        </div>
      </div>
    </header>
  );
};

export default TerminalHeader;
