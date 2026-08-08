import React, { useState, useEffect, useCallback, useRef } from 'react';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import { Pin, Trash2, Palette, X, Archive, ArchiveRestore, Search } from 'lucide-react';

const COLORS = [
    { name: 'Padrão',   value: '#ffffff' },
    { name: 'Vermelho', value: '#fdd7d9' },
    { name: 'Laranja',  value: '#fde5c4' },
    { name: 'Amarelo',  value: '#fbf3b9' },
    { name: 'Verde',    value: '#d3ecd2' },
    { name: 'Azul',     value: '#d3e6f5' },
    { name: 'Anil',     value: '#dcd9f7' },
    { name: 'Rosa',     value: '#f6d9ea' },
    { name: 'Cinza',    value: '#e5e5e5' },
];

const cardShadow = '0 1px 2px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.08)';
const cardShadowHover = '0 2px 6px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.10)';

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Notes = () => {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [secCtx, setSecCtx] = useState({ family_id: null });
    const [search, setSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [tableMissing, setTableMissing] = useState(false);

    // Composer (nova nota)
    const [composerOpen, setComposerOpen] = useState(false);
    const [draft, setDraft] = useState({ title: '', content: '', color: '#ffffff' });
    const [draftColorPicker, setDraftColorPicker] = useState(false);
    const composerRef = useRef(null);

    // Nota em edição inline
    const [editingId, setEditingId] = useState(null);
    const [editDraft, setEditDraft] = useState({ title: '', content: '', color: '#ffffff' });
    const [colorPickerFor, setColorPickerFor] = useState(null);

    const fetchNotes = useCallback(async (familyId) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('notes')
            .select('*')
            .eq('family_id', familyId)
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false });
        if (error) {
            if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
                setTableMissing(true);
            } else {
                console.error('Erro ao carregar anotações:', error);
            }
        } else {
            setNotes(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        getSecurityContext().then(ctx => {
            setSecCtx(ctx);
            if (ctx.family_id) fetchNotes(ctx.family_id);
        });
    }, [fetchNotes]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (composerOpen && composerRef.current && !composerRef.current.contains(e.target)) {
                commitComposer();
            }
            if (editingId && !e.target.closest(`[data-note-id="${editingId}"]`)) {
                commitEdit(editingId);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [composerOpen, draft, editingId, editDraft]);

    const commitComposer = async () => {
        setDraftColorPicker(false);
        if (!draft.title.trim() && !draft.content.trim()) {
            setComposerOpen(false);
            setDraft({ title: '', content: '', color: '#ffffff' });
            return;
        }
        const { data, error } = await supabase
            .from('notes')
            .insert([{ family_id: secCtx.family_id, title: draft.title.trim(), content: draft.content.trim(), color: draft.color }])
            .select()
            .single();
        if (error) {
            console.error('Erro ao criar anotação:', error);
            alert('Erro ao criar anotação: ' + error.message);
        } else {
            setNotes(prev => [data, ...prev]);
        }
        setComposerOpen(false);
        setDraft({ title: '', content: '', color: '#ffffff' });
    };

    const startEdit = (note) => {
        setEditingId(note.id);
        setEditDraft({ title: note.title || '', content: note.content || '', color: note.color || '#ffffff' });
    };

    const commitEdit = async (id) => {
        setColorPickerFor(null);
        const note = notes.find(n => n.id === id);
        if (!note) { setEditingId(null); return; }
        const changed = (note.title || '') !== editDraft.title || (note.content || '') !== editDraft.content || (note.color || '#ffffff') !== editDraft.color;
        setEditingId(null);
        if (!changed) return;
        const updated = { ...note, title: editDraft.title.trim(), content: editDraft.content.trim(), color: editDraft.color, updated_at: new Date().toISOString() };
        setNotes(prev => prev.map(n => n.id === id ? updated : n));
        const { error } = await supabase
            .from('notes')
            .update({ title: updated.title, content: updated.content, color: updated.color, updated_at: updated.updated_at })
            .eq('id', id);
        if (error) {
            console.error('Erro ao salvar anotação:', error);
            alert('Erro ao salvar anotação: ' + error.message);
        }
    };

    const togglePin = async (note) => {
        const pinned = !note.pinned;
        setNotes(prev => [...prev.map(n => n.id === note.id ? { ...n, pinned } : n)]
            .sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updated_at) - new Date(a.updated_at))));
        const { error } = await supabase.from('notes').update({ pinned }).eq('id', note.id);
        if (error) console.error('Erro ao fixar anotação:', error);
    };

    const toggleArchive = async (note) => {
        const archived = !note.archived;
        setNotes(prev => prev.map(n => n.id === note.id ? { ...n, archived } : n));
        const { error } = await supabase.from('notes').update({ archived }).eq('id', note.id);
        if (error) console.error('Erro ao arquivar anotação:', error);
    };

    const deleteNote = async (id) => {
        if (!window.confirm('Excluir esta anotação?')) return;
        setNotes(prev => prev.filter(n => n.id !== id));
        const { error } = await supabase.from('notes').delete().eq('id', id);
        if (error) console.error('Erro ao excluir anotação:', error);
    };

    const setNoteColor = async (id, color) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, color } : n));
        setColorPickerFor(null);
        const { error } = await supabase.from('notes').update({ color }).eq('id', id);
        if (error) console.error('Erro ao alterar cor:', error);
    };

    const filtered = notes.filter(n => {
        if (!!n.archived !== showArchived) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
    });

    const inputStyle = {
        border: 'none', outline: 'none', width: '100%', fontFamily: 'inherit', background: 'transparent', resize: 'none',
    };

    if (tableMissing) {
        return (
            <MainLayout>
                <div style={{ padding: '40px', maxWidth: '640px', margin: '0 auto', textAlign: 'center', color: '#555' }}>
                    <h2 style={{ color: '#004d40' }}>📝 Anotações</h2>
                    <p>A tabela <code>notes</code> ainda não existe no banco de dados.</p>
                    <p>Execute o script <code>scripts/create_notes_table.sql</code> no SQL Editor do Supabase para habilitar esta funcionalidade.</p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div style={{ padding: '20px 28px', maxWidth: '1400px', margin: '0 auto' }}>
                {/* Barra de busca */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '520px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Pesquisar anotações..."
                            style={{
                                width: '100%', padding: '10px 14px 10px 36px', borderRadius: '10px',
                                border: '1px solid #e0e0e0', background: '#f5f5f5', fontSize: '13px', outline: 'none',
                            }}
                        />
                    </div>
                    <button
                        onClick={() => setShowArchived(v => !v)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px',
                            border: '1px solid #e0e0e0', background: showArchived ? '#004d40' : '#fff', color: showArchived ? '#fff' : '#555',
                            fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >
                        {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        {showArchived ? 'Ver ativas' : 'Ver arquivadas'}
                    </button>
                </div>

                {/* Composer de nova nota */}
                {!showArchived && (
                    <div
                        ref={composerRef}
                        style={{
                            maxWidth: '600px', margin: '0 auto 32px auto', background: draft.color, borderRadius: '10px',
                            border: '1px solid #e0e0e0', boxShadow: composerOpen ? cardShadowHover : cardShadow,
                            transition: 'box-shadow 0.15s', overflow: 'hidden',
                        }}
                    >
                        {!composerOpen ? (
                            <div
                                onClick={() => setComposerOpen(true)}
                                style={{ padding: '14px 18px', cursor: 'text', color: '#666', fontSize: '14px' }}
                            >
                                Criar uma anotação...
                            </div>
                        ) : (
                            <div style={{ padding: '14px 18px 10px 18px' }}>
                                <input
                                    autoFocus
                                    value={draft.title}
                                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                                    placeholder="Título"
                                    style={{ ...inputStyle, fontSize: '15px', fontWeight: 'bold', marginBottom: '8px', color: '#222' }}
                                />
                                <textarea
                                    value={draft.content}
                                    onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                                    placeholder="Criar uma anotação..."
                                    rows={3}
                                    style={{ ...inputStyle, fontSize: '13px', color: '#333', lineHeight: '1.5' }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', position: 'relative' }}>
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            onClick={() => setDraftColorPicker(v => !v)}
                                            title="Cor"
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '50%', color: '#555', display: 'flex' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Palette size={16} />
                                        </button>
                                        {draftColorPicker && (
                                            <div style={{ position: 'absolute', top: '32px', left: 0, zIndex: 20, display: 'flex', gap: '6px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '20px', padding: '6px 8px', boxShadow: cardShadowHover }}>
                                                {COLORS.map(c => (
                                                    <div
                                                        key={c.value}
                                                        onClick={() => { setDraft(d => ({ ...d, color: c.value })); setDraftColorPicker(false); }}
                                                        title={c.name}
                                                        style={{
                                                            width: '20px', height: '20px', borderRadius: '50%', background: c.value,
                                                            border: draft.color === c.value ? '2px solid #1565c0' : '1px solid #ccc', cursor: 'pointer',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={commitComposer}
                                        style={{ padding: '7px 18px', background: '#004d40', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        Concluído
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Grid de notas (estilo masonry) */}
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Carregando...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#aaa', padding: '60px 20px', fontSize: '14px' }}>
                        {showArchived ? 'Nenhuma anotação arquivada.' : (search ? 'Nenhuma anotação encontrada.' : 'Nenhuma anotação ainda. Crie a primeira acima!')}
                    </div>
                ) : (
                    <div style={{ columnWidth: '260px', columnGap: '16px' }}>
                        {filtered.map(note => {
                            const isEditing = editingId === note.id;
                            return (
                                <div
                                    key={note.id}
                                    data-note-id={note.id}
                                    style={{
                                        breakInside: 'avoid', marginBottom: '16px', background: note.color || '#ffffff',
                                        border: '1px solid rgba(0,0,0,0.10)', borderRadius: '10px', boxShadow: cardShadow,
                                        transition: 'box-shadow 0.15s', position: 'relative', overflow: 'hidden',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = cardShadowHover}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = cardShadow}
                                >
                                    <div style={{ padding: '14px 14px 6px 14px' }} onClick={() => !isEditing && startEdit(note)}>
                                        {isEditing ? (
                                            <input
                                                autoFocus
                                                value={editDraft.title}
                                                onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                                                placeholder="Título"
                                                style={{ ...inputStyle, fontSize: '14px', fontWeight: 'bold', marginBottom: '6px', color: '#222' }}
                                            />
                                        ) : (
                                            note.title && <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#222', marginBottom: '6px' }}>{note.title}</div>
                                        )}

                                        {isEditing ? (
                                            <textarea
                                                value={editDraft.content}
                                                onChange={e => setEditDraft(d => ({ ...d, content: e.target.value }))}
                                                placeholder="Anotação..."
                                                rows={Math.max(3, (editDraft.content.match(/\n/g) || []).length + 2)}
                                                style={{ ...inputStyle, fontSize: '13px', color: '#333', lineHeight: '1.5' }}
                                            />
                                        ) : (
                                            <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.5', whiteSpace: 'pre-wrap', cursor: 'text' }}>
                                                {note.content}
                                            </div>
                                        )}
                                    </div>

                                    {/* Pin (topo direito) */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); togglePin(note); }}
                                        title={note.pinned ? 'Desafixar' : 'Fixar'}
                                        style={{
                                            position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none',
                                            cursor: 'pointer', padding: '6px', borderRadius: '50%', color: note.pinned ? '#f57f17' : '#999',
                                            display: 'flex', opacity: note.pinned ? 1 : 0.5,
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.opacity = 1; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = note.pinned ? 1 : 0.5; }}
                                    >
                                        <Pin size={15} fill={note.pinned ? '#f57f17' : 'none'} />
                                    </button>

                                    {/* Rodapé de ações */}
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 8px 8px 8px', position: 'relative' }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <div style={{ position: 'relative' }}>
                                            <button
                                                onClick={() => setColorPickerFor(v => v === note.id ? null : note.id)}
                                                title="Cor"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '50%', color: '#555', display: 'flex' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <Palette size={14} />
                                            </button>
                                            {colorPickerFor === note.id && (
                                                <div style={{ position: 'absolute', bottom: '32px', left: 0, zIndex: 20, display: 'flex', gap: '6px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '20px', padding: '6px 8px', boxShadow: cardShadowHover, flexWrap: 'wrap', width: '160px' }}>
                                                    {COLORS.map(c => (
                                                        <div
                                                            key={c.value}
                                                            onClick={() => setNoteColor(note.id, c.value)}
                                                            title={c.name}
                                                            style={{
                                                                width: '18px', height: '18px', borderRadius: '50%', background: c.value,
                                                                border: (note.color || '#ffffff') === c.value ? '2px solid #1565c0' : '1px solid #ccc', cursor: 'pointer',
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => toggleArchive(note)}
                                            title={note.archived ? 'Restaurar' : 'Arquivar'}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '50%', color: '#555', display: 'flex' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {note.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                                        </button>
                                        <button
                                            onClick={() => deleteNote(note.id)}
                                            title="Excluir"
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '50%', color: '#c62828', display: 'flex' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(198,40,40,0.10)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#888' }}>{formatDate(note.updated_at)}</span>
                                        {isEditing && (
                                            <button
                                                onClick={() => commitEdit(note.id)}
                                                style={{ marginLeft: '6px', padding: '5px 12px', background: '#004d40', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                                Concluído
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default Notes;
