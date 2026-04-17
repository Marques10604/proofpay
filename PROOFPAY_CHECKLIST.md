# PROOFPAY_CHECKLIST.md — Checklists Operacionais

---

## ✅ Checklist: Antes de fazer commit

```
[ ] npm run build em app/ passa sem erros (warnings de chunk size são OK)
[ ] Nenhum fetch direto para /oracle/evaluate — deve usar callOracleWithTimeout()
[ ] Discriminadores não foram alterados sem re-deploy do programa
[ ] Variáveis de ambiente não foram commitadas (.env não está no git)
[ ] Arquivos de log e timestamp do Vite não estão staged (*.timestamp-*.mjs)
```

---

## ✅ Checklist: Testar o fluxo completo (devnet)

```
[ ] Wallet conectada (Phantom ou Backpack) com SOL suficiente (>0.1 SOL)
[ ] Wallet tem USDC devnet (Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr)
[ ] Oracle respondendo: GET https://proofpay-oracle.onrender.com/health → {"status":"ok"}
[ ] Supabase acessível: tabela escrows visível no dashboard

Fluxo:
[ ] 1. Create Escrow → preencher payee, oracle, amount, milestone
[ ] 2. Confirmar summary → aprovar 2 transações na wallet (create + fund)
[ ] 3. Monitor exibe o escrow com status FUNDED
[ ] 4. Clicar "ABRIR DISPUTA" → preencher motivo → confirmar → aprovar tx na wallet
[ ] 5. Oracle avalia → veredicto aparece no modal (pode levar até 45s)
[ ] 6. Se timeout: botão "TENTAR NOVAMENTE" aparece → clicar após 30s
[ ] 7. Veredicto: ✅ payee ou ↩ payer + reasoning
```

---

## ✅ Checklist: Deploy do frontend (Vercel)

```
[ ] cd app && npm run build → zero erros
[ ] git push origin master → Vercel detecta automaticamente
[ ] Verificar build no Vercel dashboard (project: proofpayapp)
[ ] Abrir URL de preview e testar Create Escrow na devnet
[ ] Verificar se variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão no Vercel
```

---

## ✅ Checklist: Deploy do oracle server (Render)

```
[ ] cd server && npm run build → zero erros TypeScript
[ ] git push origin master → Render detecta (branch: master)
[ ] Verificar build logs no Render dashboard
[ ] GET https://proofpay-oracle.onrender.com/health → {"status":"ok"}
[ ] Verificar variáveis de ambiente no Render:
    [ ] ANTHROPIC_API_KEY
    [ ] SUPABASE_URL
    [ ] SUPABASE_ANON_KEY
    [ ] ORACLE_PRIVATE_KEY (array JSON de 64 bytes)
    [ ] ORACLE_WALLET_ADDRESS
    [ ] SOLANA_RPC_URL
```

---

## ✅ Checklist: Rodar testes Anchor

```
[ ] solana-test-validator não está rodando em background (anchor test sobe o próprio)
[ ] anchor build executado recentemente (programa compilado)
[ ] yarn instalado em /tests (ou npm install na raiz)
[ ] Rodar: anchor test
[ ] Verificar 4 suites: Setup, Happy Path, Security, Dispute Resolution
[ ] Todos os testes passam ✅ (nenhum timeout ou falha de account not found)
```

---

## ✅ Checklist: Antes de abrir uma disputa (usuário final)

```
[ ] Escrow está com status FUNDED (não Completed, Refunded ou Disputed)
[ ] Oracle está online: verificar https://proofpay-oracle.onrender.com/health
[ ] Motivo da disputa escrito (máximo 128 caracteres)
[ ] Wallet conectada com SOL suficiente para gas (~0.001 SOL)
[ ] Saber que o veredicto é final e executado automaticamente on-chain
```

---

## ✅ Checklist: Atualizar o IDL após mudança no programa

```
[ ] anchor build (gera target/idl/proofpay.json)
[ ] cp target/idl/proofpay.json app/src/idl/proofpay.json
[ ] Verificar se MAX_SIZE do EscrowAccount mudou → re-deploy necessário
[ ] Verificar se discriminadores mudaram → atualizar constantes em:
    - app/src/components/CreateEscrow.tsx
    - app/src/components/EscrowMonitor.tsx
[ ] Atualizar IDL inline em sdk/src/index.ts
[ ] Atualizar IDL inline em server/src/index.ts (se usado)
[ ] anchor test → todos os testes passam
[ ] npm run build em app/ → zero erros
```

---

## ✅ Checklist: Adicionar novo campo ao EscrowAccount

```
[ ] Calcular novo MAX_SIZE e atualizar EscrowAccount::MAX_SIZE em lib.rs
[ ] Atualizar IDL em todos os lugares (app, sdk, server)
[ ] Atualizar Supabase migration (novo campo na tabela escrows)
[ ] Re-deploy do programa (mudança de layout = nova versão)
[ ] Atualizar sdk/src/index.ts: interface EscrowAccount + mapRawEscrow()
[ ] Atualizar supabase/migrations/ com nova migration (não alterar migrations antigas)
[ ] Testar: anchor test → tudo passa
```

---

## ✅ Checklist: Debug de escrow travado

```
[ ] Verificar estado on-chain: solana account <PDA> --url devnet --output json
    → data[255]: 1=Funded 4=Disputed
[ ] Verificar Supabase: tabela escrows, coluna status
[ ] Se status diverge (Supabase diz funded, on-chain diz disputed):
    → Atualizar Supabase manualmente ou reindexar
[ ] Se oracle não respondeu: verificar oracle_decisions no Supabase
[ ] Se fallback: chamar fallback_dispute_resolution após 7 dias do disputed_at
[ ] Verificar Solscan para ver histórico completo de transações do PDA
```
