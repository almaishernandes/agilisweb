// Motor de Conciliação Inteligente — compartilhado pelas Edge Functions
// de Open Finance. Responsável por:
//   1) Evitar duplicidade: uma transação vinda do banco pode já existir
//      no AGILI$ porque o usuário lançou manualmente (ex: pagou no
//      cartão e digitou na hora). Nesse caso, NÃO deve virar um novo
//      lançamento — apenas marca o lançamento existente como conciliado.
//   2) Auto-categorizar: quando não há duplicidade, sugere (ou já
//      preenche) Fornecedor / Centro de Custo / Plano de Contas a
//      partir do histórico de palavras-chave da família.
//
// Import: import { reconcileStagingRow } from '../_shared/reconciliation.ts'

type SupabaseClient = any; // tipo do cliente @supabase/supabase-js (evita depender do pacote só para o tipo)

export interface StagingRow {
    id: string;
    family_id: string;
    agilis_account_id: string | null;
    description: string;
    description_raw: string;
    amount: number;
    dc_type: 'C' | 'D';
    transaction_date: string; // YYYY-MM-DD
}

const DUPLICATE_DATE_WINDOW_DAYS = 3;      // uma compra pode ser lançada manualmente até 3 dias antes/depois de compensar no banco
const DUPLICATE_SIMILARITY_THRESHOLD = 0.35; // pg_trgm similarity (0 a 1) — limiar empírico para "mesma descrição"
const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 0.8; // só lança automaticamente se a regra de categorização for bem específica

