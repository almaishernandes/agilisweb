-- ================================================================
-- AGILIS - SETUP COMPLETO DO BANCO DE DADOS
-- Execute este script no Supabase SQL Editor
-- ================================================================

-- ================================================================
-- 1. TABELAS DE SUPORTE (sem FK)
-- ================================================================

CREATE TABLE IF NOT EXISTS account_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS institutions (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
);

-- ================================================================
-- 2. TABELA DE FAMÍLIAS (multi-tenant)
-- ================================================================

CREATE TABLE IF NOT EXISTS families (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text,
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 3. PERFIS DE USUÁRIO (estende auth.users)
-- ================================================================

CREATE TABLE IF NOT EXISTS profiles (
    id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    family_id uuid REFERENCES families(id),
    full_name text,
    email     text,
    role      text DEFAULT 'Operacional',
    created_at timestamptz DEFAULT now()
);

-- Trigger: cria perfil automaticamente ao registrar usuário
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================
-- 4. CONTAS BANCÁRIAS
-- ================================================================

CREATE TABLE IF NOT EXISTS accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id       uuid REFERENCES families(id),
    name            text NOT NULL,
    account_type    text,
    account_number  text,
    institution     text,
    initial_balance numeric(15,2) DEFAULT 0,
    closing_day     integer,
    due_day         integer,
    credit_limit    numeric(15,2),
    created_at      timestamptz DEFAULT now()
);

-- ================================================================
-- 5. BENEFICIÁRIOS / FORNECEDORES
-- ================================================================

CREATE TABLE IF NOT EXISTS beneficiaries (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid REFERENCES families(id),
    full_code text,
    code      text,
    level     integer,
    category  text,
    name      text NOT NULL,
    phone     text,
    notes     text
);

-- ================================================================
-- 6. CENTRO DE CUSTOS
-- ================================================================

CREATE TABLE IF NOT EXISTS cost_centers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   uuid REFERENCES families(id),
    code        text,
    full_code   text,
    description text,
    name        text,
    category    text,  -- 'rendimento','despesa','deducao','investimento'
    level       integer
);

-- ================================================================
-- 7. PLANO DE CONTAS
-- ================================================================

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   uuid REFERENCES families(id),
    code        text,
    description text,
    level       integer
);

-- ================================================================
-- 8. TRANSAÇÕES
-- ================================================================

CREATE TABLE IF NOT EXISTS transactions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          uuid REFERENCES accounts(id) ON DELETE CASCADE,
    user_id             uuid REFERENCES profiles(id),
    family_id           uuid REFERENCES families(id),
    beneficiary_id      uuid REFERENCES beneficiaries(id) ON DELETE SET NULL,
    cost_center_id      uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
    transaction_type_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    emission_date       date NOT NULL,
    due_date            date,
    description         text,
    amount              numeric(15,2) NOT NULL,
    dc_type             char(1) NOT NULL CHECK (dc_type IN ('C','D')),
    type                text NOT NULL,
    sequential_id       integer,
    created_at          timestamptz DEFAULT now()
);

-- Sequência automática de sequential_id por conta
CREATE OR REPLACE FUNCTION set_sequential_id()
RETURNS trigger AS $$
BEGIN
    IF NEW.sequential_id IS NULL THEN
        SELECT COALESCE(MAX(sequential_id), 0) + 1
        INTO NEW.sequential_id
        FROM transactions
        WHERE account_id = NEW.account_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sequential_id ON transactions;
CREATE TRIGGER trg_sequential_id
    BEFORE INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION set_sequential_id();

-- ================================================================
-- 9. ITENS DE TRANSAÇÃO
-- ================================================================

CREATE TABLE IF NOT EXISTS transaction_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    cost_center_id      uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
    transaction_type_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    description         text,
    quantity            numeric(15,4) DEFAULT 1,
    unit_price          numeric(15,2),
    total_price         numeric(15,2)
);

-- ================================================================
-- 10. MAPEAMENTO IA (categorização automática)
-- ================================================================

CREATE TABLE IF NOT EXISTS mapeamento_ia (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    palavra_chave text,
    id_cc        uuid REFERENCES cost_centers(id) ON DELETE SET NULL
);

-- ================================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- ================================================================

ALTER TABLE families          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiaries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapeamento_ia     ENABLE ROW LEVEL SECURITY;

