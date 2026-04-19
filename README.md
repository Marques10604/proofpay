# ProofPay 🔐

> **We don't just process payments. We verify reality before money moves.**

> Solana-native B2B escrow protocol with AI-powered dispute resolution — letting businesses transact with trustless, milestone-based settlement.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF)](https://solana.com)
[![Deployed on Devnet](https://img.shields.io/badge/Network-Devnet-orange)](https://solana.com)

---

## 🏃‍♂️ Quick Start

Run the protocol and frontend locally:

```bash
anchor build
anchor test
cd app && npm run dev
```

---

## 🧩 What is ProofPay?

ProofPay is a **trustless B2B escrow protocol** built on Solana that combines two core components:

1. **On-Chain Escrow (Anchor Program)** — A smart contract that locks USDC and releases funds automatically. Supports dispute opening by either party, automatic refund on timeout (7 days), and AI-arbitrated dispute resolution.

2. **AI Oracle Server** — A Hono + Node.js server that receives dispute evidence, queries Claude (Anthropic) to evaluate the case, and submits the `resolve_dispute` transaction on-chain. Fully automated — no human arbitrator needed.

---

## 🔌 Build on ProofPay (Universal Infrastructure)

ProofPay is designed as a **universal settlement infrastructure**. It is completely unopinionated about your business model, allowing you to build any platform on top of our smart contracts. You bring the UI and the users; we handle the trustless execution.

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
│  Frontend (React + TypeScript)  — Vercel                    │
│  ├── Escrow Dashboard (create / monitor / release)          │
│  ├── Dispute Panel (open dispute + oracle result)           │
│  └── Wallet Integration (Phantom / Backpack)                │
├─────────────────────────────────────────────────────────────┤
│  AI Oracle Server (Hono + Node.js)  — Render                │
│  ├── POST /oracle/evaluate (receive evidence)               │
│  ├── Claude AI verdict (approve / reject)                   │
│  └── resolve_dispute tx submitted on-chain                  │
├─────────────────────────────────────────────────────────────┤
│  Anchor Program (Rust)  — Devnet                            │
│  ├── create_escrow                                          │
│  ├── fund_escrow                                            │
│  ├── release_funds                                          │
│  ├── open_dispute                                           │
│  └── resolve_dispute                                        │
├─────────────────────────────────────────────────────────────┤
│  TypeScript SDK (@proofpay/sdk)                             │
│  ├── createEscrow()                                         │
│  ├── fundEscrow()                                           │
│  ├── releaseFunds()                                         │
│  └── resolveDispute()                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
proofpay/
├── programs/proofpay/src/lib.rs   # Anchor smart contract (Rust)
├── app/src/                        # React frontend (TypeScript + Vite)
│   ├── components/
│   │   ├── CreateEscrow.tsx
│   │   ├── EscrowMonitor.tsx
│   │   ├── DisputePanel.tsx
│   │   └── TerminalHeader.tsx
│   └── idl/proofpay.json
├── server/src/index.ts             # AI Oracle server (Hono + Node.js)
├── sdk/src/index.ts                # @proofpay/sdk TypeScript
├── supabase/migrations/            # Supabase schema
├── tests/proofpay.ts               # Anchor test suite
└── Anchor.toml
```

---

## 🚀 Roadmap

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1 | Anchor escrow program (contract) | ✅ Done |
| M2 | Security hardening (checked arithmetic, PDA isolation, state guards) | ✅ Done |
| M3 | Supabase event indexing + oracle_decisions table | ✅ Done |
| M4 | React dashboard + wallet integration (live on Vercel) | ✅ Done |
| M5 | AI Oracle server + dispute resolution flow (live on Render) | ✅ Done |
| M6 | Colosseum hackathon submission | ✅ Done |
| M7 | Mainnet launch | 🔜 Next |

---

## 🛡️ Technical Rigor & Security

ProofPay foi desenhado com foco em segurança rigorosa e otimização para a mainnet:

- **PDA Strategy:** O protocolo utiliza sementes determinísticas (`[b"escrow", escrow_id]`) para derivar Program Derived Addresses (PDAs), garantindo um isolamento absoluto de estado para as contas.
- **Security Invariants:** Todas as transições de estado são rigorosamente validadas utilizando `require!`. Operações financeiras fazem uso exclusivo de `checked_arithmetic` (prevenindo overflows/underflows).
- **Rent Optimization:** Ao atingir estados terminais (`Completed` ou `Refunded`), as instruções invocam `close = payer`, encerrando a conta e devolvendo os lamports (rent) ao Payer.
- **Milestone Logic:** Implementa uma soma em Basis Points (bps) como invariante global. A soma de cada milestone deve atingir precisamente `10000 bps` (100%), garantindo uma matemática perfeita nos repasses.

---

## 🛠️ Tech Stack

- **Blockchain**: Solana (Devnet — mainnet em breve)
- **Smart Contracts**: Anchor Framework (Rust)
- **Settlement Token**: USDC mock (devnet) / USDC (mainnet)
- **AI Oracle**: Claude (Anthropic) via Hono + Node.js
- **Database**: Supabase (escrows + oracle_decisions)
- **Frontend**: React 19 + TypeScript + Vite (Vercel)
- **Wallet**: Phantom, Backpack

---

## 🤖 Dispute Resolution Flow

```
EscrowState::Funded
    ↓ open_dispute (payer ou payee)
EscrowState::Disputed
    ↓ oracle POST /oracle/evaluate → Claude AI analisa evidência
    ↓ resolve_dispute on-chain (oracle assina)
EscrowState::Completed  (release_to_payee = true)
    ou
EscrowState::Refunded   (release_to_payee = false)
    — fallback automático após 7 dias se oracle não responder
```

---

## 📄 License

MIT — see [LICENSE](./LICENSE)

---

## 🙏 Built for

[Superteam Agentic Engineering Grant](https://superteam.fun/earn/grants/agentic-engineering) | Built on [Solana](https://solana.com)
