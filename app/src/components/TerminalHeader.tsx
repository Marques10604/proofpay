import { useWallet } from "@solana/wallet-adapter-react";
import { useLanguage } from "@/lib/LanguageContext";

interface TerminalHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TerminalHeader = ({ activeTab, onTabChange }: TerminalHeaderProps) => {
  const { connected, publicKey, wallet, disconnect, connect, select, wallets } = useWallet();
  const { language, setLanguage, t } = useLanguage();

  const handleWalletAction = async () => {
    if (connected) {
      await disconnect();
    } else {
      try {
        if (!wallet) {
          const phantom = wallets.find(w => w.adapter.name === 'Phantom');
          if (phantom) {
            select(phantom.adapter.name);
          } else if (wallets.length > 0) {
            select(wallets[0].adapter.name);
          }
        }
        await connect();
      } catch (error) {
        console.error("Wallet connection error:", error);
      }
    }
  };

  const walletLabel = connected 
    ? publicKey?.toBase58().slice(0, 4) + "..." + publicKey?.toBase58().slice(-4)
    : (language === "en" ? "CONNECT WALLET" : "CONECTAR WALLET");

  const tabs = [
    { id: "create", label: t("CREATE"), shortcut: "F1" },
    { id: "monitor", label: t("MONITOR"), shortcut: "F2" },
    { id: "dispute", label: t("DISPUTE"), shortcut: "F3" },
  ];

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
              {connected ? (language === "en" ? "CONNECTED" : "CONECTADO") : (language === "en" ? "DISCONNECTED" : "DESCONECTADO")}
            </span>
          </div>

          {/* Language Toggle */}
          <div className="flex items-center border border-border rounded-sm overflow-hidden h-9">
            <button
              onClick={() => setLanguage("en")}
              className={`px-3 h-full text-[10px] font-bold transition-colors ${language === "en" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              EN
            </button>
            <div className="w-[1px] h-4 bg-border" />
            <button
              onClick={() => setLanguage("pt")}
              className={`px-3 h-full text-[10px] font-bold transition-colors ${language === "pt" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              PT
            </button>
          </div>

          <button
            onClick={handleWalletAction}
            className="px-4 h-9 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-primary/90 transition-colors terminal-glow"
          >
            {walletLabel}
          </button>
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
