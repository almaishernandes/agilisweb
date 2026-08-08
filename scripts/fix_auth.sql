-- ================================================================
-- CORRIGE ERROS DE AUTENTICAÇÃO
-- Execute no Supabase SQL Editor
-- ================================================================

-- 1. Garante que o perfil existe para todos os usuários em auth.users
INSERT INTO profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. Recria a policy de profiles permitindo leitura pelo próprio usuário
DROP POLICY IF EXISTS "own_profile" ON profiles;
CREATE POLICY "own_profile" ON profiles
    FOR ALL USING (id = auth.uid());

-- 3. Garante que o Supabase consegue ler profiles durante o login
-- (necessário para o GoTrue funcionar corretamente)
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;

-- 4. Garante permissões nas demais tabelas
GRANT SELECT ON account_types  TO anon, authenticated;
GRANT SELECT ON institutions   TO anon, authenticated;
GRANT ALL ON families          TO authenticated, service_role;
GRANT ALL ON accounts          TO authenticated, service_role;
GRANT ALL ON beneficiaries     TO authenticated, service_role;
GRANT ALL ON cost_centers      TO authenticated, service_role;
GRANT ALL ON chart_of_accounts TO authenticated, service_role;
GRANT ALL ON transactions      TO authenticated, service_role;
GRANT ALL ON transaction_items TO authenticated, service_role;
GRANT ALL ON mapeamento_ia     TO authenticated, service_role;

-- 5. Recria o trigger de criação de perfil com tratamento de erro
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- não bloqueia o cadastro mesmo se falhar
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