-- Função auxiliar: retorna family_id do usuário logado
CREATE OR REPLACE FUNCTION get_family_id()
RETURNS uuid AS $$
    SELECT family_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Policies: cada usuário acessa apenas dados da sua família
CREATE POLICY "family_isolation" ON accounts
    USING (family_id = get_family_id());

CREATE POLICY "family_isolation" ON cost_centers
    USING (family_id = get_family_id());

CREATE POLICY "family_isolation" ON chart_of_accounts
    USING (family_id = get_family_id());

CREATE POLICY "family_isolation" ON transactions
    USING (family_id = get_family_id());

CREATE POLICY "family_isolation" ON transaction_items
    USING (transaction_id IN (
        SELECT id FROM transactions WHERE family_id = get_family_id()
    ));

-- Beneficiários: visíveis para todos (sem isolamento por família)
CREATE POLICY "public_read" ON beneficiaries FOR SELECT USING (true);
CREATE POLICY "authenticated_write" ON beneficiaries FOR ALL USING (auth.role() = 'authenticated');

-- Perfil: cada usuário vê apenas o próprio
CREATE POLICY "own_profile" ON profiles USING (id = auth.uid());

-- Famílias: cada usuário vê apenas a própria
CREATE POLICY "own_family" ON families USING (id = get_family_id());

-- Mapeamento IA: acesso geral autenticado
CREATE POLICY "authenticated_all" ON mapeamento_ia USING (auth.role() = 'authenticated');

-- account_types e institutions: leitura pública
ALTER TABLE account_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON account_types  FOR SELECT USING (true);
CREATE POLICY "public_read" ON institutions   FOR SELECT USING (true);

-- ================================================================
-- 12. DADOS INICIAIS (tipos de conta e instituições)
-- ================================================================

INSERT INTO account_types (name) VALUES
('Conta Corrente'), ('Poupança'), ('Cartão de Crédito'),
('Investimento'), ('Dinheiro'), ('Carteira Digital'), ('Outros')
ON CONFLICT DO NOTHING;

INSERT INTO institutions (name) VALUES
('Banco do Brasil'), ('Bradesco'), ('Itaú'), ('Santander'),
('Caixa Econômica Federal'), ('Nubank'), ('Banco Inter'),
('BTG Pactual'), ('XP Investimentos'), ('Banco Safra'),
('PagBank'), ('Mercado Pago'), ('C6 Bank'), ('Banco PAN'),
('Neon'), ('Sicoob'), ('Sicredi'), ('Outros')
ON CONFLICT DO NOTHING;

-- ================================================================
-- 13. FUNÇÃO: semeia plano de contas para uma família
-- ================================================================

