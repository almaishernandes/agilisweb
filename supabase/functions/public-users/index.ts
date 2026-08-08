// Edge Function: public-users
// Usada pela Home (tela de seleção de usuário antes do login) para listar
// nome/e-mail/role dos usuários. Roda com a service_role key no servidor
// (nunca exposta ao navegador) e devolve só os campos não sensíveis
// necessários para os cartões de login — sem senha, sem IDs de família.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    const { data, error } = await adminClient
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name');

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
});
