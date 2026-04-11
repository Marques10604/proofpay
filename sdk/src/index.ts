import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";

export interface EscrowMilestone {
  description: string;
  releasePercent: number; // 0–100
}

export interface CreateEscrowParams {
  payee: PublicKey;
  amount: number; // in USDC lamports (6 decimals)
  milestones: EscrowMilestone[];
  timeoutDays?: number;
}

export interface EscrowAccount {
  escrowId: Uint8Array;
  payer: PublicKey;
  payee: PublicKey;
  totalAmount: bigint;
  releasedAmount: bigint;
  currentMilestone: number;
  state: "created" | "funded" | "completed" | "refunded" | "disputed";
  createdAt: Date;
  timeoutAt: Date;
}

/**
 * ProofPayClient — main entry point for all escrow + x402 operations.
 *
 * @example
 * ```ts
 * const client = new ProofPayClient({ rpcUrl: "https://api.mainnet-beta.solana.com" });
 * const escrow = await client.createEscrow({ ... });
 * ```
 */
export class ProofPayClient {
  private connection: Connection;
  private programId: PublicKey;

  constructor(config: {
    rpcUrl?: string;
    network?: "mainnet-beta" | "devnet" | "localnet";
    programId?: string;
  }) {
    const rpcUrls: Record<string, string> = {
      "mainnet-beta": "https://api.mainnet-beta.solana.com",
      devnet: "https://api.devnet.solana.com",
      localnet: "http://127.0.0.1:8899",
    };

    const rpcUrl =
      config.rpcUrl ??
      rpcUrls[config.network ?? "devnet"] ??
      rpcUrls.devnet;

    this.connection = new Connection(rpcUrl, "confirmed");
    this.programId = new PublicKey(
      config.programId ?? "5rULicy7hRi91KADEB1J4kgPtezJHgM96WM7pXCYNYFY"
    );
  }

  /**
   * Derive the escrow PDA address from escrowId
   */
  async getEscrowPDA(escrowId: Uint8Array): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(escrowId)],
      this.programId
    );
  }

  /**
   * Fetch an existing escrow account by ID
   */
  async getEscrow(escrowId: Uint8Array): Promise<EscrowAccount | null> {
    const [pda] = await this.getEscrowPDA(escrowId);
    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;
    // TODO: deserialize using Anchor IDL when IDL is generated
    return null;
  }

  /**
   * Get the connection instance for advanced use cases
   */
  getConnection(): Connection {
    return this.connection;
  }
}

// ─────────────────────────────────────────────
// x402 Payment utilities
// ─────────────────────────────────────────────

export interface X402Challenge {
  version: string;
  scheme: "exact";
  network: "solana";
  maxAmountRequired: string;
  resource: string;
  description: string;
  memoPrefix: string;
  payTo: string;
  requiredDeadlineSeconds: number;
  extra?: {
    name: string;
    version: string;
  };
}

export interface X402PaymentPayload {
  scheme: "exact";
  network: "solana";
  payload: {
    signature: string;
    transaction: string; // base64-encoded signed transaction
  };
  x402Version: number;
}

/**
 * Parse an x402 challenge from HTTP 402 response headers
 */
export function parseX402Challenge(headers: Headers): X402Challenge | null {
  const raw = headers.get("X-PAYMENT-REQUIRED") ?? headers.get("x-payment-required");
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw)) as X402Challenge;
  } catch {
    return null;
  }
}

/**
 * Build an x402 payment payload header value from a signed transaction
 */
export function buildX402PaymentHeader(
  signedTransaction: Uint8Array
): string {
  const payload: X402PaymentPayload = {
    scheme: "exact",
    network: "solana",
    payload: {
      signature: Buffer.from(signedTransaction.slice(0, 64)).toString("base64"),
      transaction: Buffer.from(signedTransaction).toString("base64"),
    },
    x402Version: 1,
  };
  return btoa(JSON.stringify(payload));
}

export * from "./index";
