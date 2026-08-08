import React, { useState, useEffect, useMemo, useRef } from 'react';
import MainLayout from '../../components/MainLayout';
import ReportPDF from '../../components/ReportPDF';
import { supabase } from '../../lib/supabase';

const MESES_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const fmt    = (v) => v === 0 ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtCur = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const Badge = ({ sign }) => (
    <span style={{ fontSize: '8px', fontWeight: 'bold', color: '#fff', background: sign >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '14px', height: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '3px', flexShrink: 0, verticalAlign: 'middle' }}>
        {sign >= 0 ? 'C' : 'D'}
    </span>
);

// Popup de parcelas para previsão
const ParcelasPopup = ({ pending, onConfirm, onCancel }) => {
    const [parcelas, setParcelas] = useState(1);
    if (!pending) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }} onClick={onCancel}>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '20px 24px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)', minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '14px' }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#004d40', borderBottom: '1px solid #e0e0e0', paddingBottom: '8px' }}>
                    Previsão de Gasto
                </div>
                <div style={{ fontSize: '11px', color: '#444' }}>
                    Valor: <strong style={{ color: '#c62828' }}>{fmtCur(pending.valor)}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#444', whiteSpace: 'nowrap' }}>Repetir por:</label>
                    <select
                        value={parcelas}
                        onChange={e => setParcelas(Number(e.target.value))}
                        style={{ border: '1px solid #b2dfdb', borderRadius: '3px', padding: '4px 8px', fontSize: '11px', outline: 'none', flex: 1 }}
                        autoFocus
                    >
                        {[1,2,3,4,5,6,7,8,9,10,11,12,18,24].map(n => (
                            <option key={n} value={n}>{n === 1 ? '1 mês (sem repetição)' : `${n} meses`}</option>
                        ))}
                    </select>
                </div>
                {parcelas > 1 && (
                    <div style={{ fontSize: '10px', color: '#888', background: '#f5f5f5', borderRadius: '4px', padding: '6px 8px' }}>
                        {fmtCur(pending.valor)} será lançado neste dia e repetido no mesmo dia dos próximos {parcelas - 1} {parcelas - 1 === 1 ? 'mês' : 'meses'} consecutivos.
                    </div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={onCancel} style={{ padding: '6px 14px', fontSize: '10px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: 'white' }}>Cancelar</button>
                    <button onClick={() => onConfirm(pending.key, pending.valor, parcelas)} style={{ padding: '6px 14px', fontSize: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: '#004d40', color: 'white', fontWeight: 'bold' }}>Confirmar</button>
                </div>
            </div>
        </div>
    );
};

const FinancialBalance = () => {
    const hoje     = new Date();
    const anoAtual = hoje.getFullYear();
    const trimAtual = Math.floor(hoje.getMonth() / 3) + 1;

    const [ano, setAno]             = useState(anoAtual);
    const [trimestre, setTrimestre] = useState(trimAtual);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading]     = useState(false);

    // filtro por fornecedor
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [filterBenef, setFilterBenef]     = useState('');

    // previsoes: { 'absMonth-dayIdx': { valor, parcelas } }
    const [previsoes, setPrevisoes]   = useState({});
    // raw input text per cell
    const [prevInput, setPrevInput]   = useState({});
    // pending = awaiting parcelas confirmation
    const [prevPending, setPrevPending] = useState(null);

    const mesesDoTrim = useMemo(() => {
        const base = (trimestre - 1) * 3;
        return [base, base + 1, base + 2];
    }, [trimestre]);

    // Carrega lista de fornecedores uma única vez
    useEffect(() => {
        supabase.from('beneficiaries').select('id, name').order('name')
            .then(({ data }) => setBeneficiaries(data || []));
    }, []);

    // Fetch desde Jan/1. Quando há filtro de fornecedor busca o ano inteiro (passado + futuro)
    useEffect(() => {
        setLoading(true);
        const fim = filterBenef
            ? `${ano}-12-31`
            : (() => {
                const m2      = mesesDoTrim[2] + 1;
                const lastDay = new Date(ano, mesesDoTrim[2] + 1, 0).getDate();
                return `${ano}-${String(m2).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            })();
        let q = supabase
            .from('transactions')
            .select('emission_date, amount, dc_type, beneficiary_id')
            .gte('emission_date', `${ano}-01-01`)
            .lte('emission_date', fim);
        if (filterBenef) q = q.eq('beneficiary_id', filterBenef);
        q.then(({ data }) => { setTransactions(data || []); setLoading(false); });
    }, [ano, trimestre, filterBenef]);

    // Matriz separada: antes do trimestre (para carry-over) e dentro do trimestre (exibição)
    const { matrixPrev, matrixTrim } = useMemo(() => {
        const firstMonth = mesesDoTrim[0];
        // Meses anteriores ao trimestre: acumula carry-over
        const prev = {};
        for (let m = 0; m < firstMonth; m++) {
            prev[m] = Array.from({ length: 31 }, () => ({ entradas: 0, saidas: 0 }));
        }
        // Meses do trimestre: exibição
        const trim = {
            0: Array.from({ length: 31 }, () => ({ entradas: 0, saidas: 0 })),
            1: Array.from({ length: 31 }, () => ({ entradas: 0, saidas: 0 })),
            2: Array.from({ length: 31 }, () => ({ entradas: 0, saidas: 0 })),
        };
        transactions.forEach(t => {
            const d   = new Date(t.emission_date + 'T12:00:00');
            const mes = d.getMonth();
            const dia = d.getDate() - 1;
            const val = Number(t.amount || 0);
            const isC = t.dc_type === 'C';
            if (mes < firstMonth && prev[mes]) {
                if (isC) prev[mes][dia].entradas += val;
                else     prev[mes][dia].saidas   += val;
            } else {
                const ci = mesesDoTrim.indexOf(mes);
                if (ci !== -1) {
                    if (isC) trim[ci][dia].entradas += val;
                    else     trim[ci][dia].saidas   += val;
                }
            }
        });
        return { matrixPrev: prev, matrixTrim: trim };
    }, [transactions, mesesDoTrim]);

    // Matriz de exibição (ci 0-2, di 0-30)
    const matrix = matrixTrim;

    // Saldo carry-over: soma de todos os meses ANTES do trimestre atual
    const saldoInicial = useMemo(() => {
        let acc = 0;
        Object.values(matrixPrev).forEach(mData => {
            mData.forEach(({ entradas, saidas }) => { acc += entradas - saidas; });
        });
        return acc;
    }, [matrixPrev]);

    // Expande previsões em impactos por (ci-day)
    const prevImpacts = useMemo(() => {
        const impacts = {};
        Object.entries(previsoes).forEach(([key, { valor, parcelas }]) => {
            const [ci, d] = key.split('-').map(Number);
            for (let i = 0; i < parcelas; i++) {
                const targetCi = ci + i;
                const ik = `${targetCi}-${d}`;
                impacts[ik] = (impacts[ik] || 0) + valor;
            }
        });
        return impacts;
    }, [previsoes]);

    // Saldo acumulado anual — parte do saldoInicial (carry-over de trimestres anteriores)
    const saldoAcumulado = useMemo(() => {
        let acc = saldoInicial;
        const map = { 0: new Array(31), 1: new Array(31), 2: new Array(31) };
        [0, 1, 2].forEach(ci => {
            for (let di = 0; di < 31; di++) {
                const { entradas, saidas } = matrix[ci][di];
                const prevVal = prevImpacts[`${ci}-${di}`] || 0;
                acc += entradas - saidas - prevVal;
                map[ci][di] = acc;
            }
        });
        return map;
    }, [matrix, saldoInicial, prevImpacts]);

    // Saldo final de cada mês = último valor do array (índice 30)
    const lastSaldoPorMes = [0, 1, 2].map(ci => saldoAcumulado[ci][30]);

    const getSaldo = (ci, di) => saldoAcumulado[ci][di];

    const totaisMes = useMemo(() =>
        [0, 1, 2].map(ci => ({
            entradas: matrix[ci].reduce((s, r) => s + r.entradas, 0),
            saidas:   matrix[ci].reduce((s, r) => s + r.saidas,   0),
        })),
    [matrix]);

    const totaisGerais = useMemo(() => ({
        entradas: totaisMes.reduce((s, m) => s + m.entradas, 0),
        saidas:   totaisMes.reduce((s, m) => s + m.saidas,   0),
    }), [totaisMes]);

    // Dias com movimento real (para destacar na tabela)
    const diasComDados = useMemo(() => new Set(
        Array.from({ length: 31 }, (_, i) => i).filter(i =>
            [0, 1, 2].some(ci =>
                matrix[ci][i].entradas > 0 || matrix[ci][i].saidas > 0
            )
        )
    ), [matrix]);

    // Trimestre tem algum dado real?
    const trimTemDados = diasComDados.size > 0;

    // Verifica se a célula corresponde a uma data passada (ou dia inexistente no mês)
    const startOfToday = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const isPastCell = (ci, di) => {
        const mes = mesesDoTrim[ci];
        const cellDate = new Date(ano, mes, di + 1);
        if (cellDate.getMonth() !== mes) return true; // dia inexistente no mês
        return cellDate < startOfToday;
    };

    // Handlers de previsão  (chave: `${ci}-${di}`)
    const handlePrevCommit = (ci, di, raw) => {
        if (isPastCell(ci, di)) return; // bloqueia datas passadas
        const val = parseFloat(String(raw).replace(/\./g, '').replace(',', '.'));
        if (!isNaN(val) && val > 0) {
            setPrevPending({ key: `${ci}-${di}`, valor: val });
        } else if (!raw || raw === '') {
            const key = `${ci}-${di}`;
            setPrevisoes(prev => { const n = { ...prev }; delete n[key]; return n; });
        }
    };

    const confirmPrev = (key, valor, parcelas) => {
        setPrevisoes(prev => ({ ...prev, [key]: { valor, parcelas } }));
        setPrevInput(prev => ({ ...prev, [key]: Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }));
        setPrevPending(null);
    };

    const cancelPrev = () => {
        if (prevPending) {
            // Restaura o input ao valor salvo ou limpa
            const saved = previsoes[prevPending.key];
            setPrevInput(prev => ({
                ...prev,
                [prevPending.key]: saved ? Number(saved.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
            }));
        }
        setPrevPending(null);
    };

    const inp    = { border: '1px solid #b2dfdb', borderRadius: '3px', padding: '0 6px', height: '36px', fontSize: '10px', outline: 'none', background: 'white' };
    const btnTrim = (v) => (
        <button key={v} onClick={() => setTrimestre(v)} style={{ height: '36px', padding: '0 10px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #b2dfdb', borderRadius: '3px', cursor: 'pointer', background: trimestre === v ? '#004d40' : 'white', color: trimestre === v ? 'white' : '#000000' }}>
            {v}º Trim
        </button>
    );

    const thBase = { padding: '5px 6px', textAlign: 'right', color: '#000000', fontWeight: 'bold', borderBottom: '2px solid #e0e0e0', fontSize: '9px', whiteSpace: 'nowrap', background: '#CCFF00' };

    return (
        <MainLayout>
            <ReportPDF title={`Equilíbrio Financeiro — ${trimestre}º Trimestre ${ano}`}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>

                <div style={{ background: '#89962F', borderBottom: '2px solid #b2dfdb', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>⚖ Equilíbrio Financeiro</span>
                    <span style={{ color: '#b2dfdb' }}>|</span>
                    <label style={{ color: '#CCFF00', fontSize: '10px', fontWeight: 'bold' }}>Ano:</label>
                    <select value={ano} onChange={e => setAno(Number(e.target.value))} style={inp}>
                        {[anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <span style={{ color: '#b2dfdb' }}>|</span>
                    {[1, 2, 3, 4].map(btnTrim)}
                    <span style={{ color: '#b2dfdb' }}>|</span>
                    {[
                        { label: 'Entradas', val: fmtCur(totaisGerais.entradas), color: '#2e7d32' },
                        { label: 'Saídas',   val: fmtCur(totaisGerais.saidas),   color: '#c62828' },
                        { label: totaisGerais.entradas - totaisGerais.saidas >= 0 ? 'Saldo +' : 'Saldo −', val: fmtCur(Math.abs(totaisGerais.entradas - totaisGerais.saidas)), color: totaisGerais.entradas - totaisGerais.saidas >= 0 ? '#1565c0' : '#c62828' },
                    ].map(({ label, val, color }) => (
                        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', background: '#ffffff', borderRadius: '4px', padding: '2px 6px' }}>
                            <span style={{ fontSize: '8px', color: '#000', fontWeight: 'bold', textTransform: 'uppercase' }}>{label}</span>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color }}>{val}</span>
                        </div>
                    ))}
                    <span style={{ color: '#b2dfdb' }}>|</span>
                    <label style={{ color: '#CCFF00', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Fornecedor:</label>
                    <select
                        value={filterBenef}
                        onChange={e => setFilterBenef(e.target.value)}
                        style={{ ...inp, minWidth: '160px', maxWidth: '220px' }}
                    >
                        <option value="">— Todos —</option>
                        {beneficiaries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    {filterBenef && (
                        <button onClick={() => setFilterBenef('')} style={{ padding: '0 8px', height: '36px', fontSize: '10px', border: '1px solid #b2dfdb', borderRadius: '3px', cursor: 'pointer', background: '#c62828', color: 'white', fontWeight: 'bold' }}>✕</button>
                    )}
                    {loading && <span style={{ fontSize: '10px', color: '#ccc', marginLeft: 'auto' }}>...</span>}
                </div>

                <div style={{ background: '#004d40', padding: '4px 14px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#CCFF00' }}>
                        {trimestre}º TRIMESTRE {ano} — {mesesDoTrim.map(i => MESES_FULL[i]).join(' · ')}
                    </span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            <tr>
                                <th rowSpan={2} style={{ ...thBase, textAlign: 'center', minWidth: '40px', position: 'sticky', left: 0, zIndex: 6, borderRight: '2px solid #ccc', fontSize: '10px' }}>Dia</th>
                                {mesesDoTrim.map((mi, ci) => (
                                    <th key={ci} colSpan={5} style={{ ...thBase, textAlign: 'center', borderLeft: ci > 0 ? '2px solid #ccc' : 'none', fontSize: '10px' }}>
                                        {MESES_SHORT[mi]} / {ano}
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                {mesesDoTrim.map((mi, ci) => (
                                    <React.Fragment key={ci}>
                                        <th style={{ ...thBase, borderLeft: ci > 0 ? '2px solid #ccc' : 'none', background: '#bbdefb', color: '#1b5e20' }}>Entradas</th>
                                        <th style={{ ...thBase, background: '#bbdefb', color: '#b71c1c' }}>Saídas</th>
                                        <th style={{ ...thBase, background: '#bbdefb', color: '#0d47a1' }}>Saldo/Dia</th>
                                        <th style={{ ...thBase, background: '#004d40', color: '#ffffff', fontWeight: 'bold' }}>Previsão</th>
                                        <th style={{ ...thBase, background: '#004d40', color: '#CCFF00' }}>Saldo Total</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        {/* Linha de Saldo Anterior — carry-over de trimestres anteriores */}
                        {saldoInicial !== 0 && (
                            <tbody>
                                <tr style={{ background: '#e8f5e9', borderBottom: '2px solid #a5d6a7' }}>
                                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: '#1b5e20', position: 'sticky', left: 0, background: '#e8f5e9', borderRight: '2px solid #a5d6a7', fontSize: '9px', whiteSpace: 'nowrap' }}>Saldo Ant.</td>
                                    {[0, 1, 2].map(ci => (
                                        <React.Fragment key={ci}>
                                            <td colSpan={4} style={{ borderLeft: ci > 0 ? '2px solid #c8e6c9' : 'none' }} />
                                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: '700', color: saldoInicial > 0 ? '#1565c0' : '#c62828', background: '#dcedc8' }}>
                                                {fmt(Math.abs(saldoInicial))}<Badge sign={saldoInicial >= 0 ? 1 : -1} />
                                            </td>
                                        </React.Fragment>
                                    ))}
                                </tr>
                            </tbody>
                        )}
                        <tbody>
                            {Array.from({ length: 31 }, (_, di) => {
                                const hasData = diasComDados.has(di);
                                const bg = hasData ? (di % 2 === 0 ? '#fafafa' : 'white') : (di % 2 === 0 ? '#f5f5f5' : '#f9f9f9');

                                return (
                                    <tr key={di} style={{ background: bg }}>
                                        <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: hasData ? '#004d40' : '#aaa', position: 'sticky', left: 0, background: bg, borderRight: '2px solid #eee', fontSize: '11px' }}>
                                            {String(di + 1).padStart(2, '0')}
                                        </td>
                                        {[0, 1, 2].map(ci => {
                                            const { entradas, saidas } = matrix[ci][di];
                                            const saldo     = entradas - saidas;
                                            const stVal     = getSaldo(ci, di);
                                            const prevKey   = `${ci}-${di}`;
                                            const prevSaved = previsoes[prevKey];
                                            const past      = isPastCell(ci, di);
                                            const pastBg    = '#eeeeee';
                                            const pastColorPos = '#000000';
                                            const pastColorNeg = '#c62828';
                                            const pastColorNeu = '#bbb';

                                            return (
                                                <React.Fragment key={ci}>
                                                    <td style={{ padding: '3px 6px', textAlign: 'right', color: past ? (entradas > 0 ? pastColorPos : pastColorNeu) : (entradas > 0 ? '#2e7d32' : '#ccc'), background: past ? pastBg : 'transparent', borderLeft: ci > 0 ? '2px solid #f0f0f0' : 'none' }}>{fmt(entradas)}</td>
                                                    <td style={{ padding: '3px 6px', textAlign: 'right', color: past ? (saidas > 0 ? pastColorNeg : pastColorNeu) : (saidas > 0 ? '#c62828' : '#ccc'), background: past ? pastBg : 'transparent' }}>{fmt(saidas)}</td>
                                                    <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: '600', color: past ? (saldo > 0 ? pastColorPos : saldo < 0 ? pastColorNeg : pastColorNeu) : (saldo > 0 ? '#1565c0' : saldo < 0 ? '#c62828' : '#ccc'), background: past ? pastBg : 'transparent' }}>
                                                        {saldo !== 0 ? <>{fmt(Math.abs(saldo))}<Badge sign={saldo >= 0 ? 1 : -1} /></> : '—'}
                                                    </td>
                                                    {/* Coluna Previsão */}
                                                    <td style={{ padding: '2px 4px', background: past ? pastBg : (di % 2 === 0 ? '#f0f4ff' : '#e8eeff'), borderLeft: '1px solid #ffe0b2' }}
                                                        title={past ? 'Previsão somente para datas futuras' : undefined}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            <input
                                                                type="text"
                                                                value={prevInput[prevKey] || ''}
                                                                onChange={e => { if (!past) setPrevInput(prev => ({ ...prev, [prevKey]: e.target.value })); }}
                                                                onBlur={e => handlePrevCommit(ci, di, e.target.value)}
                                                                onKeyDown={e => { if (past) return; if (e.key === 'Enter') { e.target.blur(); } if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.value === '' && prevSaved) { setPrevisoes(p => { const n = {...p}; delete n[prevKey]; return n; }); setPrevInput(p => { const n = {...p}; delete n[prevKey]; return n; }); } }}
                                                                placeholder="—"
                                                                readOnly={past}
                                                                style={{ width: '70px', border: past ? '1px solid #ddd' : (prevSaved ? '1px solid #ff9800' : '1px solid #ffe0b2'), borderRadius: '3px', padding: '1px 4px', fontSize: '9px', textAlign: 'right', outline: 'none', background: 'transparent', color: past ? pastColorNeu : '#e65100', fontWeight: prevSaved ? '700' : '400', cursor: past ? 'not-allowed' : 'text' }}
                                                            />
                                                            {prevSaved && prevSaved.parcelas > 1 && (
                                                                <span style={{ fontSize: '8px', color: '#ff9800', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{prevSaved.parcelas}x</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* Saldo Total — carry-over sempre visível */}
                                                    <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: '700', color: past ? (stVal > 0 ? pastColorPos : stVal < 0 ? pastColorNeg : pastColorNeu) : (stVal > 0 ? '#1565c0' : stVal < 0 ? '#c62828' : '#ccc'), background: past ? pastBg : (di % 2 === 0 ? '#f0f4ff' : '#e8eeff'), opacity: past ? 1 : ((entradas === 0 && saidas === 0 && !prevSaved) ? 0.45 : 1) }}>
                                                        {stVal !== 0 ? <>{fmt(Math.abs(stVal))}<Badge sign={stVal >= 0 ? 1 : -1} /></> : '—'}
                                                    </td>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#89962F', fontWeight: '700', position: 'sticky', bottom: 0 }}>
                                <td style={{ padding: '6px 8px', color: '#fff', textAlign: 'center', position: 'sticky', left: 0, background: '#89962F', borderRight: '2px solid #ccc', fontSize: '10px' }}>TOTAL</td>
                                {[0, 1, 2].map(ci => {
                                    const { entradas, saidas } = totaisMes[ci];
                                    const saldo = entradas - saidas;
                                    const saldoFinalMes = lastSaldoPorMes[ci];
                                    return (
                                        <React.Fragment key={ci}>
                                            <td style={{ padding: '6px 6px', textAlign: 'right', color: '#fff', borderLeft: ci > 0 ? '2px solid #ccc' : 'none' }}>{fmt(entradas)}</td>
                                            <td style={{ padding: '6px 6px', textAlign: 'right', color: '#fff' }}>{fmt(saidas)}</td>
                                            <td style={{ padding: '6px 6px', textAlign: 'right', color: '#CCFF00', fontWeight: 'bold' }}>
                                                {saldo !== 0 ? <>{fmt(Math.abs(saldo))}<Badge sign={saldo >= 0 ? 1 : -1} /></> : '—'}
                                            </td>
                                            <td style={{ padding: '6px 6px', background: '#7a5000', color: '#ffe0b2', textAlign: 'center', fontSize: '9px' }}>—</td>
                                            <td style={{ padding: '6px 6px', textAlign: 'right', color: '#CCFF00', fontWeight: 'bold', background: '#004d40' }}>
                                                {saldoFinalMes !== null && saldoFinalMes !== undefined ? <>{fmt(Math.abs(saldoFinalMes))}<Badge sign={saldoFinalMes >= 0 ? 1 : -1} /></> : '—'}
                                            </td>
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <ParcelasPopup
                pending={prevPending}
                onConfirm={confirmPrev}
                onCancel={cancelPrev}
            />
            </ReportPDF>
        </MainLayout>
    );
};

export default FinancialBalance;
