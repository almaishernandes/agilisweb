import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from '../../components/MainLayout';
import ReportPDF from '../../components/ReportPDF';
import { supabase } from '../../lib/supabase';
import { getSecurityContext } from '../../lib/auth';

const fmt = (v) => v === 0 ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const TRIMESTRES = ['1º Trim', '2º Trim', '3º Trim', '4º Trim'];

// Propaga uma matriz bruta (por id) para pais, respeitando o modo completo/reduzido.
const buildDisplay = (baseAccounts, rawMap, numCols, isReduced, getCode) => {
    const propagate = (accounts, mat) => {
        const sorted = [...accounts].sort((a, b) => getCode(b).split('.').length - getCode(a).split('.').length);
        sorted.forEach(a => {
            const parts = getCode(a).split('.');
            if (parts.length <= 1) return;
            const parentCode = parts.slice(0, -1).join('.');
            const parent = accounts.find(p => getCode(p) === parentCode);
            if (!parent || !mat[parent.id]) return;
            (mat[a.id] || []).forEach((v, i) => { mat[parent.id][i] += v; });
        });
    };

    if (isReduced) {
        const codes = baseAccounts.map(a => getCode(a));
        const maxDepth = codes.length ? Math.max(...codes.map(c => c.split('.').length)) : 1;
        const display = baseAccounts.filter(a => getCode(a).split('.').length < maxDepth);
        const mat = {};
        display.forEach(a => { mat[a.id] = new Array(numCols).fill(0); });
        baseAccounts.forEach(a => {
            if (getCode(a).split('.').length !== maxDepth) return;
            (rawMap[a.id] || []).forEach((v, i) => {
                const parentCode = getCode(a).split('.').slice(0, -1).join('.');
                const parent = display.find(p => getCode(p) === parentCode);
                if (parent && mat[parent.id]) mat[parent.id][i] += v;
            });
        });
        propagate(display, mat);
        return { displayAccounts: display, displayMatrix: mat };
    }

    const mat = {};
    baseAccounts.forEach(a => { mat[a.id] = [...(rawMap[a.id] || new Array(numCols).fill(0))]; });
    propagate(baseAccounts, mat);
    return { displayAccounts: baseAccounts, displayMatrix: mat };
};

