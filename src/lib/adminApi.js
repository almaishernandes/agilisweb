import { supabase } from './supabase';

async function callAdminUsers(action, payload) {
    const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action, ...payload },
    });
    if (error) throw new Error(error.message || 'Erro ao executar operação de usuário');
    return data;
}

export async function adminCreateUser({ email, password, full_name, role, family_id }) {
    const { user_id } = await callAdminUsers('create', { email, password, full_name, role, family_id });
    return user_id;
}

export async function adminUpdateUser({ user_id, full_name, email, password, role, family_id }) {
    return callAdminUsers('update', { user_id, full_name, email, password, role, family_id });
}

export async function adminDeleteUser(user_id) {
    return callAdminUsers('delete', { user_id });
}
