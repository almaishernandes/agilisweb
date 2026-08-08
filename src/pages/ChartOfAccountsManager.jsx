import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import ExportButtons from '../components/ExportButtons';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import { seedChartOfAccountsIfEmpty } from '../lib/seedChartOfAccounts';

const numericCodeCompare = (a, b) => {
    const partsA = (a || '').split('.').map(s => parseInt(s, 10) || 0);
    const partsB = (b || '').split('.').map(s => parseInt(s, 10) || 0);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const na = partsA[i] ?? -1;
        const nb = partsB[i] ?? -1;
        if (na !== nb) return na - nb;
    }
    return 0;
};

const LEVEL_INDENT = 16;

const LEVEL_STYLES = {
    1: { fontWeight: 'bold',   fontSize: '12px', color: '#004d40', textTransform: 'uppercase', letterSpacing: '0.05em' },
    2: { fontWeight: 'bold',   fontSize: '11px', color: '#00695c', textTransform: 'uppercase' },
    3: { fontWeight: '600',    fontSize: '11px', color: '#37474f' },
    4: { fontWeight: 'normal', fontSize: '11px', color: '#555' },
};

const GROUP_COLORS = {
    '1': { background: '#bbdefb', color: '#0d47a1' }, // ATIVO    — azul claro
    '2': { background: '#e1bee7', color: '#4a148c' }, // PASSIVO  — lilás claro
    '3': { background: '#c8e6c9', color: '#1b5e20' }, // RECEITAS — verde claro
    '4': { background: '#ffcdd2', color: '#b71c1c' }, // DESPESAS — rosa claro
};

const getGroupBackground = (rootCode) => {
    return { ...(GROUP_COLORS[rootCode] || { background: '#f5f5f5', color: '#333' }), fontWeight: 'bold' };
};

// Verifica se um código é filho de outro
const isChildOf = (childCode, parentCode) => {
    if (!childCode || !parentCode) return false;
    return childCode.startsWith(parentCode + '.');
};

