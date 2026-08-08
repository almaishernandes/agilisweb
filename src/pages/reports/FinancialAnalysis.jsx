import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import ReportPDF from '../../components/ReportPDF';
import { supabase } from '../../lib/supabase';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) => (Number(v || 0) * 100).toFixed(1) + '%';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const Badge = ({ sign }) => (
    <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: sign >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', flexShrink: 0, verticalAlign: 'middle' }}>
        {sign >= 0 ? 'C' : 'D'}
    </span>
);

const PanelHeader = ({ title }) => (
    <div style={{ position: 'sticky', top: 0, background: '#CCFF00', padding: '6px 10px', borderBottom: '2px solid #e0e0e0', zIndex: 2 }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#000000' }}>{title}</span>
    </div>
);

const FinancialAnalysis = () => {
    const navigate = useNavigate();
    const anoAtual = new Date().getFullYear();
    const [ano, setAno] = useState(anoAtual);
    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [chartOfAccounts, setChartOfAccounts] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetchData(); }, [ano]);

    useEffect(() => {
        supabase.from('accounts').select('id, name, current_balance').order('name')
            .then(({ data }) => setAccounts(data || []));
        supabase.from('cost_centers').select('id, full_code, description, category, level').order('full_code')
            .then(({ data }) => setCostCenters(data || []));
        supabase.from('chart_of_accounts').select('id, code, description, level').order('code')
            .then(({ data }) => setChartOfAccounts(data || []));
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('transactions')
            .select('emission_date, amount, dc_type, cost_center_id, transaction_type_id')
            .gte('emission_date', `${ano}-01-01`)
            .lte('emission_date', `${ano}-12-31`);
        setTransactions(data || []);
        setLoading(false);
    };

    const { mensal, totalEntradas, totalSaidas } = useMemo(() => {
        const mensal = MESES.map(() => ({ entradas: 0, saidas: 0 }));
        let totalEntradas = 0, totalSaidas = 0;
        transactions.forEach(t => {
            const mes = new Date(t.emission_date + 'T12:00:00').getMonth();
            const val = Number(t.amount || 0);
            if (t.dc_type === 'C') { mensal[mes].entradas += val; totalEntradas += val; }
            else { mensal[mes].saidas += val; totalSaidas += val; }
        });
        return { mensal, totalEntradas, totalSaidas };
    }, [transactions]);

    const resultado = totalEntradas - totalSaidas;
    const margem = totalEntradas > 0 ? resultado / totalEntradas : 0;
    const cobertura = totalSaidas > 0 ? totalEntradas / totalSaidas : 0;
    const maxBar = Math.max(...mensal.map(m => Math.max(m.entradas, m.saidas)), 1);

    const accountsWithBalance = useMemo(() =>
        accounts
            .filter(a => Number(a.current_balance || 0) !== 0)
            .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0)),
        [accounts]
    );

    // Agrupa saídas por centro de custo no ano selecionado
    const costCenterBalances = useMemo(() => {
        const map = {};
        transactions.forEach(t => {
            if (!t.cost_center_id) return;
            const val = Number(t.amount || 0);
            if (!map[t.cost_center_id]) map[t.cost_center_id] = { saidas: 0, entradas: 0 };
            if (t.dc_type === 'D') map[t.cost_center_id].saidas += val;
            else map[t.cost_center_id].entradas += val;
        });
        return costCenters
            .map(cc => {
                const agg = map[cc.id] || { saidas: 0, entradas: 0 };
                const net = agg.saidas; // usamos saídas como base para percentual de gastos
                return { ...cc, saidas: agg.saidas, entradas: agg.entradas, net };
            })
            .filter(cc => cc.net > 0)
            .sort((a, b) => b.net - a.net);
    }, [transactions, costCenters]);

    // Agrupa por nível 1 do centro de custo
    const ccLevel1Balances = useMemo(() => {
        const idToCode = {};
        costCenters.forEach(c => { idToCode[c.id] = c.full_code || ''; });

        const mapByRoot = {};
        transactions.forEach(t => {
            if (!t.cost_center_id) return;
            const code = idToCode[t.cost_center_id] || '';
            const root = code.split('.')[0];
            if (!root) return;
            const val = Number(t.amount || 0);
            if (!mapByRoot[root]) mapByRoot[root] = 0;
            mapByRoot[root] += t.dc_type === 'C' ? val : -val;
        });

        return costCenters
            .filter(c => c.level === 1)
            .map(c => ({ ...c, saldo: mapByRoot[c.full_code] || 0 }))
            .filter(c => c.saldo !== 0)
            .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
    }, [transactions, costCenters]);

    // Agrupa por nível 1 do plano de contas
    const coaLevel1Balances = useMemo(() => {
        // id → código da conta
        const idToCode = {};
        chartOfAccounts.forEach(c => { idToCode[c.id] = c.code || ''; });

        // Acumula saldo por código raiz (primeiro segmento)
        const mapByRoot = {};
        transactions.forEach(t => {
            if (!t.transaction_type_id) return;
            const code = idToCode[t.transaction_type_id] || '';
            const root = code.split('.')[0];
            if (!root) return;
            const val = Number(t.amount || 0);
            if (!mapByRoot[root]) mapByRoot[root] = 0;
            mapByRoot[root] += t.dc_type === 'C' ? val : -val;
        });

        // Mapeia para os registros nível 1
        return chartOfAccounts
            .filter(c => c.level === 1)
            .map(c => ({ ...c, saldo: mapByRoot[c.code] || 0 }))
            .filter(c => c.saldo !== 0)
            .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
    }, [transactions, chartOfAccounts]);

    // Despesas Fixas × Variáveis: nível 1 e 2 com category='Despesa'
    const despesasFixasVariaveis = useMemo(() => {
        if (!costCenters.length) return { groups: [], total: 0 };

        // Mapa id → costCenter para lookup O(1)
        const idToCC = {};
        costCenters.forEach(c => { idToCC[c.id] = c; });

        // Acumula saídas por full_code (propagando para todos os ancestrais)
        const codeToTotal = {};
        costCenters.forEach(c => { codeToTotal[c.full_code] = 0; });

        transactions.forEach(t => {
            if (!t.cost_center_id || t.dc_type !== 'D') return;
            const cc = idToCC[t.cost_center_id];
            if (!cc) return;
            const val = Number(t.amount || 0);
            const parts = cc.full_code.split('.');
            for (let i = 1; i <= parts.length; i++) {
                const code = parts.slice(0, i).join('.');
                if (codeToTotal[code] !== undefined) codeToTotal[code] += val;
            }
        });

        // Nível 1 com category='Despesa'
        const level1 = costCenters
            .filter(c => c.category === 'Despesa' && c.level === 1)
            .sort((a, b) => a.full_code.localeCompare(b.full_code));

        const groups = level1.map(l1 => {
            const children = costCenters
                .filter(c => c.level === 2 && c.full_code.startsWith(l1.full_code + '.'))
                .sort((a, b) => a.full_code.localeCompare(b.full_code))
                .map(c => ({ ...c, total: codeToTotal[c.full_code] || 0 }))
                .filter(c => c.total > 0)
                .sort((a, b) => b.total - a.total);
            return { ...l1, total: codeToTotal[l1.full_code] || 0, children };
        }).filter(g => g.total > 0);

        const total = groups.reduce((s, g) => s + g.total, 0);
        return { groups, total };
    }, [transactions, costCenters]);

    // Rendimentos mensais: todos os níveis com category='Rendimento'
    const rendimentosMensais = useMemo(() => {
        if (!costCenters.length) return { rows: [], totaisMes: new Array(12).fill(0), totalGeral: 0 };

        const idToCC = {};
        costCenters.forEach(c => { idToCC[c.id] = c; });

        // Acumula créditos por full_code × mês (propagando para ancestrais)
        const codeToMes = {};
        costCenters
            .filter(c => c.category === 'Rendimento')
            .forEach(c => { codeToMes[c.full_code] = new Array(12).fill(0); });

        transactions.forEach(t => {
            if (!t.cost_center_id || t.dc_type !== 'C') return;
            const cc = idToCC[t.cost_center_id];
            if (!cc || cc.category !== 'Rendimento') return;
            const mes = new Date(t.emission_date + 'T12:00:00').getMonth();
            const val = Number(t.amount || 0);
            const parts = cc.full_code.split('.');
            for (let i = 1; i <= parts.length; i++) {
                const code = parts.slice(0, i).join('.');
                if (codeToMes[code]) codeToMes[code][mes] += val;
            }
        });

        const rows = costCenters
            .filter(c => c.category === 'Rendimento')
            .sort((a, b) => a.full_code.localeCompare(b.full_code))
            .map(c => ({ ...c, meses: codeToMes[c.full_code] || new Array(12).fill(0) }))
            .filter(c => c.meses.some(v => v > 0));

        const totaisMes = new Array(12).fill(0);
        rows.filter(r => r.level === 1).forEach(r => { r.meses.forEach((v, i) => { totaisMes[i] += v; }); });
        const totalGeral = totaisMes.reduce((s, v) => s + v, 0);

        return { rows, totaisMes, totalGeral };
    }, [transactions, costCenters]);

    const inp = { border: '1px solid #b2dfdb', borderRadius: '3px', padding: '0 6px', height: '36px', fontSize: '10px', outline: 'none', background: 'white' };

    return (
        <MainLayout>
            <ReportPDF title="Análise Financeira">
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>

                {/* Cabeçalho */}
                <div style={{ background: '#89962F', borderBottom: '2px solid #b2dfdb', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Análise Financeira</span>
                    <span style={{ color: '#b2dfdb' }}>|</span>
                    <label style={{ color: '#CCFF00', fontSize: '10px', fontWeight: 'bold' }}>Ano:</label>
                    <select value={ano} onChange={e => setAno(Number(e.target.value))} style={inp}>
                        {[anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <span style={{ color: '#b2dfdb' }}>|</span>
                    {[
                        { label: 'Receita', val: fmt(totalEntradas), color: '#2e7d32', sign: 1 },
                        { label: 'Despesa', val: fmt(totalSaidas), color: '#c62828', sign: -1 },
                        { label: resultado >= 0 ? 'Lucro' : 'Prejuízo', val: fmt(Math.abs(resultado)), color: resultado >= 0 ? '#1565c0' : '#c62828', sign: resultado >= 0 ? 1 : -1 },
                        { label: 'Margem', val: fmtPct(margem), color: margem >= 0.1 ? '#2e7d32' : margem >= 0 ? '#e65100' : '#c62828', sign: null },
                        { label: 'Cobertura', val: cobertura.toFixed(2) + 'x', color: cobertura >= 1 ? '#2e7d32' : '#c62828', sign: null },
                    ].map(({ label, val, color, sign }) => (
                        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: '4px', background: '#ffffff', borderRadius: '4px', padding: '2px 6px' }}>
                            <span style={{ fontSize: '8px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                                {val}{sign !== null && <Badge sign={sign} />}
                            </span>
                        </div>
                    ))}
                    {loading && <span style={{ fontSize: '10px', color: '#999', marginLeft: 'auto' }}>...</span>}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

                    {/* Gráfico — largura total */}
                    <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '10px 14px', flexShrink: 0 }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#004d40', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Entradas × Saídas — {ano}</div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px' }}>
                            {mensal.map((m, i) => (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '2px' }}>
                                    <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '85px', justifyContent: 'center' }}>
                                        <div title={`Entradas: ${fmt(m.entradas)}`} style={{ flex: 1, background: '#4caf50', height: `${(m.entradas / maxBar) * 100}%`, borderRadius: '2px 2px 0 0', minHeight: m.entradas > 0 ? '2px' : 0, opacity: 0.85 }} />
                                        <div title={`Saídas: ${fmt(m.saidas)}`} style={{ flex: 1, background: '#f44336', height: `${(m.saidas / maxBar) * 100}%`, borderRadius: '2px 2px 0 0', minHeight: m.saidas > 0 ? '2px' : 0, opacity: 0.85 }} />
                                    </div>
                                    <span style={{ fontSize: '8px', color: '#999' }}>{MESES[i]}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                            {[['#4caf50', 'Entradas'], ['#f44336', 'Saídas']].map(([c, l]) => (
                                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: '#666' }}>
                                    <div style={{ width: '10px', height: '10px', background: c, borderRadius: '2px' }} />{l}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tabela mensal + Saldos + Centro de Custo */}
                    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                        {/* Tabela mensal */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                    <tr style={{ background: '#CCFF00' }}>
                                        {['Mês', 'Entradas', 'Saídas', 'Resultado', 'Margem'].map(h => (
                                            <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Mês' ? 'left' : 'right', color: '#000000', fontWeight: 'bold', borderBottom: '2px solid #e0e0e0' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {mensal.map((m, i) => {
                                        const res = m.entradas - m.saidas;
                                        const mg = m.entradas > 0 ? res / m.entradas : 0;
                                        const ativo = m.entradas > 0 || m.saidas > 0;
                                        return (
                                            <tr key={i} style={{ background: i % 2 === 0 ? '#fafafa' : 'white' }}>
                                                <td style={{ padding: '4px 10px', color: '#444', fontWeight: '600' }}>{MESES[i]}</td>
                                                <td style={{ padding: '4px 10px', textAlign: 'right', color: '#2e7d32' }}>{m.entradas > 0 ? fmt(m.entradas) : '—'}</td>
                                                <td style={{ padding: '4px 10px', textAlign: 'right', color: '#c62828' }}>{m.saidas > 0 ? fmt(m.saidas) : '—'}</td>
                                                <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: '600', color: res >= 0 ? '#1565c0' : '#c62828' }}>{ativo ? fmt(res) : '—'}</td>
                                                <td style={{ padding: '4px 10px', textAlign: 'right', color: mg >= 0.1 ? '#2e7d32' : mg >= 0 ? '#e65100' : '#c62828' }}>{m.entradas > 0 ? fmtPct(mg) : '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#89962F', fontWeight: '700', position: 'sticky', bottom: 0 }}>
                                        <td style={{ padding: '6px 10px', color: '#ffffff' }}>TOTAL {ano}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ffffff' }}>{fmt(totalEntradas)} <Badge sign={1} /></td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ffffff' }}>{fmt(totalSaidas)} <Badge sign={-1} /></td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ffffff' }}>{fmt(Math.abs(resultado))} <Badge sign={resultado >= 0 ? 1 : -1} /></td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ffffff' }}>{totalEntradas > 0 ? fmtPct(margem) : '—'}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Saldos das contas */}
                        <div style={{ width: '240px', flexShrink: 0, borderLeft: '2px solid #eee', background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PanelHeader title="Saldos das Contas" />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {accountsWithBalance.length === 0
                                    ? <div style={{ padding: '16px', fontSize: '10px', color: '#999', textAlign: 'center' }}>Nenhuma conta com saldo</div>
                                    : accountsWithBalance.map((a, i) => {
                                        const v = Number(a.current_balance || 0);
                                        return (
                                            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                                                <span style={{ fontSize: '10px', color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45%' }}>{a.name}</span>
                                                <span style={{ fontSize: '10px', fontWeight: 'bold', color: v >= 0 ? '#2e7d32' : '#c62828', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                                    {fmt(Math.abs(v))}<Badge sign={v >= 0 ? 1 : -1} />
                                                </span>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>

                        {/* Centro de custos */}
                        <div style={{ width: '260px', flexShrink: 0, borderLeft: '2px solid #eee', background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PanelHeader title="Centro de Custos" />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {costCenterBalances.length === 0
                                    ? <div style={{ padding: '16px', fontSize: '10px', color: '#999', textAlign: 'center' }}>Nenhum lançamento</div>
                                    : costCenterBalances.map((cc, i) => {
                                        const pct = totalSaidas > 0 ? (cc.net / totalSaidas) * 100 : 0;
                                        return (
                                            <div key={cc.id} style={{ padding: '4px 10px', background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '10px', color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }} title={cc.description}>{cc.description}</span>
                                                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#c62828', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', gap: '4px' }}>
                                                        {fmt(cc.net)}
                                                        <span style={{ fontSize: '9px', color: '#ffffff', background: '#e65100', borderRadius: '4px', padding: '1px 4px', fontWeight: 'bold' }}>
                                                            {pct.toFixed(1)}%
                                                        </span>
                                                    </span>
                                                </div>
                                                {/* barra de progresso */}
                                                <div style={{ height: '3px', background: '#f5f5f5', borderRadius: '2px', marginTop: '3px' }}>
                                                    <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct > 30 ? '#c62828' : pct > 15 ? '#e65100' : '#4caf50', borderRadius: '2px' }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>

                        {/* Plano de Contas — nível 1 */}
                        <div style={{ width: '220px', flexShrink: 0, borderLeft: '2px solid #eee', background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PanelHeader title="Plano de Contas" />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {coaLevel1Balances.length === 0
                                    ? <div style={{ padding: '16px', fontSize: '10px', color: '#999', textAlign: 'center' }}>Nenhum lançamento</div>
                                    : coaLevel1Balances.map((c, i) => {
                                        const v = c.saldo;
                                        return (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                                                <span style={{ fontSize: '10px', color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }} title={c.description}>
                                                    <span style={{ color: '#aaa', marginRight: '4px' }}>{c.code}</span>{c.description}
                                                </span>
                                                <span style={{ fontSize: '10px', fontWeight: 'bold', color: v >= 0 ? '#2e7d32' : '#c62828', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                                    {fmt(Math.abs(v))}<Badge sign={v >= 0 ? 1 : -1} />
                                                </span>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>

                        {/* Centro de Custo — nível 1 */}
                        <div style={{ width: '220px', flexShrink: 0, borderLeft: '2px solid #eee', background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PanelHeader title="Centro de Custo" />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {ccLevel1Balances.length === 0
                                    ? <div style={{ padding: '16px', fontSize: '10px', color: '#999', textAlign: 'center' }}>Nenhum lançamento</div>
                                    : ccLevel1Balances.map((c, i) => {
                                        const v = c.saldo;
                                        return (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                                                <span style={{ fontSize: '10px', color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }} title={c.description}>
                                                    <span style={{ color: '#aaa', marginRight: '4px' }}>{c.full_code}</span>{c.description}
                                                </span>
                                                <span style={{ fontSize: '10px', fontWeight: 'bold', color: v >= 0 ? '#2e7d32' : '#c62828', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                                    {fmt(Math.abs(v))}<Badge sign={v >= 0 ? 1 : -1} />
                                                </span>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>

                        {/* Despesas Fixas × Variáveis */}
                        <div style={{ width: '260px', flexShrink: 0, borderLeft: '2px solid #eee', background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <PanelHeader title="Despesas Fixas × Variáveis" />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {despesasFixasVariaveis.groups.length === 0
                                    ? <div style={{ padding: '16px', fontSize: '10px', color: '#999', textAlign: 'center' }}>Nenhum lançamento</div>
                                    : <>
                                        {despesasFixasVariaveis.groups.map((g, gi) => {
                                            const pctGrupo = despesasFixasVariaveis.total > 0 ? (g.total / despesasFixasVariaveis.total) * 100 : 0;
                                            return (
                                                <React.Fragment key={g.id}>
                                                    {/* Cabeçalho do grupo (nível 1) */}
                                                    <div style={{ background: '#004d40', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }} title={g.description}>
                                                            {g.description}
                                                        </span>
                                                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#CCFF00', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                                            {fmt(g.total)}
                                                            <span style={{ fontSize: '9px', color: '#000000', background: '#CCFF00', borderRadius: '4px', padding: '1px 4px', fontWeight: 'bold' }}>
                                                                {pctGrupo.toFixed(1)}%
                                                            </span>
                                                        </span>
                                                    </div>
                                                    {/* Itens nível 2 */}
                                                    {g.children.map((c, ci) => {
                                                        const pctItem = g.total > 0 ? (c.total / g.total) * 100 : 0;
                                                        return (
                                                            <div key={c.id} style={{ padding: '3px 10px 3px 18px', background: ci % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '9px', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }} title={c.description}>
                                                                    <span style={{ color: '#bbb', marginRight: '3px' }}>{c.full_code}</span>{c.description}
                                                                </span>
                                                                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#c62828', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                                                                    {fmt(c.total)}
                                                                    <span style={{ fontSize: '8px', color: '#ffffff', background: '#e65100', borderRadius: '3px', padding: '1px 3px', fontWeight: 'bold' }}>
                                                                        {pctItem.toFixed(1)}%
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                    {gi < despesasFixasVariaveis.groups.length - 1 && (
                                                        <div style={{ height: '4px', background: '#e8f5e9' }} />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                        {/* Total geral */}
                                        <div style={{ position: 'sticky', bottom: 0, background: '#89962F', padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ffffff' }}>TOTAL DESPESAS</span>
                                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ffffff', display: 'flex', alignItems: 'center' }}>
                                                {fmt(despesasFixasVariaveis.total)}<Badge sign={-1} />
                                            </span>
                                        </div>
                                    </>
                                }
                            </div>
                        </div>

                    </div>

                    {/* Rendimentos Detalhados — mensal */}
                    <div style={{ flexShrink: 0, borderTop: '2px solid #b2dfdb', background: 'white' }}>
                        <div style={{ position: 'sticky', left: 0, background: '#CCFF00', padding: '5px 10px', borderBottom: '2px solid #e0e0e0' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#000000' }}>RENDIMENTOS DETALHADOS — {ano}</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                <thead>
                                    <tr style={{ background: '#CCFF00' }}>
                                        <th style={{ padding: '5px 10px', textAlign: 'left', color: '#000000', fontWeight: 'bold', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', minWidth: '220px', position: 'sticky', left: 0, background: '#CCFF00', zIndex: 2 }}>Conta</th>
                                        {MESES.map(m => (
                                            <th key={m} style={{ padding: '5px 8px', textAlign: 'right', color: '#000000', fontWeight: 'bold', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{m}</th>
                                        ))}
                                        <th style={{ padding: '5px 10px', textAlign: 'right', color: '#000000', fontWeight: 'bold', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', borderLeft: '2px solid #ccc' }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rendimentosMensais.rows.length === 0
                                        ? <tr><td colSpan={14} style={{ padding: '16px', textAlign: 'center', color: '#999' }}>Nenhum rendimento no período</td></tr>
                                        : rendimentosMensais.rows.map((r, i) => {
                                            const total = r.meses.reduce((s, v) => s + v, 0);
                                            const level = Math.max(0, r.full_code.split('.').length - 1);
                                            const isL1 = r.level === 1;
                                            const bg = isL1 ? '#e8f5e9' : (i % 2 === 0 ? '#fafafa' : 'white');
                                            return (
                                                <tr key={r.id} style={{ background: bg }}>
                                                    <td style={{ padding: '3px 10px', paddingLeft: `${10 + level * 12}px`, position: 'sticky', left: 0, background: bg, borderRight: '1px solid #eee', whiteSpace: 'nowrap', color: isL1 ? '#004d40' : '#555', fontWeight: isL1 ? '700' : '400' }}>
                                                        <span style={{ color: '#aaa', marginRight: '5px', fontSize: '9px' }}>{r.full_code}</span>{r.description}
                                                    </td>
                                                    {r.meses.map((v, mi) => (
                                                        <td key={mi} style={{ padding: '3px 8px', textAlign: 'right', color: v > 0 ? '#2e7d32' : '#ccc', fontWeight: isL1 ? '600' : '400' }}>
                                                            {v > 0 ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                                                        </td>
                                                    ))}
                                                    <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: '700', color: total > 0 ? '#1565c0' : '#ccc', borderLeft: '2px solid #eee', whiteSpace: 'nowrap' }}>
                                                        {total > 0 ? <>{Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <Badge sign={1} /></> : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    }
                                </tbody>
                                {rendimentosMensais.rows.length > 0 && (
                                    <tfoot>
                                        <tr style={{ background: '#89962F', fontWeight: '700' }}>
                                            <td style={{ padding: '5px 10px', color: '#ffffff', position: 'sticky', left: 0, background: '#89962F', borderRight: '1px solid #ccc' }}>TOTAL RENDIMENTOS</td>
                                            {rendimentosMensais.totaisMes.map((v, mi) => (
                                                <td key={mi} style={{ padding: '5px 8px', textAlign: 'right', color: '#ffffff' }}>
                                                    {v > 0 ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                                                </td>
                                            ))}
                                            <td style={{ padding: '5px 10px', textAlign: 'right', color: '#ffffff', borderLeft: '2px solid #ccc', whiteSpace: 'nowrap' }}>
                                                {Number(rendimentosMensais.totalGeral).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <Badge sign={1} />
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                </div>
            </div>
            </ReportPDF>
        </MainLayout>
    );
};

export default FinancialAnalysis;
