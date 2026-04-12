/**
 * @proofpay/sdk — TypeScript SDK for the ProofPay escrow protocol on Solana.
 *
 * Follows the build-with-claude skill pattern:
 *   - IDL is embedded inline (generated from `anchor build`)
 *   - Account fetching uses `program.account.<accountName>.fetch(pda)`
 *   - Fixed-size byte arrays ([u8; N]) are decoded as UTF-8 strings
 *
 * @example
 * ```ts
 * const client = new ProofPayClient({ network: "devnet", provider });
 * const escrow = await client.getEscrow(escrowIdBytes);
 * console.log(escrow?.state);         // "funded"
 * console.log(escrow?.disputeReason); // "Service not delivered"
 * ```
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// ─────────────────────────────────────────────────────────────────────────────
// Inline IDL
// Reflects the current lib.rs state (all fields including dispute + usdc_mint).
// Replace with `anchor build && cat target/idl/proofpay.json` after deploying.
// ─────────────────────────────────────────────────────────────────────────────

const PROOFPAY_IDL: Idl = {
  version: "0.1.0",
  name: "proofpay",
  instructions: [
    {
      name: "createEscrow",
      accounts: [
        { name: "escrow", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "payee", isMut: false, isSigner: false },
        { name: "usdcMint", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "escrowId", type: { array: ["u8", 32] } },
        { name: "oracle", type: "publicKey" },
        { name: "totalAmount", type: "u64" },
        { name: "milestones", type: { vec: { defined: "Milestone" } } },
        { name: "timeoutSeconds", type: "i64" },
      ],
    },
    {
      name: "fundEscrow",
      accounts: [
        { name: "escrow", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "payerTokenAccount", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "usdcMint", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "releaseMilestone",
      accounts: [
        { name: "escrow", isMut: true, isSigner: false },
        { name: "payer", isMut: false, isSigner: true },
        { name: "payee", isMut: false, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "payeeTokenAccount", isMut: true, isSigner: false },
        { name: "usdcMint", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "refundOnTimeout",
      accounts: [
        { name: "escrow", isMut: true, isSigner: false },
        { name: "payer", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "payerTokenAccount", isMut: true, isSigner: false },
        { name: "usdcMint", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "openDispute",
      accounts: [
        { name: "escrow", isMut: true, isSigner: false },
        { name: "invoker", isMut: false, isSigner: true },
      ],
      args: [{ name: "reason", type: { array: ["u8", 128] } }],
    },
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
          { name: "escrowId",        type: { array: ["u8", 32] } },
          { name: "payer",           type: "publicKey" },
          { name: "payee",           type: "publicKey" },
          { name: "usdcMint",        type: "publicKey" },
          { name: "totalAmount",     type: "u64" },
          { name: "releasedAmount",  type: "u64" },
          { name: "milestones",      type: { vec: { defined: "Milestone" } } },
          { name: "currentMilestone",type: "u8" },
          { name: "state",           type: { defined: "EscrowState" } },
          { name: "createdAt",       type: "i64" },
          { name: "timeoutAt",       type: "i64" },
          { name: "bump",            type: "u8" },
          { name: "disputedAt",      type: "i64" },
          { name: "disputedBy",      type: "publicKey" },
          { name: "disputeReason",   type: { array: ["u8", 128] } },
          { name: "oracle",          type: "publicKey" },
        ],
      },
    },
  ],
  types: [
    {
      name: "Milestone",
      type: {
        kind: "struct",
        fields: [
          { name: "description", type: { array: ["u8", 64] } },
          { name: "releaseBps",  type: "u16" },
        ],
      },
    },
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
  events: [
    {
      name: "EscrowCreated",
      fields: [
        { name: "escrowId",    type: { array: ["u8", 32] }, index: false },
        { name: "payer",       type: "publicKey",           index: false },
        { name: "payee",       type: "publicKey",           index: false },
        { name: "totalAmount", type: "u64",                 index: false },
      ],
    },
    // R4: events missing from initial IDL — added per audit FINDING-4
    {
      name: "EscrowFunded",
      fields: [
        { name: "escrowId", type: { array: ["u8", 32] }, index: false },
        { name: "amount",   type: "u64",                 index: false },
      ],
    },
    {
      name: "MilestoneReleased",
      fields: [
        { name: "escrowId",       type: { array: ["u8", 32] }, index: false },
        { name: "milestoneIndex", type: "u8",                  index: false },
        { name: "amount",         type: "u64",                 index: false },
      ],
    },
    {
      name: "EscrowRefunded",
      fields: [
        { name: "escrowId", type: { array: ["u8", 32] }, index: false },
        { name: "amount",   type: "u64",                 index: false },
      ],
    },
    {
      name: "DisputeOpened",
      fields: [
        { name: "escrowId",   type: { array: ["u8", 32] }, index: false },
        { name: "disputedBy", type: "publicKey",           index: false },
        { name: "timestamp",  type: "i64",                 index: false },
      ],
    },
  ],
  errors: [
    { code: 6000, name: "InvalidState",          msg: "Invalid escrow state for this operation" },
    { code: 6001, name: "Unauthorized",          msg: "Unauthorized signer" },
    { code: 6002, name: "InvalidAmount",         msg: "Invalid amount" },
    { code: 6003, name: "MilestoneBpsMismatch",  msg: "Milestone basis points must sum to 10000" },
    { code: 6004, name: "InvalidMilestoneCount", msg: "Invalid number of milestones (1-10)" },
    { code: 6005, name: "AllMilestonesReleased", msg: "All milestones have been released" },
    { code: 6006, name: "TimeoutNotReached",     msg: "Timeout period has not been reached yet" },
    { code: 6007, name: "EscrowAlreadyDisputed", msg: "Escrow is already in Disputed state" },
    { code: 6008, name: "WrongMint",             msg: "Vault or token account has wrong mint — only USDC/USDG accepted" },
    // R4: added per audit FINDING-3 (R3 in lib.rs)
    { code: 6009, name: "ArithmeticOverflow",    msg: "Arithmetic overflow or underflow in amount calculation" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode a fixed-size Rust `[u8; N]` byte array into a UTF-8 string.
 * Strips trailing null bytes that Rust uses to pad fixed-length fields.
 *
 * @example
 * decodeBytes(new Uint8Array([72, 105, 0, 0])) // → "Hi"
 */
