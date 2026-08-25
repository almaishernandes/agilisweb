-- ================================================================
-- Cria o bucket de Storage "comprovantes" para armazenar fotos de
-- cupons fiscais e QR Codes capturados pelo Agilis Mobile, e as
-- políticas de acesso para usuários autenticados.
-- Execute este script no Supabase SQL Editor.
-- ================================================================

insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

-- Qualquer usuário autenticado do app pode enviar comprovantes
create policy if not exists "Authenticated upload comprovantes"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'comprovantes');

-- Qualquer usuário autenticado pode ler (necessário para gerar signed URLs)
create policy if not exists "Authenticated read comprovantes"
    on storage.objects for select
    to authenticated
    using (bucket_id = 'comprovantes');

-- Coluna para guardar o caminho do arquivo no bucket, associado à
-- nota importada.
alter table nfce_imports
    add column if not exists file_path text;

NOTIFY pgrst, 'reload schema';
