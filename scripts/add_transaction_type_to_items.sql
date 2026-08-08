-- ================================================================
-- MIGRAÇÃO: adicionar transaction_type_id em transaction_items
-- Execute no Supabase SQL Editor
-- ================================================================

ALTER TABLE transaction_items
    ADD COLUMN IF NOT EXISTS transaction_type_id uuid
        REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
