-- ================================================================
-- Cria usuário + família + vincula perfil
-- Substitua o e-mail e senha antes de executar
-- ================================================================

-- 1. Cria o usuário em auth.users
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'teste@test.com',                          -- << troque o e-mail
    crypt('senha123', gen_salt('bf')),         -- << troque a senha
    now(),
    now(),
    now(),
    '', '', '', ''
)
ON CONFLICT (email) DO NOTHING;

-- 2. Cria a família
INSERT INTO families (id, name)
VALUES ('974bd87f-4c6c-4f7e-aeb7-9e25a7fe4855', 'Família Principal')
ON CONFLICT DO NOTHING;

-- 3. Vincula o perfil à família e define role de Administrador
UPDATE profiles
SET
    family_id = '974bd87f-4c6c-4f7e-aeb7-9e25a7fe4855',
    role      = 'Administrador'
WHERE email = 'teste@test.com';              -- << mesmo e-mail do passo 1
