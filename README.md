# ProofPay 🔐

> Solana-native B2B escrow protocol with x402 payment routing — letting AI agents and businesses transact with trustless, milestone-based settlement.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF)](https://solana.com)
[![x402 Compatible](https://img.shields.io/badge/x402-Compatible-blue)](https://x402.org)

---

## 🧩 What is ProofPay?

ProofPay is a **trustless B2B escrow protocol** built on Solana that combines two core innovations:

1. **On-Chain Milestone Escrow (Anchor Program)** — A smart contract that locks funds (USDC/USDG) and releases them automatically upon cryptographic proof of delivery — no human arbitrator needed. Supports partial escrow (per-milestone locking), automatic refund on timeout, and multisig dispute resolution.

2. **Native x402 Protocol Integration** — ProofPay exposes HTTP endpoints following the [x402 standard](https://x402.org) (HTTP 402 "Payment Required"). This allows autonomous AI agents — such as those built with LangChain, CrewAI, or Eliza (ai16z) — to discover, negotiate, and settle B2B services without human intervention.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ProofPay Stack                         │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                              │
│  ├── Escrow Dashboard                                       │
│  ├── Milestone Tracker                                      │
│  └── Wallet Integration (Phantom / Backpack)                │
├─────────────────────────────────────────────────────────────┤
│  x402 Server (Hono / Deno)                                  │
│  ├── HTTP 402 Challenge / Response                          │
│  ├── Payment Signature Verification                         │
│  └── On-chain Settlement Confirmation                       │
├─────────────────────────────────────────────────────────────┤
│  Anchor Program (Rust)                                      │
│  ├── create_escrow                                          │
│  ├── fund_escrow                                            │
│  ├── release_milestone                                      │
│  ├── refund_on_timeout                                      │
│  └── open_dispute                                           │
├─────────────────────────────────────────────────────────────┤
│  TypeScript SDK (@proofpay/sdk)                             │
│  ├── createEscrow()                                         │
│  ├── payMilestone()                                         │
│  └── releaseOnVerification()                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
proofpay/
├── programs/              # Anchor smart contract (Rust)
│   └── proofpay/
│       └── src/
│           └── lib.rs
├── server/                # x402-compatible HTTP server (Hono/Deno)
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── index.ts
│   └── package.json
├── sdk/                   # TypeScript SDK (@proofpay/sdk)
│   ├── src/
│   │   ├── escrow.ts
│   │   ├── x402.ts
│   │   └── index.ts
│   └── package.json
├── app/                   # React frontend dashboard
│   ├── src/
│   └── package.json
├── tests/                 # Integration and unit tests
├── Anchor.toml
├── Cargo.toml
└── README.md
```

---

## 🚀 Roadmap

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1 | Anchor escrow program (devnet) | 🔄 In Progress |
| M2 | x402 HTTP server + on-chain verification | 📋 Planned |
| M3 | TypeScript SDK (`@proofpay/sdk`) | 📋 Planned |
| M4 | React dashboard + wallet integration | 📋 Planned |
| M5 | Mainnet launch + Colosseum submission | 📋 Planned |

---

## 🛠️ Tech Stack

- **Blockchain**: Solana (Mainnet-Beta)
- **Smart Contracts**: Anchor Framework (Rust)
- **Payment Protocol**: [x402](https://x402.org) (HTTP 402 standard)
- **Settlement Token**: USDC / USDG
- **Backend**: Hono + Deno
- **Frontend**: React 19 + TypeScript + Vite
- **Wallet**: Phantom, Backpack

---

## 🤖 AI Agent Integration

ProofPay is designed to be the payments layer for AI agents. Any agent can:

1. Call a ProofPay-protected endpoint
2. Receive a `402 Payment Required` response with x402 headers
3. Construct and sign a Solana transaction autonomously
4. Access the service after ~400ms (Solana finality)

```typescript
// Example: AI agent paying for a B2B service via ProofPay
import { ProofPayClient } from "@proofpay/sdk";

const client = new ProofPayClient({ network: "mainnet-beta" });

const escrow = await client.createEscrow({
  amount: 500, // USDC
  milestones: [
    { description: "Delivery of dataset", releasePercent: 50 },
    { description: "Integration verified", releasePercent: 50 },
  ],
  timeoutDays: 30,
});
```

---

## 📄 License

MIT — see [LICENSE](./LICENSE)

---

## 🙏 Built for

[Superteam Agentic Engineering Grant](https://superteam.fun/earn/grants/agentic-engineering) | Built on [Solana](https://solana.com) | Powered by [x402](https://x402.org)
