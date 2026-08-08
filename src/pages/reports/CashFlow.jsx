import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ReportPDF from '../../components/ReportPDF';
import { supabase } from '../../lib/supabase';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) => (Number(v || 0) * 100).toFixed(1) + '%';

const addDays = (dateStr, days) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

const CashFlow = () => {
    const today = new Date().toISOString().split('T')[0];
    const firstDay = today.slice(0, 7) + '-01';

    const [inicio, setInicio] = useState(firstDay);
    const [fim, setFim] = useState(today);
    const [atalho, setAtalho] = useState('mensal');
    const [conta, setConta] = useState('all');
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        supabase.from('accounts').select('id, name').order('name').then(({ data }) => setAccounts(data || []));
    }, []);

    useEffect(() => { fetchData(); }, [inicio, fim, conta]);

    const fetchData = async () => {
        setLoading(true);
        let q = supabase
            .from('transactions')
            .select('id, emission_date, due_date, description, amount, dc_type, account_id, accounts(name), beneficiaries(name)')
            .gte('emission_date', inicio)
            .lte('emission_date', fim)
            .order('emission_date', { ascending: true })
            .order('sequential_id', { ascending: true });
        if (conta !== 'all') q = q.eq('account_id', conta);
        const { data } = await q;
        setTransactions(data || []);
        setLoading(false);
    };

    const { rows, totalEntradas, totalSaidas, saldoAcumulado } = useMemo(() => {
        let saldo = 0, totalEntradas = 0, totalSaidas = 0;
        const rows = transactions.map(t => {
            const val = Number(t.amount || 0);
            const isC = t.dc_type === 'C';
            if (isC) { saldo += val; totalEntradas += val; }
            else { saldo -= val; totalSaidas += val; }
            return { ...t, entrada: isC ? val : 0, saida: isC ? 0 : val, saldo };
        });
        return { rows, totalEntradas, totalSaidas, saldoAcumulado: saldo };
    }, [transactions]);

    const resultado = totalEntradas - totalSaidas;
    const margem = totalEntradas > 0 ? resultado / totalEntradas : 0;

    const aplicarAtalho = (tipo) => {
        const t = new Date().toISOString().split('T')[0];
        setAtalho(tipo);
        if (tipo === 'ontem')      { const ontem = addDays(t, -1); setInicio(ontem); setFim(ontem); }
        if (tipo === 'hoje')       { setInicio(t); setFim(t); }
        if (tipo === 'semanal')    { setInicio(addDays(t, -6));  setFim(t); }
        if (tipo === 'quinzenal')  { setInicio(addDays(t, -14)); setFim(t); }
        if (tipo === 'mensal')     { setInicio(t.slice(0, 7) + '-01'); setFim(t); }
    };

    const inp = { border: '1px solid #b2dfdb', borderRadius: '3px', padding: '0 6px', height: '36px', fontSize: '10px', outline: 'none', background: 'white' };
    const btnAtalho = (v, l) => (
        <button key={v} onClick={() => aplicarAtalho(v)} style={{ flex: 1, padding: '0 8px', height: '36px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #b2dfdb', borderRadius: '3px', cursor: 'pointer', background: atalho === v ? '#00695c' : 'white', color: atalho === v ? 'white' : '#000000', whiteSpace: 'nowrap' }}>{l}</button>
    );

    return (
        <MainLayout>
            <ReportPDF title="Fluxo de Caixa">
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>

                {/* Cabeçalho único */}
                <div style={{ background: '#89962F', borderBottom: '2px solid #b2dfdb', padding: '5px 12px 5px 12px' }}>
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', color: '#e0e0e0' }}>...</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: '6px' }}>
                        {btnAtalho('ontem', 'Ontem')}
                        {btnAtalho('hoje', 'Hoje')}
                        {btnAtalho('semanal', 'Semanal')}
                        {btnAtalho('quinzenal', 'Quinzenal')}
                        {btnAtalho('mensal', 'Mensal')}
                        <input type="date" value={inicio} onChange={e => { setInicio(e.target.value); setAtalho(''); }} style={{ ...inp, flex: 1, height: '36px' }} />
                        <input type="date" value={fim} onChange={e => { setFim(e.target.value); setAtalho(''); }} style={{ ...inp, flex: 1, height: '36px' }} />
                        <select value={conta} onChange={e => setConta(e.target.value)} style={{ ...inp, flex: 1, height: '36px' }}>
                            <option value="all">Todas</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        {[
                            { label: 'Entradas', val: fmt(totalEntradas), color: '#2e7d32', sign: 1 },
                            { label: 'Saídas', val: fmt(totalSaidas), color: '#c62828', sign: -1 },
                            { label: resultado >= 0 ? 'Lucro' : 'Prejuízo', val: fmt(Math.abs(resultado)), color: resultado >= 0 ? '#1565c0' : '#c62828', sign: resultado >= 0 ? 1 : -1 },
                            { label: 'Margem', val: fmtPct(margem), color: margem >= 0 ? '#e65100' : '#c62828', sign: null },
                            { label: 'Saldo', val: fmt(Math.abs(saldoAcumulado)), color: saldoAcumulado >= 0 ? '#004d40' : '#c62828', sign: saldoAcumulado >= 0 ? 1 : -1 },
                        ].map(({ label, val, color, sign }) => (
                            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: '3px', padding: '0 6px', height: '36px' }}>
                                <span style={{ fontSize: '8px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{label}</span>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                                    {val}{sign !== null && <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: sign >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', flexShrink: 0 }}>{sign >= 0 ? 'C' : 'D'}</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tabela */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            <tr style={{ background: '#CCFF00' }}>
                                {['Emissão', 'Vencimento', 'Conta', 'Fornecedor', 'Descrição', 'Saídas', 'Entradas', 'Saldo'].map(h => (
                                    <th key={h} style={{ padding: '6px 10px', textAlign: ['Saídas', 'Entradas', 'Saldo'].includes(h) ? 'right' : 'left', color: '#000000', fontWeight: 'bold', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#999' }}>Nenhum lançamento no período</td></tr>
                            ) : rows.map((r, i) => (
                                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fafafa' : 'white' }}>
                                    <td style={{ padding: '4px 10px', color: '#444', whiteSpace: 'nowrap' }}>{r.emission_date?.split('-').reverse().join('/')}</td>
                                    <td style={{ padding: '4px 10px', color: '#555', whiteSpace: 'nowrap' }}>{r.due_date?.split('-').reverse().join('/') || '—'}</td>
                                    <td style={{ padding: '4px 10px', color: '#444' }}>{r.accounts?.name || '—'}</td>
                                    <td style={{ padding: '4px 10px', color: '#444' }}>{r.beneficiaries?.name || '—'}</td>
                                    <td style={{ padding: '4px 10px', color: '#444' }}>{r.description || '—'}</td>
                                    <td style={{ padding: '4px 10px', textAlign: 'right', color: r.saida > 0 ? '#c62828' : '#bbb' }}>{r.saida > 0 ? fmt(r.saida) : '—'}</td>
                                    <td style={{ padding: '4px 10px', textAlign: 'right', color: r.entrada > 0 ? '#2e7d32' : '#bbb' }}>{r.entrada > 0 ? fmt(r.entrada) : '—'}</td>
                                    <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: '600', color: r.saldo >= 0 ? '#1565c0' : '#c62828' }}>
                                        {fmt(Math.abs(r.saldo))} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: r.saldo >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', flexShrink: 0, verticalAlign: 'middle' }}>{r.saldo >= 0 ? 'C' : 'D'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {rows.length > 0 && (
                            <tfoot>
                                <tr style={{ background: '#89962F', fontWeight: '700', position: 'sticky', bottom: 0 }}>
                                    <td colSpan={5} style={{ padding: '6px 10px', color: '#ffffff' }}>TOTAL — {rows.length} lançamento(s)</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ffffff' }}>{fmt(totalSaidas)} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', verticalAlign: 'middle' }}>D</span></td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ffffff' }}>{fmt(totalEntradas)} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: '#1b5e20', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', verticalAlign: 'middle' }}>C</span></td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ffffff' }}>{fmt(Math.abs(saldoAcumulado))} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: saldoAcumulado >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', verticalAlign: 'middle' }}>{saldoAcumulado >= 0 ? 'C' : 'D'}</span></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
            </ReportPDF>
        </MainLayout>
    );
};

export default CashFlow;
