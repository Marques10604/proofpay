import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useLanguage } from "@/lib/LanguageContext";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface TerminalHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TerminalHeader = ({ activeTab, onTabChange }: TerminalHeaderProps) => {
  const { connected, publicKey, wallet, disconnect, connect, select } = useWallet();
  const { connection } = useConnection();
  const { language, setLanguage, t } = useLanguage();
  
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [tps, setTps] = useState<number | null>(null);
  const [escrowCount, setEscrowCount] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      // 1. SOL Price (Jupiter)
      try {
        const res = await fetch("https://price.jup.ag/v4/price?ids=SOL");
        const json = await res.json();
        setSolPrice(json.data.SOL.price);
      } catch (e) { console.error("Price fetch failed"); }

      // 2. TPS (Solana)
      try {
        const res = await connection.getRecentPerformanceSamples(1);
        if (res.length > 0) {
          const sample = res[0];
          setTps(Math.round(sample.numTransactions / sample.samplePeriodSecs));
        }
      } catch (e) { console.error("TPS fetch failed"); }

      // 3. Active Escrows (Supabase)
      try {
        const { count, error } = await supabase
          .from("escrows")
          .select("*", { count: 'exact', head: true });
        if (!error) setEscrowCount(count || 0);
      } catch (e) { console.error("Escrow count failed"); }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, [connection]);

  const handleWalletAction = async () => {
    if (connected) {
      try {
        await disconnect();
      } catch (e) {
        console.error("Disconnect failed", e);
      }
    } else {
      try {
        // Explicitly select Phantom before connecting to avoid WalletNotSelectedError
        if (!wallet || wallet.adapter.name !== 'Phantom') {
          select('Phantom' as any);
        }
        
        // Wait a tiny bit for state to propagate (optional but safer in some React versions)
        setTimeout(async () => {
          try {
            await connect();
          } catch (e) {
            console.error("Delayed connect failed", e);
          }
        }, 10);
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
          <span className="text-muted-foreground text-xs">SOLANA DEVNET</span>
          <span className="text-muted-foreground text-xs">│</span>
          <div className="flex items-center gap-4 text-[10px] font-mono whitespace-nowrap overflow-hidden">
            <span className="text-terminal-green">
              SOL/USD: ${solPrice?.toFixed(2) || "---"}
            </span>
            <span className="text-primary">
              TPS: {tps || "---"}
            </span>
            <span className="text-muted-foreground uppercase">
              ACTIVE ESCROWS: {escrowCount}
            </span>
          </div>
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
