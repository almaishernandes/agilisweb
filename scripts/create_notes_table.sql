-- ================================================================
-- ANOTAÇÕES (bloco de notas estilo Google Keep / OneNote)
-- Execute este script no Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS notes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id  uuid REFERENCES families(id),
    title      text,
    content    text,
    color      text DEFAULT '#ffffff',
    pinned     boolean DEFAULT false,
    archived   boolean DEFAULT false,
    position   integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_isolation" ON notes
    USING (family_id = get_family_id())
    WITH CHECK (family_id = get_family_id());
