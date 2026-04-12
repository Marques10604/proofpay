/**
 * ProofPay — Test Suite
 * ─────────────────────────────────────────────────────────────────────────
 * Runner : yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/proofpay.ts
 * Network: localnet  (anchor test spins the validator automatically)
 *
 * Coverage
 *   ✅ Suite 1 — Setup: airdrop + mock USDC mint + token accounts
 *   ✅ Suite 2 — Happy Path: Create → Fund → Release (Completed state)
 *   ✅ Suite 3 — Security: Release after Disputed → must revert (InvalidState)
 *
 * Design decisions
 *   - program.methods.xxx() for instruction calls (SDK builders are Phase 2)
 *   - ProofPayClient.getEscrow() for all on-chain reads (validates the SDK)
 *   - Vault is a regular token account whose authority is the escrow PDA
 *   - Inline IDL from sdk/src/index.ts (no dependency on anchor build output)
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// Import our SDK helpers — this validates the SDK exports work correctly
import {
  PROOFPAY_IDL,
  ProofPayClient,
  encodeBytes,
  decodeBytes,
} from "../sdk/src/index";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** USDC has 6 decimals; 1 USDC = 1_000_000 lamports */
const USDC_DECIMALS = 6;
const ONE_USDC = 1_000_000;

/** Escrow amount: 100 USDC (2 milestones × 50 USDC) */
const ESCROW_AMOUNT = 100 * ONE_USDC;

/** 7-day timeout in seconds */
const TIMEOUT_7_DAYS = new BN(7 * 24 * 3600);

/**
 * Anchor error code for InvalidState (see lib.rs EscrowError enum, code 6000).
 * Anchor encodes custom errors as 6000 + discriminant index.
 * InvalidState is index 0 → 6000.
 */
const ERR_INVALID_STATE = 6000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a random 32-byte escrow ID */
function randomEscrowId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Derive the canonical escrow PDA.
 * Seeds must match lib.rs exactly: ["escrow", escrow_id]
 */
async function escrowPDA(
  escrowId: Uint8Array,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(escrowId)],
    programId
  );
}

/**
 * Assert that a transaction promise throws an Anchor CustomError with the
 * expected code. Fails the test if the tx succeeds or throws a different error.
 */
