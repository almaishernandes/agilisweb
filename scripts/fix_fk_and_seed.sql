-- ============================================================
-- PASSO 1: Corrigir a FK de transactions.transaction_type_id
-- Muda de composta (transaction_type_id, family_id) para simples
-- ============================================================
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_type_id_fkey;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_transaction_type_id_fkey
  FOREIGN KEY (transaction_type_id)
  REFERENCES chart_of_accounts(id)
  ON DELETE SET NULL;

-- ============================================================
-- PASSO 2: Semear o Plano de Contas para todas as famílias
-- que já têm transações mas não têm entradas em chart_of_accounts
-- ============================================================
-- (execute manualmente para cada family_id necessária,
--  ou rode a função abaixo que faz o seed automático)

CREATE OR REPLACE FUNCTION seed_chart_of_accounts_for_family(p_family_id uuid)
RETURNS void AS $$
BEGIN
  -- Só semeia se a family ainda não tem plano de contas
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE family_id = p_family_id) THEN
    RETURN;
  END IF;

  INSERT INTO chart_of_accounts (family_id, code, description, level) VALUES
  (p_family_id, '1', 'A T I V O', 1),
  (p_family_id, '1.1', 'ATIVO CIRCULANTE', 2),
  (p_family_id, '1.1.01', 'DISPONÍVEL', 3),
  (p_family_id, '1.1.01.01', 'Dinheiro em Caixa', 4),
  (p_family_id, '1.1.01.02', 'Contas Bancárias', 4),
  (p_family_id, '1.1.01.03', 'Aplicações Financeiras', 4),
  (p_family_id, '1.2', 'ATIVO REALIZÁVEL A LONGO PRAZO', 2),
  (p_family_id, '1.2.01', 'DIREITOS A LONGO PRAZO', 3),
  (p_family_id, '1.2.01.01', 'Consórcio de Veículos', 4),
  (p_family_id, '1.2.01.02', 'Consórcio de Bens', 4),
  (p_family_id, '1.3', 'ATIVO PERMANENTE', 2),
  (p_family_id, '1.3.01', 'INVESTIMENTOS', 3),
  (p_family_id, '1.3.01.01', 'Participações em Outras Empresas', 4),
  (p_family_id, '1.3.01.02', 'Fundo de Investimento', 4),
  (p_family_id, '1.3.02', 'IMOBILIZADO', 3),
  (p_family_id, '1.3.02.01', 'Terrenos', 4),
  (p_family_id, '1.3.02.02', 'Edificações', 4),
  (p_family_id, '1.3.02.03', 'Veiculos', 4),
  (p_family_id, '1.3.02.04', 'Marcas Comerciais', 4),
  (p_family_id, '1.3.02.05', 'Móveis e Utensílios', 4),
  (p_family_id, '1.3.03', 'DIFERIDO', 3),
  (p_family_id, '1.3.03.01', 'Desp.Pré-Operacionais-Testes', 4),
  (p_family_id, '1.3.03.02', 'Desp.c/ Pesq.Desenv. Produtos', 4),
  (p_family_id, '2', 'P A S S I V O', 1),
  (p_family_id, '2.1', 'PASSIVO CIRCULANTE', 2),
  (p_family_id, '2.1.01', 'CONTAS A PAGAR', 3),
  (p_family_id, '2.1.01.01', 'Crédito em Lojas', 4),
  (p_family_id, '2.1.01.02', 'Cartão de Crédito', 4),
  (p_family_id, '2.1.02', 'EMPRESTIMOS E FINANCIAMENTOS', 3),
  (p_family_id, '2.1.02.01', 'Financiamento Meriva', 4),
  (p_family_id, '2.1.02.02', 'Emprestimos Consignados', 4),
  (p_family_id, '3', 'R E C E I T A S', 1),
  (p_family_id, '3.1', 'RECEITAS OPERACIONAIS', 2),
  (p_family_id, '3.1.01', 'RECEITA BRUTA', 3),
  (p_family_id, '3.1.01.01', 'Salários', 4),
  (p_family_id, '3.1.01.02', 'Aposentadoria', 4),
  (p_family_id, '3.1.01.03', 'Serviços Eventuais', 4),
  (p_family_id, '3.1.02', '(-) DEDUÇÕES DA RECEITA BRUTA', 3),
  (p_family_id, '3.1.02.01', 'PREVIDENCIA SOCIAL', 4),
  (p_family_id, '3.1.02.02', 'PREVIDENCIA PRIVADA', 4),
  (p_family_id, '3.1.02.03', 'IRRF', 4),
  (p_family_id, '3.1.02.04', 'ASSOCIAÇÕES', 4),
  (p_family_id, '3.1.02.05', 'SINDICATO', 4),
  (p_family_id, '3.1.03', 'RECEITAS FINANCEIRAS', 3),
  (p_family_id, '3.1.03.01', 'Juros s/Poupança', 4),
  (p_family_id, '3.1.03.02', 'Juros s/Aplicações Financeiras', 4),
  (p_family_id, '3.1.03.03', 'Descontos Obtidos', 4),
  (p_family_id, '3.1.04', 'OUTRAS RECEITAS OPERACIONAIS', 3),
  (p_family_id, '3.1.04.01', 'Despesas Recuperadas', 4),
  (p_family_id, '4', 'D E S P E S A S', 1),
  (p_family_id, '4.1', 'DESPESAS OPERACIONAIS', 2),
  (p_family_id, '4.1.01', 'CONSUMO RESIDENCIAL', 3),
  (p_family_id, '4.1.02.01', 'Agua e Esgoto', 4),
  (p_family_id, '4.1.02.02', 'Energia Elétrica', 4),
  (p_family_id, '4.1.02.03', 'Manutenção Equipamentos', 4),
  (p_family_id, '4.1.02.04', 'Manutenção Predial', 4),
  (p_family_id, '4.1.02.05', 'Internet', 4),
  (p_family_id, '4.1.02.06', 'Telefones', 4),
  (p_family_id, '4.1.02.07', 'Clubes', 4),
  (p_family_id, '4.1.02.08', 'Assinatura TV e Apps', 4),
  (p_family_id, '4.1.06', 'DESPESAS FINANCEIRAS', 3),
  (p_family_id, '4.1.06.01', 'Juros e Multas', 4),
  (p_family_id, '4.1.06.02', 'Despesas Bancárias', 4),
  (p_family_id, '4.1.06.04', 'Descontos Concedidos', 4),
  (p_family_id, '4.1.07', 'DESPESAS TRIBUTÁRIAS', 3),
  (p_family_id, '4.1.07.01', 'IPTU', 4),
  (p_family_id, '4.1.07.02', 'IPVA', 4),
  (p_family_id, '4.1.07.03', 'Licenciamento de Veiculos', 4),
  (p_family_id, '4.1.07.04', 'Documentação Pessoa Fisica', 4),
  (p_family_id, '4.1.07.05', 'Impostos e Taxas Diversas', 4),
  (p_family_id, '5', 'RESULTADO DO EXERCÍCIO', 1),
  (p_family_id, '5.1', 'RESULTADO DO EXERCÍCIO', 2),
  (p_family_id, '5.1.01', 'RESULTADO DO EXERCÍCIO', 3),
  (p_family_id, '5.1.01.01', 'Apuração do Resultado do Exercício', 4);
END;
$$ LANGUAGE plpgsql;

-- Semear para todas as famílias que têm transações mas não têm plano de contas:
SELECT seed_chart_of_accounts_for_family(family_id)
FROM (
  SELECT DISTINCT family_id FROM transactions WHERE family_id IS NOT NULL
  EXCEPT
  SELECT DISTINCT family_id FROM chart_of_accounts WHERE family_id IS NOT NULL
) AS families_sem_plano;
