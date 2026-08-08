import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { supabase } from '../../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtK = (v) => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1_000_000) return 'R$ ' + (n / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1_000) return 'R$ ' + (n / 1_000).toFixed(1) + 'K';
    return fmt(n);
};
const fmtPct = (v) => (Number(v || 0) * 100).toFixed(1) + '%';

const Badge = ({ sign }) => (
    <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#fff', background: sign >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', flexShrink: 0 }}>
        {sign >= 0 ? 'C' : 'D'}
    </span>
);

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#1a1a2e', border: '1px solid #00695c', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: '#fff' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#CCFF00' }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
                    <span style={{ color: '#ccc' }}>{p.name}:</span>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{fmtK(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

const KpiCard = ({ label, value, sub, color, bg, icon, trend }) => (
    <div style={{ flex: 1, minWidth: '140px', background: bg || '#1a1a2e', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', overflow: 'hidden', border: `1px solid ${color}33` }}>
        <div style={{ position: 'absolute', right: '12px', top: '12px', fontSize: '22px', opacity: 0.15 }}>{icon}</div>
        <span style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 'bold' }}>{label}</span>
        <span style={{ fontSize: '18px', fontWeight: '800', color, whiteSpace: 'nowrap' }}>{value}</span>
        {sub && <span style={{ fontSize: '10px', color: '#888' }}>{sub}</span>}
        {trend !== undefined && (
            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: trend >= 0 ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
                    {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
                </span>
                <span style={{ fontSize: '9px', color: '#666' }}>vs mês ant.</span>
            </div>
        )}
    </div>
);

const SectionTitle = ({ children }) => (
    <div style={{ fontSize: '10px', fontWeight: '800', color: '#CCFF00', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', paddingBottom: '4px', borderBottom: '1px solid #2a2a3e' }}>
        {children}
    </div>
);

const PIE_COLORS = ['#00e676', '#40c4ff', '#CCFF00', '#ff6d00', '#ea80fc', '#ff5252', '#69f0ae', '#40c4ff'];

const FinancialDashboard = () => {
    const navigate = useNavigate();
    const anoAtual = new Date().getFullYear();
    const mesAtual = new Date().getMonth();
    const [ano, setAno] = useState(anoAtual);
    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        supabase.from('accounts').select('id, name, current_balance').order('name')
            .then(({ data }) => setAccounts(data || []));
        supabase.from('cost_centers').select('id, full_code, description, category, level').order('full_code')
            .then(({ data }) => setCostCenters(data || []));
    }, []);

    useEffect(() => {
        setLoading(true);
        supabase.from('transactions')
            .select('emission_date, amount, dc_type, cost_center_id, transaction_type_id')
            .gte('emission_date', `${ano}-01-01`)
            .lte('emission_date', `${ano}-12-31`)
            .then(({ data }) => { setTransactions(data || []); setLoading(false); });
    }, [ano]);

    const { mensal, totalEntradas, totalSaidas, mesAtualData, mesAnteriorData } = useMemo(() => {
        const mensal = MESES.map(() => ({ entradas: 0, saidas: 0 }));
        transactions.forEach(t => {
            const mes = new Date(t.emission_date + 'T12:00:00').getMonth();
            const val = Number(t.amount || 0);
            if (t.dc_type === 'C') mensal[mes].entradas += val;
            else mensal[mes].saidas += val;
        });
        const totalEntradas = mensal.reduce((s, m) => s + m.entradas, 0);
        const totalSaidas = mensal.reduce((s, m) => s + m.saidas, 0);
        const mesAtualData = ano === anoAtual ? mensal[mesAtual] : mensal[11];
        const mesAnteriorData = ano === anoAtual && mesAtual > 0 ? mensal[mesAtual - 1] : mensal[0];
        return { mensal, totalEntradas, totalSaidas, mesAtualData, mesAnteriorData };
    }, [transactions, ano]);

    const resultado = totalEntradas - totalSaidas;
    const margem = totalEntradas > 0 ? resultado / totalEntradas : 0;
    const cobertura = totalSaidas > 0 ? totalEntradas / totalSaidas : 0;
    const saldoTotal = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);

    const trendReceita = mesAnteriorData.entradas > 0 ? ((mesAtualData.entradas - mesAnteriorData.entradas) / mesAnteriorData.entradas) * 100 : null;
    const trendDespesa = mesAnteriorData.saidas > 0 ? ((mesAtualData.saidas - mesAnteriorData.saidas) / mesAnteriorData.saidas) * 100 : null;

    const chartData = MESES.map((m, i) => ({
        mes: m,
        Entradas: mensal[i].entradas,
        Saídas: mensal[i].saidas,
        Resultado: mensal[i].entradas - mensal[i].saidas,
    }));

    const saldoAcumuladoData = (() => {
        let acc = 0;
        return MESES.map((m, i) => {
            acc += mensal[i].entradas - mensal[i].saidas;
            return { mes: m, Saldo: acc };
        });
    })();

    const accountsSorted = useMemo(() =>
        accounts.filter(a => Number(a.current_balance || 0) !== 0)
            .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0)),
        [accounts]);

    const idToCC = useMemo(() => {
        const m = {}; costCenters.forEach(c => { m[c.id] = c; }); return m;
    }, [costCenters]);

    const despesasPorCC = useMemo(() => {
        const map = {};
        transactions.forEach(t => {
            if (!t.cost_center_id || t.dc_type !== 'D') return;
            const cc = idToCC[t.cost_center_id];
            if (!cc || cc.level !== 1) return;
            map[cc.full_code] = (map[cc.full_code] || { desc: cc.description, val: 0 });
            map[cc.full_code].val += Number(t.amount || 0);
        });
        // Aggregate: transactions at deeper levels roll up to level-1
        transactions.forEach(t => {
            if (!t.cost_center_id || t.dc_type !== 'D') return;
            const cc = idToCC[t.cost_center_id];
            if (!cc || cc.level === 1) return;
            const root = cc.full_code.split('.')[0];
            const l1 = costCenters.find(c => c.full_code === root && c.level === 1);
            if (!l1) return;
            if (!map[root]) map[root] = { desc: l1.description, val: 0 };
            map[root].val += Number(t.amount || 0);
        });
        return Object.values(map).filter(v => v.val > 0).sort((a, b) => b.val - a.val).slice(0, 6);
    }, [transactions, costCenters, idToCC]);

    const pieData = despesasPorCC.map(d => ({ name: d.desc, value: d.val }));

    const ultimasTransacoes = useMemo(() => {
        const sorted = [...transactions].sort((a, b) => b.emission_date?.localeCompare(a.emission_date));
        return sorted.slice(0, 8);
    }, [transactions]);

    const inp = { border: '1px solid #2a3a2a', borderRadius: '6px', padding: '0 8px', height: '32px', fontSize: '11px', outline: 'none', background: '#1a2a1a', color: '#fff' };
    const btnNav = (label, path, icon) => (
        <button onClick={() => navigate(path)} style={{ height: '32px', padding: '0 12px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #00695c', borderRadius: '6px', cursor: 'pointer', background: '#00695c22', color: '#4caf50', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>{icon}</span>{label}
        </button>
    );

    return (
        <MainLayout>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0d0d1a', color: '#ffffff', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #0d1f0d 0%, #1a2a1a 100%)', borderBottom: '2px solid #00695c', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: '900', color: '#CCFF00', textTransform: 'uppercase', letterSpacing: '0.1em' }}>📊 Dashboard Financeiro</span>
                    <span style={{ color: '#2a4a2a' }}>|</span>
                    {btnNav('Análise Financeira', '/reports/financial-analysis', '📈')}
                    {btnNav('Equilíbrio', '/reports/financial-balance', '⚖️')}
                    <span style={{ color: '#2a4a2a' }}>|</span>
                    <label style={{ color: '#CCFF00', fontSize: '10px', fontWeight: 'bold' }}>Ano:</label>
                    <select value={ano} onChange={e => setAno(Number(e.target.value))} style={inp}>
                        {[anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    {loading && <span style={{ fontSize: '10px', color: '#4caf50', marginLeft: 'auto' }}>⟳ carregando...</span>}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* KPIs */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <KpiCard label="Receita Total" value={fmtK(totalEntradas)} sub={`Mês atual: ${fmtK(mesAtualData.entradas)}`} color="#4caf50" icon="💰" trend={trendReceita} />
                        <KpiCard label="Despesa Total" value={fmtK(totalSaidas)} sub={`Mês atual: ${fmtK(mesAtualData.saidas)}`} color="#f44336" icon="💸" trend={trendDespesa} />
                        <KpiCard label={resultado >= 0 ? 'Lucro Líquido' : 'Prejuízo'} value={fmtK(Math.abs(resultado))} sub={`Margem: ${fmtPct(margem)}`} color={resultado >= 0 ? '#40c4ff' : '#ff5252'} icon={resultado >= 0 ? '📈' : '📉'} />
                        <KpiCard label="Cobertura" value={cobertura.toFixed(2) + 'x'} sub={cobertura >= 1 ? 'Receita > Despesa' : 'Atenção: déficit'} color={cobertura >= 1.2 ? '#CCFF00' : cobertura >= 1 ? '#ff6d00' : '#f44336'} icon="🎯" />
                        <KpiCard label="Saldo em Caixa" value={fmtK(Math.abs(saldoTotal))} sub={`${accountsSorted.length} conta(s) ativa(s)`} color={saldoTotal >= 0 ? '#69f0ae' : '#f44336'} icon="🏦" />
                    </div>

                    {/* Charts row 1 */}
                    <div style={{ display: 'flex', gap: '12px', minHeight: '200px' }}>

                        {/* Bar chart Entradas x Saídas */}
                        <div style={{ flex: 2, background: '#111122', borderRadius: '12px', padding: '14px 16px', border: '1px solid #1a2a1a' }}>
                            <SectionTitle>Entradas × Saídas — {ano}</SectionTitle>
                            <ResponsiveContainer width="100%" height={150}>
                                <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={8}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2a2a" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 9, fill: '#888' }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => fmtK(v)} tick={{ fontSize: 8, fill: '#888' }} axisLine={false} tickLine={false} width={50} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="Entradas" fill="#4caf50" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="Saídas" fill="#f44336" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Line chart Saldo Acumulado */}
                        <div style={{ flex: 1, background: '#111122', borderRadius: '12px', padding: '14px 16px', border: '1px solid #1a2a1a' }}>
                            <SectionTitle>Saldo Acumulado</SectionTitle>
                            <ResponsiveContainer width="100%" height={150}>
                                <AreaChart data={saldoAcumuladoData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#CCFF00" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#CCFF00" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2a2a" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 9, fill: '#888' }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => fmtK(v)} tick={{ fontSize: 8, fill: '#888' }} axisLine={false} tickLine={false} width={50} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="Saldo" stroke="#CCFF00" strokeWidth={2} fill="url(#saldoGrad)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Row 2: Pie + Contas + Transações */}
                    <div style={{ display: 'flex', gap: '12px', minHeight: '200px' }}>

                        {/* Pie despesas por CC */}
                        <div style={{ flex: 1, background: '#111122', borderRadius: '12px', padding: '14px 16px', border: '1px solid #1a2a1a' }}>
                            <SectionTitle>Despesas por Centro de Custo</SectionTitle>
                            {pieData.length === 0
                                ? <div style={{ color: '#666', fontSize: '10px', textAlign: 'center', paddingTop: '40px' }}>Nenhum dado</div>
                                : <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <PieChart width={120} height={130}>
                                        <Pie data={pieData} cx={55} cy={60} innerRadius={30} outerRadius={55} paddingAngle={2} dataKey="value">
                                            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(v) => fmtK(v)} contentStyle={{ background: '#1a1a2e', border: '1px solid #00695c', fontSize: '10px', color: '#fff' }} />
                                    </PieChart>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {pieData.map((d, i) => {
                                            const pct = totalSaidas > 0 ? (d.value / totalSaidas) * 100 : 0;
                                            return (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                                                    <span style={{ fontSize: '9px', color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                                    <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap' }}>{pct.toFixed(0)}%</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            }
                        </div>

                        {/* Saldo das contas */}
                        <div style={{ flex: 1, background: '#111122', borderRadius: '12px', padding: '14px 16px', border: '1px solid #1a2a1a', overflow: 'hidden' }}>
                            <SectionTitle>Posição de Caixa</SectionTitle>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {accountsSorted.length === 0
                                    ? <div style={{ color: '#666', fontSize: '10px', textAlign: 'center' }}>Nenhuma conta</div>
                                    : accountsSorted.map(a => {
                                        const v = Number(a.current_balance || 0);
                                        const pct = saldoTotal !== 0 ? Math.abs(v / saldoTotal) * 100 : 0;
                                        return (
                                            <div key={a.id}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                                    <span style={{ fontSize: '10px', color: '#ccc' }}>{a.name}</span>
                                                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: v >= 0 ? '#4caf50' : '#f44336', display: 'flex', alignItems: 'center' }}>
                                                        {fmtK(Math.abs(v))}<Badge sign={v >= 0 ? 1 : -1} />
                                                    </span>
                                                </div>
                                                <div style={{ height: '4px', background: '#1a2a1a', borderRadius: '2px' }}>
                                                    <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: v >= 0 ? '#4caf50' : '#f44336', borderRadius: '2px' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Últimas transações */}
                        <div style={{ flex: 2, background: '#111122', borderRadius: '12px', padding: '14px 16px', border: '1px solid #1a2a1a', overflow: 'hidden' }}>
                            <SectionTitle>Últimos Lançamentos — {ano}</SectionTitle>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                <thead>
                                    <tr>
                                        {['Data', 'Tipo', 'Valor'].map(h => (
                                            <th key={h} style={{ textAlign: h === 'Valor' ? 'right' : 'left', color: '#666', fontWeight: 'bold', paddingBottom: '6px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ultimasTransacoes.map((t, i) => {
                                        const v = Number(t.amount || 0);
                                        return (
                                            <tr key={i} style={{ borderTop: '1px solid #1a2a1a' }}>
                                                <td style={{ padding: '4px 0', color: '#888', whiteSpace: 'nowrap' }}>{t.emission_date?.split('-').reverse().join('/')}</td>
                                                <td style={{ padding: '4px 8px' }}>
                                                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: t.dc_type === 'C' ? '#4caf50' : '#f44336', marginRight: '5px', verticalAlign: 'middle' }} />
                                                    <span style={{ color: '#ccc' }}>{t.dc_type === 'C' ? 'Entrada' : 'Saída'}</span>
                                                </td>
                                                <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 'bold', color: t.dc_type === 'C' ? '#4caf50' : '#f44336', whiteSpace: 'nowrap' }}>
                                                    {fmtK(v)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                    </div>

                    {/* Resultado mensal linha */}
                    <div style={{ background: '#111122', borderRadius: '12px', padding: '14px 16px', border: '1px solid #1a2a1a' }}>
                        <SectionTitle>Resultado Mensal — {ano}</SectionTitle>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {chartData.map((m, i) => {
                                const res = m.Resultado;
                                const maxAbs = Math.max(...chartData.map(d => Math.abs(d.Resultado)), 1);
                                const h = Math.round((Math.abs(res) / maxAbs) * 60);
                                return (
                                    <div key={i} title={`${m.mes}: ${fmt(res)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '8px', color: res >= 0 ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>{fmtK(res)}</span>
                                        <div style={{ width: '100%', height: `${h}px`, background: res >= 0 ? 'linear-gradient(180deg, #4caf50, #1b5e20)' : 'linear-gradient(180deg, #f44336, #7f0000)', borderRadius: '3px 3px 0 0', minHeight: '2px' }} />
                                        <span style={{ fontSize: '8px', color: '#666' }}>{m.mes}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            </div>
        </MainLayout>
    );
};

export default FinancialDashboard;
