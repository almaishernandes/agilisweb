-- ================================================================
-- PLANO DE CONTAS COMPLETO - FAMILIA HERNANDES
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

    DELETE FROM chart_of_accounts WHERE family_id = p_family_id;

    INSERT INTO chart_of_accounts (family_id, code, description, level) VALUES
    -- 1. ATIVO
    (p_family_id, '1',          'A T I V O',                        1),
    (p_family_id, '1.1',        'ATIVO CIRCULANTE',                 2),
    (p_family_id, '1.1.1',      'DISPONÍVEL',                       3),
    (p_family_id, '1.1.1.1',    'Caixa/Dinheiro',                   4),
    (p_family_id, '1.1.1.2',    'BB C/C Parapua',                   4),
    (p_family_id, '1.1.1.3',    'BB Poupança',                      4),
    (p_family_id, '1.1.1.4',    'Caixa Federal',                    4),

    (p_family_id, '1.2',        'ATIVO REALIZÁVEL A LONGO PRAZO',   2),
    (p_family_id, '1.2.1',      'DIREITOS A LONGO PRAZO',           3),
    (p_family_id, '1.2.1.1',    'Consórcio de Veículos',            4),

    (p_family_id, '1.3',        'ATIVO PERMANENTE',                 2),
    (p_family_id, '1.3.1',      'INVESTIMENTOS',                    3),
    (p_family_id, '1.3.1.1',    'Participações em Outras Empresas', 4),
    (p_family_id, '1.3.2',      'IMOBILIZADO',                      3),
    (p_family_id, '1.3.2.1',    'Terrenos',                         4),
    (p_family_id, '1.3.2.2',    'Edificações',                      4),
    (p_family_id, '1.3.2.3',    'Veiculos',                         4),
    (p_family_id, '1.3.2.4',    'Marcas Comerciais',                4),
    (p_family_id, '1.3.2.5',    'Móveis e Utensílios',              4),
    (p_family_id, '1.3.2.6',    'Reservas Florestais',              4),
    (p_family_id, '1.3.3',      'DIFERIDO',                         3),
    (p_family_id, '1.3.3.1',    'Desp.Pré-Operacionais',            4),
    (p_family_id, '1.3.3.2',    'Desp.Desenv.Produtos',             4),

    -- 2. PASSIVO
    (p_family_id, '2',          'P A S S I V O',                    1),
    (p_family_id, '2.1',        'PASSIVO CIRCULANTE',               2),
    (p_family_id, '2.1.1',      'CONTAS A PAGAR',                   3),
    (p_family_id, '2.1.1.1',    'Lojas Saito Calçados',             4),
    (p_family_id, '2.1.1.2',    'Lojas Rainha',                     4),
    (p_family_id, '2.1.2',      'CARTÃO CREDITO',                   3),
    (p_family_id, '2.1.2.1',    'BB Platinum',                      4),
    (p_family_id, '2.1.2.2',    'BB Facil',                         4),
    (p_family_id, '2.1.2.3',    'Carrefour',                        4),
    (p_family_id, '2.1.2.4',    'Sem Parar',                        4),
    (p_family_id, '2.1.2.5',    'Nio Card',                         4),
    (p_family_id, '2.1.2.6',    'Casas Bahia',                      4),
    (p_family_id, '2.1.3',      'FINANCIAMENTOS',                   3),
    (p_family_id, '2.1.3.1',    'a definir',                        4),
    (p_family_id, '2.1.4',      'EMPRESTIMOS',                      3),
    (p_family_id, '2.1.4.1',    'Meriva',                           4),

    -- 3. RECEITAS
    (p_family_id, '3',          'R E C E I T A S',                  1),
    (p_family_id, '3.1',        'VERBAS SALARIAIS',                 2),
    (p_family_id, '3.1.1',      'VERBAS SALARIAIS',                 3),
    (p_family_id, '3.1.1.1',    'Correios ECT',                     4),
    (p_family_id, '3.1.1.2',    'TreinaCons',                       4),
    (p_family_id, '3.1.1.3',    'Projetos SOS',                     4),
    (p_family_id, '3.1.1.4',    'Estágio Forum',                    4),
    (p_family_id, '3.1.2',      'VERBAS EVENTUAIS',                 3),
    (p_family_id, '3.1.2.1',    'Palestras',                        4),
    (p_family_id, '3.1.2.2',    'Eventos',                          4),
    (p_family_id, '3.1.3',      'RECEITAS FINANCEIRAS',             3),
    (p_family_id, '3.1.3.1',    'Juros de Poupança',                4),
    (p_family_id, '3.1.3.2',    'Juros s/ Aplicações',              4),
    (p_family_id, '3.1.3.3',    'Descontos Obtidos',                4),
    (p_family_id, '3.1.4',      'RECEITAS DIVERSAS',                3),
    (p_family_id, '3.1.4.1',    'Despesas Recuperadas',             4),
    (p_family_id, '3.1.4.2',    'Presentes Recebidos',              4),
    (p_family_id, '3.1.4.3',    'Devoluções s/ Vendas',             4),

    -- 4. DESPESAS
    (p_family_id, '4',          'DESPESAS',                         1),
    (p_family_id, '4.1',        'DESPESAS',                         2),
    (p_family_id, '4.1.1',      'DESPESAS FIXAS',                   3),
    (p_family_id, '4.1.1.1',    'Agua e Esgoto',                    4),
    (p_family_id, '4.1.1.2',    'Energia Elétrica',                 4),
    (p_family_id, '4.1.1.3',    'Internet',                         4),
    (p_family_id, '4.1.2',      'DESPESAS VARIAVEIS',               3),
    (p_family_id, '4.1.2.1',    'Combustiveis',                     4),
    (p_family_id, '4.1.2.2',    'Manutenção Residencia',            4),
    (p_family_id, '4.1.2.3',    'Manutenção Equipamentos',          4),
    (p_family_id, '4.1.2.4',    'Reformas/Ampliação',               4),
    (p_family_id, '4.1.6',      'DESPESAS FINANCEIRAS',             3),
    (p_family_id, '4.1.6.1',    'Juros p/atraso',                   4),
    (p_family_id, '4.1.6.2',    'Tarifas Bancárias',                4),
    (p_family_id, '4.1.6.3',    'Descontos Concedidos',             4),
    (p_family_id, '4.1.7',      'DESPESAS TRIBUTÁRIAS',             3),
    (p_family_id, '4.1.7.1',    'IPTU',                             4),
    (p_family_id, '4.1.7.2',    'IPVA',                             4),
    (p_family_id, '4.1.7.3',    'IRRF Anual',                       4),
    (p_family_id, '4.1.8',      'DEDUÇÕES RECEITA',                 3),
    (p_family_id, '4.1.8.1',    'Previdencia Social',               4),
    (p_family_id, '4.1.8.2',    'Previdencia Privada',              4),
    (p_family_id, '4.1.8.3',    'IRRF S/Salarios',                  4),
    (p_family_id, '4.1.8.4',    'Convenio Medico',                  4),
    (p_family_id, '4.1.8.5',    'Convenio Alimentação',             4),
    (p_family_id, '4.1.8.6',    'Sindicato/Associações',            4),
    (p_family_id, '4.1.8.7',    'Emprestimos Consignados',          4),
    (p_family_id, '4.1.8.8',    'Desconto Cartão Credito',          4);

    RAISE NOTICE 'Plano de Contas importado com sucesso para família: %', p_family_id;
END;
$$;
