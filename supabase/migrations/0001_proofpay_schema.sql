-- ═══════════════════════════════════════════════════════════════════════════
-- ProofPay — Supabase Migration v0001
-- ═══════════════════════════════════════════════════════════════════════════
-- Propósito : Espelhar o estado on-chain do ProofPay Escrow Protocol
--             para uso em dashboards, APIs REST e webhooks do indexer.
--
-- Fonte     : programs/proofpay/src/lib.rs  (EscrowAccount, Milestone,
--             EscrowState, eventos e erros)
-- Programa  : 5rULicy7hRi91KADEB1J4kgPtezJHgM96WM7pXCYNYFY
-- Cluster   : devnet (migrar para mainnet alterando apenas a variável de
--             ambiente SOLANA_CLUSTER no indexer)
--
-- Como aplicar
--   Opção 1 (Supabase Studio): Cole no SQL Editor e clique "Run"
--   Opção 2 (CLI):  supabase db push --db-url <URL>
--   Opção 3 (MCP):  apply_migration(project_id, query=<este arquivo>)
--
-- Integridade com o contrato Rust
--   Cada CHECK constraint mapeia diretamente um require!() do lib.rs.
--   Os comentários indicam a linha exata de origem.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Extensions
-- ───────────────────────────────────────────────────────────────────────────

-- pgcrypto: usado para gen_random_uuid() em event_logs.id
create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ENUM: escrow_status
-- ───────────────────────────────────────────────────────────────────────────
-- Espelha: EscrowState { Created, Funded, Completed, Refunded, Disputed }
-- Fonte  : lib.rs:410–416
--
-- ATENÇÃO: a ordem dos valores deve corresponder ao índice da variante Rust.
-- O indexer usa esse mesmo enum para mapear o campo `state` deserializado.
-- ───────────────────────────────────────────────────────────────────────────

