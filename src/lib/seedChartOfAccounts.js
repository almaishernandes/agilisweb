import { supabase } from './supabase';

const DEFAULT_COA = [
    { code: '1', description: 'A T I V O', level: 1 },
    { code: '1.1', description: 'ATIVO CIRCULANTE', level: 2 },
    { code: '1.1.01', description: 'DISPONÍVEL', level: 3 },
    { code: '1.1.01.01', description: 'Dinheiro em Caixa', level: 4 },
    { code: '1.1.01.02', description: 'Contas Bancárias', level: 4 },
    { code: '1.1.01.03', description: 'Aplicações Financeiras', level: 4 },
    { code: '1.2', description: 'ATIVO REALIZÁVEL A LONGO PRAZO', level: 2 },
    { code: '1.2.01', description: 'DIREITOS A LONGO PRAZO', level: 3 },
    { code: '1.2.01.01', description: 'Consórcio de Veículos', level: 4 },
    { code: '1.2.01.02', description: 'Consórcio de Bens', level: 4 },
    { code: '1.3', description: 'ATIVO PERMANENTE', level: 2 },
    { code: '1.3.01', description: 'INVESTIMENTOS', level: 3 },
    { code: '1.3.01.01', description: 'Participações em Outras Empresas', level: 4 },
    { code: '1.3.01.02', description: 'Fundo de Investimento', level: 4 },
    { code: '1.3.02', description: 'IMOBILIZADO', level: 3 },
    { code: '1.3.02.01', description: 'Terrenos', level: 4 },
    { code: '1.3.02.02', description: 'Edificações', level: 4 },
    { code: '1.3.02.03', description: 'Veiculos', level: 4 },
    { code: '1.3.02.04', description: 'Marcas Comerciais', level: 4 },
    { code: '1.3.02.05', description: 'Móveis e Utensílios', level: 4 },
    { code: '1.3.03', description: 'DIFERIDO', level: 3 },
    { code: '1.3.03.01', description: 'Desp.Pré-Operacionais-Testes', level: 4 },
    { code: '1.3.03.02', description: 'Desp.c/ Pesq.Desenv. Produtos', level: 4 },
    { code: '2', description: 'P A S S I V O', level: 1 },
    { code: '2.1', description: 'PASSIVO CIRCULANTE', level: 2 },
    { code: '2.1.01', description: 'CONTAS A PAGAR', level: 3 },
    { code: '2.1.01.01', description: 'Crédito em Lojas', level: 4 },
    { code: '2.1.01.02', description: 'Cartão de Crédito', level: 4 },
    { code: '2.1.02', description: 'EMPRESTIMOS E FINANCIAMENTOS', level: 3 },
    { code: '2.1.02.01', description: 'Financiamento Meriva', level: 4 },
    { code: '2.1.02.02', description: 'Emprestimos Consignados', level: 4 },
    { code: '3', description: 'R E C E I T A S', level: 1 },
    { code: '3.1', description: 'RECEITAS OPERACIONAIS', level: 2 },
    { code: '3.1.01', description: 'RECEITA BRUTA', level: 3 },
    { code: '3.1.01.01', description: 'Salários', level: 4 },
    { code: '3.1.01.02', description: 'Aposentadoria', level: 4 },
    { code: '3.1.01.03', description: 'Serviços Eventuais', level: 4 },
    { code: '3.1.02', description: '(-) DEDUÇÕES DA RECEITA BRUTA', level: 3 },
    { code: '3.1.02.01', description: 'PREVIDENCIA SOCIAL', level: 4 },
    { code: '3.1.02.02', description: 'PREVIDENCIA PRIVADA', level: 4 },
    { code: '3.1.02.03', description: 'IRRF', level: 4 },
    { code: '3.1.02.04', description: 'ASSOCIAÇÕES', level: 4 },
    { code: '3.1.02.05', description: 'SINDICATO', level: 4 },
    { code: '3.1.03', description: 'RECEITAS FINANCEIRAS', level: 3 },
    { code: '3.1.03.01', description: 'Juros s/Poupança', level: 4 },
    { code: '3.1.03.02', description: 'Juros s/Aplicações Financeiras', level: 4 },
    { code: '3.1.03.03', description: 'Descontos Obtidos', level: 4 },
    { code: '3.1.04', description: 'OUTRAS RECEITAS OPERACIONAIS', level: 3 },
    { code: '3.1.04.01', description: 'Despesas Recuperadas', level: 4 },
    { code: '4', description: 'D E S P E S A S', level: 1 },
    { code: '4.1', description: 'DESPESAS OPERACIONAIS', level: 2 },
    { code: '4.1.01', description: 'CONSUMO RESIDENCIAL', level: 3 },
    { code: '4.1.02.01', description: 'Agua e Esgoto', level: 4 },
    { code: '4.1.02.02', description: 'Energia Elétrica', level: 4 },
    { code: '4.1.02.03', description: 'Manutenção Equipamentos', level: 4 },
    { code: '4.1.02.04', description: 'Manutenção Predial', level: 4 },
    { code: '4.1.02.05', description: 'Internet', level: 4 },
    { code: '4.1.02.06', description: 'Telefones', level: 4 },
    { code: '4.1.02.07', description: 'Clubes', level: 4 },
    { code: '4.1.02.08', description: 'Assinatura TV e Apps', level: 4 },
    { code: '4.1.06', description: 'DESPESAS FINANCEIRAS', level: 3 },
    { code: '4.1.06.01', description: 'Juros e Multas', level: 4 },
    { code: '4.1.06.02', description: 'Despesas Bancárias', level: 4 },
    { code: '4.1.06.04', description: 'Descontos Concedidos', level: 4 },
    { code: '4.1.07', description: 'DESPESAS TRIBUTÁRIAS', level: 3 },
    { code: '4.1.07.01', description: 'IPTU', level: 4 },
    { code: '4.1.07.02', description: 'IPVA', level: 4 },
    { code: '4.1.07.03', description: 'Licenciamento de Veiculos', level: 4 },
    { code: '4.1.07.04', description: 'Documentação Pessoa Fisica', level: 4 },
    { code: '4.1.07.05', description: 'Impostos e Taxas Diversas', level: 4 },
    { code: '5', description: 'RESULTADO DO EXERCÍCIO', level: 1 },
    { code: '5.1', description: 'RESULTADO DO EXERCÍCIO', level: 2 },
    { code: '5.1.01', description: 'RESULTADO DO EXERCÍCIO', level: 3 },
    { code: '5.1.01.01', description: 'Apuração do Resultado do Exercício', level: 4 },
];

export async function seedChartOfAccountsIfEmpty(familyId) {
    if (!familyId) return;

    const { data: existing } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('family_id', familyId)
        .limit(1);

    if (existing && existing.length > 0) return;

    const rows = DEFAULT_COA.map(item => ({ ...item, family_id: familyId }));
    const { error } = await supabase.from('chart_of_accounts').insert(rows);
    if (error) {
        console.error('Erro ao semear plano de contas:', error);
    }
}
