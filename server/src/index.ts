import { Buffer } from 'node:buffer';
globalThis.Buffer = Buffer;

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN, Program } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// ─────────────────────────────────────────────────────────────────────────────
// SDK Types (Inlined for standalone deploy)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveDisputeParams {
  escrowId: Uint8Array;
  releaseToPayee: boolean;
  oracleKeypair: Keypair;
}

const PROOFPAY_IDL: any = {
  version: "0.1.0",
  name: "proofpay",
  instructions: [
    {
      name: "resolveDispute",
      accounts: [
        { name: "escrow", isMut: true, isSigner: false },
        { name: "oracle", isMut: false, isSigner: true },
        { name: "payer", isMut: true, isSigner: false },
        { name: "payee", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "payeeTokenAccount", isMut: true, isSigner: false },
        { name: "payerTokenAccount", isMut: true, isSigner: false },
        { name: "usdcMint", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "releaseToPayee", type: "bool" }],
    },
  ],
  accounts: [
    {
      name: "EscrowAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "escrowId", type: { array: ["u8", 32] } },
          { name: "payer", type: "publicKey" },
          { name: "payee", type: "publicKey" },
          { name: "usdcMint", type: "publicKey" },
          { name: "totalAmount", type: "u64" },
          { name: "releasedAmount", type: "u64" },
          { name: "state", type: { defined: "EscrowState" } },
        ],
      },
    },
  ],
  types: [
    {
      name: "EscrowState",
      type: {
        kind: "enum",
        variants: [
          { name: "Created" },
          { name: "Funded" },
          { name: "Completed" },
          { name: "Refunded" },
          { name: "Disputed" },
        ],
      },
    },
  ],
};

class ProofPayClient {
  private connection: Connection;
  private programId: PublicKey;
  private program: Program;

  constructor(rpcUrl: string, provider: AnchorProvider) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.programId = new PublicKey("FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i");
    // Anchor 0.30.x: Program(idl, provider)
    this.program = new Program(PROOFPAY_IDL as any, provider as any);
  }

  async getEscrowPDA(escrowId: Uint8Array): Promise<PublicKey> {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(escrowId)],
      this.programId
    );
    return pda;
  }

  async getEscrow(escrowId: Uint8Array): Promise<any> {
    const pda = await this.getEscrowPDA(escrowId);
    return await (this.program.account as any).escrowAccount.fetch(pda);
  }

  async resolveDispute(params: ResolveDisputeParams): Promise<string> {
    const escrow = await this.getEscrow(params.escrowId);
    const pda = await this.getEscrowPDA(params.escrowId);
    const vault = getAssociatedTokenAddressSync(escrow.usdcMint, pda, true);
    const payeeTokenAccount = getAssociatedTokenAddressSync(escrow.usdcMint, escrow.payee);
    const payerTokenAccount = getAssociatedTokenAddressSync(escrow.usdcMint, escrow.payer);

    return this.program.methods
      .resolveDispute(params.releaseToPayee)
      .accounts({
        escrow: pda,
        oracle: params.oracleKeypair.publicKey,
        payer: escrow.payer,
        payee: escrow.payee,
        vault,
        payeeTokenAccount,
        payerTokenAccount,
        usdcMint: escrow.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([params.oracleKeypair])
      .rpc();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Logic
// ─────────────────────────────────────────────────────────────────────────────

const app = new Hono();
app.use('/*', cors());

const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const ORACLE_WALLET_ADDRESS = process.env.ORACLE_WALLET_ADDRESS;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ORACLE_PRIVATE_KEY || !ORACLE_WALLET_ADDRESS) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const oracleKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(ORACLE_PRIVATE_KEY)));
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

class NodeWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  async signTransaction<T extends any>(tx: T): Promise<T> {
    if ("version" in (tx as any)) (tx as any).sign([this.payer]); else (tx as any).sign(this.payer as any);
    return tx;
  }
  async signAllTransactions<T extends any>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
  get publicKey() { return this.payer.publicKey; }
}

const provider = new AnchorProvider(connection, new NodeWallet(oracleKeypair), { commitment: 'confirmed' });
const client = new ProofPayClient(SOLANA_RPC_URL, provider);

app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

app.post('/oracle/evaluate', async (c) => {
  try {
    const { escrow_id, evidence, escrow_pda } = await c.req.json();
    if (!escrow_id || !evidence || !escrow_pda) return c.json({ error: "Missing fields" }, 400);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are a B2B payment arbitrator. Based on this evidence, should the milestone payment be released?
Evidence: ${evidence}
Respond ONLY with JSON: {decision: 'approve'|'reject', confidence: 0-100, reason: string}`
        }]
      })
    });

    const completion = await response.json() as any;
    const aiDecision = JSON.parse(completion.content[0].text);

    if (aiDecision.decision === 'approve') {
      const escrowIdBytes = Array.isArray(escrow_id) ? new Uint8Array(escrow_id) : new Uint8Array(Object.values(escrow_id));
      const txid = await client.resolveDispute({ escrowId: escrowIdBytes, releaseToPayee: true, oracleKeypair });
      await supabase.from("oracle_decisions").insert({ escrow_pda, decision: 'approve', confidence: aiDecision.confidence, reason: aiDecision.reason, tx_signature: txid });
      return c.json({ status: "success", decision: "approve", txid });
    } else {
      await supabase.from("oracle_decisions").insert({ escrow_pda, decision: 'reject', confidence: aiDecision.confidence, reason: aiDecision.reason, status: 'pending_human_review' });
      return c.json({ status: "rejected", reason: aiDecision.reason }, 402, {
        'X-PAYMENT-REQUIRED': JSON.stringify({ price: "10", currency: "USDC", scheme: "exact", network: "solana", payTo: ORACLE_WALLET_ADDRESS, resource: "dispute_appeal" })
      });
    }
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
serve({ fetch: app.fetch, port }, (info) => console.log(`Oracle running on port ${info.port}`));