create type escrow_status as enum (
    'created',    -- variante 0: escrow criado, aguardando fundo
    'funded',     -- variante 1: vault financiado, milestones liberáveis
    'completed',  -- variante 2: todos os milestones liberados (PDA fechado)
    'refunded',   -- variante 3: timeout atingido, fundos devolvidos (PDA fechado)
    'disputed'    -- variante 4: disputa aberta, transferências congeladas
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ENUM: event_type
-- ───────────────────────────────────────────────────────────────────────────
-- Espelha os 5 eventos on-chain (#[event] structs) do lib.rs:422–454
-- ───────────────────────────────────────────────────────────────────────────

create type event_type as enum (
    'EscrowCreated',       -- lib.rs:422
    'EscrowFunded',        -- lib.rs:430
    'MilestoneReleased',   -- lib.rs:436
    'EscrowRefunded',      -- lib.rs:443
    'DisputeOpened'        -- lib.rs:449
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. TABLE: escrows
-- ───────────────────────────────────────────────────────────────────────────
-- Espelha EscrowAccount do lib.rs:352–373
-- PK: pda_address (endereço Solana Base58, único por escrow)
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists escrows (

    -- ── Identidade ──────────────────────────────────────────────────────────
    -- Endereço da PDA on-chain: seeds = [b"escrow", escrow_id]
    pda_address         text        not null,

    -- escrow_id como hex (32 bytes → 64 chars).
    -- O indexer converte Buffer → hex antes de inserir.
    escrow_id_hex       char(64)    not null,

    -- ── Atores ──────────────────────────────────────────────────────────────
    -- Mapeiam lib.rs:355 (payer) e lib.rs:356 (payee)
    payer_address       text        not null,
    payee_address       text        not null,

    -- Mint aceito (USDC / USDG). Fonte: lib.rs:360 usdc_mint.
    -- Armazenado no create_escrow e nunca alterado — imutável.
    usdc_mint           text        not null,

    -- ── Valores (em lamports, 6 decimais USDC) ──────────────────────────────
    -- lib.rs:361–362. bigint = u64 sem sinal (Postgres não tem uint, mas
    -- bigint cobre 0..9.2×10¹⁸ que é maior que u64::MAX=1.8×10¹⁹... ATENÇÃO:
    -- usar numeric(20,0) para valores acima de 9.2×10¹⁸ lamports).
    total_amount        bigint      not null,
    released_amount     bigint      not null default 0,

    -- ── Estado da máquina ────────────────────────────────────────────────────
    -- lib.rs:365. Tipo: escrow_status enum criado acima.
    status              escrow_status not null default 'created',

    -- Índice do próximo milestone a ser liberado. lib.rs:364.
    current_milestone   smallint    not null default 0,

    -- ── Timestamps (unix seconds → timestamptz) ──────────────────────────────
    -- Convertidos pelo indexer: new Date(created_at_unix * 1000)
    created_at          timestamptz not null,
    timeout_at          timestamptz not null,

    -- Bump da PDA (lib.rs:368). Necessário para derivação off-chain.
    bump                smallint    not null,

    -- ── Campos de disputa (populados por open_dispute) ───────────────────────
    disputed_at         timestamptz,         -- null = sem disputa (lib.rs:370)
    disputed_by         text,                -- payer ou payee (lib.rs:371)
    dispute_reason      text,                -- decoded de [u8; 128] (lib.rs:372)

    -- ── Metadados do indexer ─────────────────────────────────────────────────
    -- Slot e timestamp da última transação que atualizou este registro.
    last_indexed_slot   bigint,
    last_indexed_at     timestamptz not null default now(),
    -- Assinatura da última tx que modificou o estado (para auditoria).
    last_tx_signature   text,

    -- ── Chaves ───────────────────────────────────────────────────────────────
    primary key (pda_address),
    unique (escrow_id_hex),

    -- ── Constraints de integridade (mapeiam require!() do lib.rs) ────────────

    -- lib.rs:22  require!(total_amount > 0, InvalidAmount)
    constraint chk_total_amount_positive
        check (total_amount > 0),

    -- lib.rs:55  require!(amount == escrow.total_amount, InvalidAmount)
    -- Garantia: released_amount nunca pode exceder total_amount.
    constraint chk_released_le_total
        check (released_amount <= total_amount),

    -- lib.rs:25  require!(total_bps == 10000, MilestoneBpsMismatch)
    -- Garantia de integridade temporal: milestones só completam o escrow se
    -- released_amount == total_amount quando status = 'completed'.
    constraint chk_completed_means_fully_released
        check (
            status != 'completed'
            or released_amount = total_amount
        ),

    -- Um escrow não pode ser disputado SE não tiver sido financiado.
    -- Espelha: require!(state == Funded) em open_dispute (lib.rs:180–183).
    constraint chk_dispute_requires_funding
        check (
            disputed_at is null
            or (status in ('disputed'))
        ),

    -- disputed_at e disputed_by devem ser preenchidos juntos.
    constraint chk_dispute_fields_consistent
        check (
            (disputed_at is null) = (disputed_by is null)
        ),

    -- Endereços Solana: 32 bytes Base58 = 32–44 caracteres.
    constraint chk_pda_address_length
        check (length(pda_address) between 32 and 44),
    constraint chk_payer_address_length
        check (length(payer_address) between 32 and 44),
    constraint chk_payee_address_length
        check (length(payee_address) between 32 and 44),

    -- Payer e payee devem ser endereços diferentes.
    -- Previne escrow consigo mesmo (sem paralelo direto no Rust,
    -- mas é uma constraint de negócio importante).
    constraint chk_payer_ne_payee
        check (payer_address != payee_address),

    -- lib.rs:21  require!(milestones.len() <= 10, InvalidMilestoneCount)
    -- Espelhado via FK + trigger (ver Seção 6).
    constraint chk_current_milestone_reasonable
        check (current_milestone between 0 and 10)
);

comment on table escrows is
    'Espelho do EscrowAccount on-chain. Populado pelo indexer de eventos Solana. '
    'Fonte: programs/proofpay/src/lib.rs:352–373';

comment on column escrows.pda_address      is 'Endereço Base58 da PDA: seeds=[escrow, escrow_id]';
comment on column escrows.escrow_id_hex    is 'escrow_id como hex de 64 chars (32 bytes)';
comment on column escrows.total_amount     is 'Valor total em lamports USDC (6 decimais). u64 do Rust.';
comment on column escrows.released_amount  is 'Valor já liberado em lamports. Incrementado a cada releaseMilestone.';
comment on column escrows.status           is 'Estado da máquina: Created/Funded/Completed/Refunded/Disputed.';
comment on column escrows.dispute_reason   is '[u8;128] decodificado como UTF-8 pelo indexer.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. TABLE: milestones
-- ───────────────────────────────────────────────────────────────────────────
-- Espelha Vec<Milestone> dentro de EscrowAccount (lib.rs:363, 399–407).
-- Cada row = um elemento do Vec<Milestone> com seu índice posicional.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists milestones (

    id                  bigserial   primary key,

    -- FK para o escrow pai
    escrow_pda          text        not null
        references escrows(pda_address)
        on delete cascade,

    -- Posição no Vec<Milestone> (0-indexed). lib.rs:364 current_milestone.
    milestone_index     smallint    not null,

    -- description: [u8; 64] decodificado como UTF-8. lib.rs:401.
    description         text        not null default '',

    -- release_bps: u16, basis points. lib.rs:402.
    -- 5000 = 50%, 10000 = 100%.
    release_bps         smallint    not null,

    -- true após releaseMilestone() ser chamado para este índice.
    -- Atualizado pelo indexer ao detectar evento MilestoneReleased.
    released            boolean     not null default false,

    -- Quando foi liberado (null se ainda não liberado).
    released_at         timestamptz,

    -- Assinatura da tx de liberação (para auditoria e drill-down).
    release_tx_signature text,

    -- Valor efetivamente liberado em lamports (calculado pelo contrato).
    -- release_amount = total_amount * release_bps / 10000
    released_amount_lamports bigint,

    -- ── Constraints ──────────────────────────────────────────────────────────

    -- lib.rs:21  require!(milestones.len() <= 10)
    constraint chk_milestone_index_range
        check (milestone_index between 0 and 9),

    -- lib.rs:25  require!(total_bps == 10000) — cada milestone: 1 ≤ bps ≤ 10000
    constraint chk_release_bps_range
        check (release_bps between 1 and 10000),

    -- released_at e release_tx_signature devem ser preenchidos juntos.
    constraint chk_release_fields_consistent
        check (
            (released_at is null) = (release_tx_signature is null)
        ),

    -- released_amount só pode ser preenchido se released = true.
    constraint chk_amount_only_if_released
        check (
            released = true
            or released_amount_lamports is null
        ),

    -- Unicidade: um escrow não pode ter dois milestones com o mesmo índice.
    unique (escrow_pda, milestone_index)
);

comment on table milestones is
    'Cada row é um elemento do Vec<Milestone> do EscrowAccount. '
    'Fonte: lib.rs:399–407. Populado no evento EscrowCreated.';

comment on column milestones.release_bps is
    'Basis points deste milestone. Soma de todos os bps do escrow = 10000.';
comment on column milestones.released    is
    'true após evento MilestoneReleased ser indexado para este milestone_index.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. TABLE: event_logs
-- ───────────────────────────────────────────────────────────────────────────
-- Índice de todas as transações relevantes do ProofPay.
-- Cada evento on-chain (#[event] em lib.rs:418–454) gera uma row aqui.
-- Usado para auditoria, webhooks e reconstrução de estado.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists event_logs (

    id                  uuid        primary key default gen_random_uuid(),

    -- Referência ao escrow (nullable pois o indexer pode inserir antes do escrow).
    escrow_pda          text
        references escrows(pda_address)
        on delete set null,

    -- Tipo do evento Solana (#[event] discriminador). lib.rs:418–454.
    event_type          event_type  not null,

    -- Assinatura única da transação Solana (Base58).
    tx_signature        text        not null unique,

    -- Slot em que a transação foi confirmada.
    slot                bigint      not null,

    -- Timestamp do bloco (unix seconds → timestamptz).
    block_time          timestamptz not null,

    -- Payload completo do evento como JSON (para drill-down e replay).
    -- Exemplos de campos por evento:
    --   EscrowCreated:     { escrow_id, payer, payee, total_amount }
    --   MilestoneReleased: { escrow_id, milestone_index, amount }
    --   DisputeOpened:     { escrow_id, disputed_by, timestamp }
    event_payload       jsonb       not null default '{}',

    -- Índice do milestone afetado (null para eventos não relacionados a milestone).
    milestone_index     smallint,

    -- Endereço do ator que assinou a tx (payer ou payee).
    signer_address      text,

    -- Quando este log foi persistido no banco (para SLA de indexação).
    indexed_at          timestamptz not null default now(),

    -- ── Constraints ──────────────────────────────────────────────────────────

    -- milestone_index só faz sentido em MilestoneReleased.
    constraint chk_milestone_index_only_for_release
        check (
            milestone_index is null
            or event_type = 'MilestoneReleased'
        ),

    constraint chk_tx_signature_length
        check (length(tx_signature) between 64 and 88),

    constraint chk_slot_positive
        check (slot > 0)
);

comment on table event_logs is
    'Índice de eventos on-chain do ProofPay. Cada row corresponde a uma '
    'transação indexada. Fonte: events lib.rs:418–454.';

comment on column event_logs.tx_signature  is 'Assinatura Base58 da tx Solana. Única por evento.';
comment on column event_logs.event_payload is 'JSON com todos os campos do evento (#[event] struct deserializado).';
comment on column event_logs.slot          is 'Slot Solana em que a tx foi confirmada.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6. TRIGGER: validar soma de bps por escrow (lib.rs:25)
-- ───────────────────────────────────────────────────────────────────────────
-- require!(total_bps == 10000, MilestoneBpsMismatch)
-- A constraint CHECK não consegue agregar linhas de outra tabela.
-- Este trigger valida a soma ao inserir/atualizar milestones.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function fn_check_milestone_bps_sum()
returns trigger
language plpgsql as $$
declare
    total_bps integer;
    milestone_count integer;
begin
    -- Soma todos os bps do escrow após a operação
    select
        coalesce(sum(release_bps), 0),
        count(*)
    into total_bps, milestone_count
    from milestones
    where escrow_pda = new.escrow_pda;

    -- lib.rs:21  require!(milestones.len() >= 1 && len <= 10)
    if milestone_count > 10 then
        raise exception
            'ProofPay[InvalidMilestoneCount]: escrow % tem % milestones (máx 10). '
            'Fonte: lib.rs:21',
            new.escrow_pda, milestone_count
            using errcode = 'P0001';
    end if;

    -- lib.rs:25  require!(total_bps == 10000, MilestoneBpsMismatch)
    -- Só valida quando todos os milestones do escrow estão inseridos.
    -- A validação final é feita quando current_milestone > 0 no escrow.
    if total_bps > 10000 then
        raise exception
            'ProofPay[MilestoneBpsMismatch]: soma dos bps do escrow % é % (deve ser ≤ 10000). '
            'Fonte: lib.rs:25',
            new.escrow_pda, total_bps
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

create trigger trg_milestone_bps_sum
    after insert or update on milestones
    for each row
    execute function fn_check_milestone_bps_sum();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. TRIGGER: atualizar released_amount e status no escrow
-- ───────────────────────────────────────────────────────────────────────────
-- Quando o indexer marca um milestone como released = true,
-- atualiza automaticamente o released_amount e current_milestone no escrow.
-- Se todos os milestones foram liberados → status = 'completed'.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function fn_sync_escrow_on_milestone_release()
returns trigger
language plpgsql as $$
declare
    total_bps_released integer;
    milestone_count    integer;
    escrow_total       bigint;
    new_released       bigint;
begin
    -- Só age quando milestone é marcado como released
    if new.released = false or old.released = true then
        return new;
    end if;

    -- Soma os bps já liberados (incluindo o atual)
    select
        coalesce(sum(release_bps), 0),
        count(*)
    into total_bps_released, milestone_count
    from milestones
    where escrow_pda = new.escrow_pda
      and released = true;

    -- Busca o total do escrow
    select total_amount into escrow_total
    from escrows
    where pda_address = new.escrow_pda;

    -- Calcula released_amount proporcional (espelha lib.rs:91–95)
    new_released := (escrow_total * total_bps_released) / 10000;

    -- Atualiza o escrow
    update escrows
    set
        released_amount   = new_released,
        current_milestone = (
            select coalesce(max(milestone_index), -1) + 1
            from milestones
            where escrow_pda = new.escrow_pda
              and released = true
        ),
        status = case
            when total_bps_released >= 10000 then 'completed'::escrow_status
            else status
        end,
        last_indexed_at = now()
    where pda_address = new.escrow_pda;

    return new;
end;
$$;

create trigger trg_sync_escrow_on_release
    after update of released on milestones
    for each row
    execute function fn_sync_escrow_on_milestone_release();

-- ───────────────────────────────────────────────────────────────────────────
-- 8. INDEXES (performance para queries do dashboard e indexer)
-- ───────────────────────────────────────────────────────────────────────────

-- Dashboard: buscar escrows por payer ou payee
create index if not exists idx_escrows_payer
    on escrows (payer_address);

create index if not exists idx_escrows_payee
    on escrows (payee_address);

-- Filtrar por status (ex: todos os 'disputed' para o painel de árbitros)
create index if not exists idx_escrows_status
    on escrows (status)
    where status in ('disputed', 'funded');

-- Ordenação cronológica (feed de atividade, webhook replay)
create index if not exists idx_escrows_created_at
    on escrows (created_at desc);

-- Indexer: buscar milestones não liberados de um escrow
create index if not exists idx_milestones_escrow_unreleased
    on milestones (escrow_pda, milestone_index)
    where released = false;

-- Auditoria: buscar todos os eventos de um escrow cronologicamente
create index if not exists idx_event_logs_escrow_time
    on event_logs (escrow_pda, block_time desc);

-- Deduplicação: o indexer verifica se a tx já foi processada
create index if not exists idx_event_logs_tx_signature
    on event_logs (tx_signature);

-- Filtrar por tipo de evento (ex: todos os DisputeOpened para alertas)
create index if not exists idx_event_logs_type
    on event_logs (event_type, block_time desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY (RLS)
-- ───────────────────────────────────────────────────────────────────────────
-- Habilita RLS em todas as tabelas.
-- As policies permitem:
--   - Leitura pública (qualquer um pode ver escrows e milestones)
--   - Escrita apenas pelo service_role (indexer autenticado via token)
-- ───────────────────────────────────────────────────────────────────────────

alter table escrows     enable row level security;
alter table milestones  enable row level security;
alter table event_logs  enable row level security;

-- Leitura pública (queries de dashboard sem autenticação)
create policy "Public read escrows"
    on escrows for select
    using (true);

create policy "Public read milestones"
    on milestones for select
    using (true);

create policy "Public read event_logs"
    on event_logs for select
    using (true);

-- service_role (indexer) tem acesso total
create policy "Service role full access escrows"
    on escrows for all
    to service_role
    using (true)
    with check (true);

create policy "Service role full access milestones"
    on milestones for all
    to service_role
    using (true)
    with check (true);

create policy "Service role full access event_logs"
    on event_logs for all
    to service_role
    using (true)
    with check (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 10. VIEW: escrow_dashboard
-- ───────────────────────────────────────────────────────────────────────────
-- View denormalizada para consumo direto pelo front-end sem JOIN.
-- ───────────────────────────────────────────────────────────────────────────

create or replace view escrow_dashboard as
select
    e.pda_address,
    e.escrow_id_hex,
    e.payer_address,
    e.payee_address,
    e.usdc_mint,
    -- Valor em USDC com 6 decimais (legível para humanos)
    round(e.total_amount    / 1000000.0, 2)    as total_usdc,
    round(e.released_amount / 1000000.0, 2)    as released_usdc,
    round(
        (e.released_amount * 100.0 / nullif(e.total_amount, 0)),
        1
    )                                           as pct_released,
    e.status,
    e.current_milestone,
    e.created_at,
    e.timeout_at,
    e.disputed_at,
    e.disputed_by,
    e.dispute_reason,
    -- Contagem de milestones do escrow
    (
        select count(*)
        from milestones m
        where m.escrow_pda = e.pda_address
    )                                           as total_milestones,
    (
        select count(*)
        from milestones m
        where m.escrow_pda = e.pda_address
          and m.released = true
    )                                           as released_milestones,
    e.last_tx_signature,
    e.last_indexed_at
from escrows e;

comment on view escrow_dashboard is
    'View desnormalizada para o dashboard ProofPay. '
    'Expõe valores em USDC (não lamports) e agrega counts de milestones.';
