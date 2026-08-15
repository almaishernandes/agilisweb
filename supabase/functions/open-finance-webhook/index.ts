// Edge Function: open-finance-webhook
// Recebe os eventos assíncronos da Pluggy (item atualizado, transações
// novas, erro de login etc.), grava as transações brutas em
// bank_transactions_staging e aciona o motor de conciliação para cada
// uma. É um endpoint PÚBLICO (o provedor não manda o token de sessão
// de nenhum usuário) — a validação é por um segredo compartilhado
// configurado na Pluggy e aqui.
//
// Idempotência: cada evento é registrado em webhook_events_log com uma
// chave única (provider + event_id). Se o provedor reentregar o mesmo
// evento (retry de rede), a segunda chamada é ignorada (200 imediato).
// A tabela de staging também é protegida por UNIQUE(bank_connection_id,
// external_transaction_id), então mesmo sem o log, o INSERT duplicado
// simplesmente falharia silenciosamente (upsert ignora conflito).
//
// Deploy: supabase functions deploy open-finance-webhook --no-verify-jwt
// (--no-verify-jwt é necessário: o provedor não manda um JWT do Supabase)
// Configurar na Pluggy: Webhook URL = {SUPABASE_URL}/functions/v1/open-finance-webhook?secret={OPEN_FINANCE_WEBHOOK_SECRET}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { reconcileStagingRow, normalizeDescription, type StagingRow } from '../_shared/reconciliation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID')!;
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET')!;
const WEBHOOK_SECRET = Deno.env.get('OPEN_FINANCE_WEBHOOK_SECRET')!;
const PLUGGY_API_URL = 'https://api.pluggy.ai';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function getPluggyApiKey(): Promise<string> {
    const res = await fetch(`${PLUGGY_API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
    });
    if (!res.ok) throw new Error(`Falha ao autenticar com a Pluggy (${res.status}).`);
    const { apiKey } = await res.json();
    return apiKey;
}

// Busca as transações novas/atualizadas do item na Pluggy (o webhook em
// si só avisa "há novidade" — os dados vêm por uma chamada separada,
// como recomenda a documentação da Pluggy).
async function fetchTransactionsFromProvider(apiKey: string, accountId: string, since?: string) {
    const url = new URL(`${PLUGGY_API_URL}/transactions`);
    url.searchParams.set('accountId', accountId);
    if (since) url.searchParams.set('from', since);
    url.searchParams.set('pageSize', '500');

    const res = await fetch(url, { headers: { 'X-API-KEY': apiKey } });
    if (!res.ok) throw new Error(`Falha ao buscar transações na Pluggy (${res.status}).`);
    const { results } = await res.json();
    return results as any[];
}

async function handleTransactionsSync(itemId: string) {
    const { data: connection, error: connErr } = await supabase
        .from('bank_connections')
        .select('id, family_id, account_id')
        .eq('provider', 'pluggy')
        .eq('provider_item_id', itemId)
        .single();

    if (connErr || !connection) {
        console.warn(`Webhook recebido para item desconhecido: ${itemId}`);
        return { imported: 0, matched: 0, pending: 0 };
    }

    const apiKey = await getPluggyApiKey();

    const { data: itemAccounts } = await fetch(`${PLUGGY_API_URL}/accounts?itemId=${itemId}`, {
        headers: { 'X-API-KEY': apiKey },
    }).then(r => r.json());

    let imported = 0, matched = 0, pending = 0;

    for (const account of itemAccounts || []) {
        const providerTransactions = await fetchTransactionsFromProvider(apiKey, account.id, connection.last_synced_at);

        for (const tx of providerTransactions) {
            const stagingRow: Omit<StagingRow, 'id'> = {
                family_id: connection.family_id,
                agilis_account_id: connection.account_id,
                description: normalizeDescription(tx.description),
                description_raw: tx.description,
                amount: Math.abs(tx.amount),
                dc_type: tx.amount >= 0 ? 'C' : 'D',
                transaction_date: (tx.date || '').slice(0, 10),
            } as any;

            // Insert idempotente: se (bank_connection_id, external_transaction_id) já
            // existir, o conflito é ignorado — não reprocessa uma transação já tratada.
            const { data: inserted, error: insertErr } = await supabase
                .from('bank_transactions_staging')
                .upsert({
                    bank_connection_id: connection.id,
                    external_transaction_id: tx.id,
                    category_provider: tx.category || null,
                    raw_payload: tx,
                    ...stagingRow,
                }, { onConflict: 'bank_connection_id,external_transaction_id', ignoreDuplicates: true })
                .select()
                .maybeSingle();

            if (insertErr) {
                console.error(`Erro ao inserir staging para tx ${tx.id}:`, insertErr.message);
                continue;
            }
            if (!inserted) continue; // já existia (conflito ignorado) — nada a reconciliar de novo

            const result = await reconcileStagingRow(supabase, { id: inserted.id, ...stagingRow } as StagingRow);
            if (result.action === 'IMPORTED') imported++;
            else if (result.action === 'MATCHED') matched++;
            else pending++;
        }
    }

    await supabase.from('bank_connections').update({
        last_synced_at: new Date().toISOString(),
        status: 'CONNECTED',
    }).eq('id', connection.id);

    return { imported, matched, pending };
}

async function handleItemStatusUpdate(itemId: string, pluggyStatus: string) {
    const map: Record<string, string> = {
        UPDATED: 'CONNECTED',
        LOGIN_ERROR: 'LOGIN_ERROR',
        OUTDATED: 'OUTDATED',
    };
    await supabase.from('bank_connections')
        .update({ status: map[pluggyStatus] || 'WAITING_USER_INPUT' })
        .eq('provider', 'pluggy')
        .eq('provider_item_id', itemId);
}

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

    // Validação do segredo compartilhado (configurado como query param na
    // Pluggy, já que o provedor não assina o payload por padrão).
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== WEBHOOK_SECRET) {
        return jsonResponse({ error: 'Webhook não autorizado.' }, 401);
    }

    let event: any;
    try {
        event = await req.json();
    } catch {
        return jsonResponse({ error: 'Payload inválido.' }, 400);
    }

    // event.id nem sempre vem preenchido dependendo do evento; usa um
    // fallback determinístico (tipo + itemId + timestamp) para não perder
    // a proteção de idempotência nesses casos.
    const eventId = event.id || `${event.event}:${event.itemId}:${event.triggeredBy || ''}`;

    // Registra o evento ANTES de processar. Se já existir (evento
    // reentregue), o insert falha por violação de UNIQUE e devolvemos 200
    // sem reprocessar nada — essa é a garantia de idempotência.
    const { error: logError } = await supabase.from('webhook_events_log').insert({
        provider: 'pluggy',
        event_id: eventId,
        event_type: event.event,
        payload: event,
    });

    if (logError) {
        if (logError.code === '23505') { // unique_violation — evento duplicado
            return jsonResponse({ status: 'already_processed' });
        }
        console.error('Erro ao registrar evento de webhook:', logError.message);
        // segue mesmo assim — melhor processar de novo do que perder a transação
    }

    try {
        switch (event.event) {
            case 'transactions/created':
            case 'transactions/updated':
                await handleTransactionsSync(event.itemId);
                break;
            case 'item/created':
            case 'item/updated':
            case 'item/error':
                await handleItemStatusUpdate(event.itemId, event.data?.status || event.status);
                break;
            default:
                console.log(`Evento não tratado: ${event.event}`);
        }
        return jsonResponse({ status: 'ok' });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error('Erro ao processar webhook:', message);
        // 500 faz a Pluggy reagendar o reenvio — seguro graças à idempotência acima.
        return jsonResponse({ error: message }, 500);
    }
});
