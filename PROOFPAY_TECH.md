# PROOFPAY_TECH.md — Arquitetura Técnica

## Stack Completo

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Smart Contract | Anchor (Rust) | 0.30.1 |
| Blockchain | Solana | 1.18.0 |
| Token | USDC / USDG (SPL Token) | — |
| Backend / Oracle | Hono + Node.js 20 | Hono 4.3 |
| IA do Oracle | Claude via Anthropic API | claude-sonnet-4-5 |
| Frontend | React 19 + TypeScript + Vite | Vite 5.4 |
| UI | Tailwind CSS + shadcn/ui | — |
| Banco de dados | Supabase (PostgreSQL) | — |
| Deploy frontend | Vercel | — |
| Deploy oracle | Render (free tier) | — |
| SDK | `@proofpay/sdk` TypeScript | 0.1.0 |

---

## 1. Programa Anchor (`programs/proofpay/src/lib.rs`)

### Program ID
```
FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i   (devnet e localnet)
```

### Instruções

| Instrução | Signer requerido | Pré-condição de estado |
|-----------|-----------------|----------------------|
| `create_escrow` | payer | — |
| `fund_escrow` | payer | Created |
| `release_milestone` | payer | Funded |
| `refund_on_timeout` | payer | Funded + timeout_at <= now |
| `open_dispute` | payer **ou** payee | Funded |
| `resolve_dispute` | oracle | Disputed |
| `fallback_dispute_resolution` | qualquer | Disputed + dispute_timeout_at <= now |
| `init_oracle_reputation` | payer | — |
| `get_oracle_reputation` | — | — |

### Máquina de Estados

```
Created → Funded → Completed    (via release_milestone, último milestone)
                 → Refunded     (via refund_on_timeout)
                 → Disputed → Completed  (via resolve_dispute, release_to_payee=true)
                            → Refunded   (via resolve_dispute, release_to_payee=false)
                            → Refunded   (via fallback_dispute_resolution, 7 dias)
```

### EscrowAccount — Layout de Memória

```
Campo                  | Tipo        | Bytes
-----------------------|-------------|-------
discriminator          | [u8; 8]     | 8
escrow_id              | [u8; 32]    | 32
payer                  | Pubkey      | 32
payee                  | Pubkey      | 32
oracle                 | Pubkey      | 32
usdc_mint              | Pubkey      | 32
total_amount           | u64         | 8
released_amount        | u64         | 8
milestones             | Vec<M> (10) | 4 + 660
current_milestone      | u8          | 1
state                  | enum u8     | 1
created_at             | i64         | 8
timeout_at             | i64         | 8
bump                   | u8          | 1
disputed_at            | i64         | 8
disputed_by            | Pubkey      | 32
dispute_reason         | [u8; 128]   | 128
dispute_timeout_at     | i64         | 8
```

**Byte de estado** (para leitura raw): offset **255** na conta deserializada.
Valores: 0=Created, 1=Funded, 2=Completed, 3=Refunded, 4=Disputed

### PDA Seeds
```rust
seeds = [b"escrow", escrow_id]
// escrow_id é [u8; 32] gerado aleatoriamente no frontend com crypto.getRandomValues()
```

### Vault
Conta SPL Token `getAssociatedTokenAddressSync(usdc_mint, escrow_pda, allowOwnerOffCurve=true)`.
Autoridade da conta = escrow PDA (programa controla as transferências).

### OracleReputation
```
seeds = [b"reputation", oracle_pubkey]
campos: oracle: Pubkey, resolved_disputes: u64, bump: u8
```

### Erros customizados

| Código | Nome | Mensagem |
|--------|------|----------|
| 6000 | InvalidState | Invalid escrow state for this operation |
| 6001 | Unauthorized | Unauthorized signer |
| 6002 | InvalidAmount | Invalid amount |
| 6003 | MilestoneBpsMismatch | Milestone basis points must sum to 10000 |
| 6004 | InvalidMilestoneCount | Invalid number of milestones (1-10) |
| 6005 | AllMilestonesReleased | All milestones have been released |
| 6006 | TimeoutNotReached | Timeout period has not been reached yet |
| 6007 | EscrowAlreadyDisputed | Escrow is already in Disputed state |
| 6008 | WrongMint | Vault or token account has wrong mint |
| 6009 | ArithmeticOverflow | Arithmetic overflow or underflow |

---

## 2. Oracle Server (`server/src/index.ts`)

**URL de produção:** `https://proofpay-oracle.onrender.com`

### Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/` | Status do serviço |
| GET | `/health` | Health check (usado pelo self-ping) |
| POST | `/oracle/evaluate` | Avaliação de disputa + resolução on-chain |

