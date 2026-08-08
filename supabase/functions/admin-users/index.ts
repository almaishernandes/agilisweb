// Edge Function: admin-users
// Executa operações administrativas de usuário (criar/atualizar/excluir) usando
// a service_role key, que fica só no servidor — nunca no bundle do navegador.
//
// Deploy: supabase functions deploy admin-users
// Invoke (client): supabase.functions.invoke('admin-users', { body: { action, ...payload } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

// Confirma que quem chamou está autenticado e tem papel de "Suporte"
// (mesma regra já usada na rota /users do front-end).
async function requireSupportRole(authHeader: string | null) {
    if (!authHeader) throw new Error('Não autenticado.');

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) throw new Error('Sessão inválida.');

    const { data: profile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const roles = (profile?.role || '').split(',').map((r: string) => r.trim());
    if (!roles.includes('Suporte')) throw new Error('Permissão negada: requer papel Suporte.');
}

async function createUser({ email, password, full_name, role, family_id }: any) {
    const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
    });
    if (error) throw new Error(error.message);

    const userId = data.user.id;
    await adminClient.from('profiles').upsert({
        id: userId,
        email,
        full_name: full_name || '',
        role: role || 'Operacional',
        family_id: family_id || null,
    });

    return { user_id: userId };
}

async function updateUser({ user_id, full_name, email, password, role, family_id }: any) {
    if (password) {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
        if (error) {
            const msg = error.message.toLowerCase();
            const ignore = msg.includes('same') || msg.includes('different') || msg.includes('reuse') || msg.includes('not found');
            if (!ignore) throw new Error(error.message);
        }
    }

    const updateData: Record<string, unknown> = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (family_id !== undefined) updateData.family_id = family_id;

    if (Object.keys(updateData).length > 0) {
        const { error } = await adminClient.from('profiles').update(updateData).eq('id', user_id);
        if (error) throw new Error(error.message);
    }

    return { user_id };
}

async function deleteUser(user_id: string) {
    const { error } = await adminClient.auth.admin.deleteUser(user_id);
    if (error) throw new Error(error.message);
    return { user_id };
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
        await requireSupportRole(req.headers.get('Authorization'));

        const { action, ...payload } = await req.json();

        let result;
        switch (action) {
            case 'create':
                result = await createUser(payload);
                break;
            case 'update':
                result = await updateUser(payload);
                break;
            case 'delete':
                result = await deleteUser(payload.user_id);
                break;
            default:
                return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
        }

        return jsonResponse(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        const status = message.includes('Permissão negada') || message.includes('autenticado') ? 403 : 500;
        return jsonResponse({ error: message }, status);
    }
});
