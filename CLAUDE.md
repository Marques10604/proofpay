# CLAUDE.md — ProofPay

Guia para Claude Code trabalhar neste repositório. Leia antes de qualquer tarefa.

---

## Estrutura do Repositório

```
proofpay/
├── programs/proofpay/src/lib.rs   # Anchor smart contract (Rust)
├── app/src/                        # React frontend (TypeScript + Vite)
│   ├── components/
│   │   ├── CreateEscrow.tsx        # Formulário de criação de escrow
│   │   ├── EscrowMonitor.tsx       # Monitor de contratos + fluxo de disputa
│   │   ├── DisputePanel.tsx        # Painel de disputa (componente auxiliar)
│   │   └── TerminalHeader.tsx      # Header do dashboard
│   ├── lib/
│   │   ├── supabase.ts             # Cliente Supabase
│   │   └── LanguageContext.tsx     # i18n (PT/EN)
│   └── idl/proofpay.json           # IDL gerado pelo anchor build
├── server/src/index.ts             # Oracle server (Hono + Node.js)
├── sdk/src/index.ts                # @proofpay/sdk TypeScript
├── supabase/migrations/            # Migrações SQL do banco
├── tests/proofpay.ts               # Suite de testes Anchor
└── Anchor.toml                     # Config: cluster=devnet
```

---

## Comandos Principais

```bash
# Smart contract
anchor build                        # Compila o programa Rust
anchor test                         # Roda testes (localnet automático)
anchor deploy --provider.cluster devnet

# Frontend
cd app && npm run dev               # Dev server (Vite)
cd app && npm run build             # Build de produção
cd app && npm run lint              # ESLint

# Oracle server
cd server && npm run dev            # Dev com hot-reload (tsx watch)
cd server && npm run build          # Compila para dist/

# SDK
cd sdk && npm run build             # Compila TypeScript
```

---

## IDs e Endereços

| Recurso | Valor |
|---------|-------|
| Program ID (devnet) | `FpN5kH3w6kVLDEHz1zUfSof2n2QfMKfENCE97LMiut6i` |
| USDC mock (devnet) | `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` |
| Oracle wallet | `2hFPmWGKiTJvHNHmywFSWsPQt4pmL3NRH2g5yc2tipad` |
| Oracle URL | `https://proofpay-oracle.onrender.com` |
| Frontend (Vercel) | `proofpayapp` (project ID: `prj_OsYYKDVWCdpBk28H2phISyhighiu`) |

---

## Convenções de Código

### Rust (programa Anchor)
- Padrão CHECK → EFFECT → INTERACT em todas as instruções
- `require!()` para todas as validações de estado
- `checked_mul`, `checked_div`, `checked_sub` — nunca aritmética unchecked
- `close = payer` em estados terminais (Completed, Refunded, Resolved)
- PDA seeds: `[b"escrow", escrow_id]` — não altere sem migrar

### TypeScript (frontend)
- Fetch ao oracle: **sempre** usar `callOracleWithTimeout()` — não fazer fetch direto
- Timeout padrão: 45 segundos no frontend, 30 segundos no servidor
- Estados do modal de disputa: `loading`, `timedOut`, `verdict`
- Discriminadores hard-coded em `CreateEscrow.tsx` e `EscrowMonitor.tsx` — devem bater com o IDL
- i18n: usar `t("STRING")` do `useLanguage()` para strings visíveis ao usuário

### Supabase
- Frontend usa `SUPABASE_ANON_KEY` para leitura + insert em `escrows`
- Oracle server usa `SUPABASE_ANON_KEY` para insert em `oracle_decisions`
- RLS: leitura pública; escrita via service_role (indexer) ou anon (frontend/oracle)

---

## Variáveis de Ambiente

### `server/.env` (baseado em `.env.example`)
```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
ORACLE_PRIVATE_KEY=[1,2,...,64]   # JSON array de 64 bytes
ORACLE_WALLET_ADDRESS=2hFPmWGKiTJvHNHmywFSWsPQt4pmL3NRH2g5yc2tipad
SOLANA_RPC_URL=https://api.devnet.solana.com
PORT=3000
```

### `app/.env`
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## Regras de Trabalho

1. **Não inventar features.** O scope é: escrow on-chain + oracle AI + dashboard.
2. **Não alterar discriminadores** sem re-deployar o programa.
3. **Não fazer fetch direto ao oracle** — sempre via `callOracleWithTimeout()`.
4. **Não misturar lógica de negócio com componentes UI** — lógica de transação fica em handlers, não em JSX.
5. **Antes de editar `lib.rs`**: verificar se muda o `MAX_SIZE` do `EscrowAccount` — mudança exige re-deploy.
6. **Testes rodam no localnet** — não rodar `anchor test` contra devnet.
7. **Build antes de commit** — `cd app && npm run build` não deve ter erros (warnings de chunk size são OK).

---

## Fluxo de Disputa (referência rápida)

```
EscrowState::Funded
    ↓ open_dispute (payer ou payee)
EscrowState::Disputed
    ↓ oracle POST /oracle/evaluate → resolve_dispute on-chain
EscrowState::Completed (release_to_payee=true)
    ou
EscrowState::Refunded (release_to_payee=false)
    — fallback após 7 dias se oracle não responder
```

---

## Arquivos de Contexto do Projeto

| Arquivo | Conteúdo |
|---------|----------|
| `PROOFPAY_CONTEXT.md` | O que é, para quem, por quê |
| `PROOFPAY_TECH.md` | Arquitetura técnica detalhada |
| `PROOFPAY_BIZ.md` | Contexto de negócio e mercado |
| `PROOFPAY_BUGS.md` | Bugs conhecidos e status |
| `PROOFPAY_POST_HACKATHON.md` | Roadmap pós-hackathon |
| `PROOFPAY_TEMPLATES.md` | Snippets e templates de código |
| `PROOFPAY_CHECKLIST.md` | Checklists operacionais |
