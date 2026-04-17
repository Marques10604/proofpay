# PROOFPAY_TEMPLATES.md — Snippets e Templates

Snippets prontos para uso baseados no código atual do repositório.

---

## 1. Derivar PDA de um escrow (TypeScript)

```typescript
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

const PROGRAM_ID = new PublicKey("FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i");

function deriveEscrowPDA(escrowId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(escrowId)],
    PROGRAM_ID
  );
}
```

---

## 2. Chamar o oracle com timeout (padrão do projeto)

```typescript
// Sempre usar esta função — não fazer fetch direto ao oracle
const callOracleWithTimeout = async (
  escrowIdHex: string,
  evidence: string,
  disputedBy: string
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch("https://proofpay-oracle.onrender.com/oracle/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escrow_id: escrowIdHex, evidence, disputed_by: disputedBy }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await res.json();
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error("ORACLE_TIMEOUT");
    throw e;
  }
};
```

---

## 3. Ler estado raw de um escrow on-chain (sem SDK)

```typescript
import { Connection, PublicKey } from "@solana/web3.js";

async function getEscrowStateByte(pdaAddress: string): Promise<number | null> {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const pda = new PublicKey(pdaAddress);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  // Byte 255: 0=Created 1=Funded 2=Completed 3=Refunded 4=Disputed
  return info.data[255];
}

const STATE_NAMES = ["Created", "Funded", "Completed", "Refunded", "Disputed"];
```

---

## 4. SDK — criar escrow via ProofPayClient

```typescript
import { ProofPayClient, encodeBytes } from "@proofpay/sdk";
import { PublicKey } from "@solana/web3.js";

const client = new ProofPayClient({ provider: anchorProvider });

const escrowId = crypto.getRandomValues(new Uint8Array(32));
const txid = await client.createEscrow(escrowId, {
  payee: new PublicKey("PAYEE_ADDRESS"),
  usdcMint: new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"),
  oracle: new PublicKey("ORACLE_ADDRESS"),
  amount: 100_000_000, // 100 USDC (6 decimais)
  milestones: [
    { description: "Entrega 1: Design", releasePercent: 50 },
    { description: "Entrega 2: Desenvolvimento", releasePercent: 50 },
  ],
  timeoutDays: 30,
});
```

---

## 5. Inserir escrow no Supabase (padrão do CreateEscrow.tsx)

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

await supabase.from("escrows").insert({
  escrow_id_hex: Buffer.from(escrowId).toString("hex"),
  pda_address: escrowPda.toString(),
  payer_address: payerPublicKey.toString(),
  payee_address: payeePublicKey.toString(),
  usdc_mint: DEVNET_USDC.toString(),
  total_amount: Number(amountInLamports),
  status: "funded",
  created_at: new Date().toISOString(),
  timeout_at: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
  bump: bump,
  last_tx_signature: fundTxId,
});
```

---

## 6. Discriminadores de instrução (para construção manual de transações)

```typescript
// Todos os discriminadores hard-coded no frontend
// Derivados por: sha256("global:<instruction_name>")[0..8]
const DISCRIMINATORS = {
  CREATE_ESCROW:      Buffer.from([253, 215, 165, 116,  36, 108,  68,  80]),
  FUND_ESCROW:        Buffer.from([155,  18, 218, 141, 182, 213,  69, 201]),
  RELEASE_MILESTONE:  Buffer.from([ 56,   2, 199, 164, 184, 108, 167, 222]),
  OPEN_DISPUTE:       Buffer.from([137,  25,  99, 119,  23, 223, 161,  42]),
};
```

---

## 7. Verificar saúde do oracle

```bash
# Health check
curl https://proofpay-oracle.onrender.com/health

# Resposta esperada:
# {"status":"ok","timestamp":1234567890}

# Status completo
curl https://proofpay-oracle.onrender.com/
# {"status":"live","service":"proofpay-oracle","version":"0.1.0","network":"devnet"}
```

---

## 8. Testar oracle manualmente (curl)

```bash
curl -X POST https://proofpay-oracle.onrender.com/oracle/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "escrow_id": "<hex-64-chars>",
    "evidence": "O freelancer não entregou o design conforme especificado",
    "escrow_pda": "<base58-pda-address>"
  }'
```

---

## 9. Verificar estado de um escrow no Solscan

```
https://solscan.io/account/<PDA_ADDRESS>?cluster=devnet
```

---

## 10. Variáveis de ambiente para dev local

### `app/.env.local`
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### `server/.env`
```env
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
ORACLE_PRIVATE_KEY=[1,2,3,...,64]
ORACLE_WALLET_ADDRESS=2hFPmWGKiTJvHNHmywFSWsPQt4pmL3NRH2g5yc2tipad
SOLANA_RPC_URL=https://api.devnet.solana.com
PORT=3000
```

---

## 11. Encode/decode de campos fixos Rust ↔ TypeScript

```typescript
import { encodeBytes, decodeBytes } from "@proofpay/sdk";

// [u8; 64] para milestone description
const encoded = encodeBytes("Entrega final aprovada", 64);  // Array(64)
const decoded = decodeBytes(encoded);                        // "Entrega final aprovada"

// [u8; 128] para dispute reason
const reason = encodeBytes("Produto não corresponde ao escopo", 128);
```