### POST `/oracle/evaluate`

**Body:**
```json
{
  "escrow_id": "<hex string de 64 chars>",
  "evidence": "<string com a razão da disputa>",
  "escrow_pda": "<base58 do PDA>"
}
```

**Fluxo interno:**
1. Chama Claude API (`claude-sonnet-4-5`, max_tokens=1024)
2. Timeout de 30 segundos na chamada ao Claude
3. Parse da resposta JSON: `{ verdict: "payee"|"payer", confidence: 0-100, reasoning: string }`
4. Chama `resolve_dispute` on-chain com o keypair do oracle
5. Insere decisão em `oracle_decisions` no Supabase
6. Retorna `{ status, verdict, confidence, reasoning, txid }`

**Self-ping:** intervalo de 10 minutos para `GET /health` — evita cold start no Render free tier.

---

## 3. Frontend (`app/src/`)

### Componentes principais

**`CreateEscrow.tsx`**
- Cria + funda o escrow em duas transações (create_escrow → fund_escrow)
- Usa discriminadores hard-coded (não usa Anchor client)
- Insere registro em Supabase após confirmar funding
- Discriminadores:
  - `CREATE_ESCROW_DISCRIMINATOR`: `[253, 215, 165, 116, 36, 108, 68, 80]`
  - `FUND_ESCROW_DISCRIMINATOR`: `[155, 18, 218, 141, 182, 213, 69, 201]`

**`EscrowMonitor.tsx`**
- Lista escrows do Supabase em tempo real (Realtime subscription)
- Release milestone: usa `RELEASE_MILESTONE_DISCRIMINATOR: [56, 2, 199, 164, 184, 108, 167, 222]`
- Abertura de disputa: usa `OPEN_DISPUTE_DISCRIMINATOR: [137, 25, 99, 119, 23, 223, 161, 42]`
- Oracle call: via `callOracleWithTimeout()` — AbortController de 45s
- Estado `timedOut`: mostra botão de retry quando oracle cold start

### Constantes globais (frontend)
```typescript
PROGRAM_ID = "FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i"
DEVNET_USDC = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
```

### Paleta de cores (CSS vars → hex)
| Var | HSL | Hex |
|-----|-----|-----|
| `--background` | 0 0% 3% | `#080808` |
| `--primary` (âmbar) | 48 100% 50% | `#FFB800` |
| `--terminal-green` | 120 100% 40% | `#00CC00` |
| `--terminal-red` | 0 72% 51% | `#E03232` |
| `--terminal-amber` | 38 92% 50% | `#F59E0B` |
| `--terminal-cyan` | 187 100% 42% | `#00BFCA` |

---

## 4. Supabase Schema

### Tabelas

| Tabela | Descrição |
|--------|-----------|
| `escrows` | Espelho do EscrowAccount on-chain |
| `milestones` | Vec<Milestone> separado por linha |
| `event_logs` | Eventos on-chain indexados |
| `oracle_decisions` | Decisões do oracle AI |

### View
`escrow_dashboard` — valores em USDC (não lamports), contagem de milestones.

### RLS
- Leitura: pública (qualquer um)
- Escrita `escrows`: anon (frontend com ANON_KEY)
- Escrita `oracle_decisions`: anon (oracle server com ANON_KEY)
- Full access: service_role (indexer)

---

## 5. SDK (`sdk/src/index.ts`)

### Exports principais
```typescript
ProofPayClient          // Classe principal
decodeBytes(bytes)      // [u8;N] → string UTF-8
encodeBytes(str, len)   // string → [u8;N]
parseX402Challenge()    // HTTP 402 header → X402Challenge
buildX402PaymentHeader()// SignedTransaction → X-PAYMENT header
PROOFPAY_IDL            // IDL completo inline
```

### Construção do client
```typescript
// Modo leitura
const client = new ProofPayClient({ network: "devnet" });

// Modo leitura + escrita
const client = new ProofPayClient({ provider: anchorProvider });
```

---

## 6. Testes

Localização: `tests/proofpay.ts`
Runner: `yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts`

| Suite | Cobertura |
|-------|-----------|
| Suite 1 | Setup: airdrop, mock USDC, token accounts |
| Suite 2 | Happy path: Create → Fund → Release (2 milestones) → PDA fechado |
| Suite 3 | Segurança: Disputed bloqueia release_milestone (erro 6000) |
| Suite 4 | Resolução: resolve_dispute com oracle keypair + fallback de segurança |

**Nota:** os testes usam Program ID `5rULicy7hRi91KADEB1J4kgPtezJHgM96WM7pXCYNYFY` (localnet) — diferente do devnet `FpN5...`.