// Normaliza a descrição do banco para melhorar o match de similaridade
// (bancos costumam prefixar com código de operação, datas, asteriscos etc.)
export function normalizeDescription(raw: string): string {
    return (raw || '')
        .toUpperCase()
        .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, '')      // remove datas embutidas
        .replace(/\b\d{4,}\b/g, '')                     // remove códigos numéricos longos (autorização, terminal, etc.)
        .replace(/[*#_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── 1) Verifica duplicidade contra lançamentos já existentes ───────────────
async function findDuplicateTransaction(supabase: SupabaseClient, row: StagingRow) {
    const dateFrom = shiftDate(row.transaction_date, -DUPLICATE_DATE_WINDOW_DAYS);
    const dateTo = shiftDate(row.transaction_date, DUPLICATE_DATE_WINDOW_DAYS);

    // Candidatos: mesma família, mesmo valor exato, mesmo tipo (D/C),
    // dentro da janela de datas, ainda não conciliados.
    const { data: candidates, error } = await supabase
        .from('transactions')
        .select('id, description, amount, dc_type, due_date, is_conciliated')
        .eq('family_id', row.family_id)
        .eq('dc_type', row.dc_type)
        .eq('amount', row.amount)
        .eq('is_conciliated', false)
        .gte('due_date', dateFrom)
        .lte('due_date', dateTo);

    if (error || !candidates?.length) return null;

    // Entre os candidatos (mesmo valor/tipo/janela), escolhe o de maior
    // similaridade textual com a descrição do banco. pg_trgm faria isso
    // via SQL (similarity()), mas como já filtramos por valor+data (poucas
    // linhas), comparar em memória aqui evita uma segunda função no banco.
    let best: { id: string; score: number } | null = null;
    const target = normalizeDescription(row.description);
    for (const c of candidates) {
        const score = trigramSimilarity(target, normalizeDescription(c.description || ''));
        if (score >= DUPLICATE_SIMILARITY_THRESHOLD && (!best || score > best.score)) {
            best = { id: c.id, score };
        }
    }
    return best;
}

// ── 2) Auto-categorização por palavra-chave (tabela mapeamento_ia) ─────────
async function suggestCategorization(supabase: SupabaseClient, familyId: string, description: string) {
    const { data: rules } = await supabase
        .from('mapeamento_ia')
        .select('palavra_chave, id_cc, id_plano_conta, id_fornecedor, family_id')
        .or(`family_id.eq.${familyId},family_id.is.null`);

    if (!rules?.length) return null;

    const upperDesc = normalizeDescription(description);

    // Regra específica da família tem prioridade sobre regra global;
    // entre regras do mesmo escopo, a palavra-chave mais longa vence
    // (evita que "POSTO" capture antes de "POSTO IPIRANGA" mais específico).
    const matches = rules
        .filter(r => r.palavra_chave && upperDesc.includes(r.palavra_chave.toUpperCase()))
        .sort((a, b) => {
            const scopeA = a.family_id ? 1 : 0;
            const scopeB = b.family_id ? 1 : 0;
            if (scopeA !== scopeB) return scopeB - scopeA;
            return (b.palavra_chave?.length || 0) - (a.palavra_chave?.length || 0);
        });

    if (!matches.length) return null;

    const rule = matches[0];
    return {
        cost_center_id: rule.id_cc || null,
        chart_account_id: rule.id_plano_conta || null,
        beneficiary_id: rule.id_fornecedor || null,
        // regra de família específica é mais confiável que a global
        confidence: rule.family_id ? 0.9 : 0.6,
    };
}

// ── Orquestração principal — chamada para cada linha de staging nova ───────
export async function reconcileStagingRow(supabase: SupabaseClient, row: StagingRow) {
    // 1) Duplicidade: já existe um lançamento manual para essa transação?
    const duplicate = await findDuplicateTransaction(supabase, row);
    if (duplicate) {
        await supabase.from('transactions').update({
            is_conciliated: true,
            origin: 'OPEN_FINANCE', // a origem passa a refletir que foi confirmado pelo extrato
        }).eq('id', duplicate.id);

        await supabase.from('bank_transactions_staging').update({
            status: 'MATCHED',
            matched_transaction_id: duplicate.id,
            match_confidence: duplicate.score,
        }).eq('id', row.id);

        return { action: 'MATCHED', transactionId: duplicate.id };
    }

    // 2) Sem duplicidade — tenta sugerir/auto-preencher a categorização.
    const suggestion = await suggestCategorization(supabase, row.family_id, row.description);

    if (suggestion && suggestion.confidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD && row.agilis_account_id) {
        // Confiança alta o bastante para lançar automaticamente.
        const { data: inserted, error } = await supabase.from('transactions').insert([{
            account_id: row.agilis_account_id,
            family_id: row.family_id,
            emission_date: row.transaction_date,
            due_date: row.transaction_date,
            description: row.description,
            amount: row.amount,
            dc_type: row.dc_type,
            type: row.dc_type === 'C' ? 'Income' : 'Expense',
            beneficiary_id: suggestion.beneficiary_id,
            cost_center_id: suggestion.cost_center_id,
            transaction_type_id: suggestion.chart_account_id,
            external_transaction_id: row.id,
            origin: 'OPEN_FINANCE',
            is_conciliated: true,
        }]).select().single();

        if (!error) {
            await supabase.from('bank_transactions_staging').update({
                status: 'IMPORTED',
                matched_transaction_id: inserted.id,
                suggested_cost_center_id: suggestion.cost_center_id,
                suggested_chart_account_id: suggestion.chart_account_id,
                suggested_beneficiary_id: suggestion.beneficiary_id,
                match_confidence: suggestion.confidence,
            }).eq('id', row.id);
            return { action: 'IMPORTED', transactionId: inserted.id };
        }
    }

    // 3) Sem duplicidade e sem confiança suficiente — fica pendente na
    // tela de "Aprovação de Conciliação", já com a sugestão pré-preenchida
    // (o usuário só confirma ou corrige, em vez de digitar do zero).
    await supabase.from('bank_transactions_staging').update({
        status: 'PENDING',
        suggested_cost_center_id: suggestion?.cost_center_id || null,
        suggested_chart_account_id: suggestion?.chart_account_id || null,
        suggested_beneficiary_id: suggestion?.beneficiary_id || null,
        match_confidence: suggestion?.confidence || null,
    }).eq('id', row.id);

    return { action: 'PENDING' };
}

// ── Utilitários ──────────────────────────────────────────────────────────
function shiftDate(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

// Similaridade de trigramas em memória (mesmo princípio do pg_trgm do
// Postgres), suficiente para comparar um punhado de candidatos já
// pré-filtrados por valor+data — evita round-trip extra ao banco.
function trigramSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const gramsA = trigrams(a);
    const gramsB = trigrams(b);
    if (!gramsA.size || !gramsB.size) return 0;
    let intersection = 0;
    for (const g of gramsA) if (gramsB.has(g)) intersection++;
    const union = gramsA.size + gramsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function trigrams(s: string): Set<string> {
    const padded = `  ${s} `;
    const grams = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
    return grams;
}
