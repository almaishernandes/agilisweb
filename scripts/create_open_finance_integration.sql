-- ================================================================
-- AGILI$ — INTEGRAÇÃO OPEN FINANCE (Pluggy / Belvo)
-- Execute este script no Supabase SQL Editor
-- ================================================================
-- Modela: conexões bancárias (consentimento), fila de staging de
-- transações brutas do provedor, vínculo dessas transações com os
-- lançamentos já existentes em `transactions`, e o log de idempotência
-- de webhooks. Segue exatamente os padrões já usados no restante do
-- banco (family_id + RLS via get_family_id(), uuid pk, timestamptz).
-- ================================================================

-- pg_trgm habilita comparação de similaridade de texto (usado pelo
-- motor de conciliação para casar a descrição do banco com a do
-- lançamento manual, mesmo quando o texto não é idêntico).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ================================================================
-- 1. CONEXÕES BANCÁRIAS (consentimento Open Finance)
-- ================================================================
-- Importante (LGPD): NUNCA armazenamos usuário/senha do banco do
-- cliente. O provedor (Pluggy/Belvo) cuida de toda a autenticação
-- OAuth do Open Finance; aqui guardamos apenas o identificador do
-- "item" (a conexão) que o provedor nos devolve, para conseguirmos
-- consultar/atualizar essa conexão depois.
CREATE TABLE IF NOT EXISTS bank_connections (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id           uuid NOT NULL REFERENCES families(id),
    account_id          uuid REFERENCES accounts(id) ON DELETE SET NULL, -- conta AGILI$ vinculada (pode ser preenchida depois, quando o usuário mapear qual conta bancária corresponde a qual conta cadastrada)
    provider            text NOT NULL DEFAULT 'pluggy',                  -- 'pluggy' | 'belvo'
    provider_item_id    text NOT NULL,                                   -- itemId (Pluggy) / link_id (Belvo) — identifica a conexão no provedor
    provider_account_id text,                                            -- id da conta bancária específica dentro do item (um item pode ter várias contas)
    institution_id      text,
    institution_name    text,
    status              text NOT NULL DEFAULT 'WAITING_USER_INPUT'
                         CHECK (status IN ('CONNECTED','UPDATING','LOGIN_ERROR','OUTDATED','WAITING_USER_INPUT','DISCONNECTED')),
    consent_expires_at  timestamptz,      -- validade do consentimento Open Finance (obrigatório renovar após esse prazo)
    last_synced_at      timestamptz,
    created_by          uuid REFERENCES profiles(id),
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    UNIQUE (provider, provider_item_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_family ON bank_connections(family_id);

-- ================================================================
-- 2. FILA DE STAGING — transações brutas vindas do Open Finance,
-- antes de serem consolidadas (ou não) em `transactions`.
-- ================================================================
CREATE TABLE IF NOT EXISTS bank_transactions_staging (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_connection_id       uuid NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    family_id                uuid NOT NULL REFERENCES families(id), -- denormalizado para permitir RLS direto, sem join
    agilis_account_id        uuid REFERENCES accounts(id) ON DELETE SET NULL,
    external_transaction_id  text NOT NULL,   -- id da transação no provedor (chave de idempotência)
    description_raw          text,            -- descrição original, como veio do banco
    description              text,            -- descrição normalizada (usada na comparação de similaridade)
    amount                   numeric(15,2) NOT NULL,
    dc_type                  char(1) NOT NULL CHECK (dc_type IN ('C','D')),
    transaction_date         date NOT NULL,
    category_provider        text,            -- categoria que o próprio provedor sugere (Pluggy/Belvo já vem com uma categorização própria)
    status                   text NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING','MATCHED','IMPORTED','IGNORED','DUPLICATE')),
    matched_transaction_id   uuid REFERENCES transactions(id) ON DELETE SET NULL, -- quando concilia com um lançamento manual já existente
    suggested_beneficiary_id uuid REFERENCES beneficiaries(id) ON DELETE SET NULL,
    suggested_cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
    suggested_chart_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    match_confidence         numeric(4,3),    -- 0.000 a 1.000 — grau de confiança da auto-categorização/duplicidade
    raw_payload              jsonb,           -- payload bruto do provedor, para auditoria/depuração
    created_at               timestamptz DEFAULT now(),
    UNIQUE (bank_connection_id, external_transaction_id)  -- garante idempotência mesmo se o webhook reprocessar
);

CREATE INDEX IF NOT EXISTS idx_staging_family_status ON bank_transactions_staging(family_id, status);
CREATE INDEX IF NOT EXISTS idx_staging_description_trgm ON bank_transactions_staging USING gin (description gin_trgm_ops);

-- ================================================================
-- 3. LOG DE EVENTOS DE WEBHOOK — idempotência de entrega
-- ================================================================
-- O provedor pode reenviar o mesmo evento (retry de rede, etc). Este
-- log garante que cada evento só é processado uma única vez.
CREATE TABLE IF NOT EXISTS webhook_events_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider     text NOT NULL,
    event_id     text NOT NULL,   -- id do evento entregue pelo provedor (ou hash determinístico, se o provedor não enviar um)
    event_type   text NOT NULL,
    payload      jsonb,
    processed_at timestamptz DEFAULT now(),
    UNIQUE (provider, event_id)
);

-- ================================================================
-- 4. CAMPOS NOVOS EM `transactions` — vínculo com a origem
-- ================================================================
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS external_transaction_id text,
    ADD COLUMN IF NOT EXISTS is_conciliated          boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS origin                  text NOT NULL DEFAULT 'MANUAL'
        CHECK (origin IN ('MANUAL','OPEN_FINANCE','NFCE_QR','NFCE_XML','VOICE')),
    ADD COLUMN IF NOT EXISTS bank_connection_id       uuid REFERENCES bank_connections(id) ON DELETE SET NULL;

-- Evita duas transações Open Finance idênticas dentro da mesma família
-- (partial unique index — só se aplica quando o campo está preenchido).
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_family_external_id
    ON transactions(family_id, external_transaction_id)
    WHERE external_transaction_id IS NOT NULL;

-- Índice de similaridade de texto para o motor de conciliação
-- (usa pg_trgm para casar "UBER *TRIP" com "Uber - corrida", por exemplo).
CREATE INDEX IF NOT EXISTS idx_transactions_description_trgm
    ON transactions USING gin (description gin_trgm_ops);

-- ================================================================
-- 5. MAPEAMENTO DE AUTO-CATEGORIZAÇÃO — estende `mapeamento_ia`
-- ================================================================
-- A tabela `mapeamento_ia` já existia (palavra_chave -> centro de
-- custo). Agora também aponta para o Plano de Contas e passa a ser
-- escopada por família (com fallback global quando family_id é nulo),
-- já que regras de categorização variam de família para família.
ALTER TABLE mapeamento_ia
    ADD COLUMN IF NOT EXISTS family_id  uuid REFERENCES families(id),
    ADD COLUMN IF NOT EXISTS id_plano_conta uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS id_fornecedor  uuid REFERENCES beneficiaries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mapeamento_ia_family ON mapeamento_ia(family_id);

-- ================================================================
-- 6. ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE bank_connections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events_log        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_isolation" ON bank_connections
    USING (family_id = get_family_id())
    WITH CHECK (family_id = get_family_id());

CREATE POLICY "family_isolation" ON bank_transactions_staging
    USING (family_id = get_family_id())
    WITH CHECK (family_id = get_family_id());

-- webhook_events_log é escrito apenas pela Edge Function (service_role,
-- que ignora RLS) — nenhuma política de leitura para o cliente comum.
CREATE POLICY "service_role_only" ON webhook_events_log
    USING (false);

-- NOTIFY pgrst, 'reload schema' força o PostgREST a reconhecer as
-- tabelas/colunas novas imediatamente (evita erro de "schema cache").
NOTIFY pgrst, 'reload schema';
