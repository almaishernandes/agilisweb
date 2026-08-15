// Edge Function: open-finance-connect-token
// Gera o "connect token" do provedor de Open Finance (Pluggy) para o
// widget do front-end, e registra a conexão bancária depois que o
// usuário concluir o fluxo no widget.
//
// LGPD: o AGILI$ nunca vê usuário/senha do banco do cliente. O widget
// da Pluggy roda isolado (iframe) e conversa direto com a Pluggy; aqui
// só lidamos com credenciais da NOSSA integração (clientId/clientSecret
// do AGILI$ junto à Pluggy) e com o itemId que ela nos devolve.
//
// Deploy: supabase functions deploy open-finance-connect-token
// Invoke (client): supabase.functions.invoke('open-finance-connect-token', { body: { action, ...payload } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID')!;
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET')!;
const PLUGGY_API_URL = 'https://api.pluggy.ai';

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

// Confirma que quem chamou está autenticado e retorna { userId, familyId }
async function requireAuthenticatedUser(authHeader: string | null) {
    if (!authHeader) throw new Error('Não autenticado.');

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) throw new Error('Sessão inválida.');

    const { data: profile } = await adminClient
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single();

    if (!profile?.family_id) throw new Error('Usuário sem família associada.');
    return { userId: user.id, familyId: profile.family_id as string };
}

// Autentica o AGILI$ junto à Pluggy (credenciais da aplicação, não do usuário final)
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

// action: 'create' — gera o token de curta duração que alimenta o widget PluggyConnect no front-end.
// Se itemId for informado, o token é gerado em "modo atualização" (reconectar uma conexão existente).
async function createConnectToken(itemId?: string) {
    const apiKey = await getPluggyApiKey();
    const res = await fetch(`${PLUGGY_API_URL}/connect_token`, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            itemId: itemId || undefined,
            webhookUrl: `${SUPABASE_URL}/functions/v1/open-finance-webhook`,
        }),
    });
    if (!res.ok) throw new Error(`Falha ao gerar connect token (${res.status}).`);
    const { accessToken } = await res.json();
    return { connectToken: accessToken };
}

// action: 'register-item' — chamado pelo front-end logo após o widget
// retornar sucesso (onSuccess), com o itemId que a Pluggy criou. Busca os
// detalhes do item (instituição, contas) e grava/atualiza bank_connections.
async function registerItem(familyId: string, userId: string, itemId: string) {
    const apiKey = await getPluggyApiKey();
    const res = await fetch(`${PLUGGY_API_URL}/items/${itemId}`, {
        headers: { 'X-API-KEY': apiKey },
    });
    if (!res.ok) throw new Error(`Falha ao consultar item na Pluggy (${res.status}).`);
    const item = await res.json();

    const { data: connection, error } = await adminClient
        .from('bank_connections')
        .upsert({
            family_id: familyId,
            provider: 'pluggy',
            provider_item_id: itemId,
            institution_id: item.connector?.id?.toString() || null,
            institution_name: item.connector?.name || 'Instituição desconhecida',
            status: mapPluggyStatus(item.status),
            consent_expires_at: item.consecutiveFailedLoginAttempts >= 1 ? null : item.statusDetail?.consentExpiresAt || null,
            last_synced_at: item.lastUpdatedAt || null,
            created_by: userId,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'provider,provider_item_id' })
        .select()
        .single();

    if (error) throw new Error(`Falha ao registrar conexão bancária: ${error.message}`);
    return { connection };
}

function mapPluggyStatus(pluggyStatus: string): string {
    const map: Record<string, string> = {
        UPDATED: 'CONNECTED',
        UPDATING: 'UPDATING',
        LOGIN_ERROR: 'LOGIN_ERROR',
        OUTDATED: 'OUTDATED',
        WAITING_USER_INPUT: 'WAITING_USER_INPUT',
    };
    return map[pluggyStatus] || 'WAITING_USER_INPUT';
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
        const { userId, familyId } = await requireAuthenticatedUser(req.headers.get('Authorization'));
        const { action, ...payload } = await req.json();

        let result;
        switch (action) {
            case 'create':
                result = await createConnectToken(payload.itemId);
                break;
            case 'register-item':
                if (!payload.itemId) throw new Error('itemId é obrigatório.');
                result = await registerItem(familyId, userId, payload.itemId);
                break;
            default:
                return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
        }

        return jsonResponse(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const status = message.includes('autenticado') || message.includes('Sessão') ? 401 : 500;
        return jsonResponse({ error: message }, status);
    }
});
