-- ================================================================
-- CORREÇÃO: criar/completar tabela transaction_items
-- Execute no Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS transaction_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    cost_center_id      uuid REFERENCES cost_centers(id)      ON DELETE SET NULL,
    transaction_type_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    description         text,
    quantity            numeric(15,4) DEFAULT 1,
    unit_price          numeric(15,2),
    total_price         numeric(15,2)
);

-- Caso a tabela já exista mas faltem colunas, adiciona individualmente:
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS cost_center_id      uuid REFERENCES cost_centers(id)      ON DELETE SET NULL;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS transaction_type_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS description         text;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS quantity            numeric(15,4) DEFAULT 1;
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS unit_price          numeric(15,2);
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS total_price         numeric(15,2);

-- RLS
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_items" ON transaction_items;
CREATE POLICY "family_items" ON transaction_items
    USING (transaction_id IN (
        SELECT id FROM transactions WHERE family_id = get_family_id()
    ));