const PlanoContasReport = () => {
    const anoAtual = new Date().getFullYear();
    const [ano, setAno] = useState(anoAtual);
    const [periodo, setPeriodo] = useState('mensal');
    const [aba, setAba] = useState('coa');          // 'coa' | 'coa-r'
    const [chartOfAccounts, setChartOfAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [saldoAnteriorTx, setSaldoAnteriorTx] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getSecurityContext().then(ctx => {
            supabase.from('chart_of_accounts').select('id, code, description, level')
                .eq('family_id', ctx.family_id)
                .order('code')
                .then(({ data }) => setChartOfAccounts((data || []).filter(r => r.code?.trim() || r.description?.trim())));
        });
    }, []);

    useEffect(() => { fetchTransactions(); }, [ano]);

    const fetchTransactions = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('transactions')
            .select('due_date, amount, dc_type, transaction_type_id')
            .gte('due_date', `${ano}-01-01`)
            .lte('due_date', `${ano}-12-31`);
        setTransactions(data || []);

        const { data: anteriores } = await supabase
            .from('transactions')
            .select('amount, dc_type, transaction_type_id')
            .lt('due_date', `${ano}-01-01`);
        setSaldoAnteriorTx(anteriores || []);

        setLoading(false);
    };

    const colunas = useMemo(() => {
        if (periodo === 'mensal') return MESES.map((m, i) => ({ label: m, idx: i }));
        if (periodo === 'trimestral') return TRIMESTRES.map((t, i) => ({ label: t, idx: i }));
        return [{ label: String(ano), idx: 0 }];
    }, [periodo, ano]);

    const colIdx = (mesIdx) => {
        if (periodo === 'trimestral') return Math.floor(mesIdx / 3);
        if (periodo === 'anual') return 0;
        return mesIdx;
    };

    const isReduced = aba === 'coa-r';
    const idKey = 'transaction_type_id';
    const getCode = (a) => a.code || '';

    // Gera nós pai que não existem na tabela mas são implícitos pelos códigos filhos
    const baseAccounts = useMemo(() => {
        const existingCodes = new Set(chartOfAccounts.map(a => a.code?.trim()));
        const synthetic = [];
        chartOfAccounts.forEach(a => {
            const parts = (a.code || '').split('.');
            for (let i = 1; i < parts.length; i++) {
                const pCode = parts.slice(0, i).join('.');
                if (!existingCodes.has(pCode)) {
                    existingCodes.add(pCode);
                    synthetic.push({ id: `syn-${pCode}`, code: pCode, description: '', level: i - 1, _synthetic: true });
                }
            }
        });
        return [...chartOfAccounts, ...synthetic].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    }, [chartOfAccounts]);

    const fullMatrix = useMemo(() => {
        const map = {};
        baseAccounts.forEach(a => { map[a.id] = new Array(colunas.length).fill(0); });
        transactions.forEach(t => {
            const id = t[idKey];
            if (!map[id]) return;
            const mes = new Date(t.due_date + 'T12:00:00').getMonth();
            const ci = colIdx(mes);
            const val = Number(t.amount || 0);
            map[id][ci] += t.dc_type === 'C' ? val : -val;
        });
        return map;
    }, [transactions, baseAccounts, colunas, periodo]);

    const saldoAnteriorRaw = useMemo(() => {
        const map = {};
        baseAccounts.forEach(a => { map[a.id] = [0]; });
        saldoAnteriorTx.forEach(t => {
            const id = t[idKey];
            if (!map[id]) return;
            const val = Number(t.amount || 0);
            map[id][0] += t.dc_type === 'C' ? val : -val;
        });
        return map;
    }, [saldoAnteriorTx, baseAccounts]);

    const { displayAccounts, displayMatrix } = useMemo(
        () => buildDisplay(baseAccounts, fullMatrix, colunas.length, isReduced, getCode),
        [isReduced, baseAccounts, fullMatrix, colunas]
    );

    const { displayMatrix: saldoAnteriorMatrix } = useMemo(
        () => buildDisplay(baseAccounts, saldoAnteriorRaw, 1, isReduced, getCode),
        [isReduced, baseAccounts, saldoAnteriorRaw]
    );

    const getLevel = (a) => Math.max(0, getCode(a).split('.').length - 1);

    const visibleAccounts = useMemo(() => {
        return displayAccounts.filter(a =>
            getLevel(a) <= 2 || (displayMatrix[a.id] || []).some(v => v !== 0)
        );
    }, [displayAccounts, displayMatrix, isReduced]);

    const totais = useMemo(() => {
        const t = new Array(colunas.length).fill(0);
        visibleAccounts.forEach(a => { (displayMatrix[a.id] || []).forEach((v, i) => { t[i] += v; }); });
        return t;
    }, [displayMatrix, visibleAccounts, colunas]);

    const totalSaldoAnterior = useMemo(() => {
        return visibleAccounts.reduce((s, a) => s + ((saldoAnteriorMatrix[a.id] || [0])[0]), 0);
    }, [saldoAnteriorMatrix, visibleAccounts]);

    const leafSet = useMemo(() => {
        const parentCodes = new Set(
            baseAccounts.map(a => {
                const parts = getCode(a).split('.');
                return parts.length > 1 ? parts.slice(0, -1).join('.') : null;
            }).filter(Boolean)
        );
        return new Set(baseAccounts.filter(a => !parentCodes.has(getCode(a))).map(a => a.id));
    }, [baseAccounts]);

    const inp = { border: '1px solid #b2dfdb', borderRadius: '3px', padding: '0 6px', height: '36px', fontSize: '10px', outline: 'none', background: 'white' };

    const btnPeriodo = (v, l) => (
        <button key={v} onClick={() => setPeriodo(v)} style={{ flex: 1, padding: '0 8px', height: '36px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #b2dfdb', borderRadius: '3px', cursor: 'pointer', background: periodo === v ? '#00695c' : 'white', color: periodo === v ? 'white' : '#000000', whiteSpace: 'nowrap' }}>{l}</button>
    );

    const btnAba = (v, l) => (
        <button key={v} onClick={() => setAba(v)} style={{ flex: 1, padding: '0 10px', height: '36px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #b2dfdb', borderRadius: '3px', cursor: 'pointer', background: aba === v ? '#004d40' : 'white', color: aba === v ? 'white' : '#000000', whiteSpace: 'nowrap' }}>{l}</button>
    );

    const thS = { padding: '6px 8px', textAlign: 'right', color: '#000000', fontWeight: 'bold', borderBottom: '2px solid #e0e0e0', fontSize: '10px', whiteSpace: 'nowrap', background: '#CCFF00' };

    return (
        <MainLayout>
            <ReportPDF title={`Plano de Contas ${ano} — ${aba === 'coa' ? 'Completo' : 'Reduzido'}`}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>

                <div style={{ background: '#89962F', borderBottom: '2px solid #b2dfdb', padding: '5px 12px' }}>
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', color: '#e0e0e0' }}>...</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: '6px' }}>
                        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...inp, flex: 1, height: '36px' }}>
                            {[anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        {btnPeriodo('mensal', 'Mensal')}
                        {btnPeriodo('trimestral', 'Trimestral')}
                        {btnPeriodo('anual', 'Anual')}
                        {btnAba('coa', 'Completo')}
                        {btnAba('coa-r', 'Reduzido')}
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            <tr>
                                <th style={{ ...thS, textAlign: 'left', minWidth: '240px', position: 'sticky', left: 0, zIndex: 6 }}>Conta</th>
                                <th style={{ ...thS, color: '#004d40', borderRight: '2px solid #ccc' }}>Saldo Anterior</th>
                                {colunas.map(c => <th key={c.idx} style={thS}>{c.label}</th>)}
                                <th style={{ ...thS, color: '#004d40', borderLeft: '2px solid #ccc' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleAccounts.map((a, i) => {
                                const row = displayMatrix[a.id] || new Array(colunas.length).fill(0);
                                const total = row.reduce((s, v) => s + v, 0);
                                const saldoAnterior = (saldoAnteriorMatrix[a.id] || [0])[0];
                                const level = getLevel(a);
                                const isLeaf = leafSet.has(a.id);
                                const bg = isLeaf ? (i % 2 === 0 ? '#e8f5e9' : '#f1f8e9') : (i % 2 === 0 ? '#fafafa' : 'white');
                                const nameColor = isLeaf ? '#1b5e20' : (level === 0 ? '#004d40' : '#666');
                                const nameFw = isLeaf ? '700' : (level === 0 ? '700' : '400');
                                return (
                                    <tr key={a.id} style={{ background: bg }}>
                                        <td style={{ padding: '4px 8px', paddingLeft: `${8 + level * 12}px`, position: 'sticky', left: 0, background: bg, borderRight: '1px solid #eee', color: nameColor, fontWeight: nameFw, fontSize: '10px', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: isLeaf ? '#66bb6a' : '#aaa', marginRight: '5px' }}>{getCode(a)}</span>{a.description || ''}
                                        </td>
                                        <td style={{ padding: '4px 8px', textAlign: 'right', color: saldoAnterior === 0 ? '#ccc' : isLeaf ? (saldoAnterior < 0 ? '#c62828' : '#2e7d32') : nameColor, fontWeight: isLeaf ? '700' : (level === 0 ? '600' : '400'), borderRight: '2px solid #eee' }}>{fmt(saldoAnterior)}</td>
                                        {row.map((v, ci) => (
                                            <td key={ci} style={{ padding: '4px 8px', textAlign: 'right', color: v === 0 ? '#ccc' : isLeaf ? (v < 0 ? '#c62828' : '#2e7d32') : nameColor, fontWeight: isLeaf ? '700' : (level === 0 ? '600' : '400') }}>{fmt(v)}</td>
                                        ))}
                                        <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: '700', color: total > 0 ? '#1565c0' : total < 0 ? '#c62828' : '#ccc', borderLeft: '2px solid #eee' }}>
                                            {total === 0 ? '—' : <>{fmt(Math.abs(total))} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: total >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', verticalAlign: 'middle' }}>{total >= 0 ? 'C' : 'D'}</span></>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#89962F', fontWeight: '700', position: 'sticky', bottom: 0 }}>
                                <td style={{ padding: '6px 8px', position: 'sticky', left: 0, background: '#89962F', color: '#ffffff', borderRight: '1px solid #ccc', fontSize: '10px' }}>TOTAL GERAL</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#ffffff', borderRight: '2px solid #ccc' }}>
                                    {totalSaldoAnterior === 0 ? '—' : <>{fmt(Math.abs(totalSaldoAnterior))} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: totalSaldoAnterior >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', verticalAlign: 'middle' }}>{totalSaldoAnterior >= 0 ? 'C' : 'D'}</span></>}
                                </td>
                                {totais.map((v, ci) => (
                                    <td key={ci} style={{ padding: '6px 8px', textAlign: 'right', color: '#ffffff' }}>
                                        {v === 0 ? '—' : <>{fmt(Math.abs(v))} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: v >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', verticalAlign: 'middle' }}>{v >= 0 ? 'C' : 'D'}</span></>}
                                    </td>
                                ))}
                                {(() => { const tot = totais.reduce((s, v) => s + v, 0); return (
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#ffffff', borderLeft: '2px solid #ccc' }}>
                                        {tot === 0 ? '—' : <>{fmt(Math.abs(tot))} <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', background: tot >= 0 ? '#1b5e20' : '#c62828', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', verticalAlign: 'middle' }}>{tot >= 0 ? 'C' : 'D'}</span></>}
                                    </td>
                                ); })()}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            </ReportPDF>
        </MainLayout>
    );
};

export default PlanoContasReport;
