/**
 * Fetches the current user's security context (user_id, family_id, role, email).
 * This is required to satisfy RLS policies and handle user permissions.
 */
import { supabase } from './supabase';

export async function getSecurityContext() {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { user_id: null, family_id: null, role: null, email: null };
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('family_id, role, email')
            .eq('id', user.id)
            .single();

        // Hardcoded check for support email as absolute fallback
        const isSupportEmail = user.email?.toLowerCase() === 'almaishernandes@gmail.com';
        
        return {
            user_id: user.id,
            family_id: profile?.family_id || null,
            role: profile?.role || (isSupportEmail ? 'Suporte,Administrador,Gestor,Operacional' : 'Operacional'),
            email: user.email
        };
    } catch (error) {
        console.error('Error fetching security context:', error);
        return { user_id: null, family_id: null, role: null, email: null };
    }
}

export async function signIn(email, password) {
    return await supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, metadata = {}) {
    return await supabase.auth.signUp({
        email,
        password,
        options: {
            data: metadata
        }
    });
}

export async function signOut() {
    return await supabase.auth.signOut();
}

export async function resetPassword(email) {
    return await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth?type=recovery'
    });
}
