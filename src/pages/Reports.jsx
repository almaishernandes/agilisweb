import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Filter, Search, Download, ChevronRight, PieChart as PieIcon, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import AdvancedDatePicker from '../components/AdvancedDatePicker';

const Reports = () => {
    const [items, setItems] = useState([]);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [filters, setFilters] = useState({ description: '', emission_date: '', vendor: '' });
    const [loading, setLoading] = useState(true);
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedCC, setSelectedCC] = useState('all');
    const [costCenters, setCostCenters] = useState([]);

    useEffect(() => {
        fetchData();
    }, [selectedCC]);

    async function fetchData() {
        setLoading(true);

        // Fetch Cost Centers for filter
        const { data: ccData } = await supabase.from('cost_centers').select('*');
        setCostCenters(ccData || []);

        // Fetch Items with full Transaction info
        let query = supabase
            .from('transaction_items')
            .select('*, transactions(*, cost_centers(description))');

        if (selectedCC !== 'all') {
            query = query.eq('transactions.cost_center_id', selectedCC);
        }

        const { data: itemData } = await query.order('id', { ascending: false });
        setItems(itemData || []);
        setLoading(false);
    }

    const filteredItems = items.filter(item => {
        const descMatch = (item.description || '').toLowerCase().includes((filters.description || '').toLowerCase());
        const vendorMatch = (item.transactions?.description || '').toLowerCase().includes((filters.vendor || '').toLowerCase());

        let dateMatch = true;
        if (filters.emission_date) {
            const date = item.transactions?.emission_date;
            if (filters.emission_date.includes(':')) {
                const [start, end] = filters.emission_date.split(':');
                dateMatch = date >= start && date <= end;
            } else {
                dateMatch = date === filters.emission_date;
            }
        }

        return descMatch && vendorMatch && dateMatch;
    });

    const toggleSelectAll = () => {
        const visibleIds = filteredItems.map(i => i.id);
        const allVisibleSelected = visibleIds.every(id => selectedItems.has(id));

        setSelectedItems(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleIds.forEach(id => next.delete(id));
            } else {
                visibleIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const handleRowSelection = (e, id) => {
        e.stopPropagation();
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

        const rowEl = e.currentTarget.closest('tr') || e.currentTarget;
        const rowRect = rowEl.getBoundingClientRect();
        const menuWidth = 200;
        let x = rowRect.right + 8;
        if (x + menuWidth > window.innerWidth) x = rowRect.left - menuWidth - 8;
        if (x < 8) x = 8;
        setContextMenu({ x, y: 0, id });
    };

    const duplicateTransactions = async (itemIds) => {
        const selectedParentIds = items
            .filter(i => itemIds.includes(i.id))
            .map(i => i.transaction_id)
            .filter((v, i, a) => a.indexOf(v) === i); // Unique parents

        if (selectedParentIds.length === 0) return;

        try {
            const { data: raws } = await supabase.from('transactions').select('*').in('id', selectedParentIds);
            if (!raws) return;

            const payloads = raws.map(raw => {
                const { id: _, sequential_id: __, created_at: ___, ...payload } = raw;
                return payload;
            });

            await supabase.from('transactions').insert(payloads);
            fetchData();
            setSelectedItems(new Set());
        } catch (err) { console.error(err); }
        setContextMenu(null);
    };

    const deleteTransactions = async (itemIds) => {
        const selectedParentIds = items
            .filter(i => itemIds.includes(i.id))
            .map(i => i.transaction_id)
            .filter((v, i, a) => a.indexOf(v) === i);

        if (window.confirm(`Deseja excluir ${selectedParentIds.length} lançamento(s) vinculados?`)) {
            try {
                await supabase.from('transactions').delete().in('id', selectedParentIds);
                fetchData();
                setSelectedItems(new Set());
            } catch (err) { console.error(err); }
        }
        setContextMenu(null);
    };

    // Calculate chart data
    const chartData = items.reduce((acc, item) => {
        const ccName = item.transactions?.cost_centers?.description || 'Não Alocado';
        const existing = acc.find(d => d.name === ccName);
        if (existing) {
            existing.value += Number(item.unit_price);
        } else {
            acc.push({ name: ccName, value: Number(item.unit_price) });
        }
        return acc;
    }, []);

    const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Filters and List */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="glass-card p-4 flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                            <input
                                type="text"
                                placeholder="Filtrar por produto..."
                                className="w-full pl-10"
                                value={filters.description}
                                onChange={(e) => setFilters(prev => ({ ...prev, description: e.target.value }))}
                            />
                            {filters.description && (
                                <button
                                    className="clear-filter-input-btn top-1/2 -translate-y-1/2"
                                    onClick={() => setFilters(prev => ({ ...prev, description: '' }))}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder="Filtrar fornecedor..."
                                className="w-full"
                                value={filters.vendor}
                                onChange={(e) => setFilters(prev => ({ ...prev, vendor: e.target.value }))}
                            />
                            {filters.vendor && (
                                <button
                                    className="clear-filter-input-btn top-1/2 -translate-y-1/2"
                                    onClick={() => setFilters(prev => ({ ...prev, vendor: '' }))}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 relative">
                            <AdvancedDatePicker
                                value={filters.emission_date}
                                onChange={(val) => setFilters(prev => ({ ...prev, emission_date: val }))}
                                placeholder="Filtrar por data..."
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="text-text-muted" size={18} />
                            <select
                                value={selectedCC}
                                onChange={(e) => setSelectedCC(e.target.value)}
                                className="bg-surface border-border text-sm"
                            >
                                <option value="all">Todos os Centros de Custo</option>
                                {costCenters.map(cc => (
                                    <option key={cc.id} value={cc.id}>{cc.description}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-surface-hover/50 text-text-muted text-[10px] uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold w-[30px]">
                                            <div
                                                className={`selection-header ${filteredItems.length > 0 && filteredItems.every(i => selectedItems.has(i.id)) ? 'checked' : ''}`}
                                                onClick={toggleSelectAll}
                                            />
                                        </th>
                                        <th className="px-6 py-4 font-semibold">Produto</th>
                                        <th className="px-6 py-4 font-semibold">Fornecedor</th>
                                        <th className="px-6 py-4 font-semibold">Centro Custo</th>
                                        <th className="px-6 py-4 font-semibold text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {loading ? (
                                        <tr><td colSpan="4" className="px-6 py-10 text-center">Carregando detalhes...</td></tr>
                                    ) : items.length === 0 ? (
                                        <tr><td colSpan="4" className="px-6 py-10 text-center">Nenhum item encontrado.</td></tr>
                                    ) : (
                                        filteredItems.map((item) => (
                                            <tr key={item.id} className={`hover:bg-white/5 transition-colors group ${selectedItems.has(item.id) ? 'selected-row-highlight' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div
                                                        className={`selection-indicator ${selectedItems.has(item.id) ? 'checked' : ''}`}
                                                        onClick={(e) => handleRowSelection(e, item.id)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-medium">{item.description}</p>
                                                    <p className="text-[10px] text-text-muted">{new Date(item.transactions?.emission_date).toLocaleDateString('pt-BR')}</p>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-text-muted">
                                                    {item.transactions?.description}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span style={{ fontSize: '11px', color: '#00695c', fontWeight: '600' }}>
                                                        {item.transactions?.cost_centers?.description || 'N/A'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold">
                                                    {Number(item.unit_price) === 0 ? '-' : `R$ ${Number(item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Breakdown Chart */}
                <div className="flex flex-col gap-6">
                    <div className="glass-card p-6 min-h-[400px]">
                        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
                            <PieIcon className="text-primary" size={20} />
                            Distribuição por CC
                        </h3>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="300">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="mt-6 space-y-4">
                            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Top Gastos</h4>
                            {chartData.sort((a, b) => b.value - a.value).slice(0, 3).map((d, i) => (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                        {d.name}
                                    </span>
                                    <span className="font-semibold">{d.value === 0 ? '-' : `R$ ${d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {contextMenu && (
                <div
                    className="context-menu glass-card"
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 1000,
                        padding: '4px 0',
                        minWidth: '160px',
                        boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
                        borderRadius: '4px',
                        border: '1px solid var(--money-border)',
                        background: '#fff'
                    }}
                    onClick={() => setContextMenu(null)}
                >
                    <div style={{ padding: '3px 10px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#00695c', borderBottom: '1px solid #eee' }}>Ações</div>
                    <div className="context-menu-item" onClick={() => {/* Edit not fully implemented for items but could redirect */ window.location.hash = `/transactions?edit=${contextMenu.id}`; }}>
                        ✎ Editar {selectedItems.size > 1 ? `(${selectedItems.size})` : ''}
                    </div>
                    <div className="context-menu-item" onClick={() => duplicateTransactions(selectedItems.size > 0 ? Array.from(selectedItems) : [contextMenu.id])}>
                        ❐ Duplicar {selectedItems.size > 1 ? `(${selectedItems.size})` : ''}
                    </div>
                    <div className="context-menu-item" style={{ color: '#d32f2f' }} onClick={() => deleteTransactions(selectedItems.size > 0 ? Array.from(selectedItems) : [contextMenu.id])}>
                        🗑 Excluir {selectedItems.size > 1 ? `(${selectedItems.size})` : ''}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;
