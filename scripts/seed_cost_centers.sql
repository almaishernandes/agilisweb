-- ================================================================
-- CENTROS DE CUSTO - FAMILIA HERNANDES
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

    DELETE FROM cost_centers WHERE family_id = p_family_id;

    INSERT INTO cost_centers (family_id, full_code, code, description, name, level, category) VALUES
    -- 1. Rendimentos
    (p_family_id, '1',    '1',   'Rendimentos',          'Rendimentos',          1, 'rendimento'),
    (p_family_id, '1.1',  '1',   'Salários',             'Salários',             2, 'rendimento'),
    (p_family_id, '1.2',  '2',   'Vendas',               'Vendas',               2, 'rendimento'),

    -- 3. Moradia
    (p_family_id, '3',    '3',   'Moradia',              'Moradia',              1, 'despesa'),
    (p_family_id, '3.1',  '1',   'Água',                 'Água',                 2, 'despesa'),
    (p_family_id, '3.2',  '2',   'Luz',                  'Luz',                  2, 'despesa'),
    (p_family_id, '3.3',  '3',   'Gás',                  'Gás',                  2, 'despesa'),
    (p_family_id, '3.4',  '4',   'Internet',             'Internet',             2, 'despesa'),
    (p_family_id, '3.5',  '5',   'TV Assinaturas',       'TV Assinaturas',       2, 'despesa'),

    -- 4. Alimentação
    (p_family_id, '4',    '4',   'Alimentação',          'Alimentação',          1, 'despesa'),
    (p_family_id, '4.1',  '1',   'Supermercado',         'Supermercado',         2, 'despesa'),

    -- 5. Saúde
    (p_family_id, '5',    '5',   'Saúde',                'Saúde',                1, 'despesa'),
    (p_family_id, '5.1',  '1',   'Plano de Saúde',       'Plano de Saúde',       2, 'despesa'),
    (p_family_id, '5.2',  '2',   'Farmácia',             'Farmácia',             2, 'despesa'),
    (p_family_id, '5.3',  '3',   'Consultas/Exames',     'Consultas/Exames',     2, 'despesa'),

    -- 6. Educação
    (p_family_id, '6',    '6',   'Educação',             'Educação',             1, 'despesa'),
    (p_family_id, '6.1',  '1',   'Cursos',               'Cursos',               2, 'despesa'),
    (p_family_id, '6.2',  '2',   'Livros/Material',      'Livros/Material',      2, 'despesa'),
    (p_family_id, '6.3',  '3',   'Cabeleireiro/Barbeiro','Cabeleireiro/Barbeiro',2, 'despesa'),

    -- 7. Vestuário
    (p_family_id, '7',    '7',   'Vestuário',            'Vestuário',            1, 'despesa'),
    (p_family_id, '7.1',  '1',   'Roupas/Calçados',      'Roupas/Calçados',      2, 'despesa'),

    -- 8. Cuidados Pessoais
    (p_family_id, '8',    '8',   'Cuidados Pessoais',    'Cuidados Pessoais',    1, 'despesa'),
    (p_family_id, '8.1',  '1',   'Cabeleireiro/Barbeiro','Cabeleireiro/Barbeiro',2, 'despesa'),
    (p_family_id, '8.2',  '2',   'Academia',             'Academia',             2, 'despesa'),

    -- 9. Veiculos
    (p_family_id, '9',    '9',   'Veiculos',             'Veiculos',             1, 'despesa'),
    (p_family_id, '9.1',  '1',   'Combustível',          'Combustível',          2, 'despesa'),

    -- 10. Lazer
    (p_family_id, '10',   '10',  'Lazer',                'Lazer',                1, 'despesa'),
    (p_family_id, '10.1', '1',   'Viagens',              'Viagens',              2, 'despesa'),
    (p_family_id, '10.2', '2',   'Cinema/Shows',         'Cinema/Shows',         2, 'despesa'),
    (p_family_id, '10.3', '3',   'Hobbies',              'Hobbies',              2, 'despesa');

    RAISE NOTICE 'Centros de Custo importados com sucesso para família: %', p_family_id;
END;
$$;
