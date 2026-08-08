import { useState, useEffect } from 'react';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => { if (!d) return '—'; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };

export default function Compras() {
    const [suppliers, setSuppliers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingTx, setLoadingTx] = useState(false);
    const [year, setYear] = useState(0);

    useEffect(() => { loadSuppliers(); }, []);
    useEffect(() => { if (selected) loadTransactions(selected); }, [selected, year]);

    async function loadSuppliers() {
        setLoading(true);
        const ctx = await getSecurityContext();

        // Busca fornecedores que têm lançamentos via nome na descrição
        const { data: txs } = await supabase
            .from('transactions')
            .select('description')
            .eq('family_id', ctx.family_id);

        const { data: bens } = await supabase
            .from('beneficiaries')
            .select('id, code, name')
            .order('name');

        // Filtra apenas fornecedores que aparecem em algum lançamento
        const txDescriptions = (txs || []).map(t => (t.description || '').toLowerCase());
        const withTx = (bens || []).filter(b =>
            txDescriptions.some(d => d.includes((b.name || '').toLowerCase()))
        );

        setSuppliers(withTx);
        setLoading(false);
    }

    async function loadTransactions(supplier) {
        setLoadingTx(true);
        const ctx = await getSecurityContext();

        let query = supabase
            .from('transactions')
            .select('id, emission_date, due_date, description, amount, dc_type, accounts(name), cost_center_id, chart_account_id')
            .eq('family_id', ctx.family_id)
            .ilike('description', `%${supplier.name}%`)
            .order('due_date', { ascending: false });

        if (year > 0) {
            query = query.gte('due_date', `${year}-01-01`).lte('due_date', `${year}-12-31`);
        }

        const { data: txs } = await query;

        // Busca centros de custo e plano de contas usados
        const ccIds = [...new Set((txs || []).map(t => t.cost_center_id).filter(Boolean))];
        const pcIds = [...new Set((txs || []).map(t => t.chart_account_id).filter(Boolean))];

        const [ccRes, pcRes] = await Promise.all([
            ccIds.length ? supabase.from('cost_centers').select('id, description').in('id', ccIds) : { data: [] },
            pcIds.length ? supabase.from('chart_of_accounts').select('id, description').in('id', pcIds) : { data: [] },
        ]);

        const ccMap = Object.fromEntries((ccRes.data || []).map(r => [r.id, r.description]));
        const pcMap = Object.fromEntries((pcRes.data || []).map(r => [r.id, r.description]));

        const enriched = (txs || []).map(t => ({
            ...t,
            cc_name: t.cost_center_id ? (ccMap[t.cost_center_id] || '—') : '—',
            pc_name: t.chart_account_id ? (pcMap[t.chart_account_id] || '—') : '—',
        }));

        setTransactions(enriched);
        setLoadingTx(false);
    }

    const filtered = suppliers.filter(s =>
        !filter || (s.name || '').toLowerCase().includes(filter.toLowerCase()) || (s.code || '').includes(filter)
    );

    const totalDebito  = transactions.filter(t => t.dc_type === 'D').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCredito = transactions.filter(t => t.dc_type === 'C').reduce((s, t) => s + Number(t.amount || 0), 0);
    const saldo = totalCredito - totalDebito;

    const th = (label, align = 'left') => ({
        padding: '6px 8px', textAlign: align, fontSize: 10, fontWeight: 'bold',
        textTransform: 'uppercase', color: '#fff', background: '#00695c',
        whiteSpace: 'nowrap', borderRight: '1px solid #004d40',
    });
    const td = (align = 'left') => ({
        padding: '4px 8px', fontSize: 11, borderBottom: '1px solid #f0f0f0',
        textAlign: align, whiteSpace: 'nowrap',
    });

    return (
        <MainLayout title="Compras">
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

                {/* ── Coluna Fornecedores ── */}
                <div style={{ width: 210, borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fafafa' }}>
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid #e0e0e0', background: '#00695c', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', marginBottom: 6, letterSpacing: '0.05em' }}>FORNECEDORES</div>
                        <input
                            type="text" placeholder="🔍 Filtrar..." value={filter}
                            onChange={e => setFilter(e.target.value)}
                            style={{ width: '100%', border: '1px solid #b2dfdb', borderRadius: 4, padding: '4px 6px', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {loading ? (
                            <div style={{ padding: 12, fontSize: 11, color: '#888' }}>Carregando...</div>
                        ) : filtered.map(s => (
                            <div key={s.id} onClick={() => setSelected(s)}
                                style={{
                                    padding: '7px 10px', cursor: 'pointer', fontSize: 11,
                                    borderBottom: '1px solid #f0f0f0',
                                    background: selected?.id === s.id ? '#e8f5e9' : '#fff',
                                    borderLeft: `3px solid ${selected?.id === s.id ? '#00695c' : 'transparent'}`,
                                    color: selected?.id === s.id ? '#00695c' : '#333',
                                    fontWeight: selected?.id === s.id ? 'bold' : 'normal',
                                }}
                                onMouseEnter={e => { if (selected?.id !== s.id) e.currentTarget.style.background = '#f5f5f5'; }}
                                onMouseLeave={e => { if (selected?.id !== s.id) e.currentTarget.style.background = '#fff'; }}
                            >
                                {s.name}
                            </div>
                        ))}
                    </div>
                    <div style={{ padding: '5px 10px', fontSize: 10, color: '#888', borderTop: '1px solid #e0e0e0', background: '#f5f5f5', flexShrink: 0 }}>
                        {filtered.length} fornecedor(es) com lançamentos
                    </div>
                </div>

                {/* ── Painel direito ── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {!selected ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 36 }}>👆</div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>Selecione um fornecedor</div>
                        </div>
                    ) : (
                        <>
                            {/* Cabeçalho */}
                            <div style={{ padding: '8px 14px', background: '#00695c', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', letterSpacing: '0.03em' }}>{selected.name}</span>
                                <span style={{ color: '#b2dfdb' }}>|</span>
                                <label style={{ fontSize: 10, color: '#CCFF00', fontWeight: 'bold' }}>Ano:</label>
                                <select value={year} onChange={e => setYear(Number(e.target.value))}
                                    style={{ border: '1px solid #b2dfdb', borderRadius: 3, padding: '2px 6px', fontSize: 11, outline: 'none' }}>
                                    <option value={0}>Todos</option>
                                    {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <span style={{ color: '#b2dfdb' }}>|</span>
                                <span style={{ fontSize: 10, color: '#fff' }}><strong>{transactions.length}</strong> lançamento(s)</span>
                            </div>

                            {/* Tabela */}
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                                {loadingTx ? (
                                    <div style={{ padding: 20, fontSize: 11, color: '#888' }}>Carregando...</div>
                                ) : transactions.length === 0 ? (
                                    <div style={{ padding: 20, fontSize: 12, color: '#aaa', textAlign: 'center' }}>
                                        Nenhum lançamento encontrado para <strong>{selected.name}</strong>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                        <colgroup>
                                            <col style={{ width: 80 }} />
                                            <col style={{ width: 80 }} />
                                            <col style={{ width: 110 }} />
                                            <col style={{ width: 'auto' }} />
                                            <col style={{ width: 130 }} />
                                            <col style={{ width: 130 }} />
                                            <col style={{ width: 90 }} />
                                            <col style={{ width: 90 }} />
                                        </colgroup>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                            <tr>
                                                <th style={th()}>Emissão</th>
                                                <th style={th()}>Vencimento</th>
                                                <th style={th()}>Conta</th>
                                                <th style={th()}>Descrição</th>
                                                <th style={th()}>Centro de Custo</th>
                                                <th style={th()}>Plano de Contas</th>
                                                <th style={th('right')}>Débito</th>
                                                <th style={th('right')}>Crédito</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transactions.map((tx, i) => {
                                                const isC = tx.dc_type === 'C';
                                                return (
                                                    <tr key={tx.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbe7' }}>
                                                        <td style={td()}>{fmtDate(tx.emission_date)}</td>
                                                        <td style={td()}>{fmtDate(tx.due_date)}</td>
                                                        <td style={{ ...td(), overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.accounts?.name || '—'}</td>
                                                        <td style={{ ...td(), overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description || '—'}</td>
                                                        <td style={{ ...td(), overflow: 'hidden', textOverflow: 'ellipsis', color: '#555' }}>{tx.cc_name}</td>
                                                        <td style={{ ...td(), overflow: 'hidden', textOverflow: 'ellipsis', color: '#555' }}>{tx.pc_name}</td>
                                                        <td style={{ ...td('right'), color: '#c62828', fontWeight: isC ? 'normal' : 'bold' }}>
                                                            {!isC ? fmtBRL(tx.amount) : '—'}
                                                        </td>
                                                        <td style={{ ...td('right'), color: '#2e7d32', fontWeight: isC ? 'bold' : 'normal' }}>
                                                            {isC ? fmtBRL(tx.amount) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: '#e8f5e9', fontWeight: 'bold', position: 'sticky', bottom: 0 }}>
                                                <td colSpan={6} style={{ ...td(), color: '#1b5e20', fontSize: 11 }}>
                                                    TOTAL — {transactions.length} lançamento(s)
                                                </td>
                                                <td style={{ ...td('right'), color: '#c62828', fontSize: 12, borderTop: '2px solid #a5d6a7' }}>
                                                    {fmtBRL(totalDebito)}
                                                </td>
                                                <td style={{ ...td('right'), color: '#2e7d32', fontSize: 12, borderTop: '2px solid #a5d6a7' }}>
                                                    {fmtBRL(totalCredito)}
                                                </td>
                                            </tr>
                                            <tr style={{ background: '#c8e6c9', fontWeight: 'bold', position: 'sticky', bottom: 0 }}>
                                                <td colSpan={6} style={{ ...td(), color: '#1b5e20', fontSize: 11 }}>SALDO</td>
                                                <td colSpan={2} style={{ ...td('right'), color: saldo >= 0 ? '#1b5e20' : '#b71c1c', fontSize: 13 }}>
                                                    {fmtBRL(saldo)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
