# PROOFPAY_BUGS.md — Bugs Conhecidos e Status

## Legenda
- ✅ Resolvido (merged)
- ⚠️ Workaround ativo
- 🔴 Aberto
- 🟡 Parcialmente resolvido

---

## Bugs Resolvidos

### ✅ BUG-001 — Oracle hanging forever (cold start Render)
**Componente:** `EscrowMonitor.tsx`
**Sintoma:** Fetch para `POST /oracle/evaluate` travava indefinidamente quando o container Render estava em cold start.
**Causa:** Free tier do Render hiberna após inatividade — pode levar 30–60s para acordar. Fetch sem timeout = hang infinito.
**Fix:** `callOracleWithTimeout()` com `AbortController` de 45s. Ao timeout, modal muda para estado `timedOut` com botão de retry e mensagem "Oracle is waking up, please try again in 30 seconds".
**Commit:** `f5d6a5c` — fix(frontend): add 45s AbortController timeout to oracle fetch with retry UI

---

### ✅ BUG-002 — Build failure por variáveis não declaradas
**Componente:** `EscrowMonitor.tsx`
**Sintoma:** `npm run build` falhava com variáveis fora de escopo.
**Causa:** Variáveis `escrowPda` declaradas fora do bloco try mas usadas dentro.
**Fix:** Declaração explícita antes do try-catch.
**Commit:** `143037d`

---

### ✅ BUG-003 — Erro "already processed" bloqueava retry
**Componente:** `CreateEscrow.tsx`
**Sintoma:** Ao tentar criar um escrow que já havia sido processado, o frontend lançava erro em vez de redirecionar.
**Fix:** Verificação de estado on-chain antes de tentar re-submeter. Se PDA já existe, redireciona com sucesso.
**Commit:** `45ad2dc`

---

### ✅ BUG-004 — Valor de funding dinâmico não propagado corretamente
**Componente:** `CreateEscrow.tsx`
**Sintoma:** O valor inserido pelo usuário não chegava corretamente na instrução `fund_escrow`.
**Fix:** Parsing do amount feito antes da derivação da PDA; BigInt usado consistentemente.
**Commit:** `0726cf4`

---

### ✅ BUG-005 — Self-ping ausente no oracle (cold starts frequentes)
**Componente:** `server/src/index.ts`
**Sintoma:** Oracle entrava em cold start frequentemente — `GET /health` iniciou via auto-ping a cada 10 min.
**Fix:** `setInterval` de 10 minutos que faz `fetch` para `https://proofpay-oracle.onrender.com/health`.
**Commit:** `a6e92b5`

---

## Bugs Parcialmente Resolvidos

### 🟡 BUG-006 — Oracle cold start ainda possível se timeout < tempo de wake-up
**Componente:** `EscrowMonitor.tsx` + `server/src/index.ts`
**Sintoma:** Se o Render levar mais de 45s para acordar, o frontend mostra timeout mesmo com o oracle disponível logo depois.
**Status:** Workaround implementado (retry button). O usuário pode tentar novamente em 30s.
**Limitação real:** Free tier do Render pode levar até 60s em cold start em horários de pico.
**Solução definitiva:** Migrar oracle para plano pago do Render ou usar outro host sem cold start.

---

### 🟡 BUG-007 — oracle_decisions usa decision='approve'/'reject' mas server insere 'payee'/'payer'
**Componente:** `server/src/index.ts` vs `supabase/migrations/0002_oracle_decisions.sql`
**Sintoma:** Migration define `check (decision in ('approve', 'reject'))` mas o server insere `'payee'` ou `'payer'`.
**Status:** Insert funciona porque a check constraint está no campo `decision`, mas o insert usa o campo livre `decision` — o check passa porque `'payee'` não está na constraint... na verdade isso deveria **falhar**.
**Risco:** Inconsistência entre schema e código. Inserts de oracle_decisions podem estar falhando silenciosamente (o server não verifica o erro do Supabase após insert).
**Ação necessária:** Alinhar a constraint com os valores reais (`'payee'`, `'payer'`) ou mudar o server para usar `'approve'`/`'reject'`.

---

## Bugs Abertos

### 🔴 BUG-008 — Supabase insert em oracle_decisions não verifica erro
**Componente:** `server/src/index.ts`, linha ~220
**Sintoma:** `await supabase.from("oracle_decisions").insert(...)` — o erro retornado não é checado. Se falhar (ex: constraint violation do BUG-007), o oracle continua e retorna 200 ao frontend sem ter registrado a decisão.
**Risco:** Baixo para o fluxo on-chain (a transação já foi executada), mas perde o registro de auditoria.
**Fix sugerido:** Verificar `const { error } = await supabase...` e logar o erro.

---

### 🔴 BUG-009 — IDL desatualizado em `app/src/idl/proofpay.json`
**Componente:** `app/src/idl/proofpay.json`
**Sintoma:** O IDL na pasta do frontend pode estar desatualizado em relação ao `sdk/src/index.ts` (que tem campos adicionados como `dispute_timeout_at`, `oracle` separado no IDL do SDK).
**Risco:** Médio — o frontend não usa o IDL para deserialização (usa discriminadores manuais), mas qualquer consumidor do IDL via arquivo pode ter problemas.
**Fix:** Rodar `anchor build` e substituir o arquivo pelo `target/idl/proofpay.json` gerado.

---

### 🔴 BUG-010 — `release_milestone` não verifica se o `payer` foi o assinante original
**Componente:** `programs/proofpay/src/lib.rs` — `release_milestone`
**Sintoma:** A instrução usa `has_one = payer` na conta, mas o signer `payer` no `ReleaseMilestone` é apenas `Signer<'info>` sem verificação de que é o mesmo `payer` que criou o escrow além do `has_one`.
**Status:** `has_one = payer` já garante isso via Anchor — é uma falsa preocupação. Mas vale documentar que a segurança depende do `has_one` funcionando corretamente.
**Ação:** Documentar como invariante, não como bug.

---

### 🔴 BUG-011 — `CreateEscrow.tsx` limita milestone a 1 (hard-coded)
**Componente:** `app/src/components/CreateEscrow.tsx`, linha ~120
**Sintoma:** O formulário aceita uma única descrição de milestone e serializa `milestones_len=1` com `release_bps=10000`. O programa suporta até 10 milestones, mas o frontend não expõe essa funcionalidade.
**Risco:** Nenhum funcional — o contrato funciona. Mas limita o produto ao caso mais simples.
**Ação:** Feature request para v2 — não é bug crítico.

---

## Notas de Debug

### Como verificar estado de um escrow on-chain
```bash
solana account <PDA_ADDRESS> --output json --url devnet
# Byte 255 do data[] = estado: 0=Created 1=Funded 2=Completed 3=Refunded 4=Disputed
```

### Como verificar logs do oracle
```bash
# Render dashboard → logs em tempo real
# Ou: GET https://proofpay-oracle.onrender.com/health
```

### Como forçar um cold start do oracle (para testar o retry UI)
Não fazer nada por 15+ minutos e então disparar uma disputa.
