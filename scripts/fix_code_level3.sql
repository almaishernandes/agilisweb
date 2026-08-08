-- Remove o zero à esquerda do 3º segmento de todos os códigos
-- "1.1.01"    → "1.1.1"
-- "1.1.01.01" → "1.1.1.01"
-- Execute no Supabase SQL Editor

UPDATE chart_of_accounts
SET code = regexp_replace(code, '^(\d+\.\d+\.)0+(\d+)', '\1\2')
WHERE code ~ '^\d+\.\d+\.0\d+';
