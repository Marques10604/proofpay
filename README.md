# ProofPay 🔐

> **We don't just process payments. We verify reality before money moves.**

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

## 🔌 Build on ProofPay (Universal Infrastructure)

ProofPay is designed as a **universal settlement infrastructure**. It is completely unopinionated about your business model, allowing you to build any platform on top of our smart contracts and x402 routing protocol. You bring the UI and the users; we handle the trustless execution.

### 🌟 Core Use Cases

1. **Freelance Platforms**
   Replace legacy escrow providers with a web3-native protocol. Clients lock USDC upfront, and freelancers receive funds directly to their wallets upon milestone completion—no high middleman fees, no manual invoicing.

2. **Decentralized Marketplaces**
   Build the next generation of B2B SaaS or creative marketplaces. ProofPay ensures that buyers are protected until delivery, and sellers have mathematical guarantees that the funds exist and are committed on-chain.

3. **High-Value B2B Contracts**
   Secure cross-border agreements for software agencies, consultancies, or enterprise procurement. Integrate ProofPay into your custom proposal flow to remove counterparty risk and eliminate accounts receivable friction entirely.

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
| M1 | Anchor escrow program (Contract) | ✅ Done |
| M2 | Security Suite | ✅ Done |
| M3 | Supabase Event Mapping | ✅ Done |
| M4 | React dashboard + wallet integration | 📋 Planned |
| M5 | Mainnet launch + Colosseum submission | 📋 Planned |

---

## 🛡️ Technical Rigor & Security

O ProofPay foi desenhado com foco em segurança rigorosa e otimização para a mainnet:

- **PDA Strategy:** O protocolo utiliza sementes determinísticas (`[b"escrow", escrow_id]`) para derivar Program Derived Addresses (PDAs), garantindo um isolamento absoluto de estado para as contas.
- **Security Invariants:** Todas as transições de estado são rigorosamente validadas utilizando `require!`. Operações financeiras fazem uso exclusivo de `checked_arithmetic` (prevenindo overflows/underflows).
- **Rent Optimization:** Foco no ROI Técnico, otimizando os custos na Solana. Ao atingir estados terminais (conto `Completed` ou `Refunded`), as instruções invocam `close = payer`, encerrando a conta e devolvendo os lamports (rent) ao Payer.
- **Milestone Logic:** Implementa uma soma em Basis Points (bps) como uma invariante global do protocolo. A soma de cada milestone deve atingir precisamente `10000 bps` (100%), garantindo uma matemática perfeita nos repasses.

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
