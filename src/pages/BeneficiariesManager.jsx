import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import ExportButtons from '../components/ExportButtons';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

const numericCodeCompare = (a, b) => {
    const partsA = (a || '').split('.').map(Number);
    const partsB = (b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const na = partsA[i] ?? -1;
        const nb = partsB[i] ?? -1;
        if (na !== nb) return na - nb;
    }
    return 0;
};

const getGroupBackground = (code, rootCodes) => {
    if (!code) return {};
    const rootCode = String(code).split('.')[0];
    const idx = rootCodes.indexOf(rootCode);
    return idx % 2 === 0
        ? { background: '#e3f2fd', color: '#0d47a1' } // par  → azul
        : { background: '#e8f5e9', color: '#1b5e20' }; // ímpar → verde
};

const LEVEL_INDENT = 18;

const LEVEL_STYLES = {
    1: { fontWeight: 'bold',   fontSize: '12px', color: '#004d40', textTransform: 'uppercase', letterSpacing: '0.05em' },
    2: { fontWeight: '600',    fontSize: '11px', color: '#212121' },
};

const BeneficiariesManager = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = searchParams.get('returnTo');
    const prefill  = searchParams.get('prefill');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [filter, setFilter] = useState('');
    const [viewMode, setViewMode] = useState('completo');
    const [collapsed, setCollapsed] = useState(new Set());
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [activeLevel, setActiveLevel] = useState(2);
    const [expanded, setExpanded] = useState(new Set()); // expansões individuais no modo nível 1
    const [categories, setCategories] = useState([]);
    const [secCtx, setSecCtx] = useState({ family_id: null });
    const inputRef = useRef(null);
    const scrollRef = useRef(null);

    const FIELDS = ['full_code', 'category', 'name', 'phone', 'notes'];

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('beneficiaries')
            .select('id, full_code, code, level, category, name, phone, notes')
            .order('full_code', { ascending: true });
        if (error) {
            console.error('Erro ao carregar fornecedores:', error);
        } else {
            const sorted = [...(data || [])].sort((a, b) => {
                const partsA = (a.full_code || a.code || '').split('.').map(s => s.padStart(4, '0'));
                const partsB = (b.full_code || b.code || '').split('.').map(s => s.padStart(4, '0'));
                return partsA.join('.').localeCompare(partsB.join('.'));
            });
            setRows([
                ...sorted,
                { id: `temp-${Date.now()}`, full_code: '', code: '', level: null, category: '', name: '', phone: '', notes: '', isNew: true }
            ]);
        }
        setLoading(false);
    }, []);

    const fetchCategories = useCallback(async (familyId) => {
        const { data } = await supabase
            .from('beneficiary_categories')
            .select('name')
            .eq('family_id', familyId)
            .order('name');
        setCategories((data || []).map(r => r.name));
    }, []);

    useEffect(() => {
        getSecurityContext().then(ctx => {
            setSecCtx(ctx);
            fetchData();
            if (ctx.family_id) fetchCategories(ctx.family_id);
        });
        if (prefill) setFilter(prefill);
    }, [fetchData, fetchCategories]);

    useEffect(() => {
        if (editingCell && inputRef.current) inputRef.current.focus();
    }, [editingCell]);

    const addCategory = async (name) => {
        if (!secCtx.family_id) return;
        await supabase.from('beneficiary_categories').insert({ name, family_id: secCtx.family_id });
        fetchCategories(secCtx.family_id);
    };

    const editCategory = async (original, newName) => {
        if (!secCtx.family_id) return;
        await supabase.from('beneficiary_categories').update({ name: newName }).eq('name', original).eq('family_id', secCtx.family_id);
        setRows(prev => prev.map(r => r.category === original ? { ...r, category: newName } : r));
        fetchCategories(secCtx.family_id);
    };

    const deleteCategory = async (name) => {
        if (!secCtx.family_id) return;
        await supabase.from('beneficiary_categories').delete().eq('name', name).eq('family_id', secCtx.family_id);
        fetchCategories(secCtx.family_id);
    };

    // Filtro: digits only → each char as segment
    const normalizeFilter = (f) => /^\d+$/.test(f) ? f.split('').join('.') : f;
    const codeStartsWith = (code, prefix) => {
        const codeParts = (code || '').split('.').map(s => parseInt(s, 10));
        const prefParts = prefix.split('.').map(s => parseInt(s, 10));
        return prefParts.every((seg, i) => codeParts[i] === seg);
    };

    const maxLevel = Math.max(...rows.filter(r => !r.isNew && r.full_code).map(r => r.full_code.split('.').length), 1);

    const isChildOf = (child, parent) => (child || '').startsWith(parent + '.');
    const isHidden = (code) => { for (const c of collapsed) { if (isChildOf(code, c)) return true; } return false; };
    const hasChildren = (code) => rows.some(r => !r.isNew && isChildOf(r.full_code, code));
    const toggleCollapse = (code) => setCollapsed(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
    const toggleExpanded = (code) => setExpanded(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });

    const visibleRows = rows.filter(r => {
        if (r.isNew) return true;
        const rowLevel = r.level || (r.full_code || '').split('.').length || 1;
        if (activeLevel === 1) {
            // No modo nível 1: mostra apenas nível 1 + filhos de linhas explicitamente expandidas
            if (rowLevel === 1) return true;
            const parentCode = (r.full_code || '').split('.').slice(0, -1).join('.');
            return expanded.has(parentCode);
        }
        if (rowLevel > activeLevel) return false;
        if (viewMode === 'reduzido' && (r.full_code || '').split('.').length >= maxLevel) return false;
        if (isHidden(r.full_code)) return false;
        if (!filter) return true;
        const q = filter.toLowerCase();
        const normalized = normalizeFilter(q);
        return codeStartsWith(r.full_code, normalized)
            || (r.name || '').toLowerCase().includes(q)
            || (r.phone || '').toLowerCase().includes(q);
    });

    const handleCellClick = (id, field) => {
        setEditingCell({ id, field });
        setContextMenu(null);
    };

    const handleChange = (id, field, value) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const handleKeyDown = (e, id, fieldIdx) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const next = e.shiftKey ? fieldIdx - 1 : fieldIdx + 1;
            if (next >= 0 && next < FIELDS.length) {
                handleSave(id, FIELDS[next]);
            } else {
                handleSave(id, FIELDS[fieldIdx]);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            handleSave(id, null);
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const handleSave = async (id, keepField, overrides = {}) => {
        const row = rows.find(r => r.id === id);
        if (!row) return;
        const merged = { ...row, ...overrides };
        if (merged.isNew && !merged.name && !merged.category) { setEditingCell(null); return; }

        const { isNew, ...payload } = merged;
        if (isNew) delete payload.id;

        let result;
        if (isNew) {
            result = await supabase.from('beneficiaries').insert([payload]).select();
        } else {
            result = await supabase.from('beneficiaries').update(payload).eq('id', id).select();
        }

        if (result.error) {
            alert(`Erro ao salvar: ${result.error.message}`);
            return;
        }

        const savedId = isNew ? result.data?.[0]?.id : id;
        await fetchData();

        if (keepField) {
            if (savedId) setEditingCell({ id: savedId, field: keepField });
        } else {
            setEditingCell(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const deleteRow = async (id) => {
        if (typeof id === 'string' && id.startsWith('temp-')) {
            setRows(prev => prev.filter(r => r.id !== id));
            setContextMenu(null);
            return;
        }
        if (!window.confirm('Excluir este fornecedor?')) { setContextMenu(null); return; }
        const { error } = await supabase.from('beneficiaries').delete().eq('id', id);
        if (error) { alert(`Erro ao excluir: ${error.message}`); }
        else { fetchData(); }
        setContextMenu(null);
    };

    const deleteSelected = async () => {
        const ids = [...selectedIds].filter(id => !String(id).startsWith('temp-'));
        if (!ids.length) { setContextMenu(null); return; }
        if (!window.confirm(`Excluir ${ids.length} fornecedor(es) selecionado(s)?`)) { setContextMenu(null); return; }
        const { error } = await supabase.from('beneficiaries').delete().in('id', ids);
        if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
        setSelectedIds(new Set());
        fetchData();
        setContextMenu(null);
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const realIds = visibleRows.filter(r => !r.isNew).map(r => r.id);
        if (realIds.every(id => selectedIds.has(id))) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(realIds));
        }
    };

    const handleImport = async (data) => {
        if (!data?.length) return;
        const MAP = { 'Código': 'code', 'Nome': 'name', 'Telefone': 'phone', 'Observações': 'notes' };
        const records = data.map(row => {
            const rec = {};
            Object.entries(MAP).forEach(([label, key]) => { if (row[label] !== undefined) rec[key] = String(row[label]); });
            return rec;
        }).filter(r => r.code || r.name);
        if (!records.length) { alert('Nenhum dado válido encontrado. Verifique os cabeçalhos: Código, Nome, Telefone, Observações'); return; }
        if (!window.confirm(`Importar ${records.length} registro(s)?\n\nATENÇÃO: os dados existentes serão apagados antes da importação.`)) return;
        const existingIds = rows.filter(r => !r.isNew).map(r => r.id);
        if (existingIds.length) {
            const { error: delErr } = await supabase.from('beneficiaries').delete().in('id', existingIds);
            if (delErr) { alert(`Erro ao limpar dados: ${delErr.message}`); return; }
        }
        const { error } = await supabase.from('beneficiaries').insert(records);
        if (error) { alert(`Erro ao importar: ${error.message}`); return; }
        alert(`${records.length} registro(s) importado(s) com sucesso!`);
        fetchData();
    };

    const insertAfterRow = (afterId) => {
        const sourceRow = rows.find(r => r.id === afterId);
        if (!sourceRow) return;
        const sourceCode = sourceRow.full_code || '';
        const isLevel1 = !sourceCode.includes('.');

        let prefix, newCategory, newLevel, editField;
        if (isLevel1) {
            // inserindo filho: prefixo é o próprio código do pai
            prefix      = sourceCode;
            newCategory = sourceRow.name || '';
            newLevel    = 2;
            editField   = 'name';
        } else {
            // inserindo irmão: prefixo é o pai do sourceRow
            prefix      = sourceCode.split('.').slice(0, -1).join('.');
            newCategory = sourceRow.category || '';
            newLevel    = sourceRow.level || 2;
            editField   = 'name';
        }

        const children = rows.filter(r => {
            if (r.isNew || !r.full_code) return false;
            return r.full_code.startsWith(prefix + '.') &&
                   r.full_code.split('.').length === prefix.split('.').length + 1;
        }).map(r => parseInt(r.full_code.split('.').pop(), 10) || 0);

        const maxChild = Math.max(0, ...children);
        const nextNum  = String(maxChild + 1).padStart(2, '0');
        const newCode  = `${prefix}.${nextNum}`;

        const newId = `temp-${Date.now()}`;
        setRows(prev => {
            let insertIdx = prev.findIndex(r => r.id === afterId) + 1;
            while (insertIdx < prev.length && ((prev[insertIdx].full_code || '').startsWith(sourceCode + '.'))) insertIdx++;
            const next = [...prev];
            next.splice(insertIdx, 0, { id: newId, full_code: newCode, code: nextNum, level: newLevel, category: newCategory, name: '', phone: '', notes: '', isNew: true });
            return next;
        });
        // Para nível 2: aponta para coluna 'category' (que editará o campo 'name')
        setEditingCell({ id: newId, field: newLevel === 2 ? 'category' : editField });
        setContextMenu(null);
    };

    const columns = [
        { key: 'full_code', label: 'Código',              width: '80px' },
        { key: 'category',  label: 'Categoria/Fornecedor', width: '350px', type: 'combobox' },
        { key: 'phone',     label: 'Telefone',             width: '130px' },
        { key: 'notes',     label: 'Observações' },
    ];

    if (loading) return (
        <MainLayout title="Fornecedores">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
                Carregando...
            </div>
        </MainLayout>
    );

    return (
        <MainLayout title="Fornecedores">
            <div onClick={() => setContextMenu(null)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {/* Toolbar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '6px 12px', borderBottom: '1px solid #e0e0e0',
                    background: '#f9f9f9', flexShrink: 0
                }}>
                    {returnTo && (
                        <button type="button" onClick={() => navigate(returnTo)} style={{ padding: '4px 12px', background: '#00695c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ✕ Fechar
                        </button>
                    )}

                    {/* Seletores de nível */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '3px 6px' }}>
                        <span style={{ fontSize: '10px', color: '#666', fontWeight: '600', marginRight: '2px', whiteSpace: 'nowrap' }}>Nível:</span>
                        {Array.from({ length: maxLevel }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                type="button"
                                title={`Mostrar até nível ${n}`}
                                onClick={() => { setActiveLevel(n); setExpanded(new Set()); }}
                                style={{
                                    width: '24px', height: '24px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '4px', border: 'none',
                                    background: activeLevel === n ? '#1565c0' : '#e8eaf6',
                                    color: activeLevel === n ? '#fff' : '#3949ab',
                                    fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    boxShadow: activeLevel === n ? '0 1px 3px rgba(21,101,192,0.4)' : 'none',
                                }}
                            >{n}</button>
                        ))}
                    </div>

                    {/* Filtro */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: '160px', maxWidth: '280px' }}>
                        <input
                            type="text"
                            placeholder="🔍  Filtrar..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, border: '1px solid #ccc', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', outline: 'none' }}
                        />
                        {filter && (
                            <button type="button" onClick={() => setFilter('')} style={{ padding: '2px 6px', background: '#e0e0e0', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', color: '#555' }}>✕</button>
                        )}
                    </div>

                    <ExportButtons
                        title="Fornecedores"
                        columns={[{ label: 'Código', key: 'full_code' }, { label: 'Categoria/Fornecedor', key: 'category' }, { label: 'Telefone', key: 'phone' }, { label: 'Observações', key: 'notes' }]}
                        rows={rows.filter(r => !r.isNew)}
                        onImport={handleImport}
                    />
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#888' }}>
                        {visibleRows.filter(r => !r.isNew).length} registro(s)
                    </span>
                </div>

                {filter && visibleRows.filter(r => !r.isNew).length === 0 && (
                    <div style={{ padding: '10px 16px', background: '#fff3e0', borderBottom: '1px solid #ffcc80', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#e65100' }}>
                        <span>Nenhum resultado para "<strong>{filter}</strong>".</span>
                        <button type="button" onClick={() => setFilter('')} style={{ padding: '4px 12px', background: '#e65100', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                            📋 Abrir cadastro completo (sem filtro)
                        </button>
                    </div>
                )}

                {/* Table */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="money-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            <tr>
                                {/* Checkbox selecionar todos */}
                                <th style={{ width: '28px', textAlign: 'center', padding: '2px 4px' }}>
                                    <input type="checkbox"
                                        title="Selecionar todos"
                                        checked={visibleRows.filter(r => !r.isNew).length > 0 && visibleRows.filter(r => !r.isNew).every(r => selectedIds.has(r.id))}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer', accentColor: '#00695c' }}
                                    />
                                </th>
                                <th style={{ width: '56px', textAlign: 'center', padding: '2px 4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', height: '22px' }}>
                                        <span style={{ display: 'inline-flex', width: '20px', height: '20px' }} />
                                        <span
                                            title={viewMode === 'completo' ? 'Recolher (Reduzido)' : 'Expandir (Completo)'}
                                            onClick={() => setViewMode(v => v === 'completo' ? 'reduzido' : 'completo')}
                                            style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', borderRadius: '3px', background: viewMode === 'reduzido' ? '#1565c0' : 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}
                                        >{viewMode === 'completo' ? '▲' : '▼'}</span>
                                    </div>
                                </th>
                                {columns.map(col => (
                                    <th key={col.key} style={{ width: col.width, textAlign: 'left', paddingLeft: '12px' }}>{col.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const rootCodes = [...new Set(
                                    rows.filter(r => !r.isNew && r.full_code)
                                        .map(r => String(r.full_code).split('.')[0])
                                )];
                                return visibleRows.map((row) => {
                                const lvl = row.isNew ? 1 : ((row.full_code || '').split('.').length);
                                const indent = row.isNew ? 0 : (lvl - 1) * LEVEL_INDENT;
                                const lstyle = LEVEL_STYLES[Math.min(lvl, 2)] || LEVEL_STYLES[2];
                                const rowBg = row.isNew ? {} : getGroupBackground(row.full_code, rootCodes);
                                const lstyleText = { ...lstyle, color: rowBg?.color || lstyle.color };

                                return (
                                    <tr
                                        key={row.id}
                                        onContextMenu={e => {
                                            e.preventDefault();
                                            const rowRect = e.currentTarget.getBoundingClientRect();
                                            const menuWidth = 200;
                                            let x = rowRect.right + 8;
                                            if (x + menuWidth > window.innerWidth) x = rowRect.left - menuWidth - 8;
                                            if (x < 8) x = 8;
                                            if (!row.isNew && !selectedIds.has(row.id)) {
                                                setSelectedIds(new Set([row.id]));
                                            }
                                            setContextMenu({ x, y: 0, id: row.id });
                                        }}
                                        className={`transaction-row ${row.isNew ? 'new-row-highlight-green' : ''} ${!row.isNew && selectedIds.has(row.id) ? 'selected-row' : ''}`}
                                        style={{ ...(row.isNew ? {} : rowBg), borderBottom: 'none', outline: !row.isNew && selectedIds.has(row.id) ? '2px solid #00695c' : 'none', outlineOffset: '-2px' }}
                                    >
                                        {/* Checkbox seleção */}
                                        <td style={{ width: '28px', textAlign: 'center', padding: '2px 4px', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                            {!row.isNew && (
                                                <input type="checkbox"
                                                    checked={selectedIds.has(row.id)}
                                                    onChange={() => toggleSelect(row.id)}
                                                    style={{ cursor: 'pointer', accentColor: '#00695c' }}
                                                />
                                            )}
                                        </td>
                                        {/* Botões: ⊕ inserir + seta expandir/recolher */}
                                        <td style={{ width: '56px', textAlign: 'center', padding: '2px 4px', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                            {!row.isNew && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', height: '22px' }}>
                                                    <span title="Inserir linha abaixo" onClick={() => insertAfterRow(row.id)}
                                                        style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', borderRadius: '3px', background: '#89962F', color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>⊕</span>
                                                    <span
                                                        title={
                                                            activeLevel === 1
                                                                ? (expanded.has(row.full_code) ? 'Recolher' : 'Expandir')
                                                                : (collapsed.has(row.full_code) ? 'Expandir' : 'Recolher')
                                                        }
                                                        onClick={() => {
                                                            if (!hasChildren(row.full_code)) return;
                                                            if (activeLevel === 1) toggleExpanded(row.full_code);
                                                            else toggleCollapse(row.full_code);
                                                        }}
                                                        style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', borderRadius: '3px', background: hasChildren(row.full_code) ? 'rgba(0,0,0,0.15)' : 'transparent', color: hasChildren(row.full_code) ? '#fff' : 'transparent', fontSize: '11px', fontWeight: 'bold', cursor: hasChildren(row.full_code) ? 'pointer' : 'default', userSelect: 'none', flexShrink: 0 }}>
                                                        {activeLevel === 1
                                                            ? (expanded.has(row.full_code) ? '▲' : '▼')
                                                            : (collapsed.has(row.full_code) ? '▼' : '▲')
                                                        }
                                                    </span>
                                                </div>
                                            )}
                                        </td>

                                        {columns.map((col, idx) => {
                                            const isEditing = editingCell?.id === row.id && editingCell?.field === col.key;
                                            // Lógica de exibição por nível
                                            let displayVal = row[col.key] || '';
                                            if (!row.isNew && col.key === 'category') {
                                                displayVal = lvl === 1
                                                    ? (row.name || '').toUpperCase()
                                                    : (row.name || '');
                                            }
                                            // Para nível 1 e 2, a coluna 'category' exibe e edita 'name'
                                            const isLevel2 = row.isNew ? (row.level === 2) : (lvl === 2);
                                            const isLevel1 = row.isNew ? (row.level === 1) : (lvl === 1);
                                            const editKey = (col.key === 'category' && (isLevel1 || isLevel2)) ? 'name' : col.key;
                                            const val = row[editKey] || '';
                                            const catIndent = !row.isNew && lvl === 2 && col.key === 'category' ? indent : 0;

                                            return (
                                                <td
                                                    key={col.key}
                                                    className="editable-cell"
                                                    onClick={() => handleCellClick(row.id, col.key)}
                                                    style={{ paddingLeft: `${12 + catIndent}px` }}
                                                >
                                                    {isEditing ? (
                                                        <input
                                                            ref={inputRef}
                                                            className="spreadsheet-input"
                                                            type="text"
                                                            value={val}
                                                            onChange={e => handleChange(row.id, editKey, e.target.value)}
                                                            onKeyDown={e => handleKeyDown(e, row.id, FIELDS.indexOf(col.key))}
                                                            onFocus={e => e.target.select()}
                                                            placeholder={col.key === 'category' ? (isLevel1 ? 'Nome da categoria...' : isLevel2 ? 'Nome do fornecedor...' : '') : ''}
                                                        />
                                                    ) : (
                                                        <span style={col.key === 'category' ? { fontSize: lvl === 1 ? '12px' : '11px', color: rowBg?.color || '#00695c', fontWeight: lvl === 1 ? 'bold' : 600 } : {}}>
                                                            {displayVal || ' '}
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            });
                            })()}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div style={{ padding: '4px 12px', fontSize: '10px', color: '#999', borderTop: '1px dashed #ddd', flexShrink: 0 }}>
                    <strong>Dica:</strong> TAB salva e avança o campo | ENTER grava e vai ao início | ESC cancela
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    {selectedIds.size > 1 ? (
                        <>
                            <div style={{ padding: '3px 10px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#00695c', borderBottom: '1px solid #eee' }}>
                                {selectedIds.size} itens selecionados
                            </div>
                            <div className="context-menu-item" style={{ color: '#d32f2f' }} onClick={deleteSelected}>🗑 Excluir selecionados</div>
                            <div className="context-menu-item" onClick={() => setContextMenu(null)}>✕ Cancelar</div>
                        </>
                    ) : (
                        <>
                            <div className="context-menu-item" onClick={() => { setEditingCell({ id: contextMenu.id, field: 'code' }); setContextMenu(null); }}>✎ Editar</div>
                            <div className="context-menu-item" style={{ color: '#d32f2f' }} onClick={() => deleteRow(contextMenu.id)}>🗑 Excluir</div>
                        </>
                    )}
                </div>
            )}
        </MainLayout>
    );
};

export default BeneficiariesManager;
