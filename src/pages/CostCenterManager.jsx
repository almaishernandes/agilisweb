import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import ExportButtons from '../components/ExportButtons';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

// ── Ordena códigos hierárquicos numericamente, ex: 1 < 1.1 < 1.2 < 2 < 2.1 < 10
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

const LEVEL_INDENT = 18; // px de indentação por nível

const GROUP_COLORS = {
    '1': { background: '#c8e6c9', color: '#1b5e20' }, // RECEITAS         — verde claro
    '2': { background: '#e1bee7', color: '#4a148c' }, // DEDUÇÕES         — lilás claro
    '3': { background: '#bbdefb', color: '#0d47a1' }, // DESPESAS FIXAS   — azul claro
    '4': { background: '#ffcdd2', color: '#b71c1c' }, // DESPESAS VARIÁVEIS — rosa claro
};

const getGroupBackground = (rootCode) => {
    return { ...(GROUP_COLORS[rootCode] || { background: '#f5f5f5', color: '#333' }), fontWeight: 'bold' };
};

const CostCenterManager = ({ embedded = false, onSelect } = {}) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = embedded ? null : searchParams.get('returnTo');
    const prefill  = embedded ? null : searchParams.get('prefill');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState(null); // { id, field }
    const [contextMenu, setContextMenu] = useState(null); // { x, y, id }
    const [filter, setFilter] = useState('');
    const [activeLevel, setActiveLevel] = useState(2); // 1-2: nível máximo visível (CC tem 2 níveis)
    const [collapsed, setCollapsed] = useState(new Set());
    const [securityContext, setSecurityContext] = useState({ user_id: null, family_id: null });
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [editingValue, setEditingValue] = useState('');
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

    // ── Fetch ─────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('cost_centers')
            .select('id, code, full_code, description, category, level');
        if (error) {
            console.error('Erro ao carregar centros de custo:', error);
        } else {
            const sorted = [...(data || [])]
                .filter(r => r.full_code?.trim() || r.description?.trim())
                .sort((a, b) =>
                numericCodeCompare(a.full_code || a.code, b.full_code || b.code)
            );
            setRows([
                ...sorted,
                { id: `temp-${Date.now()}`, code: '', full_code: '', description: '', category: 'despesa', level: 1, isNew: true }
            ]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        getSecurityContext().then(ctx => { setSecurityContext(ctx); fetchData(); });
        if (prefill) setFilter(prefill);
    }, [fetchData]);

    // Bloqueia scroll do .main-content enquanto esta página está aberta
    useEffect(() => {
        const mc = document.querySelector('.main-content');
        if (mc) mc.style.overflow = 'hidden';
        return () => { if (mc) mc.style.overflow = ''; };
    }, []);

    // ── Derived: filtered + always keep new row last ──────────────────────
    const maxLevel = Math.max(...rows.filter(r => !r.isNew).map(r => r.level || 1), 1);

    const getCode = (r) => r.full_code || r.code || '';
    const isChildOf = (childCode, parentCode) => childCode.startsWith(parentCode + '.');
    const isHidden = (code) => { for (const c of collapsed) { if (isChildOf(code, c)) return true; } return false; };
    const hasChildren = (code) => rows.some(r => !r.isNew && isChildOf(getCode(r), code));
    const toggleCollapse = (code) => setCollapsed(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });

    const visibleRows = rows.filter(r => {
        if (r.isNew) return true;
        if ((r.level || 1) > activeLevel) return false;
        if (isHidden(getCode(r))) return false;
        if (!filter) return true;
        const q = filter.toLowerCase();
        const firstLevelCode = (r.full_code || r.code || '').split('.')[0].toLowerCase();
        return firstLevelCode === q || (r.description || '').toLowerCase().includes(q);
    });

    // ── Helpers ───────────────────────────────────────────────────────────
    const startEditing = (id, field, initialValue = '') => {
        captureScrollPositions();
        setEditingValue(initialValue);
        setEditingCell({ id, field });
        setContextMenu(null);
    };

    const handleKeyDown = (e, id, fields, idx) => {
        if (e.key === 'Tab') {
            // TAB salva e move para o próximo/anterior campo
            e.preventDefault();
            const next = e.shiftKey ? idx - 1 : idx + 1;
            if (next >= 0 && next < fields.length) {
                handleSave(id, fields[next]);
            } else {
                handleSave(id, fields[idx]);
            }
        } else if (e.key === 'Enter') {
            // ENTER salva e vai ao topo
            e.preventDefault();
            handleSave(id, null);
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const handleSave = async (id, keepField) => {
        const row = rows.find(r => r.id === id);
        if (!row) return;

        // Mescla o valor sendo editado
        const field = editingCell?.field;
        const currentRow = field ? { ...row, [field]: editingValue } : row;

        if (currentRow.isNew && !currentRow.full_code && !currentRow.description) {
            setEditingCell(null);
            return;
        }
        captureScrollPositions();

        let ctx = securityContext;
        if (!ctx.family_id) { ctx = await getSecurityContext(); setSecurityContext(ctx); }

        const { id: rid, isNew, current_balance, predicted_balance, ...payload } = currentRow;
        if (isNew) delete payload.id;

        if (!payload.full_code) payload.full_code = payload.code;
        if (payload.full_code && !payload.code) payload.code = payload.full_code.split('.').pop();
        if (payload.full_code) payload.level = payload.full_code.split('.').length;
        payload.name = payload.description || payload.full_code || payload.code || '';
        payload.family_id = ctx.family_id;

        let result;
        if (isNew) {
            result = await supabase.from('cost_centers').insert([payload]).select();
        } else {
            result = await supabase.from('cost_centers').update(payload).eq('id', id).select();
        }

        if (result.error) {
            alert(`Erro ao salvar: ${result.error.message}`);
            return;
        }

        const savedId = isNew ? result.data?.[0]?.id : id;
        captureScrollPositions();
        await fetchData();
        restoreScrollPositions();
        requestAnimationFrame(restoreScrollPositions);

        if (keepField && savedId) {
            const savedRow = result.data?.[0] || {};
            startEditing(savedId, keepField, savedRow[keepField] || '');
        } else {
            setEditingCell(null);
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
        if (!window.confirm(`Excluir ${ids.length} centro(s) de custo selecionado(s)?`)) return;
        captureScrollPositions();
        await supabase.from('transactions').update({ cost_center_id: null }).in('cost_center_id', ids);
        const { error } = await supabase.from('cost_centers').delete().in('id', ids);
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

        // Verifica se há lançamentos vinculados
        const { count } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('cost_center_id', id);

        const msg = count > 0
            ? `Este centro de custo está vinculado a ${count} lançamento(s).\n\nAo excluir, esses lançamentos perderão o vínculo com o centro de custo.\n\nDeseja continuar?`
            : 'Excluir este centro de custo?';

        if (!window.confirm(msg)) { setContextMenu(null); return; }

        // Desvincula lançamentos antes de excluir
        if (count > 0) {
            await supabase.from('transactions').update({ cost_center_id: null }).eq('cost_center_id', id);
        }

        const { error } = await supabase.from('cost_centers').delete().eq('id', id);
        if (error) { alert(`Erro ao excluir: ${error.message}`); }
        else { fetchData(); }
        setContextMenu(null);
    };

    const handleImport = async (data) => {
        if (!data?.length) return;
        const MAP = { 'Código': 'full_code', 'Descrição': 'description', 'Categoria': 'category', 'Nível': 'level' };
        let ctx = securityContext;
        if (!ctx.family_id) { ctx = await getSecurityContext(); setSecurityContext(ctx); }
        const records = data.map(row => {
            const rec = {};
            Object.entries(MAP).forEach(([label, key]) => { if (row[label] !== undefined) rec[key] = row[label]; });
            if (rec.full_code) {
                rec.full_code = String(rec.full_code);
                rec.code = rec.full_code.split('.').pop();
                rec.level = rec.level ? Number(rec.level) : rec.full_code.split('.').length;
                rec.name = rec.description || rec.full_code;
            }
            if (rec.description) rec.description = String(rec.description);
            if (ctx.family_id) rec.family_id = ctx.family_id;
            return rec;
        }).filter(r => r.full_code && r.description);
        if (!records.length) { alert('Nenhum dado válido. Cabeçalhos esperados: Código, Descrição'); return; }
        if (!window.confirm(`Importar ${records.length} registro(s)?\n\nATENÇÃO: os dados existentes serão apagados antes da importação.`)) return;
        const existingIds = rows.filter(r => !r.isNew).map(r => r.id);
        if (existingIds.length) {
            const { error: delErr } = await supabase.from('cost_centers').delete().in('id', existingIds);
            if (delErr) { alert(`Erro ao limpar dados: ${delErr.message}`); return; }
        }
        const { error } = await supabase.from('cost_centers').insert(records);
        if (error) { alert(`Erro ao importar: ${error.message}`); return; }
        alert(`${records.length} registro(s) importado(s) com sucesso!`);
        fetchData();
    };

    const insertAfterRow = (afterId) => {
        captureScrollPositions();
        const sourceRow = rows.find(r => r.id === afterId);
        if (!sourceRow) return;
        const sourceCode = sourceRow.full_code || sourceRow.code || '';
        const prefix = sourceCode.split('.').slice(0, -1).join('.');

        const siblings = rows.filter(r => {
            if (r.isNew) return false;
            const rc = r.full_code || r.code || '';
            const rPrefix = rc.split('.').slice(0, -1).join('.');
            return rPrefix === prefix && rc.split('.').length === sourceCode.split('.').length;
        }).map(r => parseInt((r.full_code || r.code || '').split('.').pop(), 10) || 0);
        const maxSibling = Math.max(...siblings, parseInt(sourceCode.split('.').pop(), 10) || 0);
        const newFullCode = prefix ? `${prefix}.${maxSibling + 1}` : `${maxSibling + 1}`;
        const newLevel = sourceRow.level || 1;
        const newId = `temp-${Date.now()}`;

        setRows(prev => {
            let insertIdx = prev.findIndex(r => r.id === afterId) + 1;
            while (insertIdx < prev.length && ((prev[insertIdx].full_code || prev[insertIdx].code || '').startsWith(sourceCode + '.'))) insertIdx++;
            const next = [...prev];
            next.splice(insertIdx, 0, {
                id: newId, full_code: newFullCode, code: newFullCode.split('.').pop(),
                description: '', name: '', category: sourceRow.category || 'despesa', level: newLevel, isNew: true
            });
            return next;
        });
        startEditing(newId, 'description', '');
        setContextMenu(null);
    };

    const addNewRow = () => {
        const newId = `temp-${Date.now()}`;
        setRows(prev => [
            ...prev.filter(r => !r.isNew || r.code),
            { id: newId, code: '', full_code: '', description: '', category: 'despesa', level: 1, isNew: true }
        ]);
        startEditing(newId, 'full_code', '');
        setContextMenu(null);
    };

    const columns = [
        { key: 'full_code', label: 'Código', width: '90px' },
        { key: 'description', label: 'Descrição', width: '280px' },
    ];

    // ── Render ────────────────────────────────────────────────────────────
    const wrap = (content) => embedded
        ? <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{content}</div>
        : <MainLayout title="Centro de Custos">{content}</MainLayout>;

    if (loading) return wrap(
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
            Carregando...
        </div>
    );

    return wrap(<>
            <div onClick={() => setContextMenu(null)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {/* ── Toolbar ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', borderBottom: '2px solid #e0e0e0', background: '#f4f6f8', flexShrink: 0, flexWrap: 'wrap' }}>
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
                                onClick={() => setActiveLevel(n)}
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

                    {/* Filtro — sobre a coluna Descrição */}
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
                        title="Centro de Custos"
                        columns={[{ label: 'Código', key: 'full_code' }, { label: 'Descrição', key: 'description' }, { label: 'Nível', key: 'level' }]}
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

                {/* ── Table ── */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="money-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <colgroup>
                            <col style={{ width: '26px' }} /> {/* checkbox */}
                            <col style={{ width: '24px' }} /> {/* incluir */}
                            <col style={{ width: '24px' }} /> {/* excluir */}
                            <col style={{ width: '24px' }} /> {/* expandir */}
                            <col style={{ width: '90px' }} /> {/* código */}
                            <col />                             {/* descrição */}
                        </colgroup>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            <tr>
                                <th style={{ textAlign: 'center', padding: '2px 4px' }}>
                                    <input type="checkbox"
                                        title="Selecionar todos"
                                        checked={visibleRows.filter(r => !r.isNew).length > 0 && visibleRows.filter(r => !r.isNew).every(r => selectedIds.has(r.id))}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer', accentColor: '#00695c' }}
                                    />
                                </th>
                                <th style={{ textAlign: 'center', padding: '2px 0', fontSize: '9px', color: '#aaa' }}>+</th>
                                <th style={{ textAlign: 'center', padding: '2px 0', fontSize: '9px', color: '#aaa' }}>−</th>
                                <th style={{ textAlign: 'center', padding: '2px 0', fontSize: '9px', color: '#aaa' }}>▲</th>
                                <th style={{ textAlign: 'left', paddingLeft: '12px' }}>Código</th>
                                <th style={{ textAlign: 'left', paddingLeft: '12px' }}>Descrição</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row, rowIdx) => {
                                const indent = row.isNew ? 0 : ((row.level || 1) - 1) * LEVEL_INDENT;
                                const isLevel1 = (row.level || 1) === 1;
                                const rootCode = row.isNew ? '' : (row.full_code || row.code || '').split('.')[0];
                                const rowBg = row.isNew ? null : getGroupBackground(rootCode);
                                const textColor = rowBg?.color || '#333';

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
                                        style={{
                                            ...(row.isNew ? {} : rowBg),
                                            fontWeight: isLevel1 && !row.isNew ? 'bold' : 'normal',
                                            borderBottom: 'none',
                                            outline: !row.isNew && selectedIds.has(row.id) ? '2px solid #00695c' : 'none',
                                            outlineOffset: '-2px',
                                        }}
                                    >
                                        {/* Col 1: checkbox */}
                                        <td style={{ textAlign: 'center', padding: '2px 4px', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                            {!row.isNew && (
                                                <input type="checkbox"
                                                    checked={selectedIds.has(row.id)}
                                                    onChange={() => toggleSelect(row.id)}
                                                    onMouseDown={e => e.preventDefault()}
                                                    style={{ cursor: 'pointer', accentColor: '#00695c' }}
                                                />
                                            )}
                                        </td>
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
                                        {/* Col 4: Expandir/Recolher — apenas nível 1 */}
                                        <td style={{ textAlign: 'center', padding: '0', verticalAlign: 'middle' }}
                                            onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                                            {!row.isNew && (row.level || 1) === 1 && (
                                                hasChildren(getCode(row)) ? (
                                                    <span title={collapsed.has(getCode(row)) ? 'Expandir' : 'Recolher'}
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={e => { e.stopPropagation(); toggleCollapse(getCode(row)); }}
                                                        style={{ display: 'inline-flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', background: '#1565c0', color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                                        {collapsed.has(getCode(row)) ? '▼' : '▲'}
                                                    </span>
                                                ) : (
                                                    <span style={{ display: 'inline-flex', width: '20px', height: '20px' }} />
                                                )
                                            )}
                                        </td>
                                        {embedded && onSelect && !row.isNew && (
                                            <td style={{ width: '60px', textAlign: 'center', padding: '0 4px' }} onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => onSelect(row)}
                                                    style={{ padding: '2px 8px', background: '#00695c', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    Usar
                                                </button>
                                            </td>
                                        )}

                                        {/* Código */}
                                        <td className="editable-cell"
                                            style={{ width: '90px', textAlign: 'left', paddingLeft: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
                                            {editingCell?.id === row.id && editingCell?.field === 'full_code' ? (
                                                <input
                                                    ref={focusRef}
                                                    type="text"
                                                    value={editingValue}
                                                    onChange={e => setEditingValue(e.target.value)}
                                                    onKeyDown={e => handleKeyDown(e, row.id, columns.map(c => c.key), 0)}
                                                    style={{ width: '100%', height: '22px', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'monospace', fontSize: '12px', color: textColor, padding: 0, boxShadow: 'inset 0 -1px 0 #1565c0', display: 'block' }}
                                                />
                                            ) : (
                                                <span
                                                    style={{ display: 'flex', alignItems: 'center', height: '22px', cursor: 'text', fontFamily: 'monospace', fontSize: '12px', color: textColor }}
                                                    onClick={e => { e.preventDefault(); startEditing(row.id, 'full_code', row.full_code || ''); }}
                                                >{row.full_code || ' '}</span>
                                            )}
                                        </td>

                                        {/* Descrição */}
                                        <td className="editable-cell"
                                            style={{ paddingLeft: `${12 + indent}px` }}>
                                            {editingCell?.id === row.id && editingCell?.field === 'description' ? (
                                                <input
                                                    ref={focusRef}
                                                    type="text"
                                                    value={editingValue}
                                                    onChange={e => setEditingValue(e.target.value)}
                                                    onKeyDown={e => handleKeyDown(e, row.id, columns.map(c => c.key), 1)}
                                                    style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '11px', textTransform: isLevel1 && !row.isNew ? 'uppercase' : 'none', color: textColor, letterSpacing: isLevel1 ? '0.03em' : 'normal', fontWeight: isLevel1 ? 'bold' : 'normal', padding: 0, boxShadow: 'inset 0 -1px 0 #1565c0' }}
                                                />
                                            ) : (
                                                <span
                                                    style={{ display: 'flex', alignItems: 'center', height: '22px', cursor: 'text', fontFamily: 'inherit', fontSize: '11px', textTransform: isLevel1 && !row.isNew ? 'uppercase' : 'none', color: textColor, letterSpacing: isLevel1 ? '0.03em' : 'normal', fontWeight: isLevel1 ? 'bold' : 'normal',  }}
                                                    onClick={e => { e.preventDefault(); startEditing(row.id, 'description', row.description || ''); }}
                                                >{row.description || ' '}</span>
                                            )}
                                        </td>
                                        <td />
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Footer hint ── */}
                <div style={{
                    padding: '4px 12px', fontSize: '10px', color: '#999',
                    borderTop: '1px dashed #ddd', flexShrink: 0
                }}>
                    <strong>Dica:</strong> TAB salva e avança o campo | ENTER grava e vai ao início | ESC cancela
                </div>
            </div>

            {/* ── Context Menu ── */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="context-menu-item" onClick={() => {
                        const r = rows.find(x => x.id === contextMenu.id);
                        startEditing(contextMenu.id, 'full_code', r?.full_code || '');
                        setContextMenu(null);
                    }}>✎ Editar</div>
                    <div className="context-menu-item" style={{ color: '#d32f2f' }}
                        onClick={() => deleteRow(contextMenu.id)}>
                        🗑 Excluir
                    </div>
                </div>
            )}
        </>
    );
};

export default CostCenterManager;
