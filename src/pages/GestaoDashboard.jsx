import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, CreditCard, Activity } from 'lucide-react';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const COLORS_PIE = ['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];

export default function GestaoDashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState([]);
    const [kpis, setKpis] = useState({ totalSaldo: 0, entradasMes: 0, saidasMes: 0, economia: 0 });
    const [monthlyData, setMonthlyData] = useState([]);
    const [pieData, setPieData] = useState([]);
    const [recentTx, setRecentTx] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());

    useEffect(() => { load(); }, [year]);

    async function load() {
        setLoading(true);
        const ctx = await getSecurityContext();

        // ── Contas ──────────────────────────────────────────
        const { data: accs } = await supabase
            .from('accounts')
            .select('id, name, account_type, initial_balance')
            .eq('family_id', ctx.family_id);

        // ── Todas as transações do ano ──────────────────────
        const { data: txs } = await supabase
            .from('transactions')
            .select('id, amount, dc_type, emission_date, due_date, description, account_id, beneficiary_id')
            .eq('family_id', ctx.family_id)
            .gte('due_date', `${year}-01-01`)
            .lte('due_date', `${year}-12-31`)
            .order('due_date', { ascending: false });

        // ── Transações recentes (qualquer data) ────────────
        const { data: recent } = await supabase
            .from('transactions')
            .select('id, amount, dc_type, emission_date, description, accounts(name)')
            .eq('family_id', ctx.family_id)
            .order('emission_date', { ascending: false })
            .limit(8);

        // ── Saldo de cada conta ────────────────────────────
        const { data: allTxs } = await supabase
            .from('transactions')
            .select('amount, dc_type, account_id')
            .eq('family_id', ctx.family_id);

        const balanceByAccount = {};
        (accs || []).forEach(a => { balanceByAccount[a.id] = Number(a.initial_balance || 0); });
        (allTxs || []).forEach(t => {
            if (!balanceByAccount.hasOwnProperty(t.account_id)) return;
            const amt = Number(t.amount || 0);
            balanceByAccount[t.account_id] += t.dc_type === 'C' ? amt : -amt;
        });

        const accountsWithBalance = (accs || []).map(a => ({
            ...a, saldo: balanceByAccount[a.id] || 0
        })).sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo)).slice(0, 6);
        setAccounts(accountsWithBalance);

        // ── KPIs do mês atual ─────────────────────────────
        const now = new Date();
        const curMonth = String(now.getMonth() + 1).padStart(2, '0');
        const curYear = now.getFullYear();
        const monthPrefix = `${curYear}-${curMonth}`;
        const mesAtualTxs = (txs || []).filter(t => (t.due_date || '').startsWith(monthPrefix));
        const entradasMes = mesAtualTxs.filter(t => t.dc_type === 'C').reduce((s, t) => s + Number(t.amount || 0), 0);
        const saidasMes   = mesAtualTxs.filter(t => t.dc_type === 'D').reduce((s, t) => s + Number(t.amount || 0), 0);
        const totalSaldo  = Object.values(balanceByAccount).reduce((s, v) => s + v, 0);

        setKpis({ totalSaldo, entradasMes, saidasMes, economia: entradasMes - saidasMes });

        // ── Dados mensais (entradas vs saídas) ────────────
        const monthly = MONTHS.map((m, i) => {
            const mm = String(i + 1).padStart(2, '0');
            const prefix = `${year}-${mm}`;
            const slice = (txs || []).filter(t => (t.due_date || '').startsWith(prefix));
            const entrada = slice.filter(t => t.dc_type === 'C').reduce((s, t) => s + Number(t.amount || 0), 0);
            const saida   = slice.filter(t => t.dc_type === 'D').reduce((s, t) => s + Number(t.amount || 0), 0);
            return { mes: m, Entradas: +entrada.toFixed(2), Saídas: +saida.toFixed(2), Resultado: +(entrada - saida).toFixed(2) };
        });
        setMonthlyData(monthly);

        // ── Pie: saídas por conta ─────────────────────────
        const saidaByAcc = {};
        (txs || []).filter(t => t.dc_type === 'D').forEach(t => {
            const acc = (accs || []).find(a => a.id === t.account_id);
            const name = acc?.name || 'Outros';
            saidaByAcc[name] = (saidaByAcc[name] || 0) + Number(t.amount || 0);
        });
        const pie = Object.entries(saidaByAcc)
            .sort((a, b) => b[1] - a[1]).slice(0, 8)
            .map(([name, value]) => ({ name, value: +value.toFixed(2) }));
        setPieData(pie);

        setRecentTx(recent || []);
        setLoading(false);
    }

    const KpiCard = ({ icon: Icon, label, value, sub, color, trend }) => (
        <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.07)', border: `1px solid ${color}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ background: `${color}18`, borderRadius: 8, padding: 8, display: 'flex' }}>
                    <Icon size={18} color={color} />
                </div>
                {trend !== undefined && (
                    <span style={{ fontSize: 10, fontWeight: 'bold', color: trend >= 0 ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 2 }}>
                        {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {Math.abs(trend).toFixed(1)}%
                    </span>
                )}
            </div>
            <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{fmtBRL(value)}</div>
                {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
            </div>
        </div>
    );

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 14px', fontSize: 11 }}>
                <div style={{ color: '#94a3b8', marginBottom: 4, fontWeight: 'bold' }}>{label}</div>
                {payload.map(p => (
                    <div key={p.name} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                        <span>{p.name}</span><span style={{ fontWeight: 'bold' }}>{fmtBRL(p.value)}</span>
                    </div>
                ))}
            </div>
        );
    };

    const accountTypeColor = (type) => {
        const t = (type || '').toLowerCase();
        if (t.includes('crédito') || t.includes('credito')) return '#ef4444';
        if (t.includes('poupança') || t.includes('poupanca') || t.includes('invest')) return '#10b981';
        return '#0ea5e9';
    };

    if (loading) return (
        <MainLayout title="DashBoard">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>
                Carregando dashboard...
            </div>
        </MainLayout>
    );

    return (
        <MainLayout title="DashBoard">
            <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%', background: '#f1f5f9' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Dashboard Financeiro</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Visão consolidada de todas as contas</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Ano:</span>
                        <select value={year} onChange={e => setYear(Number(e.target.value))}
                            style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 12, background: '#fff', outline: 'none', color: '#1e293b', fontWeight: 'bold' }}>
                            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>

                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                    <KpiCard icon={Wallet}       label="Saldo Total"     value={kpis.totalSaldo}   color="#0ea5e9" sub="Todas as contas" />
                    <KpiCard icon={TrendingUp}   label="Entradas (mês)"  value={kpis.entradasMes}  color="#10b981" sub="Mês atual" />
                    <KpiCard icon={TrendingDown} label="Saídas (mês)"    value={kpis.saidasMes}    color="#ef4444" sub="Mês atual" />
                    <KpiCard icon={Activity}     label="Resultado (mês)" value={kpis.economia}     color={kpis.economia >= 0 ? '#8b5cf6' : '#f59e0b'} sub={kpis.economia >= 0 ? 'Superávit' : 'Déficit'} />
                </div>

                {/* Charts row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>

                    {/* Bar chart mensal */}
                    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Entradas × Saídas por Mês</span>
                            <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '3px 8px', borderRadius: 20 }}>{year}</span>
                        </div>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={monthlyData} barGap={2} barCategoryGap="25%">
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="Entradas" fill="#10b981" radius={[3,3,0,0]} />
                                <Bar dataKey="Saídas"   fill="#ef4444" radius={[3,3,0,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Pie: saídas por conta */}
                    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>Saídas por Conta</div>
                        {pieData.length > 0 ? (
                            <>
                                <ResponsiveContainer width="100%" height={160}>
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                                            paddingAngle={2} dataKey="value">
                                            {pieData.map((_, i) => <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(v) => fmtBRL(v)} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                                    {pieData.slice(0, 5).map((d, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS_PIE[i % COLORS_PIE.length], flexShrink: 0 }} />
                                                <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{d.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{fmtBRL(d.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 40 }}>Sem dados</div>}
                    </div>
                </div>

                {/* Charts row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

                    {/* Area: resultado acumulado */}
                    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>Resultado Mensal</div>
                        <ResponsiveContainer width="100%" height={160}>
                            <AreaChart data={monthlyData}>
                                <defs>
                                    <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="Resultado" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorRes)" dot={{ r: 3, fill: '#8b5cf6' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Contas */}
                    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Saldo por Conta</span>
                            <button onClick={() => navigate('/accounts')} style={{ fontSize: 10, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Ver todas →</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {accounts.map(acc => {
                                const color = accountTypeColor(acc.account_type);
                                const maxAbs = Math.max(...accounts.map(a => Math.abs(a.saldo)), 1);
                                const pct = Math.abs(acc.saldo) / maxAbs * 100;
                                return (
                                    <div key={acc.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <CreditCard size={12} color={color} />
                                                <span style={{ fontSize: 11, color: '#475569', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</span>
                                            </div>
                                            <span style={{ fontSize: 11, fontWeight: 'bold', color: acc.saldo < 0 ? '#ef4444' : '#1e293b' }}>{fmtBRL(acc.saldo)}</span>
                                        </div>
                                        <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4 }}>
                                            <div style={{ height: 4, width: `${pct}%`, background: acc.saldo < 0 ? '#ef4444' : color, borderRadius: 4, transition: 'width 0.5s' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Transações recentes */}
                <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Lançamentos Recentes</span>
                        <button onClick={() => navigate('/transactions')} style={{ fontSize: 10, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Ver todos →</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {recentTx.map(tx => {
                            const isC = tx.dc_type === 'C';
                            const [y, m, d] = (tx.emission_date || '').split('-');
                            return (
                                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, borderLeft: `3px solid ${isC ? '#10b981' : '#ef4444'}` }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: isC ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {isC ? <ArrowUpRight size={14} color="#10b981" /> : <ArrowDownRight size={14} color="#ef4444" />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || '—'}</div>
                                        <div style={{ fontSize: 9, color: '#94a3b8' }}>{tx.accounts?.name} · {d}/{m}</div>
                                    </div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: isC ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                                        {isC ? '+' : '-'}{fmtBRL(tx.amount)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </MainLayout>
    );
}
