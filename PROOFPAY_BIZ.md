# PROOFPAY_BIZ.md — Contexto de Negócio

## Proposta de Valor

> "Resolução de disputas B2B em segundos. Não anos."

ProofPay elimina o custo e o tempo de arbitragem tradicional substituindo o árbitro humano por um oráculo de IA on-chain. O resultado é verificável em blockchain e o custo é o gas fee da Solana.

---

## Matriz CSD (Certezas, Suposições, Dúvidas)

### Certezas (validadas)
- Disputas B2B custam caro: ~R$130k para arbitragem de contrato de R$10M (dados AAA)
- Travam capital: 73% das PMEs são impactadas por atrasos em pagamentos contratuais
- Volume: AAA resolveu $21,3 bilhões em disputas B2B em 2024
- PMEs brasileiras mais penalizadas: judiciário leva 2–4 anos para resolver contratos
- Solana processa transações em ~400ms com custo de gas mínimo

### Suposições (não totalmente validadas)
- "28–90 dias" é tempo de resolução real apenas para arbitragem institucional rápida
  - Judiciário comum: 2–4 anos
  - Arbitragem de baixo valor: 5–9 meses
- PMEs prefeririam pagar em USDC se tivesse garantia de resolução automática
- A adoção depende do custo de onboarding de wallet (ainda é barreira real)

### Dúvidas abertas
- Qual o ticket mínimo de contrato que justifica usar ProofPay vs transferência simples?
- Quão confortável é o mercado B2B brasileiro com "oráculo de IA" como árbitro?
- Existe risco regulatório de vincular resolução de disputa a uma IA sem supervisão humana?

---

## Mercado-Alvo

### Primário (para hackathon e grant)
Agentes de IA autônomos que precisam pagar por serviços via HTTP 402 (x402 Protocol):
- Agentes LangChain, CrewAI, Eliza (ai16z) que contratam serviços B2B programaticamente
- Infraestrutura de AI-to-AI payments no ecossistema Solana

### Secundário (MVP real)
PMEs brasileiras com contratos de serviço recorrente:
- Agências de desenvolvimento de software
- Consultorias
- Prestadores de serviço com contratos acima de R$10k

### Comparação com alternativas

| Solução | Tempo | Custo | On-chain |
|---------|-------|-------|----------|
| Judiciário | 2–4 anos | Alto | Não |
| Arbitragem AAA | 5–9 meses | ~R$130k | Não |
| Escrow bancário | Manual | Taxas bancárias | Não |
| **ProofPay** | **Segundos** | **Gas fee** | **Sim** |

---

## Modelo de Negócio (atual — pré-monetização)

Nenhum. O produto está em fase hackathon/grant.

**Caminhos possíveis pós-validação (não implementados):**
- Taxa percentual sobre o valor do contrato (ex: 0,5%)
- Assinatura mensal para plataformas que integram o SDK
- Venda de acesso ao oracle para disputas de alto valor com humano-no-loop

---

## Contexto Competitivo

Projetos com overlap no Colosseum (baseado em pesquisa Copilot):
- Escrow genérico com milestones existe em vários projetos Solana
- Diferencial do ProofPay: oráculo de IA + x402 + foco específico em disputa B2B

**Posicionamento:** "não somos escrow genérico — somos resolução de disputas com IA como árbitro"

---

## Posição Atual (Abril 2026)

- Fase: Hackathon / Grant (Superteam Agentic Engineering + Colosseum)
- Rede: Devnet
- Status do produto: MVP funcional com fluxo completo de disputa rodando
- Próxima etapa crítica: mainnet deploy + audit de segurança
