-- ================================================================
-- FORNECEDORES FAMILIA HERNANDES - MIGRAÇÃO + SEED HIERÁRQUICO
-- Padrão igual a Centros de Custo:
--   Nível 1 = Categoria  (full_code = '1', '2', ... '28')
--   Nível 2 = Fornecedor (full_code = '1.01', '1.02', ...)
-- Execute este script no Supabase SQL Editor
-- ================================================================

-- PASSO 1: Garantir colunas necessárias na tabela beneficiaries
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id);
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS category  text;
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS full_code text;
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS level     integer;

-- PASSO 2: Inserir fornecedores com hierarquia
DO $$
DECLARE
    p_family_id uuid;
BEGIN
    SELECT id INTO p_family_id FROM families ORDER BY created_at LIMIT 1;

    IF p_family_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma família encontrada. Faça login primeiro.';
    END IF;

    DELETE FROM beneficiaries WHERE family_id = p_family_id;

    -- Colunas: family_id, full_code, code, level, name, phone, notes, category
    INSERT INTO beneficiaries (family_id, full_code, code, level, name, phone, notes, category) VALUES

    -- ============================================================
    -- 1. AÇOUGUE
    -- ============================================================
    (p_family_id, '1',    '1',  1, 'Açougue',                    null, null, null),
    (p_family_id, '1.01', '01', 2, 'Açougue Casoni',             null, null, 'Açougue'),

    -- ============================================================
    -- 2. CABELELEIRO
    -- ============================================================
    (p_family_id, '2',    '2',  1, 'Cabeleleiro',                null, null, null),
    (p_family_id, '2.01', '01', 2, 'Aildo Viana Brito',          null, null, 'Cabeleleiro'),
    (p_family_id, '2.02', '02', 2, 'Norberto Cabelereiro',       null, null, 'Cabeleleiro'),

    -- ============================================================
    -- 3. COMBUSTIVEIS
    -- ============================================================
    (p_family_id, '3',    '3',  1, 'Combustiveis',               null, null, null),
    (p_family_id, '3.01', '01', 2, 'Fenix Posto Gasolina',       null, null, 'Combustiveis'),
    (p_family_id, '3.02', '02', 2, 'Maracanã Posto Gasolina',    null, null, 'Combustiveis'),
    (p_family_id, '3.03', '03', 2, 'Posto Bandeiras',            null, null, 'Combustiveis'),
    (p_family_id, '3.04', '04', 2, 'Posto Fenix',                null, null, 'Combustiveis'),
    (p_family_id, '3.05', '05', 2, 'Posto Maracana',             null, null, 'Combustiveis'),
    (p_family_id, '3.06', '06', 2, 'Posto Miranda',              null, null, 'Combustiveis'),
    (p_family_id, '3.07', '07', 2, 'Posto Prudentão',            null, null, 'Combustiveis'),
    (p_family_id, '3.08', '08', 2, 'Posto São Domingos',         null, null, 'Combustiveis'),
    (p_family_id, '3.09', '09', 2, 'Posto Zanetti',              null, null, 'Combustiveis'),
    (p_family_id, '3.10', '10', 2, 'Posto Zema',                 null, null, 'Combustiveis'),

    -- ============================================================
    -- 4. CONSUMO
    -- ============================================================
    (p_family_id, '4',    '4',  1, 'Consumo',                    null, null, null),
    (p_family_id, '4.01', '01', 2, 'Energisa',                   null, null, 'Consumo'),
    (p_family_id, '4.02', '02', 2, 'Sabesp',                     null, null, 'Consumo'),

    -- ============================================================
    -- 5. FACULDADE
    -- ============================================================
    (p_family_id, '5',    '5',  1, 'Faculdade',                  null, null, null),
    (p_family_id, '5.01', '01', 2, 'Reges Faculdade',            null, null, 'Faculdade'),

    -- ============================================================
    -- 6. FAMILIA
    -- ============================================================
    (p_family_id, '6',    '6',  1, 'Familia',                    null, null, null),
    (p_family_id, '6.01', '01', 2, 'Ana L Hernandes',            null, null, 'Familia'),
    (p_family_id, '6.02', '02', 2, 'Andreia Ol.Rocha',           null, null, 'Familia'),
    (p_family_id, '6.03', '03', 2, 'João Otavio Hernandes',      null, null, 'Familia'),
    (p_family_id, '6.04', '04', 2, 'Maria Clara Hernandes',      null, null, 'Familia'),

    -- ============================================================
    -- 7. FARMÁCIA
    -- ============================================================
    (p_family_id, '7',    '7',  1, 'Farmácia',                   null, null, null),
    (p_family_id, '7.01', '01', 2, 'Drogalira',                  null, null, 'Farmácia'),

    -- ============================================================
    -- 8. FEIRA LIVRE
    -- ============================================================
    (p_family_id, '8',    '8',  1, 'Feira Livre',                null, null, null),
    (p_family_id, '8.01', '01', 2, 'Mauro Vagner Bassoli',       null, null, 'Feira Livre'),
    (p_family_id, '8.02', '02', 2, 'Wellington Fernandes Barbosa', null, null, 'Feira Livre'),

    -- ============================================================
    -- 9. FINANCEIRO
    -- ============================================================
    (p_family_id, '9',    '9',  1, 'Financeiro',                 null, null, null),
    (p_family_id, '9.01', '01', 2, 'Banco Bradesco',             null, null, 'Financeiro'),
    (p_family_id, '9.02', '02', 2, 'Banco Brasil',               null, null, 'Financeiro'),
    (p_family_id, '9.03', '03', 2, 'CEF',                        null, null, 'Financeiro'),
    (p_family_id, '9.04', '04', 2, 'Tribunal de Justiça',        null, null, 'Financeiro'),
    (p_family_id, '9.05', '05', 2, 'Via Platinun',               null, null, 'Financeiro'),
    (p_family_id, '9.06', '06', 2, 'Visa Facil',                 null, null, 'Financeiro'),
    (p_family_id, '9.07', '07', 2, 'Visa Platinun',              null, null, 'Financeiro'),

    -- ============================================================
    -- 10. GÁS DE COZINHA
    -- ============================================================
    (p_family_id, '10',    '10',  1, 'Gás de Cozinha',           null, null, null),
    (p_family_id, '10.01', '01', 2, 'Pacu Gás e Agua',           null, null, 'Gás de Cozinha'),

    -- ============================================================
    -- 11. HOTEIS
    -- ============================================================
    (p_family_id, '11',    '11',  1, 'Hoteis',                   null, null, null),
    (p_family_id, '11.01', '01', 2, 'Booking',                   null, null, 'Hoteis'),

    -- ============================================================
    -- 12. IGREJA
    -- ============================================================
    (p_family_id, '12',    '12',  1, 'Igreja',                   null, null, null),
    (p_family_id, '12.01', '01', 2, 'Laercio Caetano Oliveira',  null, null, 'Igreja'),
    (p_family_id, '12.02', '02', 2, 'Paroquia Adamantina',       null, null, 'Igreja'),
    (p_family_id, '12.03', '03', 2, 'Paroquia São José',         null, null, 'Igreja'),

    -- ============================================================
    -- 13. INFORMATIZAÇÃO
    -- ============================================================
    (p_family_id, '13',    '13',  1, 'Informatização',           null, null, null),
    (p_family_id, '13.01', '01', 2, 'Marcos Antonio Beluzzi',    null, null, 'Informatização'),

    -- ============================================================
    -- 14. INTERNET
    -- ============================================================
    (p_family_id, '14',    '14',  1, 'Internet',                 null, null, null),
    (p_family_id, '14.01', '01', 2, 'Amazon',                    null, null, 'Internet'),
    (p_family_id, '14.02', '02', 2, 'Atlantain',                 null, null, 'Internet'),
    (p_family_id, '14.03', '03', 2, 'BPak Comercial',            null, null, 'Internet'),
    (p_family_id, '14.04', '04', 2, 'Claude Antropic',           null, null, 'Internet'),
    (p_family_id, '14.05', '05', 2, 'Google',                    null, null, 'Internet'),
    (p_family_id, '14.06', '06', 2, 'IPAG Pagamentos Digitais',  null, null, 'Internet'),
    (p_family_id, '14.07', '07', 2, 'Lovable',                   null, null, 'Internet'),
    (p_family_id, '14.08', '08', 2, 'MarketPlace',               null, null, 'Internet'),
    (p_family_id, '14.09', '09', 2, 'Mercado Pago',              null, null, 'Internet'),
    (p_family_id, '14.10', '10', 2, 'MultiDisplay',              null, null, 'Internet'),
    (p_family_id, '14.11', '11', 2, 'Shopee',                    null, null, 'Internet'),

    -- ============================================================
    -- 15. LAZER
    -- ============================================================
    (p_family_id, '15',    '15',  1, 'Lazer',                    null, null, null),
    (p_family_id, '15.01', '01', 2, 'Clube das Bandeiras',       null, null, 'Lazer'),
    (p_family_id, '15.02', '02', 2, 'Sparta Academia Clube',     null, null, 'Lazer'),

    -- ============================================================
    -- 16. LOJAS
    -- ============================================================
    (p_family_id, '16',    '16',  1, 'Lojas',                    null, null, null),
    (p_family_id, '16.01', '01', 2, 'A R Assessorios',           null, null, 'Lojas'),
    (p_family_id, '16.02', '02', 2, 'Adriane Salvagni',          null, null, 'Lojas'),
    (p_family_id, '16.03', '03', 2, 'Adrios Spuma',              null, null, 'Lojas'),
    (p_family_id, '16.04', '04', 2, 'Amanda Cristina Santos',    null, null, 'Lojas'),
    (p_family_id, '16.05', '05', 2, 'Antonio Cleber Gonçalves',  null, null, 'Lojas'),
    (p_family_id, '16.06', '06', 2, 'Bella Store',               null, null, 'Lojas'),
    (p_family_id, '16.07', '07', 2, 'Canticos Liturgicos',       null, null, 'Lojas'),
    (p_family_id, '16.08', '08', 2, 'Cia do Terno',              null, null, 'Lojas'),
    (p_family_id, '16.09', '09', 2, 'Clery Uniformes',           null, null, 'Lojas'),
    (p_family_id, '16.10', '10', 2, 'Daiane Mendes Silva',       null, null, 'Lojas'),
    (p_family_id, '16.11', '11', 2, 'Diego Dias Toledo',         null, null, 'Lojas'),
    (p_family_id, '16.12', '12', 2, 'Havan',                     null, null, 'Lojas'),
    (p_family_id, '16.13', '13', 2, 'Helio F Torres',            null, null, 'Lojas'),
    (p_family_id, '16.14', '14', 2, 'IVANI CUBA AKI',            null, null, 'Lojas'),
    (p_family_id, '16.15', '15', 2, 'JELF IND COM',              null, null, 'Lojas'),
    (p_family_id, '16.16', '16', 2, 'João da Silva Barros',      null, null, 'Lojas'),
    (p_family_id, '16.17', '17', 2, 'Leticia',                   null, null, 'Lojas'),
    (p_family_id, '16.18', '18', 2, 'Luis Henrique Bortolucci',  null, null, 'Lojas'),
    (p_family_id, '16.19', '19', 2, 'Magalu',                    null, null, 'Lojas'),
    (p_family_id, '16.20', '20', 2, 'Marcelo Leandro Martines',  null, null, 'Lojas'),
    (p_family_id, '16.21', '21', 2, 'Marcos Rogerio',            null, null, 'Lojas'),
    (p_family_id, '16.22', '22', 2, 'Maria Eduarda',             null, null, 'Lojas'),
    (p_family_id, '16.23', '23', 2, 'Mauro Fotos',               null, null, 'Lojas'),
    (p_family_id, '16.24', '24', 2, 'O Vidraceiro',              null, null, 'Lojas'),
    (p_family_id, '16.25', '25', 2, 'Paulo de Miranda',          null, null, 'Lojas'),
    (p_family_id, '16.26', '26', 2, 'Poliana Dias Silva',        null, null, 'Lojas'),
    (p_family_id, '16.27', '27', 2, 'Prudenshoping',             null, null, 'Lojas'),
    (p_family_id, '16.28', '28', 2, 'Real Moveis',               null, null, 'Lojas'),
    (p_family_id, '16.29', '29', 2, 'Renata Rosa Pereira Loure', null, null, 'Lojas'),
    (p_family_id, '16.30', '30', 2, 'Risque e Rabisque',         null, null, 'Lojas'),
    (p_family_id, '16.31', '31', 2, 'Thiago de Souza Prado',     null, null, 'Lojas'),
    (p_family_id, '16.32', '32', 2, 'Vitoria Rodrigues de Lima', null, null, 'Lojas'),

    -- ============================================================
    -- 17. MANUTENÇÃO
    -- ============================================================
    (p_family_id, '17',    '17',  1, 'Manutenção',               null, null, null),
    (p_family_id, '17.01', '01', 2, 'Chaveiro Refrigeração',     null, null, 'Manutenção'),
    (p_family_id, '17.02', '02', 2, 'Cimafa',                    null, null, 'Manutenção'),
    (p_family_id, '17.03', '03', 2, 'Ferragens Paulista',        null, null, 'Manutenção'),
    (p_family_id, '17.04', '04', 2, 'L Moreno',                  null, null, 'Manutenção'),

    -- ============================================================
    -- 18. MATERIAL CONSTRUÇÃO
    -- ============================================================
    (p_family_id, '18',    '18',  1, 'Material Construção',      null, null, null),
    (p_family_id, '18.01', '01', 2, 'Casa Construtor',           null, null, 'Material Construção'),
    (p_family_id, '18.02', '02', 2, 'Gero Mat.Construção',       null, null, 'Material Construção'),

    -- ============================================================
    -- 19. MINI MERCADOS
    -- ============================================================
    (p_family_id, '19',    '19',  1, 'Mini Mercados',            null, null, null),
    (p_family_id, '19.01', '01', 2, 'Camorsa E-Commerce',        null, null, 'Mini Mercados'),
    (p_family_id, '19.02', '02', 2, 'Conveniencia Borssato',     null, null, 'Mini Mercados'),
    (p_family_id, '19.03', '03', 2, 'Elisa Kumiko Ichikawa',     null, null, 'Mini Mercados'),
    (p_family_id, '19.04', '04', 2, 'Encanto Natural',           null, null, 'Mini Mercados'),
    (p_family_id, '19.05', '05', 2, 'Utilar',                    null, null, 'Mini Mercados'),

    -- ============================================================
    -- 20. OFICINA
    -- ============================================================
    (p_family_id, '20',    '20',  1, 'Oficina',                  null, null, null),
    (p_family_id, '20.01', '01', 2, 'Auto Eletrica São Cristovão', null, null, 'Oficina'),
    (p_family_id, '20.02', '02', 2, 'Maiara Mozzini Almeida',    null, null, 'Oficina'),
    (p_family_id, '20.03', '03', 2, 'Okubo Pneus',               null, null, 'Oficina'),
    (p_family_id, '20.04', '04', 2, 'Paulo Ricardo Gaudio',      null, null, 'Oficina'),
    (p_family_id, '20.05', '05', 2, 'Rafael Freitas Gaudio',     null, null, 'Oficina'),
    (p_family_id, '20.06', '06', 2, 'Silas Carlos Figueiredo',   null, null, 'Oficina'),

    -- ============================================================
    -- 21. PADARIA
    -- ============================================================
    (p_family_id, '21',    '21',  1, 'Padaria',                  null, null, null),
    (p_family_id, '21.01', '01', 2, 'Atenas Padaria',            null, null, 'Padaria'),
    (p_family_id, '21.02', '02', 2, 'Padaria Cantilly',          null, null, 'Padaria'),
    (p_family_id, '21.03', '03', 2, 'Padaria Santo Antonio',     null, null, 'Padaria'),
    (p_family_id, '21.04', '04', 2, 'Padaria Trigo Art',         null, null, 'Padaria'),

    -- ============================================================
    -- 22. RECEITAS
    -- ============================================================
    (p_family_id, '22',    '22',  1, 'Receitas',                 null, null, null),
    (p_family_id, '22.01', '01', 2, 'Correios ECT',              null, null, 'Receitas'),
    (p_family_id, '22.02', '02', 2, 'INSS',                      null, null, 'Receitas'),

    -- ============================================================
    -- 23. RESTAURANTES
    -- ============================================================
    (p_family_id, '23',    '23',  1, 'Restaurantes',             null, null, null),
    (p_family_id, '23.01', '01', 2, 'Bagaço Sucos',              null, null, 'Restaurantes'),
    (p_family_id, '23.02', '02', 2, 'BK',                        null, null, 'Restaurantes'),
    (p_family_id, '23.03', '03', 2, 'Casa do Pastel',            null, null, 'Restaurantes'),
    (p_family_id, '23.04', '04', 2, 'Costelerios',               null, null, 'Restaurantes'),
    (p_family_id, '23.05', '05', 2, 'Divino Fogão',              null, null, 'Restaurantes'),
    (p_family_id, '23.06', '06', 2, 'Grill Adamantina',          null, null, 'Restaurantes'),
    (p_family_id, '23.07', '07', 2, 'Kikão Lanches',             null, null, 'Restaurantes'),
    (p_family_id, '23.08', '08', 2, 'La Ilha Pizzaria',          null, null, 'Restaurantes'),
    (p_family_id, '23.09', '09', 2, 'Lanchonete Padre Pio',      null, null, 'Restaurantes'),
    (p_family_id, '23.10', '10', 2, 'Livia Gasparini',           null, null, 'Restaurantes'),
    (p_family_id, '23.11', '11', 2, 'MacDonald Tupa',            null, null, 'Restaurantes'),
    (p_family_id, '23.12', '12', 2, 'Marquinhos Lanche',         null, null, 'Restaurantes'),
    (p_family_id, '23.13', '13', 2, 'Mixx Pizaria',              null, null, 'Restaurantes'),
    (p_family_id, '23.14', '14', 2, 'Pizzaria La Ilha',          null, null, 'Restaurantes'),
    (p_family_id, '23.15', '15', 2, 'Pizzaria Mazzini',          null, null, 'Restaurantes'),
    (p_family_id, '23.16', '16', 2, 'Pizzaria Mixx',             null, null, 'Restaurantes'),
    (p_family_id, '23.17', '17', 2, 'Pizzaria N.1',              null, null, 'Restaurantes'),
    (p_family_id, '23.18', '18', 2, 'Pizzaria Trevão',           null, null, 'Restaurantes'),
    (p_family_id, '23.19', '19', 2, 'Restaurante Agua na Boca',  null, null, 'Restaurantes'),
    (p_family_id, '23.20', '20', 2, 'Restaurante Cocipa',        null, null, 'Restaurantes'),
    (p_family_id, '23.21', '21', 2, 'Restaurante D.Neide',       null, null, 'Restaurantes'),
    (p_family_id, '23.22', '22', 2, 'Restaurante da Hora',       null, null, 'Restaurantes'),
    (p_family_id, '23.23', '23', 2, 'Restaurante NaBrasa',       null, null, 'Restaurantes'),
    (p_family_id, '23.24', '24', 2, 'Sorveteria SkiMel',         null, null, 'Restaurantes'),
    (p_family_id, '23.25', '25', 2, 'Suco Regente Feijó',        null, null, 'Restaurantes'),
    (p_family_id, '23.26', '26', 2, 'Tempero Caseiro',           null, null, 'Restaurantes'),
    (p_family_id, '23.27', '27', 2, 'Trevão Pizzaria',           null, null, 'Restaurantes'),
    (p_family_id, '23.28', '28', 2, 'Yak Dog',                   null, null, 'Restaurantes'),

    -- ============================================================
    -- 24. SORVETERIA
    -- ============================================================
    (p_family_id, '24',    '24',  1, 'Sorveteria',               null, null, null),
    (p_family_id, '24.01', '01', 2, 'Açai',                      null, null, 'Sorveteria'),

    -- ============================================================
    -- 25. SUPERMERCADO
    -- ============================================================
    (p_family_id, '25',    '25',  1, 'Supermercado',             null, null, null),
    (p_family_id, '25.01', '01', 2, 'Atacadão',                  null, null, 'Supermercado'),
    (p_family_id, '25.02', '02', 2, 'Bandeiras Mercadinho',      null, null, 'Supermercado'),
    (p_family_id, '25.03', '03', 2, 'Big Mart',                  null, null, 'Supermercado'),
    (p_family_id, '25.04', '04', 2, 'Casa Aliança Supermercado', null, null, 'Supermercado'),
    (p_family_id, '25.05', '05', 2, 'Casa Avenida',              null, null, 'Supermercado'),
    (p_family_id, '25.06', '06', 2, 'Cocipa Supermercados',      null, null, 'Supermercado'),
    (p_family_id, '25.07', '07', 2, 'Kawakami Bastos',           null, null, 'Supermercado'),
    (p_family_id, '25.08', '08', 2, 'Pastorinho Supermercados',  null, null, 'Supermercado'),
    (p_family_id, '25.09', '09', 2, 'Savenago Supermercados',    null, null, 'Supermercado'),
    (p_family_id, '25.10', '10', 2, 'Supermercado Muffato',      null, null, 'Supermercado'),
    (p_family_id, '25.11', '11', 2, 'Vitoria Supermercados',     null, null, 'Supermercado'),

    -- ============================================================
    -- 26. TRABALHO
    -- ============================================================
    (p_family_id, '26',    '26',  1, 'Trabalho',                 null, null, null),
    (p_family_id, '26.01', '01', 2, 'Selma Cardoso',             null, null, 'Trabalho'),

    -- ============================================================
    -- 27. TRANSPORTES
    -- ============================================================
    (p_family_id, '27',    '27',  1, 'Transportes',              null, null, null),
    (p_family_id, '27.01', '01', 2, 'Eixo Pedagio',              null, null, 'Transportes'),
    (p_family_id, '27.02', '02', 2, 'Guilherme Hassan',          null, null, 'Transportes'),

    -- ============================================================
    -- 28. VIGILANTE
    -- ============================================================
    (p_family_id, '28',    '28',  1, 'Vigilante',                null, null, null),
    (p_family_id, '28.01', '01', 2, 'Julio de Souza Sá',         null, null, 'Vigilante');

    RAISE NOTICE 'Fornecedores importados com sucesso. Família: %', p_family_id;
END;
$$;
