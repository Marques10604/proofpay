-- ═══════════════════════════════════════════════════════════════════════════
-- ProofPay — Supabase Migration v0002
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Cria tabela oracle_decisions (referenciada em server/src/index.ts)
-- 2. Adiciona política INSERT para anon em escrows (frontend cria escrows
--    diretamente com anon key — sem isso todos os inserts de CreateEscrow.tsx
--    falham por RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABLE: oracle_decisions
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists oracle_decisions (
    id              uuid        primary key default gen_random_uuid(),

    -- PDA do escrow julgado (nullable para não bloquear insert se PDA não
    -- foi indexado ainda)
    escrow_pda      text
        references escrows(pda_address)
        on delete set null,

    -- 'approve' → fundos liberados ao payee on-chain
    -- 'reject'  → disputa não resolvida, requer revisão humana
    decision        text        not null
        check (decision in ('approve', 'reject')),

    -- 0-100, retornado pelo modelo AI
    confidence      smallint
        check (confidence between 0 and 100),

    -- Raciocínio do modelo AI
    reason          text,

    -- Assinatura da TX on-chain de resolve_dispute (apenas em 'approve')
    tx_signature    text,

    -- 'resolved' | 'pending_human_review'
    status          text        not null default 'resolved',

    created_at      timestamptz not null default now(),

    constraint chk_tx_only_on_approve
        check (tx_signature is null or decision = 'approve')
);

comment on table oracle_decisions is
    'Decisões do oracle AI para cada disputa. Populado por server/src/index.ts '
    'após chamada à API Anthropic.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RLS em oracle_decisions
-- ───────────────────────────────────────────────────────────────────────────

alter table oracle_decisions enable row level security;

create policy "Public read oracle_decisions"
    on oracle_decisions for select
    using (true);

-- O servidor oracle usa SUPABASE_ANON_KEY, então anon precisa de INSERT
create policy "Anon insert oracle_decisions"
    on oracle_decisions for insert
    to anon
    with check (true);

create policy "Service role full access oracle_decisions"
    on oracle_decisions for all
    to service_role
    using (true)
    with check (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS: permite INSERT de anon em escrows
-- ───────────────────────────────────────────────────────────────────────────
-- O frontend (CreateEscrow.tsx) usa VITE_SUPABASE_ANON_KEY para inserir
-- escrows diretamente. Sem esta policy todos os inserts falham por RLS.
-- ───────────────────────────────────────────────────────────────────────────

create policy "Anon insert escrows"
    on escrows for insert
    to anon
    with check (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Index de performance em oracle_decisions
-- ───────────────────────────────────────────────────────────────────────────

create index if not exists idx_oracle_decisions_escrow_pda
    on oracle_decisions (escrow_pda, created_at desc);

create index if not exists idx_oracle_decisions_decision
    on oracle_decisions (decision)
    where decision = 'reject';
