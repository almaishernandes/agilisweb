-- ================================================================
-- Adiciona a coluna "metodo" à tabela nfce_imports (Notas Fiscais Importadas)
-- para diferenciar a origem do registro: 'app_mobile' (scanner do app) ou
-- 'manual_chave' (inserção manual da chave de 44 dígitos na tela de Integração).
-- Execute este script no Supabase SQL Editor.
-- ================================================================

ALTER TABLE nfce_imports
    ADD COLUMN IF NOT EXISTS metodo text DEFAULT 'app_mobile';

-- Força o PostgREST a recarregar o cache de schema imediatamente.
-- Sem isso, o erro "Could not find the 'metodo' column ... schema cache"
-- pode persistir por até alguns minutos após o ALTER TABLE acima.
NOTIFY pgrst, 'reload schema';
