import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayISO = () => new Date().toISOString().split('T')[0];
const addMonths = (iso, n) => {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().split('T')[0];
};
const fmtDateBR = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const STEPS = ['amount', 'flowType', 'installments', 'beneficiary', 'costCenter', 'chartAccount', 'review'];

const EMPTY = {
    amount: '',
    dc_type: 'D',
    type: 'Expense',
    installments: '1',
    firstDueDate: todayISO(),
    beneficiary: null, // { id, name } | { id: null, name: <novo> }
    costCenter: null,
    chartAccount: null,
};

// Mesma sequência de campos do Agilis Mobile (Digitação): Valor, Tipo,
// Parcelas (com vencimento/parcelamento se >1), Fornecedor, Centro de
// Custos, Plano de Contas, Conferência. A Conta já vem fixada (a página
// atual), por isso não entra como passo aqui.
export default function NewTransactionModal({ account, onClose, onCreated }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [values, setValues] = useState(EMPTY);
    const [showInstallmentDetail, setShowInstallmentDetail] = useState(false);
    const [saving, setSaving] = useState(false);

    const [beneficiaries, setBeneficiaries] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [chartAccounts, setChartAccounts] = useState([]);
    const [beneficiarySearch, setBeneficiarySearch] = useState('');

    const amountRef = useRef(null);
    const installmentsRef = useRef(null);

    const step = STEPS[stepIndex];

    useEffect(() => {
        supabase.from('beneficiaries').select('id, name').order('name').then(({ data }) => setBeneficiaries(data || []));
        supabase.from('cost_centers').select('id, full_code, description').order('full_code').then(({ data }) => setCostCenters(data || []));
        supabase.from('chart_of_accounts').select('id, code, description').order('code').then(({ data }) => setChartAccounts(data || []));
    }, []);

    useEffect(() => {
        if (step === 'amount') setTimeout(() => amountRef.current?.focus(), 50);
        if (step === 'installments' && !showInstallmentDetail) setTimeout(() => installmentsRef.current?.focus(), 50);
    }, [step, showInstallmentDetail]);

    const advance = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
    const goBack = () => setStepIndex(i => Math.max(i - 1, 0));

    const handleAmountSubmit = () => {
        const n = parseFloat(String(values.amount).replace(',', '.'));
        if (!n || n <= 0) return;
        setValues(v => ({ ...v, amount: n }));
        advance();
    };

    const handleInstallmentsSubmit = () => {
        const n = Math.max(1, Math.round(parseFloat(String(values.installments).replace(',', '.')) || 1));
        setValues(v => ({ ...v, installments: n }));
        if (n > 1) {
            setValues(v => ({ ...v, firstDueDate: todayISO() }));
            setShowInstallmentDetail(true);
        } else {
            advance();
        }
    };

    const filteredBeneficiaries = beneficiaries.filter(b =>
        b.name.toLowerCase().includes(beneficiarySearch.trim().toLowerCase())
    );
    const exactBeneficiaryMatch = beneficiaries.some(b => b.name.toLowerCase() === beneficiarySearch.trim().toLowerCase());

    const resolveBeneficiaryId = async () => {
        if (values.beneficiary?.id) return values.beneficiary.id;
        const name = (values.beneficiary?.name || '').trim();
        if (!name) return null;
        const { data: existing } = await supabase.from('beneficiaries').select('id').ilike('name', name).maybeSingle();
        if (existing?.id) return existing.id;
        const { data: created } = await supabase.from('beneficiaries').insert([{ name, level: 2 }]).select().single();
        return created?.id || null;
    };

    const handleConfirm = async () => {
        setSaving(true);
        try {
            const ctx = await getSecurityContext();
            const beneficiaryId = await resolveBeneficiaryId();
            const n = Number(values.installments) || 1;
            const today = todayISO();
            const dueBase = n > 1 ? values.firstDueDate : today;
            const rows = [];
            for (let i = 0; i < n; i++) {
                rows.push({
                    account_id: account.id,
                    emission_date: today,
                    due_date: addMonths(dueBase, i),
                    description: n > 1 ? `${values.beneficiary?.name || ''} (${i + 1}/${n})` : (values.beneficiary?.name || ''),
                    amount: values.amount / n,
                    dc_type: values.dc_type,
                    type: values.type,
                    beneficiary_id: beneficiaryId,
                    cost_center_id: values.costCenter?.id ?? null,
                    transaction_type_id: values.chartAccount?.id ?? null,
                    user_id: ctx?.user_id ?? null,
                    family_id: ctx?.family_id ?? null,
                });
            }
            const { error } = await supabase.from('transactions').insert(rows);
            if (error) throw error;
            onCreated?.();
            onClose();
        } catch (err) {
            alert('Erro ao gravar lançamento: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={ov.backdrop} onClick={onClose}>
            <div style={ov.modal} onClick={e => e.stopPropagation()}>
                <div style={ov.header}>
                    <span>+ Novo Lançamento — {account.name}</span>
                    <button onClick={onClose} style={ov.closeBtn}>✕</button>
                </div>

                <div style={ov.body}>
                    {step !== 'review' && (
                        <div style={ov.doneList}>
                            {stepIndex > 0 && <DoneRow label="Valor" value={fmtBRL(values.amount)} />}
                            {stepIndex > 1 && <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : 'Saída'} />}
                            {stepIndex > 2 && <DoneRow label="Parcelas" value={`${values.installments}x`} />}
                            {stepIndex > 3 && <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} />}
                            {stepIndex > 4 && <DoneRow label="Centro de Custos" value={values.costCenter?.description || '—'} />}
                            {stepIndex > 5 && <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} />}
                        </div>
                    )}

                    {step === 'amount' && (
                        <Field label="Valor (R$)">
                            <input
                                ref={amountRef}
                                style={ov.input}
                                value={values.amount}
                                onChange={e => setValues(v => ({ ...v, amount: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleAmountSubmit()}
                                placeholder="0,00"
                                inputMode="decimal"
                            />
                        </Field>
                    )}

                    {step === 'flowType' && (
                        <Field label="Saída ou Entrada?">
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    style={{ ...ov.flowBtn, background: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' }}
                                    onClick={() => { setValues(v => ({ ...v, dc_type: 'D', type: 'Expense' })); advance(); }}
                                >↓ Saída</button>
                                <button
                                    style={{ ...ov.flowBtn, background: 'rgba(34,197,94,0.1)', borderColor: '#22c55e' }}
                                    onClick={() => { setValues(v => ({ ...v, dc_type: 'C', type: 'Income' })); advance(); }}
                                >↑ Entrada</button>
                            </div>
                        </Field>
                    )}

                    {step === 'installments' && !showInstallmentDetail && (
                        <Field label="Parcelas">
                            <input
                                ref={installmentsRef}
                                style={ov.input}
                                value={values.installments}
                                onChange={e => setValues(v => ({ ...v, installments: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleInstallmentsSubmit()}
                                inputMode="numeric"
                            />
                        </Field>
                    )}

                    {step === 'installments' && showInstallmentDetail && (
                        <>
                            <Field label="Vencimento da 1ª parcela">
                                <input
                                    type="date"
                                    style={ov.input}
                                    value={values.firstDueDate}
                                    onChange={e => setValues(v => ({ ...v, firstDueDate: e.target.value }))}
                                />
                            </Field>
                            <Field label="Parcelamento">
                                <div style={ov.installmentList}>
                                    {Array.from({ length: Number(values.installments) }, (_, i) => (
                                        <div key={i} style={ov.installmentRow}>
                                            <span style={{ color: '#89962F', fontWeight: 'bold', width: 50 }}>{i + 1}/{values.installments}</span>
                                            <span style={{ flex: 1 }}>{fmtDateBR(addMonths(values.firstDueDate, i))}</span>
                                            <span style={{ fontWeight: 'bold', color: '#00695c' }}>{fmtBRL(values.amount / values.installments)}</span>
                                        </div>
                                    ))}
                                </div>
                            </Field>
                            <button style={ov.primaryBtn} onClick={() => { setShowInstallmentDetail(false); advance(); }}>Continuar</button>
                        </>
                    )}

                    {step === 'beneficiary' && (
                        <Field label="Fornecedor">
                            <input
                                style={ov.input}
                                value={beneficiarySearch}
                                onChange={e => setBeneficiarySearch(e.target.value)}
                                placeholder="Buscar ou digitar novo fornecedor..."
                                autoFocus
                            />
                            <div style={ov.pickList}>
                                {beneficiarySearch.trim() && !exactBeneficiaryMatch && (
                                    <div
                                        style={{ ...ov.pickRow, background: 'rgba(204,255,0,0.08)' }}
                                        onClick={() => { setValues(v => ({ ...v, beneficiary: { id: null, name: beneficiarySearch.trim() } })); advance(); }}
                                    >
                                        + Usar "{beneficiarySearch.trim()}" (novo fornecedor)
                                    </div>
                                )}
                                {filteredBeneficiaries.slice(0, 50).map(b => (
                                    <div key={b.id} style={ov.pickRow} onClick={() => { setValues(v => ({ ...v, beneficiary: b })); advance(); }}>
                                        {b.name}
                                    </div>
                                ))}
                            </div>
                        </Field>
                    )}

                    {step === 'costCenter' && (
                        <Field label="Centro de Custos">
                            <div style={ov.pickList}>
                                {costCenters.map(cc => (
                                    <div key={cc.id} style={ov.pickRow} onClick={() => { setValues(v => ({ ...v, costCenter: cc })); advance(); }}>
                                        {cc.full_code ? `${cc.full_code} - ` : ''}{cc.description}
                                    </div>
                                ))}
                            </div>
                        </Field>
                    )}

                    {step === 'chartAccount' && (
                        <Field label="Plano de Contas">
                            <div style={ov.pickList}>
                                {chartAccounts.map(coa => (
                                    <div key={coa.id} style={ov.pickRow} onClick={() => { setValues(v => ({ ...v, chartAccount: coa })); advance(); }}>
                                        {coa.code ? `${coa.code} - ` : ''}{coa.description}
                                    </div>
                                ))}
                            </div>
                        </Field>
                    )}

                    {step === 'review' && (
                        <>
                            <Field label="Conferência">
                                <DoneRow label="Data" value={fmtDateBR(todayISO())} />
                                <DoneRow label="Valor" value={fmtBRL(values.amount)} />
                                <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : 'Saída'} />
                                <DoneRow label="Parcelas" value={`${values.installments}x`} />
                                {Number(values.installments) > 1 && <DoneRow label="1º Vencimento" value={fmtDateBR(values.firstDueDate)} />}
                                <DoneRow label="Conta" value={account.name} />
                                <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} />
                                <DoneRow label="Centro de Custos" value={values.costCenter?.description || '—'} />
                                <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} />
                            </Field>
                            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <button style={ov.secondaryBtn} onClick={goBack} disabled={saving}>‹ Voltar</button>
                                <button style={ov.primaryBtn} onClick={handleConfirm} disabled={saving}>
                                    {saving ? 'Gravando...' : 'Gravar'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#89962F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
            {children}
        </div>
    );
}

function DoneRow({ label, value }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{ fontWeight: 'bold', color: '#222' }}>{value}</span>
        </div>
    );
}

const ov = {
    backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    modal: { background: '#fff', borderRadius: 10, width: 420, maxWidth: '92vw', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' },
    header: { background: '#0d47a1', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: 13 },
    closeBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' },
    body: { padding: 20, overflowY: 'auto' },
    doneList: { marginBottom: 12 },
    input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 15, boxSizing: 'border-box' },
    flowBtn: { flex: 1, padding: '16px', borderRadius: 8, border: '1px solid', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 },
    primaryBtn: { flex: 1, background: '#CCFF00', color: '#0f172a', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 },
    secondaryBtn: { flex: 1, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 },
    pickList: { maxHeight: 260, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, marginTop: 8 },
    pickRow: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', fontSize: 13 },
    installmentList: { border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' },
    installmentRow: { display: 'flex', padding: '8px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 13 },
};
