# PROOFPAY_CONTEXT.md — O que é o ProofPay

## Definição em uma frase

ProofPay é um protocolo de escrow B2B on-chain (Solana) com resolução de disputas por oráculo de IA — elimina a necessidade de árbitro humano em contratos de entrega de serviços.

---

## Problema que resolve

Disputas contratuais B2B no Brasil travam capital e custam caro:

| Via | Tempo | Custo |
|-----|-------|-------|
| Judiciário comum | 2–4 anos | Honorários + custas |
| Arbitragem institucional (ex: AAA) | 5–9 meses | ~R$ 130k para contrato de R$ 10M |
| ProofPay (oráculo AI) | Segundos (após disputa aberta) | Gas fee Solana |

**73% das PMEs brasileiras** são impactadas por atrasos de pagamento ligados a disputas.

---

## Como funciona (fluxo completo)

```
1. Payer cria escrow on-chain
      → deposita USDC em vault PDA (programa controla os fundos)
      → define payee, oracle, milestone, timeout

2. Payee entrega o serviço

3a. Entrega aceita → Payer clica "Release Milestone"
      → USDC transferido do vault para o payee
      → PDA fechado, rent devolvido ao payer

3b. Entrega rejeitada → Payer (ou Payee) abre disputa
      → Estado muda para Disputed (sem movimento de fundos)
      → Frontend chama POST /oracle/evaluate
      → Oracle lê evidência, chama Claude (Anthropic API)
      → Claude emite veredicto JSON { verdict, confidence, reasoning }
      → Oracle chama resolve_dispute on-chain (assina com keypair do oracle)
      → Fundos liberados para payee OU devolvidos ao payer
      → PDA fechado

3c. Timeout (7 dias sem resolução) → fallback_dispute_resolution
      → Fundos devolvidos automaticamente ao payer
```

---

## Quem usa

**Versão atual (devnet, hackathon):**
- Fundadores e avaliadores do Colosseum Hackathon
- Testes internos pelo time ProofPay

**Target de produto (mainnet):**
- PMEs brasileiras com contratos de serviço B2B (agências, consultorias, freelancers de alto valor)
- Plataformas de marketplace que precisam de escrow nativo em USDC
- Agentes de IA que precisam pagar por serviços via protocolo x402

---

## O que diferencia

1. **Oráculo de IA substitui árbitro humano** — decisão em segundos, não meses
2. **On-chain e auditável** — toda transação verificável no Solscan
3. **x402 Protocol** — endpoints HTTP com `402 Payment Required`, compatível com agentes de IA autônomos
4. **Custo na casa do gas fee** — não tem porcentagem sobre o valor do contrato

---

## Status atual (Abril 2026)

- Programa Anchor: deployado no devnet
- Frontend: deployado no Vercel (React + Tailwind)
- Oracle: rodando no Render (free tier — cold start ~30–45s após inatividade)
- Supabase: schema completo com RLS, triggers e views
- Testes: 4 suites cobrindo happy path + segurança + resolução de disputa
- x402: especificação implementada no SDK e no server, não integrada no frontend ainda

---

## Repositório

`github.com/Marques10604/proofpay`
Licença: MIT
Construído para: Superteam Agentic Engineering Grant / Colosseum