async function assertAnchorError(
  txPromise: Promise<unknown>,
  expectedCode: number,
  label: string
): Promise<void> {
  try {
    await txPromise;
    assert.fail(`${label}: expected transaction to revert but it succeeded`);
  } catch (err: unknown) {
    const msg = (err as Error).message ?? String(err);

    // Anchor surfaces custom errors as "custom program error: 0x<hex>"
    // e.g. 6000 = 0x1770
    const hex = expectedCode.toString(16);
    const errHex = `0x${hex}`;

    assert.include(
      msg,
      errHex,
      `${label}: expected error code ${expectedCode} (${errHex}), got: ${msg}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test State (shared across suites via closure)
// ─────────────────────────────────────────────────────────────────────────────

describe("ProofPay Escrow Protocol", () => {
  // ── Anchors ────────────────────────────────────────────────────────────────
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(
    PROOFPAY_IDL as Idl,
    new PublicKey("5rULicy7hRi91KADEB1J4kgPtezJHgM96WM7pXCYNYFY"),
    provider
  );

  // SDK client (read-only operations)
  const sdkClient = new ProofPayClient({
    provider,
    programId: "5rULicy7hRi91KADEB1J4kgPtezJHgM96WM7pXCYNYFY",
  });

  // ── Actors ─────────────────────────────────────────────────────────────────
  /** payer = maker = client who opens the escrow */
  const payer = Keypair.generate();
  /** payee = taker = freelancer who receives milestone payments */
  const payee = Keypair.generate();

  // ── Shared on-chain accounts ────────────────────────────────────────────────
  let usdcMint: PublicKey;
  let payerTokenAccount: PublicKey;
  let payeeTokenAccount: PublicKey;

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 1 — Setup
  // ─────────────────────────────────────────────────────────────────────────

  describe("Suite 1 — Environment Setup", () => {
    it("airdrops SOL to payer and payee for rent and fees", async () => {
      const payerSig = await provider.connection.requestAirdrop(
        payer.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      const payeeSig = await provider.connection.requestAirdrop(
        payee.publicKey,
        1 * LAMPORTS_PER_SOL // payee only needs rent for its token account
      );

      await provider.connection.confirmTransaction(payerSig, "confirmed");
      await provider.connection.confirmTransaction(payeeSig, "confirmed");

      const payerBal = await provider.connection.getBalance(payer.publicKey);
      assert.isAbove(payerBal, 4 * LAMPORTS_PER_SOL, "payer SOL balance too low");
    });

    it("creates mock USDC mint (6 decimals)", async () => {
      usdcMint = await createMint(
        provider.connection,
        payer,            // mint fee payer
        payer.publicKey,  // mint authority
        null,             // no freeze authority
        USDC_DECIMALS
      );
      assert.ok(usdcMint, "USDC mint not created");
    });

    it("creates payer and payee token accounts and mints 100 USDC to payer", async () => {
      payerTokenAccount = await createAccount(
        provider.connection,
        payer,
        usdcMint,
        payer.publicKey
      );
      payeeTokenAccount = await createAccount(
        provider.connection,
        payer,          // payer funds the account creation
        usdcMint,
        payee.publicKey
      );

      // Mint exactly the escrow amount + a small reserve to payer
      await mintTo(
        provider.connection,
        payer,
        usdcMint,
        payerTokenAccount,
        payer,            // mint authority
        ESCROW_AMOUNT * 3 // 300 USDC — enough for multiple test suites
      );

      const acct = await getAccount(provider.connection, payerTokenAccount);
      assert.equal(
        Number(acct.amount),
        ESCROW_AMOUNT * 3,
        "payer token balance mismatch after mint"
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 2 — Happy Path: Create → Fund → Release
  // ─────────────────────────────────────────────────────────────────────────

  describe("Suite 2 — Happy Path: Create → Fund → Release", () => {
    const escrowId = randomEscrowId();
    let escrowAddress: PublicKey;
    let vault: PublicKey;

    /**
     * Milestone structure: 2 milestones of 50% each (5000 bps).
     * Encoded as [u8; 64] fixed-size arrays padded with zeros.
     */
    const milestones = [
      {
        description: encodeBytes("Milestone 1: Design complete", 64),
        releaseBps: 5000,
      },
      {
        description: encodeBytes("Milestone 2: Development complete", 64),
        releaseBps: 5000,
      },
    ];

    before("derive escrow PDA and create vault token account", async () => {
      [escrowAddress] = await escrowPDA(escrowId, program.programId);

      // The vault is a plain SPL token account whose authority is the escrow
      // PDA. Anchor's token::authority constraint will verify this on-chain.
      vault = await createAccount(
        provider.connection,
        payer,           // fee payer for account creation
        usdcMint,
        escrowAddress    // authority = escrow PDA (program-controlled)
      );
    });

    it("create_escrow — initialises PDA with correct state", async () => {
      await program.methods
        .createEscrow(
          Array.from(escrowId),   // [u8; 32]
          new BN(ESCROW_AMOUNT),  // u64
          milestones,
          TIMEOUT_7_DAYS          // i64
        )
        .accounts({
          escrow:        escrowAddress,
          payer:         payer.publicKey,
          payee:         payee.publicKey,
          usdcMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      // ── SDK read validation ──────────────────────────────────────────────
      const on_chain = await sdkClient.getEscrow(escrowId);
      assert.isNotNull(on_chain, "escrow account not found on-chain");
      assert.equal(on_chain!.state, "created",   "state should be 'created'");
      assert.equal(
        Number(on_chain!.totalAmount),
        ESCROW_AMOUNT,
        "totalAmount mismatch"
      );
      assert.equal(
        on_chain!.usdcMint.toBase58(),
        usdcMint.toBase58(),
        "usdc_mint not stored correctly"
      );
      assert.equal(
        decodeBytes(on_chain!.milestones[0].description as unknown as number[])
          .startsWith("Milestone 1"),
        true,
        // Note: EscrowMilestone.description is already decoded to string by the SDK
        "milestone description not decoded correctly"
      );
      assert.isNull(on_chain!.disputedAt, "disputedAt should be null before any dispute");
    });

    it("fund_escrow — payer transfers 100 USDC to vault, state → Funded", async () => {
      const payerBalBefore = Number(
        (await getAccount(provider.connection, payerTokenAccount)).amount
      );

      await program.methods
        .fundEscrow(new BN(ESCROW_AMOUNT))
        .accounts({
          escrow:             escrowAddress,
          payer:              payer.publicKey,
          payerTokenAccount,
          vault,
          usdcMint,
          tokenProgram:       TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      const payerBalAfter = Number(
        (await getAccount(provider.connection, payerTokenAccount)).amount
      );
      const vaultBal = Number(
        (await getAccount(provider.connection, vault)).amount
      );

      assert.equal(
        payerBalBefore - payerBalAfter,
        ESCROW_AMOUNT,
        "payer balance did not decrease by escrow amount"
      );
      assert.equal(vaultBal, ESCROW_AMOUNT, "vault did not receive full amount");

      const on_chain = await sdkClient.getEscrow(escrowId);
      assert.equal(on_chain!.state, "funded", "state should be 'funded' after funding");
    });

    it("release_milestone(0) — releases 50 USDC to payee, state stays Funded", async () => {
      const payeeBalBefore = Number(
        (await getAccount(provider.connection, payeeTokenAccount)).amount
      );

      await program.methods
        .releaseMilestone()
        .accounts({
          escrow:             escrowAddress,
          payer:              payer.publicKey,
          payee:              payee.publicKey,
          vault,
          payeeTokenAccount,
          usdcMint,
          tokenProgram:       TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      const payeeBalAfter = Number(
        (await getAccount(provider.connection, payeeTokenAccount)).amount
      );

      assert.equal(
        payeeBalAfter - payeeBalBefore,
        ESCROW_AMOUNT / 2,
        "payee should receive 50 USDC for milestone 1"
      );

      const on_chain = await sdkClient.getEscrow(escrowId);
      // After 1 of 2 milestones, state should still be Funded (not Completed yet)
      assert.equal(on_chain!.state, "funded",      "state should stay funded after 1/2 milestones");
      assert.equal(on_chain!.currentMilestone, 1,  "currentMilestone should advance to 1");
      assert.equal(
        Number(on_chain!.releasedAmount),
        ESCROW_AMOUNT / 2,
        "releasedAmount should be 50 USDC"
      );
    });

    it("release_milestone(1) — releases final 50 USDC, state → Completed + PDA closed", async () => {
      await program.methods
        .releaseMilestone()
        .accounts({
          escrow:             escrowAddress,
          payer:              payer.publicKey,
          payee:              payee.publicKey,
          vault,
          payeeTokenAccount,
          usdcMint,
          tokenProgram:       TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      const payeeFinalBal = Number(
        (await getAccount(provider.connection, payeeTokenAccount)).amount
      );
      assert.equal(
        payeeFinalBal,
        ESCROW_AMOUNT,
        "payee should hold full 100 USDC after all milestones"
      );

      // After Completed, `close = payer` closes the PDA — getAccountInfo returns null
      const closedInfo = await provider.connection.getAccountInfo(escrowAddress);
      assert.isNull(closedInfo, "escrow PDA should be closed (lamports returned to payer)");

      // SDK getEscrow should now return null (account gone)
      const sdk_result = await sdkClient.getEscrow(escrowId);
      assert.isNull(sdk_result, "SDK should return null for closed escrow");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Suite 3 — Security: Disputed state blocks release_milestone
  // ─────────────────────────────────────────────────────────────────────────

  describe("Suite 3 — Security: release_milestone reverts in Disputed state", () => {
    /**
     * ATTACK SCENARIO
     * ─────────────────────────────────────────────────────────────────────
     * A rogue payer (or automated bot) tries to:
     *   1. Fund an escrow
     *   2. Open a dispute to freeze the funds
     *   3. Then immediately call release_milestone to drain funds to the payee
     *      (or the payee tries to game the arbitration window)
     *
     * Expected: Anchor rejects with InvalidState (6000) because the state
     *           machine requires state == Funded for release_milestone, but
     *           after open_dispute the state is Disputed.
     * ─────────────────────────────────────────────────────────────────────
     */

    const escrowId = randomEscrowId();
    let escrowAddress: PublicKey;
    let vault: PublicKey;

    const milestones = [
      {
        description: encodeBytes("Security test milestone", 64),
        releaseBps:  10000, // single 100% milestone for simplicity
      },
    ];

    before("setup escrow PDA + vault for security test", async () => {
      [escrowAddress] = await escrowPDA(escrowId, program.programId);
      vault = await createAccount(
        provider.connection,
        payer,
        usdcMint,
        escrowAddress
      );
    });

    it("setup: create and fund the dispute-test escrow", async () => {
      await program.methods
        .createEscrow(
          Array.from(escrowId),
          new BN(ESCROW_AMOUNT),
          milestones,
          TIMEOUT_7_DAYS
        )
        .accounts({
          escrow:        escrowAddress,
          payer:         payer.publicKey,
          payee:         payee.publicKey,
          usdcMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      await program.methods
        .fundEscrow(new BN(ESCROW_AMOUNT))
        .accounts({
          escrow:             escrowAddress,
          payer:              payer.publicKey,
          payerTokenAccount,
          vault,
          usdcMint,
          tokenProgram:       TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      const on_chain = await sdkClient.getEscrow(escrowId);
      assert.equal(on_chain!.state, "funded", "pre-condition: escrow must be Funded");
    });

    it("open_dispute — transitions state to Disputed, freezing funds", async () => {
      const reason = encodeBytes("Deliverable does not match spec", 128);

      await program.methods
        .openDispute(reason)
        .accounts({
          escrow:  escrowAddress,
          invoker: payer.publicKey, // maker opens the dispute
        })
        .signers([payer])
        .rpc();

      const on_chain = await sdkClient.getEscrow(escrowId);
      assert.equal(on_chain!.state, "disputed", "state should be 'disputed'");
      assert.isNotNull(on_chain!.disputedAt,    "disputedAt should be set");
      assert.isNotNull(on_chain!.disputedBy,    "disputedBy should be set");
      assert.equal(
        on_chain!.disputedBy!.toBase58(),
        payer.publicKey.toBase58(),
        "disputedBy should be the payer"
      );
      assert.equal(
        on_chain!.disputeReason,
        "Deliverable does not match spec",
        "dispute reason not stored/decoded correctly"
      );
    });

    it("🔒 release_milestone MUST revert with InvalidState while Disputed", async () => {
      /**
       * This is the critical security invariant:
       *   state == Disputed → require!(state == Funded) fails → tx reverts
       *
       * The require! on line 80 of lib.rs:
       *   require!(escrow.state == EscrowState::Funded, EscrowError::InvalidState)
       *
       * Anchor encodes InvalidState (index 0 in EscrowError) as error 6000 (0x1770).
       * The assertAnchorError helper confirms the correct error code is returned.
       */
      const releaseAttempt = program.methods
        .releaseMilestone()
        .accounts({
          escrow:             escrowAddress,
          payer:              payer.publicKey,
          payee:              payee.publicKey,
          vault,
          payeeTokenAccount,
          usdcMint,
          tokenProgram:       TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      await assertAnchorError(
        releaseAttempt,
        ERR_INVALID_STATE,
        "release_milestone in Disputed state"
      );
    });

    it("vault balance is unchanged — funds remain locked after failed release", async () => {
      const vaultBal = Number(
        (await getAccount(provider.connection, vault)).amount
      );
      assert.equal(
        vaultBal,
        ESCROW_AMOUNT,
        "vault must still hold full amount — no funds leaked despite attack attempt"
      );
    });

    it("unauthorized third party also cannot open a dispute", async () => {
      /**
       * Bonus security check: a random keypair that is neither payer nor payee
       * must be rejected by the account-level constraint in OpenDispute.
       */
      const attacker = Keypair.generate();
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(attacker.publicKey, LAMPORTS_PER_SOL)
      );

      const attackAttempt = program.methods
        .openDispute(encodeBytes("Attack", 128))
        .accounts({
          escrow:  escrowAddress,
          invoker: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();

      // Anchor constraint error, not a custom error — just check it throws
      try {
        await attackAttempt;
        assert.fail("attacker should not be able to open dispute");
      } catch (err: unknown) {
        assert.include(
          (err as Error).message,
          "Error",
          "expected transaction to fail for unauthorized invoker"
        );
      }
    });
  });
});