CREATE OR REPLACE FUNCTION seed_chart_of_accounts_for_family(p_family_id uuid)
RETURNS void AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE family_id = p_family_id) THEN
        RETURN;
    END IF;
    INSERT INTO chart_of_accounts (family_id, code, description, level) VALUES
    (p_family_id,'1','A T I V O',1),
    (p_family_id,'1.1','ATIVO CIRCULANTE',2),
    (p_family_id,'1.1.01','DISPONÍVEL',3),
    (p_family_id,'1.1.01.01','Dinheiro em Caixa',4),
    (p_family_id,'1.1.01.02','Contas Bancárias',4),
    (p_family_id,'1.1.01.03','Aplicações Financeiras',4),
    (p_family_id,'1.2','ATIVO REALIZÁVEL A LONGO PRAZO',2),
    (p_family_id,'1.2.01','DIREITOS A LONGO PRAZO',3),
    (p_family_id,'1.2.01.01','Consórcio de Veículos',4),
    (p_family_id,'1.2.01.02','Consórcio de Bens',4),
    (p_family_id,'1.3','ATIVO PERMANENTE',2),
    (p_family_id,'1.3.01','INVESTIMENTOS',3),
    (p_family_id,'1.3.01.01','Participações em Outras Empresas',4),
    (p_family_id,'1.3.01.02','Fundo de Investimento',4),
    (p_family_id,'1.3.02','IMOBILIZADO',3),
    (p_family_id,'1.3.02.01','Terrenos',4),
    (p_family_id,'1.3.02.02','Edificações',4),
    (p_family_id,'1.3.02.03','Veiculos',4),
    (p_family_id,'1.3.02.04','Marcas Comerciais',4),
    (p_family_id,'1.3.02.05','Móveis e Utensílios',4),
    (p_family_id,'1.3.03','DIFERIDO',3),
    (p_family_id,'1.3.03.01','Desp.Pré-Operacionais-Testes',4),
    (p_family_id,'1.3.03.02','Desp.c/ Pesq.Desenv. Produtos',4),
    (p_family_id,'2','P A S S I V O',1),
    (p_family_id,'2.1','PASSIVO CIRCULANTE',2),
    (p_family_id,'2.1.01','CONTAS A PAGAR',3),
    (p_family_id,'2.1.01.01','Crédito em Lojas',4),
    (p_family_id,'2.1.01.02','Cartão de Crédito',4),
    (p_family_id,'2.1.02','EMPRESTIMOS E FINANCIAMENTOS',3),
    (p_family_id,'2.1.02.01','Financiamento Meriva',4),
    (p_family_id,'2.1.02.02','Emprestimos Consignados',4),
    (p_family_id,'3','R E C E I T A S',1),
    (p_family_id,'3.1','RECEITAS OPERACIONAIS',2),
    (p_family_id,'3.1.01','RECEITA BRUTA',3),
    (p_family_id,'3.1.01.01','Salários',4),
    (p_family_id,'3.1.01.02','Aposentadoria',4),
    (p_family_id,'3.1.01.03','Serviços Eventuais',4),
    (p_family_id,'3.1.02','(-) DEDUÇÕES DA RECEITA BRUTA',3),
    (p_family_id,'3.1.02.01','PREVIDENCIA SOCIAL',4),
    (p_family_id,'3.1.02.02','PREVIDENCIA PRIVADA',4),
    (p_family_id,'3.1.02.03','IRRF',4),
    (p_family_id,'3.1.02.04','ASSOCIAÇÕES',4),
    (p_family_id,'3.1.02.05','SINDICATO',4),
    (p_family_id,'3.1.03','RECEITAS FINANCEIRAS',3),
    (p_family_id,'3.1.03.01','Juros s/Poupança',4),
    (p_family_id,'3.1.03.02','Juros s/Aplicações Financeiras',4),
    (p_family_id,'3.1.03.03','Descontos Obtidos',4),
    (p_family_id,'3.1.04','OUTRAS RECEITAS OPERACIONAIS',3),
    (p_family_id,'3.1.04.01','Despesas Recuperadas',4),
    (p_family_id,'4','D E S P E S A S',1),
    (p_family_id,'4.1','DESPESAS OPERACIONAIS',2),
    (p_family_id,'4.1.01','CONSUMO RESIDENCIAL',3),
    (p_family_id,'4.1.02.01','Agua e Esgoto',4),
    (p_family_id,'4.1.02.02','Energia Elétrica',4),
    (p_family_id,'4.1.02.03','Manutenção Equipamentos',4),
    (p_family_id,'4.1.02.04','Manutenção Predial',4),
    (p_family_id,'4.1.02.05','Internet',4),
    (p_family_id,'4.1.02.06','Telefones',4),
    (p_family_id,'4.1.02.07','Clubes',4),
    (p_family_id,'4.1.02.08','Assinatura TV e Apps',4),
    (p_family_id,'4.1.06','DESPESAS FINANCEIRAS',3),
    (p_family_id,'4.1.06.01','Juros e Multas',4),
    (p_family_id,'4.1.06.02','Despesas Bancárias',4),
    (p_family_id,'4.1.06.04','Descontos Concedidos',4),
    (p_family_id,'4.1.07','DESPESAS TRIBUTÁRIAS',3),
    (p_family_id,'4.1.07.01','IPTU',4),
    (p_family_id,'4.1.07.02','IPVA',4),
    (p_family_id,'4.1.07.03','Licenciamento de Veiculos',4),
    (p_family_id,'4.1.07.04','Documentação Pessoa Fisica',4),
    (p_family_id,'4.1.07.05','Impostos e Taxas Diversas',4),
    (p_family_id,'5','RESULTADO DO EXERCÍCIO',1),
    (p_family_id,'5.1','RESULTADO DO EXERCÍCIO',2),
    (p_family_id,'5.1.01','RESULTADO DO EXERCÍCIO',3),
    (p_family_id,'5.1.01.01','Apuração do Resultado do Exercício',4);
END;
$$ LANGUAGE plpgsql;