const ChartOfAccountsManager = ({ embedded = false, onSelect } = {}) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = embedded ? null : searchParams.get('returnTo');
    const prefill  = embedded ? null : searchParams.get('prefill');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [filter, setFilter] = useState('');
    const [activeLevel, setActiveLevel] = useState(4); // 1-4: nível máximo visível
    const [collapsed, setCollapsed] = useState(new Set());
    const [securityContext, setSecurityContext] = useState({ user_id: null, family_id: null });
    const [selectedIds, setSelectedIds] = useState(new Set());

    const scrollRef = useRef(null);
    const scrollSnapshot = useRef({ internalTop: 0, mainTop: 0 });

    const captureScrollPositions = useCallback(() => {
        const mc = document.querySelector('.main-content');
        scrollSnapshot.current = {
            internalTop: scrollRef.current ? scrollRef.current.scrollTop : 0,
            mainTop: mc ? mc.scrollTop : 0,
        };
    }, []);

    const restoreScrollPositions = useCallback(() => {
        const { internalTop, mainTop } = scrollSnapshot.current;
        if (scrollRef.current) scrollRef.current.scrollTop = internalTop;
        const mc = document.querySelector('.main-content');
        if (mc) mc.scrollTop = mainTop;
    }, []);

    // Callback ref: foca o input e restaura scroll (setSelectionRange pode causar scroll)
    const focusRef = useCallback(el => {
        if (el) {
            const restore = () => {
                const { internalTop, mainTop } = scrollSnapshot.current;
                if (scrollRef.current) scrollRef.current.scrollTop = internalTop;
                const mc = document.querySelector('.main-content');
                if (mc) mc.scrollTop = mainTop;
            };
            el.focus({ preventScroll: true });
            restore();
            requestAnimationFrame(restore);
            const len = el.value.length;
            el.setSelectionRange(len, len);
            requestAnimationFrame(restore);
        }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('chart_of_accounts')
            .select('id, code, description, level');
        if (error) {
            console.error('Erro ao carregar plano de contas:', error);
        } else {
            const sorted = [...(data || [])].sort((a, b) => numericCodeCompare(a.code, b.code));
            setRows([
                ...sorted,
                { id: `temp-${Date.now()}`, code: '', description: '', level: 1, isNew: true }
            ]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        getSecurityContext().then(async (ctx) => {
            setSecurityContext(ctx);
            if (ctx.family_id) await seedChartOfAccountsIfEmpty(ctx.family_id);
            fetchData();
        });
        if (prefill) setFilter(prefill);
    }, [fetchData]);

    // Bloqueia scroll do .main-content enquanto esta página está aberta
    useEffect(() => {
        const mc = document.querySelector('.main-content');
        if (mc) mc.style.overflow = 'hidden';
        return () => { if (mc) mc.style.overflow = ''; };
    }, []);

    const startEditing = useCallback((id, field, initialValue = '') => {
        captureScrollPositions();
        setEditingValue(initialValue);
        setEditingCell({ id, field });
        setContextMenu(null);
    }, [captureScrollPositions]);

    const stopEditing = useCallback((newCell = null) => {
        setEditingCell(newCell);
    }, []);

    const toggleCollapse = useCallback((code) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    }, []);

    const isHidden = useCallback((code) => {
        for (const c of collapsed) {
            if (isChildOf(code, c)) return true;
        }
        return false;
    }, [collapsed]);

    const hasChildren = useCallback((code) => {
        return rows.some(r => r.code && isChildOf(r.code, code));
    }, [rows]);

    const normalizeFilter = (f) => /^\d+$/.test(f) ? f.split('').join('.') : f;

    const codeStartsWith = (code, prefix) => {
        const codeParts = (code || '').split('.').map(s => parseInt(s, 10));
        const prefParts = prefix.split('.').map(s => parseInt(s, 10));
        return prefParts.every((seg, i) => codeParts[i] === seg);
    };

    const visibleRows = rows.filter(r => {
        if (r.isNew) return true;
        if ((r.level || 1) > activeLevel) return false;
        if (!filter && isHidden(r.code)) return false;
        if (!filter) return true;
        const q = filter.toLowerCase();
        const normalized = normalizeFilter(q);
        return codeStartsWith(r.code, normalized) || (r.description || '').toLowerCase().includes(q);
    });

    const handleChange = (id, field, value) => {
        setRows(prev => prev.map(r => {
            if (r.id !== id) return r;
            const updated = { ...r, [field]: value };
            if (field === 'code' && value) updated.level = value.split('.').length;
            return updated;
        }));
    };

    const FIELDS = ['code', 'description'];

    const handleKeyDown = (e, id, fieldIdx) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const next = e.shiftKey ? fieldIdx - 1 : fieldIdx + 1;
            captureScrollPositions();
            if (next >= 0 && next < FIELDS.length) {
                handleSave(id, FIELDS[next]);
            } else {
                handleSave(id, FIELDS[fieldIdx]);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            captureScrollPositions();
            handleSave(id, null);
        } else if (e.key === 'Escape') {
            stopEditing();
        }
    };

    const handleSave = async (id, keepField) => {
        const row = rows.find(r => r.id === id);
        if (!row) return;

        // Mescla o valor sendo editado na linha
        const field = editingCell?.field;
        const currentRow = field ? { ...row, [field]: editingValue } : row;

        if (currentRow.isNew && !currentRow.code && !currentRow.description) { stopEditing(); return; }

        const level = currentRow.code ? currentRow.code.split('.').length : (currentRow.level || 1);
        const payload = {
            code: currentRow.code || '',
            description: currentRow.description || '',
            level,
            ...(securityContext.family_id ? { family_id: securityContext.family_id } : {})
        };

        let result;
        if (row.isNew) {
            result = await supabase.from('chart_of_accounts').insert([payload]).select();
        } else {
            result = await supabase.from('chart_of_accounts').update(payload).eq('id', id).select();
        }

        if (result.error) {
            alert(`Erro ao salvar: ${result.error.message}`);
            return;
        }

        const savedId = row.isNew ? result.data?.[0]?.id : id;
        captureScrollPositions();
        await fetchData();
        restoreScrollPositions();
        requestAnimationFrame(restoreScrollPositions);

        if (keepField && savedId) {
            const savedRow = result.data?.[0] || {};
            startEditing(savedId, keepField, savedRow[keepField] || '');
        } else {
            stopEditing();
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    const toggleSelectAll = () => {
        const realIds = visibleRows.filter(r => !r.isNew).map(r => r.id);
        if (realIds.every(id => selectedIds.has(id))) setSelectedIds(new Set());
        else setSelectedIds(new Set(realIds));
    };

    const deleteSelected = async () => {
        const ids = [...selectedIds].filter(id => !String(id).startsWith('temp-'));
        if (!ids.length) return;
        if (!window.confirm(`Excluir ${ids.length} item(ns) do plano de contas?`)) return;
        captureScrollPositions();
        const { error } = await supabase.from('chart_of_accounts').delete().in('id', ids);
        if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
        setSelectedIds(new Set());
        await fetchData();
        setTimeout(restoreScrollPositions, 0);
    };

    const deleteRow = async (id) => {
        if (typeof id === 'string' && id.startsWith('temp-')) {
            setRows(prev => prev.filter(r => r.id !== id));
            setContextMenu(null);
            return;
        }
        if (!window.confirm('Excluir este item do plano de contas?')) { setContextMenu(null); return; }
        captureScrollPositions();
        const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id);
        if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
        await fetchData();
        setContextMenu(null);
        setTimeout(restoreScrollPositions, 0);
    };

    const handleImport = async (data) => {
        if (!data?.length) return;
        const MAP = { 'Código': 'code', 'Descrição': 'description', 'Nível': 'level' };
        const records = data.map(row => {
            const rec = {};
            Object.entries(MAP).forEach(([label, key]) => { if (row[label] !== undefined) rec[key] = row[label]; });
            if (rec.code) {
                rec.code = String(rec.code);
                rec.level = rec.level ? Number(rec.level) : rec.code.split('.').length;
            }
            if (rec.description) rec.description = String(rec.description);
            if (securityContext.family_id) rec.family_id = securityContext.family_id;
            return rec;
        }).filter(r => r.code && r.description);
        if (!records.length) { alert('Nenhum dado válido. Cabeçalhos esperados: Código, Descrição'); return; }
        if (!window.confirm(`Importar ${records.length} registro(s)?\n\nATENÇÃO: os dados existentes serão apagados antes da importação.`)) return;
        const existingIds = rows.filter(r => !r.isNew).map(r => r.id);
        if (existingIds.length) {
            const { error: delErr } = await supabase.from('chart_of_accounts').delete().in('id', existingIds);
            if (delErr) { alert(`Erro ao limpar dados: ${delErr.message}`); return; }
        }
        const { error } = await supabase.from('chart_of_accounts').insert(records);
        if (error) { alert(`Erro ao importar: ${error.message}`); return; }
        alert(`${records.length} registro(s) importado(s) com sucesso!`);
        fetchData();
    };

    const insertAfterRow = (afterId) => {
        captureScrollPositions();
        const sourceRow = rows.find(r => r.id === afterId);
        if (!sourceRow) return;
        const parentCode = sourceRow.code;
        const prefix = parentCode.split('.').slice(0, -1).join('.');

        const siblings = rows.filter(r => {
            if (r.isNew || !r.code) return false;
            const rPrefix = r.code.split('.').slice(0, -1).join('.');
            return rPrefix === prefix && r.code.split('.').length === parentCode.split('.').length;
        }).map(r => parseInt(r.code.split('.').pop(), 10) || 0);
        const maxSibling = Math.max(...siblings, parseInt(parentCode.split('.').pop(), 10) || 0);
        const newCode = prefix ? `${prefix}.${maxSibling + 1}` : `${maxSibling + 1}`;
        const newLevel = sourceRow.level || 1;
        const newId = `temp-${Date.now()}`;

        setRows(prev => {
            let insertIdx = prev.findIndex(r => r.id === afterId) + 1;
            while (insertIdx < prev.length && (prev[insertIdx].code || '').startsWith(parentCode + '.')) insertIdx++;
            const next = [...prev];
            next.splice(insertIdx, 0, { id: newId, code: newCode, description: '', level: newLevel, isNew: true });
            return next;
        });
        startEditing(newId, 'description', '');
    };

    const Wrapper = ({ children }) => embedded
        ? <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{children}</div>
        : <MainLayout title="Plano de Contas">{children}</MainLayout>;

    if (loading) return (
        <Wrapper>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
                Carregando...
            </div>
        </Wrapper>
    );

    return (
        <Wrapper>
            <div onClick={() => setContextMenu(null)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', borderBottom: '2px solid #e0e0e0', background: '#f4f6f8', flexShrink: 0, flexWrap: 'wrap' }}>
                    {returnTo && (
                        <button type="button" onClick={() => navigate(returnTo)} style={{ padding: '4px 12px', background: '#00695c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ✕ Fechar
                        </button>
                    )}

                    {/* Seletores de nível — alinhados acima da coluna Código */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '3px 6px' }}>
                        <span style={{ fontSize: '10px', color: '#666', fontWeight: '600', marginRight: '2px', whiteSpace: 'nowrap' }}>Nível:</span>
                        {[1, 2, 3, 4].map(n => (
                            <button
                                key={n}
                                type="button"
                                title={`Mostrar até nível ${n}`}
                                onClick={() => setActiveLevel(n)}
                                style={{
                                    width: '24px', height: '24px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: activeLevel === n ? '#1565c0' : '#e8eaf6',
                                    color: activeLevel === n ? '#fff' : '#3949ab',
                                    fontSize: '11px', fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    boxShadow: activeLevel === n ? '0 1px 3px rgba(21,101,192,0.4)' : 'none',
                                }}
                            >{n}</button>
                        ))}
                    </div>

                    {/* Filtro — alinhado sobre a coluna Descrição */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: '160px', maxWidth: '280px' }}>
                        <input
                            type="text"
                            placeholder="🔍  Filtrar descrição..."
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
                        title="Plano de Contas"
                        columns={[{ label: 'Código', key: 'code' }, { label: 'Descrição', key: 'description' }, { label: 'Nível', key: 'level' }]}
                        rows={rows.filter(r => !r.isNew)}
                        onImport={handleImport}
                    />
                    {selectedIds.size > 0 && (
                        <button type="button" onClick={deleteSelected} style={{ padding: '4px 12px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            🗑 Excluir {selectedIds.size} selecionado(s)
                        </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#888', whiteSpace: 'nowrap' }}>
                        {visibleRows.filter(r => !r.isNew).length} reg.
                    </span>
                </div>

                {/* Table */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowAnchor: 'none' }}>
                    <table className="money-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <colgroup>
                            <col style={{ width: '26px' }} /> {/* checkbox */}
                            <col style={{ width: '24px' }} /> {/* incluir */}
                            <col style={{ width: '24px' }} /> {/* excluir */}
                            <col style={{ width: '24px' }} /> {/* expandir/recolher */}
                            <col style={{ width: '130px' }} /> {/* código */}
                            <col />                             {/* descrição */}
                        </colgroup>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            <tr>
                                {/* Col 1: seleção */}
                                <th style={{ textAlign: 'center', padding: '2px 4px' }}>
                                    <input type="checkbox"
                                        title="Selecionar todos"
                                        checked={visibleRows.filter(r => !r.isNew).length > 0 && visibleRows.filter(r => !r.isNew).every(r => selectedIds.has(r.id))}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer', accentColor: '#00695c' }}
                                    />
                                </th>
                                {/* Col 2,3,4: rótulos */}
                                <th style={{ textAlign: 'center', padding: '2px 0', fontSize: '9px', color: '#aaa' }}>+</th>
                                <th style={{ textAlign: 'center', padding: '2px 0', fontSize: '9px', color: '#aaa' }}>−</th>
                                <th style={{ textAlign: 'center', padding: '2px 0', fontSize: '9px', color: '#aaa' }}>▲</th>
                                <th style={{ textAlign: 'left', paddingLeft: '12px' }}>Código</th>
                                <th style={{ textAlign: 'left', paddingLeft: '12px' }}>Descrição</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row) => {
                                const lvl = row.isNew ? 1 : (row.level || 1);
                                const indent = row.isNew ? 0 : (lvl - 1) * LEVEL_INDENT;
                                const lstyle = LEVEL_STYLES[lvl] || LEVEL_STYLES[4];
                                const rootCode = row.isNew ? '' : (row.code || '').split('.')[0];
                                const rowBg = row.isNew ? {} : getGroupBackground(rootCode);
                                const lstyleText = { ...lstyle, color: rowBg.color || lstyle.color };
                                const isCollapsed = collapsed.has(row.code);
                                const rowHasChildren = !row.isNew && hasChildren(row.code);
                                const isEditing = editingCell?.id === row.id;

                                return (
                                    <tr
                                        key={row.id}
                                        onMouseDown={() => captureScrollPositions()}
                                        onContextMenu={e => {
                                            e.preventDefault();
                                            captureScrollPositions();
                                            if (!row.isNew && !selectedIds.has(row.id)) setSelectedIds(new Set([row.id]));
                                            const rowRect = e.currentTarget.getBoundingClientRect();
                                            const menuWidth = 200;
                                            let x = rowRect.right + 8;
                                            if (x + menuWidth > window.innerWidth) x = rowRect.left - menuWidth - 8;
                                            if (x < 8) x = 8;
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
                                                    onMouseDown={e => e.preventDefault()}
                                                    style={{ cursor: 'pointer', accentColor: '#00695c' }}
                                                />
                                            )}
                                        </td>

                                        {/* Botões: ⊕ inserir + seta expandir/recolher */}
                                        {/* Col 2: Incluir */}
                                        <td style={{ textAlign: 'center', padding: '0', verticalAlign: 'middle' }}
                                            onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                                            {!row.isNew && (
                                                <span title="Inserir linha abaixo"
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onClick={e => { e.stopPropagation(); insertAfterRow(row.id); }}
                                                    style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', background: '#2e7d32', color: '#fff', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>⊕</span>
                                            )}
                                        </td>
                                        {/* Col 3: Excluir */}
                                        <td style={{ textAlign: 'center', padding: '0', verticalAlign: 'middle' }}
                                            onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                                            {!row.isNew && (
                                                <span title="Excluir linha"
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onClick={e => { e.stopPropagation(); deleteRow(row.id); }}
                                                    style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', background: '#c62828', color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>✕</span>
                                            )}
                                        </td>
                                        {/* Col 4: Expandir/Recolher — apenas níveis 1, 2 e 3 */}
                                        <td style={{ textAlign: 'center', padding: '0', verticalAlign: 'middle' }}
                                            onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                                            {!row.isNew && lvl <= 3 && (
                                                rowHasChildren ? (
                                                    <span
                                                        title={isCollapsed ? 'Expandir' : 'Recolher'}
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={e => { e.stopPropagation(); toggleCollapse(row.code); }}
                                                        style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', background: '#1565c0', color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                                        {isCollapsed ? '▼' : '▲'}
                                                    </span>
                                                ) : (
                                                    <span style={{ display: 'inline-flex', width: '20px', height: '20px' }} />
                                                )
                                            )}
                                        </td>

                                        {embedded && onSelect && !row.isNew && (
                                            <td style={{ width: '60px', textAlign: 'center', padding: '0 4px' }} onClick={e => e.stopPropagation()}>
                                                <button onClick={() => onSelect(row)} style={{ padding: '2px 8px', background: '#00695c', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                    Usar
                                                </button>
                                            </td>
                                        )}

                                        {/* Código */}
                                        <td className="editable-cell"
                                            style={{ width: '130px', textAlign: 'left', paddingLeft: '12px', fontFamily: 'monospace', fontSize: lstyle.fontSize, verticalAlign: 'middle' }}>
                                            {isEditing && editingCell.field === 'code' ? (
                                                <input
                                                    ref={focusRef}
                                                    type="text"
                                                    value={editingValue}
                                                    onChange={e => setEditingValue(e.target.value)}
                                                    onKeyDown={e => handleKeyDown(e, row.id, 0)}
                                                    style={{ width: '100%', height: '22px', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'monospace', fontSize: lstyle.fontSize, color: lstyleText.color, fontWeight: lstyle.fontWeight, padding: 0, boxShadow: 'inset 0 -1px 0 #1565c0', display: 'block' }}
                                                />
                                            ) : (
                                                <span
                                                    style={{ display: 'block', width: '100%', cursor: 'text', fontFamily: 'monospace', fontSize: lstyle.fontSize, color: lstyleText.color, fontWeight: lstyle.fontWeight, minHeight: '14px' }}
                                                    onClick={e => { e.preventDefault(); captureScrollPositions(); startEditing(row.id, 'code', row.code || ''); }}
                                                >{row.code || ' '}</span>
                                            )}
                                        </td>

                                        {/* Descrição */}
                                        <td className="editable-cell"
                                            style={{ paddingLeft: `${12 + indent}px` }}>
                                            {isEditing && editingCell.field === 'description' ? (
                                                <input
                                                    ref={focusRef}
                                                    type="text"
                                                    value={editingValue}
                                                    onChange={e => setEditingValue(e.target.value)}
                                                    onKeyDown={e => handleKeyDown(e, row.id, 1)}
                                                    style={{ width: '100%', height: '22px', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', ...lstyleText, padding: 0, boxShadow: 'inset 0 -1px 0 #1565c0', display: 'block' }}
                                                />
                                            ) : (
                                                <span
                                                    style={{ display: 'block', width: '100%', cursor: 'text', fontFamily: 'inherit', ...lstyleText, minHeight: '14px' }}
                                                    onClick={e => { e.preventDefault(); captureScrollPositions(); startEditing(row.id, 'description', row.description || ''); }}
                                                >{row.description || ' '}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div style={{ padding: '4px 12px', fontSize: '10px', color: '#999', borderTop: '1px dashed #ddd', flexShrink: 0 }}>
                    <strong>Dica:</strong> ENTER para gravar | TAB para próximo campo
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
                    <div className="context-menu-item" onClick={() => {
                        const r = rows.find(x => x.id === contextMenu.id);
                        startEditing(contextMenu.id, 'code', r?.code || '');
                    }}>✎ Editar</div>
                    <div className="context-menu-item" style={{ color: '#d32f2f' }} onClick={() => deleteRow(contextMenu.id)}>🗑 Excluir</div>
                </div>
            )}
        </Wrapper>
    );
};

export default ChartOfAccountsManager;
