-- ================================================================
-- FORNECEDORES - FAMILIA HERNANDES
-- Execute no Supabase SQL Editor
-- ================================================================

DO $$
DECLARE
    p_family_id uuid;
BEGIN
    SELECT id INTO p_family_id FROM families ORDER BY created_at LIMIT 1;

    IF p_family_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma família encontrada. Faça login primeiro.';
    END IF;

    DELETE FROM beneficiaries WHERE family_id = p_family_id;

    INSERT INTO beneficiaries (family_id, code, name, phone, notes) VALUES
    -- 1. Supermercados
    (p_family_id, '1',   'SUPERMERCADOS',         null, null),
    (p_family_id, '1.1', 'Atacadão',              null, null),
    (p_family_id, '1.2', 'Carrefour',             null, null),
    (p_family_id, '1.3', 'Assaí',                 null, null),

    -- 2. Farmácias
    (p_family_id, '2',   'FARMÁCIAS',             null, null),
    (p_family_id, '2.1', 'Drogasil',              null, null),
    (p_family_id, '2.2', 'Droga Raia',            null, null),

    -- 3. Serviços Públicos
    (p_family_id, '3',   'SERVIÇOS PÚBLICOS',     null, null),
    (p_family_id, '3.1', 'SABESP / Água',         null, null),
    (p_family_id, '3.2', 'Enel / Energia',        null, null),
    (p_family_id, '3.3', 'Comgás / Gás',          null, null),

    -- 4. Telecomunicações
    (p_family_id, '4',   'TELECOMUNICAÇÕES',      null, null),
    (p_family_id, '4.1', 'Claro',                 null, null),
    (p_family_id, '4.2', 'Vivo',                  null, null),
    (p_family_id, '4.3', 'NET / Claro TV',        null, null),

    -- 5. Saúde
    (p_family_id, '5',   'SAÚDE',                 null, null),
    (p_family_id, '5.1', 'Unimed',                null, null),
    (p_family_id, '5.2', 'Bradesco Saúde',        null, null),

    -- 6. Educação
    (p_family_id, '6',   'EDUCAÇÃO',              null, null),
    (p_family_id, '6.1', 'a definir',             null, null),

    -- 7. Combustível
    (p_family_id, '7',   'COMBUSTÍVEL',           null, null),
    (p_family_id, '7.1', 'Posto Shell',           null, null),
    (p_family_id, '7.2', 'Posto Ipiranga',        null, null),

    -- 8. Bancos / Financeiras
    (p_family_id, '8',   'BANCOS / FINANCEIRAS',  null, null),
    (p_family_id, '8.1', 'Banco do Brasil',       null, null),
    (p_family_id, '8.2', 'Caixa Econômica',       null, null),
    (p_family_id, '8.3', 'Nubank',                null, null),

    -- 9. Outros
    (p_family_id, '9',   'OUTROS',                null, null),
    (p_family_id, '9.1', 'a definir',             null, null);

    RAISE NOTICE 'Fornecedores importados com sucesso para família: %', p_family_id;
END;
$$;
