import React, { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import App from "./App.tsx";
import "./index.css";
import "@solana/wallet-adapter-react-ui/styles.css";

const Root = () => {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  const onError = (error: any) => {
    console.error("Wallet Error:", error);
    // Suppress common errors that trigger disconnects in some adapters
    if (error.name === "WalletSendTransactionError") {
      console.log("Suppressing auto-disconnect for SendTransactionError");
    }
  };

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <App />
      </WalletProvider>
    </ConnectionProvider>
  );
};

createRoot(document.getElementById("root")!).render(<Root />);
