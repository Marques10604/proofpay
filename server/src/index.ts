import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, utils } from '@coral-xyz/anchor';
import { ProofPayClient } from '@proofpay/sdk';
import 'dotenv/config';

const app = new Hono();

// 8. Adicionar middleware CORS para aceitar requests de qualquer origem
app.use('/*', cors());

// 9. Processar variáveis de ambiente
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const ORACLE_WALLET_ADDRESS = process.env.ORACLE_WALLET_ADDRESS;

if (!ORACLE_PRIVATE_KEY || !ORACLE_WALLET_ADDRESS) {
  console.error("Missing required environment variables: ORACLE_PRIVATE_KEY or ORACLE_WALLET_ADDRESS");
  process.exit(1);
}

// Inicializar configuração Solana
let oracleKeypair: Keypair;
try {
  oracleKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(ORACLE_PRIVATE_KEY)));
} catch (e) {
  console.error("Invalid ORACLE_PRIVATE_KEY format. Must be a JSON array of numbers.");
  process.exit(1);
}

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Cria classe Wallet compatível com o AnchorProvider
class NodeWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  async signTransaction<T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(tx: T): Promise<T> {
    if ("version" in tx) {
        tx.sign([this.payer]);
    } else {
        tx.sign(this.payer as any);
    }
    return tx;
  }
  async signAllTransactions<T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
  get publicKey() {
    return this.payer.publicKey;
  }
}

const wallet = new NodeWallet(oracleKeypair);
const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
const client = new ProofPayClient({ rpcUrl: SOLANA_RPC_URL, provider });

// 1. Rota POST /resolve
app.post('/resolve', async (c) => {
  // 2. Verificar header X-PAYMENT no request
  const paymentHeader = c.req.header('X-PAYMENT');

  if (!paymentHeader) {
    // 3. Retornar status 402 com header X-PAYMENT-REQUIRED
    return c.json({ error: "Payment required" }, 402, {
      'X-PAYMENT-REQUIRED': JSON.stringify({
        price: "5",
        currency: "USDC",
        network: "solana",
        payTo: ORACLE_WALLET_ADDRESS
      })
    });
  }

  // 4. Validar assinatura com connection.getTransaction()
  let signature = paymentHeader;
  try {
    const decodedVal = Buffer.from(paymentHeader, 'base64').toString('utf8');
    const parsed = JSON.parse(decodedVal);
    if (parsed.payload && parsed.payload.signature) {
      const sigBuffer = Buffer.from(parsed.payload.signature, 'base64');
      // converter para string base58
      signature = utils.bytes.bs58.encode(sigBuffer);
    }
  } catch (e) {
    // Header não é x402 valid json -> assumir que é raw signature (Fallback)
  }

  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    if (!tx) {
        return c.json({ error: "Transaction not found or not confirmed" }, 400);
    }
  } catch (err) {
    console.error("Transaction API Error:", err);
    return c.json({ error: "Invalid transaction signature or network error" }, 400);
  }

  // Parse Body
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { escrow_id, release_to_payee } = body;
  
  if (!escrow_id || release_to_payee === undefined) {
    return c.json({ error: "escrow_id and release_to_payee are required" }, 400);
  }

  // Formatar array de bytes do escrow_id
  let escrowIdBytes: Uint8Array;
  try {
      if (Array.isArray(escrow_id)) {
          escrowIdBytes = new Uint8Array(escrow_id);
      } else {
          escrowIdBytes = new Uint8Array(Object.values(escrow_id));
      }
      if (escrowIdBytes.length !== 32) throw new Error("Invalid length");
  } catch (e) {
      return c.json({ error: "escrow_id must be a 32-byte array" }, 400);
  }

  // 5. Ler o estado do escrow via getEscrow()
  const escrow = await client.getEscrow(escrowIdBytes);
  if (!escrow) {
    return c.json({ error: "Escrow not found" }, 404);
  }

  // 6. Verificar que o estado é disputed antes de prosseguir
  if (escrow.state !== "disputed") {
    return c.json({ error: `Escrow is not in disputed state. Current state: ${escrow.state}` }, 400);
  }

  // 7. Retornar JSON com o veredito
  return c.json({
    escrow_id,
    verdict: release_to_payee ? "payee" : "payer",
    reason: escrow.disputeReason,
    timestamp: Date.now()
  });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`x402 Server running on http://localhost:${info.port}`);
});
