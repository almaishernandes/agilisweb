import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';

const CategoryManager = () => {
    const { type } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState(null); // { id, field }
    const [contextMenu, setContextMenu] = useState(null); // { x, y, id }
    const [viewMode, setViewMode] = useState('complete'); // 'complete' or 'reduced'
    const inputRef = useRef(null);

    // Configuration for different category types
    const configs = {
        'cost-centers': {
            table: 'cost_centers',
            title: 'Centros de Custo',
            columns: [
                { label: 'Código', key: 'code' },
                { label: 'Descrição', key: 'description' },
                { label: 'Categoria', key: 'category', type: 'combobox', options: ['rendimento', 'despesa'] }
            ],
            defaultNew: { code: '', description: '', category: 'despesa' }
        },
        'chart-of-accounts': {
            table: 'chart_of_accounts',
            title: 'Plano de Contas',
            columns: [
                { label: 'Código', key: 'code' },
                { label: 'Descrição', key: 'description' }
            ],
            defaultNew: { code: '', description: '', level: 1 }
        },
        'vendors': {
            table: 'vendors',
            title: 'Fornecedores',
            columns: [
                { label: 'Código', key: 'code' },
                { label: 'Nome do Fornecedor', key: 'name' },
                { label: 'Categoria', key: 'category' },
                { label: 'Notas', key: 'notes' }
            ],
            defaultNew: { code: '', name: '', category: '', notes: '' }
        }
    };

    const config = configs[type] || configs['cost-centers'];

    useEffect(() => {
        fetchData();
        setEditingCell(null);
        setContextMenu(null);
    }, [type]);

    const fetchData = async () => {
        setLoading(true);
        const { data: result, error } = await supabase
            .from(config.table)
            .select('*')
            .order('code', { ascending: true });

        if (error) {
            console.error(`Error fetching ${type}:`, error);
        } else {
            setData([
                ...(result || []),
                { id: `temp-${Date.now()}`, ...config.defaultNew, isNew: true }
            ]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingCell]);

    const handleCellClick = (id, field) => {
        setEditingCell({ id, field });
        setContextMenu(null);
    };

    const handleInputChange = (id, field, value) => {
        setData(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const handleKeyDown = (e, id, fieldIndex) => {
        if (e.key === 'Tab') {
            const nextFieldIndex = fieldIndex + 1;
            if (nextFieldIndex < config.columns.length) {
                e.preventDefault();
                setEditingCell({ id, field: config.columns[nextFieldIndex].key });
            } else {
                setEditingCell(null);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            handleSave(id);
        }
    };

    const handleSave = async (id) => {
        const item = data.find(a => a.id === id);
        if (!item) return;

        // Don't save if empty new row
        if (item.isNew && !item.code) {
            setEditingCell(null);
            return;
        }

        const { isNew, ...itemData } = item;
        const payload = { ...itemData };
        if (typeof id === 'string' && id.startsWith('temp-')) {
            delete payload.id;
        }

        let result;
        if (isNew) {
            result = await supabase.from(config.table).insert([payload]).select();
        } else {
            result = await supabase.from(config.table).update(payload).eq('id', id).select();
        }

        if (result.error) {
            console.error(`Error saving ${type}:`, result.error);
        } else {
            if (isNew) {
                fetchData();
            }
        }
        setEditingCell(null);
    };

    const addNewRow = () => {
        const newId = `temp-${Date.now()}`;
        setData(prev => [
            ...itemNoEmpty(prev),
            { id: newId, ...config.defaultNew, isNew: true }
        ]);
        setEditingCell({ id: newId, field: 'code' });
        setContextMenu(null);
    };

    const itemNoEmpty = (list) => {
        // Remove empty new rows before adding a new one
        return list.filter(item => !item.isNew || item.code);
    }

    const handleContextMenu = (e, id) => {
        e.preventDefault();
        const rowRect = e.currentTarget.getBoundingClientRect();
        const menuWidth = 200;
        let x = rowRect.right + 8;
        if (x + menuWidth > window.innerWidth) x = rowRect.left - menuWidth - 8;
        if (x < 8) x = 8;
        setContextMenu({ x, y: 0, id });
    };

    const deleteItem = async (id) => {
        if (typeof id === 'string' && id.startsWith('temp-')) {
            setData(prev => prev.filter(item => item.id !== id));
        } else {
            const { error } = await supabase.from(config.table).delete().eq('id', id);
            if (error) {
                console.error(`Error deleting ${type}:`, error);
            } else {
                setData(prev => prev.filter(item => item.id !== id));
            }
        }
        setContextMenu(null);
    };

    if (loading) {
        return (
            <MainLayout title={config.title}>
                <div className="flex items-center justify-center h-full">
                    <p className="text-text-muted">Carregando...</p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout title={config.title}>
            <div onClick={() => setContextMenu(null)}>
                <table className="money-table">
                    <thead>
                        <tr>
                            {config.columns.map(col => <th key={col.key}>{col.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data
                            .filter(item => {
                                if (viewMode === 'complete') return true;
                                if (type === 'cost-centers') return item.level && item.level <= 2;
                                if (type === 'chart-of-accounts') return item.level && item.level <= 3;
                                return true;
                            })
                            .map((item) => (
                                <tr
                                    key={item.id}
                                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                                >
                                    {config.columns.map((col, idx) => (
                                        <td
                                            key={col.key}
                                            className="editable-cell"
                                            onClick={() => handleCellClick(item.id, col.key)}
                                        >
                                            {editingCell?.id === item.id && editingCell?.field === col.key ? (
                                                <>
                                                    <input
                                                        ref={inputRef}
                                                        list={col.type === 'combobox' ? `list-${col.key}` : undefined}
                                                        className="spreadsheet-input"
                                                        type="text"
                                                        value={item[col.key] || ''}
                                                        onChange={(e) => handleInputChange(item.id, col.key, e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, item.id, idx)}
                                                        onBlur={() => handleSave(item.id)}
                                                        onFocus={(e) => e.target.select()}
                                                    />
                                                    {col.type === 'combobox' && (
                                                        <datalist id={`list-${col.key}`}>
                                                            {col.options.map(opt => (
                                                                <option key={opt} value={opt} />
                                                            ))}
                                                        </datalist>
                                                    )}
                                                </>
                                            ) : (
                                                <div style={{
                                                    minHeight: '14px',
                                                    paddingLeft: ((type === 'cost-centers' || type === 'chart-of-accounts') && col.key === 'description') ? `${(item.level - 1) * 20}px` : '0px',
                                                    fontWeight: ((type === 'cost-centers' || type === 'chart-of-accounts') && item.level === 1 && col.key === 'description') ? 'bold' : 'normal',
                                                    textTransform: ((type === 'cost-centers' || type === 'chart-of-accounts') && item.level === 1 && col.key === 'description') ? 'uppercase' : 'none'
                                                }}>
                                                    {item[col.key] || '\u00A0'}
                                                </div>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            <div className="p-2 text-[10px] text-text-muted mt-2 border-t border-dashed">
                <strong>Dica:</strong> TAB para navegar em todos os campos | ENTER para gravar onde estiver | BOTÃO DIREITO para incluir editar excluir
            </div>

            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="context-menu-item" onClick={() => addNewRow()}>Cadastrar</div>
                    <div className="context-menu-item" onClick={() => { setEditingCell({ id: contextMenu.id, field: 'code' }); setContextMenu(null); }}>Editar</div>
                    <div className="context-menu-item" onClick={() => { window.print(); setContextMenu(null); }}>Imprimir</div>
                    <div className="context-menu-item" onClick={() => { setViewMode('reduced'); setContextMenu(null); }}>Visualizar Reduzido</div>
                    <div className="context-menu-item" onClick={() => { setViewMode('complete'); setContextMenu(null); }}>Visualizar Completo</div>
                    <div className="context-menu-item" style={{ color: '#d32f2f' }} onClick={() => deleteItem(contextMenu.id)}>Excluir</div>
                </div>
            )}
        </MainLayout>
    );
};

export default CategoryManager;
