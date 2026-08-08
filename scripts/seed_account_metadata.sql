-- Seed Account Types and Institutions

DELETE FROM account_types;
INSERT INTO account_types (name) VALUES
('Conta Corrente'),
('Poupança'),
('Cartão de Crédito'),
('Investimento'),
('Dinheiro'),
('Carteira Digital'),
('Outros');

DELETE FROM institutions;
INSERT INTO institutions (name) VALUES
('Banco do Brasil'),
('Bradesco'),
('Itaú'),
('Santander'),
('Caixa Econômica Federal'),
('Nubank'),
('Banco Inter'),
('BTG Pactual'),
('XP Investimentos'),
('Banco Safra'),
('PagBank'),
('Mercado Pago'),
('C6 Bank'),
('Banco PAN'),
('Neon'),
('Sicoob'),
('Sicredi'),
('Outros');