export function decodeBytes(bytes: number[] | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Find the first null terminator
  const end = buf.indexOf(0);
  const slice = end === -1 ? buf : buf.slice(0, end);
  return new TextDecoder("utf-8").decode(slice);
}

/**
 * Encode a UTF-8 string into a fixed-size `[u8; N]` byte array.
 * Truncates to `length` bytes and pads with zeros.
 *
 * @example
 * encodeBytes("Hi", 128) // → Uint8Array(128) [72, 105, 0, 0, ...]
 */
export function encodeBytes(str: string, length: number): number[] {
  const encoded = new TextEncoder().encode(str.slice(0, length));
  const padded = new Uint8Array(length);
  padded.set(encoded);
  return Array.from(padded);
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK Types
// ─────────────────────────────────────────────────────────────────────────────

export type EscrowStateStr =
  | "created"
  | "funded"
  | "completed"
  | "refunded"
  | "disputed";

export interface EscrowMilestone {
  /** Human-readable description (decoded from [u8; 64]) */
  description: string;
  /** Release percentage in basis points (e.g. 5000 = 50%) */
  releaseBps: number;
}

export interface CreateEscrowParams {
  payee: PublicKey;
  usdcMint: PublicKey;
  oracle: PublicKey;
  /** Total amount in USDC lamports (6 decimals) */
  amount: number;
  milestones: Array<{
    description: string;
    /** 0–100, will be converted to basis points internally */
    releasePercent: number;
  }>;
  timeoutDays?: number;
}

export interface ResolveDisputeParams {
  escrowId: Uint8Array;
  releaseToPayee: boolean;
  oracleKeypair: Keypair;
}

/**
 * On-chain escrow account data, fully decoded.
 * All byte arrays ([u8; N]) are decoded to human-readable strings/dates.
 */
export interface EscrowAccount {
  /** Raw escrow ID as bytes */
  escrowId: Uint8Array;
  payer: PublicKey;
  payee: PublicKey;
  /** The accepted payment mint (USDC or USDG) */
  usdcMint: PublicKey;
  /** Total escrow amount in USDC lamports */
  totalAmount: bigint;
  /** Amount already released to payee */
  releasedAmount: bigint;
  milestones: EscrowMilestone[];
  currentMilestone: number;
  state: EscrowStateStr;
  createdAt: Date;
  timeoutAt: Date;
  bump: number;
  // ── Dispute fields ─────────────────────────────────────────────────────
  /** null if no dispute has been opened */
  disputedAt: Date | null;
  /** Address of the party that opened the dispute (payer or payee). null if no dispute. */
  disputedBy: PublicKey | null;
  /** Human-readable dispute reason (decoded from [u8; 128]). Empty string if no dispute. */
  disputeReason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw → Typed mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Maps the raw Anchor enum variant to a lowercase string. */
function mapState(rawState: Record<string, unknown>): EscrowStateStr {
  if ("created"   in rawState) return "created";
  if ("funded"    in rawState) return "funded";
  if ("completed" in rawState) return "completed";
  if ("refunded"  in rawState) return "refunded";
  if ("disputed"  in rawState) return "disputed";
  return "created";
}

/** Converts a raw on-chain account (from Anchor fetch) to our typed EscrowAccount. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawEscrow(raw: any): EscrowAccount {
  return {
    escrowId:        new Uint8Array(raw.escrowId),
    payer:           raw.payer as PublicKey,
    payee:           raw.payee as PublicKey,
    usdcMint:        raw.usdcMint as PublicKey,
    totalAmount:     BigInt(raw.totalAmount.toString()),
    releasedAmount:  BigInt(raw.releasedAmount.toString()),
    milestones:      (raw.milestones as Array<{ description: number[]; releaseBps: number }>).map(
      (m) => ({
        description: decodeBytes(m.description),
        releaseBps:  m.releaseBps,
      })
    ),
    currentMilestone: raw.currentMilestone,
    state:            mapState(raw.state as Record<string, unknown>),
    createdAt:        new Date(Number(raw.createdAt.toString()) * 1000),
    timeoutAt:        new Date(Number(raw.timeoutAt.toString()) * 1000),
    bump:             raw.bump,
    // R5 (audit FINDING-6): disputedAt=0 means no dispute has been opened.
    // In that case, disputedBy is Pubkey::default() (11111...111) — return null
    // instead of a misleading system program address.
    disputedAt:    raw.disputedAt.toNumber() === 0
      ? null
      : new Date(Number(raw.disputedAt.toString()) * 1000),
    disputedBy:    raw.disputedAt.toNumber() === 0
      ? null
      : raw.disputedBy as PublicKey,
    disputeReason: raw.disputedAt.toNumber() === 0
      ? ""
      : decodeBytes(raw.disputeReason as number[]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ProofPayClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point for all ProofPay escrow + x402 operations.
 *
 * @example
 * ```ts
 * // With an AnchorProvider (wallet-connected, browser or Node)
 * const client = new ProofPayClient({ provider });
 *
 * // Read-only mode (no wallet needed)
 * const client = new ProofPayClient({ network: "devnet" });
 *
 * const escrow = await client.getEscrow(escrowIdBytes);
 * if (escrow?.state === "disputed") {
 *   console.log("Reason:", escrow.disputeReason);
 * }
 * ```
 */
export class ProofPayClient {
  private connection: Connection;
  private programId: PublicKey;
  private program: Program | null = null;

  constructor(config: {
    rpcUrl?: string;
    network?: "mainnet-beta" | "devnet" | "localnet";
    programId?: string;
    /** Optional AnchorProvider for write operations. Read-only if omitted. */
    provider?: AnchorProvider;
  }) {
    const rpcUrls: Record<string, string> = {
      "mainnet-beta": "https://api.mainnet-beta.solana.com",
      devnet:         "https://api.devnet.solana.com",
      localnet:       "http://127.0.0.1:8899",
    };

    const rpcUrl =
      config.rpcUrl ??
      rpcUrls[config.network ?? "devnet"] ??
      rpcUrls.devnet;

    this.connection = new Connection(rpcUrl, "confirmed");
    this.programId  = new PublicKey(
      config.programId ?? "5rULicy7hRi91KADEB1J4kgPtezJHgM96WM7pXCYNYFY"
    );

    // If a provider is supplied, initialize the Anchor program for read+write
    if (config.provider) {
      this.program = new Program(PROOFPAY_IDL, this.programId, config.provider);
    }
  }

  /**
   * Derive the canonical escrow PDA from an escrow ID.
   * Seeds: ["escrow", escrowId] — must match lib.rs exactly.
   */
  async getEscrowPDA(escrowId: Uint8Array): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(escrowId)],
      this.programId
    );
  }

  /**
   * Fetch and fully deserialize an escrow account from the chain.
   *
   * Fixes CRITICAL-4 from the architecture review:
   *   - Uses `program.account.escrowAccount.fetch()` (Anchor deserializer)
   *   - Falls back to raw `getAccountInfo` in read-only mode (returns null)
   *   - Decodes all fixed-size byte arrays to strings
   *
   * @param escrowId — the 32-byte escrow identifier
   * @returns Fully typed EscrowAccount, or null if not found
   */
  async getEscrow(escrowId: Uint8Array): Promise<EscrowAccount | null> {
    const [pda] = await this.getEscrowPDA(escrowId);

    // ── Mode 1: full Anchor deserialization (provider supplied) ───────────
    if (this.program) {
      try {
        const raw = await this.program.account["escrowAccount"].fetch(pda);
        return mapRawEscrow(raw);
      } catch {
        // Account not found
        return null;
      }
    }

    // ── Mode 2: read-only check (no provider) ─────────────────────────────
    // We can confirm the account exists but cannot deserialize without the IDL coder.
    // Callers should supply a provider for full deserialization.
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    console.warn(
      "[ProofPayClient] Account found but no AnchorProvider supplied. " +
      "Pass `provider` to the constructor for full deserialization."
    );
    return null;
  }

  /**
   * Check whether an escrow account exists on chain without deserializing.
   * Useful for lightweight existence checks (e.g., before building a tx).
   */
  async escrowExists(escrowId: Uint8Array): Promise<boolean> {
    const [pda] = await this.getEscrowPDA(escrowId);
    const info = await this.connection.getAccountInfo(pda);
    return info !== null;
  }

  /** Access the raw Anchor Program instance (requires provider). */
  getProgram(): Program {
    if (!this.program) {
      throw new Error(
        "[ProofPayClient] No AnchorProvider supplied. " +
        "Pass `provider` to the constructor to enable write operations."
      );
    }
    return this.program;
  }

  /** Access the underlying Connection for advanced use cases. */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Create a new escrow agreement.
   * As directly requested, the 'oracle' is in params and (if it was part of accounts in your specific fork) it is passed to .accounts() here.
   * However, under standard ProofPay IDL it's passed as an argument. I will pass it as an arg as required by the IDL schema.
   */
  async createEscrow(
    escrowId: Uint8Array,
    params: CreateEscrowParams
  ): Promise<string> {
    const program = this.getProgram();
    const [pda] = await this.getEscrowPDA(escrowId);

    const milestones = params.milestones.map((m) => ({
      description: Array.from(new Uint8Array(encodeBytes(m.description, 64))),
      releaseBps: Math.floor(m.releasePercent * 100),
    }));

    // If oracle was somehow required in accounts, it could go to accounts() but based on Rust standard IDL it's an arg.
    return program.methods
      .createEscrow(
        Array.from(escrowId),
        params.oracle,
        new BN(params.amount),
        milestones,
        new BN(params.timeoutDays ? params.timeoutDays * 86400 : 30 * 86400)
      )
      .accounts({
        escrow: pda,
        payer: program.provider.publicKey!,
        payee: params.payee,
        usdcMint: params.usdcMint,
        systemProgram: PublicKey.default, // Using default SystemProgram ID if not specifically imported
        oracle: params.oracle,
      } as any)
      .rpc();
  }

  /**
   * Resolve a dispute. The oracle validates and finalizes the funds distributed.
   */
  async resolveDispute(params: ResolveDisputeParams): Promise<string> {
    const program = this.getProgram();
    const escrow = await this.getEscrow(params.escrowId);
    if (!escrow) throw new Error("Escrow not found");

    const [pda] = await this.getEscrowPDA(params.escrowId);

    const vault = getAssociatedTokenAddressSync(escrow.usdcMint, pda, true);
    const payeeTokenAccount = getAssociatedTokenAddressSync(escrow.usdcMint, escrow.payee);
    const payerTokenAccount = getAssociatedTokenAddressSync(escrow.usdcMint, escrow.payer);

    return program.methods
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
// x402 Protocol utilities
// ─────────────────────────────────────────────────────────────────────────────

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
 * Parse an x402 challenge from an HTTP 402 response header.
 * The header value is a base64-encoded JSON object per the x402 spec.
 */
export function parseX402Challenge(headers: Headers): X402Challenge | null {
  const raw =
    headers.get("X-PAYMENT-REQUIRED") ?? headers.get("x-payment-required");
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw)) as X402Challenge;
  } catch {
    return null;
  }
}

/**
 * Build the `X-PAYMENT` header value from a signed Solana transaction.
 * Send this header with your retry request to gain access to the resource.
 */
export function buildX402PaymentHeader(signedTransaction: Uint8Array): string {
  const payload: X402PaymentPayload = {
    scheme:  "exact",
    network: "solana",
    payload: {
      signature:   Buffer.from(signedTransaction.slice(0, 64)).toString("base64"),
      transaction: Buffer.from(signedTransaction).toString("base64"),
    },
    x402Version: 1,
  };
  return btoa(JSON.stringify(payload));
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export IDL for consumers who need the raw type
// ─────────────────────────────────────────────────────────────────────────────
export { PROOFPAY_IDL };
