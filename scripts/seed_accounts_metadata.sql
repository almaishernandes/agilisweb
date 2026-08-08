-- ================================================================
-- TIPOS DE CONTA E INSTITUIÇÕES
-- Execute no Supabase SQL Editor
-- ================================================================

-- Limpa e repopula tipos de conta
DELETE FROM account_types;
INSERT INTO account_types (name) VALUES
('Conta Corrente'),
('Poupança'),
('Cartão de Crédito'),
('Investimento'),
('Dinheiro'),
('Carteira Digital'),
('Consórcio'),
('Financiamento'),
('Empréstimo'),
('Outros');

-- Limpa e repopula instituições
DELETE FROM institutions;
INSERT INTO institutions (name) VALUES
('Banco do Brasil'),
('Bradesco'),
('Itaú'),
('Santander'),
('Caixa Econômica Federal'),
('Nubank'),
('Banco Inter'),
('BTG Pactual'),
('XP Investimentos'),
('Sicoob'),
('Sicredi'),
('C6 Bank'),
('PicPay'),
('Mercado Pago'),
('Outros');

-- ================================================================
-- CONTAS INICIAIS
-- Execute APÓS ter um usuário/família cadastrado
-- ================================================================

DO $$
DECLARE
    p_family_id uuid;
BEGIN
    SELECT id INTO p_family_id FROM families ORDER BY created_at LIMIT 1;
    IF p_family_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma família encontrada. Faça login primeiro.';
    END IF;

    -- Não duplica se já existir
    IF EXISTS (SELECT 1 FROM accounts WHERE family_id = p_family_id) THEN
        RAISE NOTICE 'Contas já existem para esta família. Nenhuma alteração feita.';
        RETURN;
    END IF;

    INSERT INTO accounts (family_id, name, account_type, institution, initial_balance, account_number) VALUES
    (p_family_id, 'Caixa',         'Dinheiro',          'Outros',              0, null),
    (p_family_id, 'BB C/C Parapua','Conta Corrente',     'Banco do Brasil',     0, null),
    (p_family_id, 'BB Poupança',   'Poupança',           'Banco do Brasil',     0, null),
    (p_family_id, 'Caixa Federal', 'Conta Corrente',     'Caixa Econômica Federal', 0, null),
    (p_family_id, 'BB Facil',      'Cartão de Crédito',  'Banco do Brasil',     0, null),
    (p_family_id, 'BB Platinum',   'Cartão de Crédito',  'Banco do Brasil',     0, null);

    RAISE NOTICE 'Contas criadas para família: %', p_family_id;
END;
$$;
