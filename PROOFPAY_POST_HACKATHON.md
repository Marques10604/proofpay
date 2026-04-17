# PROOFPAY_POST_HACKATHON.md — Roadmap Pós-Hackathon

Este arquivo lista o que precisa acontecer antes de um lançamento em mainnet real.
Não é especulação — é derivado do que existe no código atual e das limitações conhecidas.

---

## Prioridade 1 — Bloqueadores de Mainnet

### 1.1 Auditoria de segurança do programa Anchor
**O que precisa ser feito:**
- Auditoria formal do `programs/proofpay/src/lib.rs`
- Verificar invariantes: overflow, re-entrância, account confusion, PDA validation
- Itens específicos para revisar:
  - `resolve_dispute` fecha a conta com `close = payer` — verificar que `payer` é `UncheckedAccount` seguro
  - `fallback_dispute_resolution` não verifica quem é o `invoker` — qualquer um pode chamar após timeout
  - `release_milestone` usa `close = payer` após último milestone mas milestones intermediários não fecham

**Custo estimado:** $5k–$20k (Ottersec, Neodyme, MadShield)

---

### 1.2 Migrar oracle de Render free para hosting confiável
**Problema atual:** Cold start de até 60s no Render free tier.
**Opções:**
- Render paid ($7/mês) — elimina cold start
- Railway.app — similar, mais barato
- Fly.io — melhor latência
- Cloudflare Workers — cold start <5ms, mas precisa migrar de Node para edge runtime

**Bloqueia mainnet porque:** fundos reais dependem do oracle estar disponível durante a janela de disputa.

---

### 1.3 Substituir USDC mock pelo USDC real da Circle
**Atual:** `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` (devnet mock)
**Mainnet USDC:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

**O que muda no código:**
- `DEVNET_USDC` em `CreateEscrow.tsx` e `EscrowMonitor.tsx`
- `SOLANA_RPC_URL` no server para mainnet RPC
- `cluster = "mainnet-beta"` no `Anchor.toml`
- Re-deploy do programa para mainnet com novo Program ID

---

### 1.4 Suporte a múltiplos milestones no frontend
**Atual:** `CreateEscrow.tsx` hard-coded para 1 milestone com 100% dos bps.
**Necessário:** O programa já suporta até 10 milestones — o frontend precisa expor isso.
**Impacto:** Sem múltiplos milestones, o produto não funciona para contratos reais de serviço que têm entregas parciais.

---

## Prioridade 2 — Qualidade e Confiabilidade

### 2.1 Resolver BUG-007 (constraint de oracle_decisions)
Alinhar `decision` field entre migration SQL e server.
Ver `PROOFPAY_BUGS.md` BUG-007.

### 2.2 Adicionar verificação de erro no insert de oracle_decisions
Ver `PROOFPAY_BUGS.md` BUG-008.

### 2.3 Atualizar IDL em `app/src/idl/proofpay.json`
Rodar `anchor build` e substituir o arquivo.

### 2.4 Indexer on-chain real
**Atual:** Frontend insere direto no Supabase após confirmar a transação. Não há indexer.
**Problema:** Se o frontend cair ou o usuário fechar o browser antes do insert, o Supabase não sabe do escrow.
**Solução:** Indexer que escuta eventos Solana (`EscrowCreated`, `EscrowFunded`, etc.) e popula o Supabase automaticamente.
**Referência:** Schema de `event_logs` já está preparado para isso.

---

## Prioridade 3 — Features para Produto Real

### 3.1 x402 integrado no frontend
**Atual:** x402 Protocol está no SDK e no server, mas o frontend não usa.
**Necessário para:** Agentes de IA pagarem por serviços autonomamente.

### 3.2 Human-in-the-loop para disputas de alto valor
**Atual:** Oracle AI decide tudo automaticamente.
**Problema:** Para contratos acima de determinado valor, pode ser necessário revisão humana.
**Referência:** `oracle_decisions.status = 'pending_human_review'` já está no schema.

### 3.3 Notificações (email / webhook)
**Atual:** Nenhuma notificação quando dispute é aberta ou oracle emite veredicto.
**Necessário para:** Usuário saber que precisa agir.

### 3.4 Painel do payee
**Atual:** O monitor mostra todos os escrows, mas o fluxo do payee (confirmar entrega, ver veredicto) não está implementado.

---

## Checklist de Deploy para Mainnet

```
[ ] Auditoria de segurança aprovada
[ ] Oracle em hosting pago sem cold start
[ ] USDC mainnet configurado
[ ] Testes de integração rodando contra mainnet fork
[ ] Indexer on-chain ativo e monitorado
[ ] Variáveis de ambiente de produção configuradas
[ ] Backup do keypair do oracle armazenado com segurança
[ ] Limite de valor máximo definido para fase beta (ex: $1000 USDC)
[ ] Processo de atualização do programa definido (upgrade authority)
[ ] Monitoramento de alertas configurado (ex: oracle não responde em 5 min)
```
