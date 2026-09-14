import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

// Chave usada para guardar o estado deste modal na sessionStorage enquanto o
// usuário vai cadastrar um fornecedor novo em outra tela, e retomar exatamente
// de onde parou ao voltar (ver handleGoRegisterBeneficiary / Transactions.jsx).
export const NEW_TX_RESUME_KEY = 'agilis_new_tx_resume';

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

// Vencimento padrão de fatura de Cartão de Crédito: emissão até o dia de
// fechamento cai na fatura do mês seguinte; após o fechamento, cai na fatura
// do segundo mês subsequente. Mesma regra usada no formulário de lançamentos.
const calculateDueDate = (emissionDateStr, acc) => {
    const type = (acc?.account_type || '').toLowerCase();
    const isCC = type.includes('crédito') || type.includes('credito');
    if (!isCC || !acc?.closing_day || !acc?.due_day) return emissionDateStr;

    const [year, month, day] = emissionDateStr.split('-').map(Number);
    const closingDay = Number(acc.closing_day);
    const dueDay = Number(acc.due_day);

    let targetMonth = month - 1; // 0-indexed
    targetMonth += day <= closingDay ? 1 : 2;

    const targetDate = new Date(year, targetMonth, dueDay);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const CALC_KEYS = [
    ['7', '8', '9', '/'],
    ['4', '5', '6', '*'],
    ['1', '2', '3', '-'],
    ['0', ',', '⌫', '+'],
    ['C', '', '=', ''],
];

const EMPTY = {
    amount: '',
    dc_type: 'D',       // 'D' Saída | 'C' Entrada | 'T' Transferência
    type: 'Expense',
    installments: '1',
    firstDueDate: todayISO(),
    beneficiary: null,      // { id, name } | { id: null, name: <novo> }
    costCenterItems: [],    // [{ id, full_code, description, amount }]
    chartAccount: null,
    destinoAccount: null,
    description: '',
};

const SpeechRecognitionAPI =
    typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

// Monta a sequência de passos de acordo com o tipo de lançamento:
// - Transferência: fluxo curto (Valor → Tipo → Conta destino → Conferência).
// - Saída/Entrada: fluxo completo; Parcelas só entra se a conta for de
//   Cartão de Crédito (parcelamento só faz sentido nesse tipo de conta).
function buildSteps(dcType, isCreditCard) {
    if (dcType === 'T') return ['amount', 'flowType', 'destinoAccount', 'review'];
    const steps = ['amount', 'flowType'];
    if (isCreditCard) steps.push('installments');
    steps.push('beneficiary', 'costCenter', 'chartAccount', 'description', 'review');
    return steps;
}

// Mesma sequência de campos do Agilis Mobile (Digitação): Valor, Tipo,
// Parcelas (com vencimento/parcelamento se >1, só em Cartão de Crédito),
// Fornecedor, Centro de Custos (com rateio), Plano de Contas, Conferência.
// A Conta de origem já vem fixada (a página atual).
export default function NewTransactionModal({ account, onClose, onCreated, resumeState }) {
    const isCreditCard = (account?.account_type || '').toLowerCase().includes('cart');
    const navigate = useNavigate();

    const [stepIndex, setStepIndex] = useState(() => resumeState?.stepIndex ?? 0);
    const [values, setValues] = useState(() => resumeState?.values ?? EMPTY);
    const [showInstallmentDetail, setShowInstallmentDetail] = useState(false);
    // Nome do fornecedor que o usuário acabou de cadastrar em outra tela —
    // assim que a lista de fornecedores recarregar, seleciona automaticamente.
    const pendingBeneficiaryNameRef = useRef(resumeState?.pendingBeneficiaryName || null);
    // Idem para Centro de Custos — pendingCostCenterForRateio diz se o item
    // deve entrar como o primeiro CC ou como mais uma linha de rateio.
    const pendingCostCenterNameRef = useRef(resumeState?.pendingCostCenterName || null);
    const pendingCostCenterForRateioRef = useRef(!!resumeState?.pendingCostCenterForRateio);
    const [saving, setSaving] = useState(false);
    // calcTarget: null | 'amount' | { cc: idx } — identifica onde o resultado
    // da calculadora deve ser escrito (Valor geral ou o valor de um item de rateio).
    const [calcTarget, setCalcTarget] = useState(null);
    const [calcDisplay, setCalcDisplay] = useState('');

    const [beneficiaries, setBeneficiaries] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [chartAccounts, setChartAccounts] = useState([]);
    const [otherAccounts, setOtherAccounts] = useState([]);
    const [beneficiarySearch, setBeneficiarySearch] = useState(() => resumeState?.pendingBeneficiaryName || '');
    const [chartAccountSearch, setChartAccountSearch] = useState('');
    const [costCenterSearch, setCostCenterSearch] = useState(() => (!resumeState?.pendingCostCenterForRateio && resumeState?.pendingCostCenterName) || '');
    const [rateioCostCenterSearch, setRateioCostCenterSearch] = useState('');
    const [rateioPickerOpen, setRateioPickerOpen] = useState(false);
    const [listeningDescription, setListeningDescription] = useState(false);
    const descriptionRecognitionRef = useRef(null);

    const amountRef = useRef(null);
    const installmentsRef = useRef(null);
    const flowTypeFirstBtnRef = useRef(null);

    const STEPS = buildSteps(values.dc_type, isCreditCard);
    // Se o passo atual não existe mais na sequência recalculada (ex: trocou
    // de Saída para Transferência depois de já ter avançado), volta ao início.
    const step = STEPS[stepIndex] || STEPS[0];

    useEffect(() => {
        supabase.from('beneficiaries').select('id, name').order('name').then(({ data }) => setBeneficiaries(data || []));
        supabase.from('cost_centers').select('id, full_code, description').order('full_code').then(({ data }) => setCostCenters(data || []));
        supabase.from('chart_of_accounts').select('id, code, description').order('code').then(({ data }) => setChartAccounts(data || []));
        getSecurityContext().then(ctx => {
            if (!ctx?.family_id) return;
            supabase.from('accounts').select('id, name, account_type').eq('family_id', ctx.family_id).neq('id', account.id).order('name')
                .then(({ data }) => setOtherAccounts(data || []));
        });
        // Vencimento padrão já vem calculado (fatura do mês seguinte à emissão),
        // mesmo para 1 parcela só — o usuário pode ajustar se precisar. Ao
        // retomar depois de cadastrar fornecedor, o valor já digitado antes fica.
        if (!resumeState) {
            setValues(v => ({ ...v, firstDueDate: calculateDueDate(todayISO(), account) }));
        }
    }, [account.id]);

    // Ao voltar do cadastro de Fornecedores, seleciona automaticamente o que
    // acabou de ser criado assim que a lista recarregar, e segue o fluxo.
    useEffect(() => {
        if (!pendingBeneficiaryNameRef.current || beneficiaries.length === 0) return;
        const match = beneficiaries.find(b => b.name.toLowerCase() === pendingBeneficiaryNameRef.current.trim().toLowerCase());
        if (match) {
            pendingBeneficiaryNameRef.current = null;
            setValues(v => ({ ...v, beneficiary: match }));
            advance();
        }
    }, [beneficiaries]);

    // Idem para Centro de Custos: entra como primeiro CC ou como mais uma
    // linha de rateio, conforme de onde o usuário saiu para cadastrar.
    useEffect(() => {
        if (!pendingCostCenterNameRef.current || costCenters.length === 0) return;
        const match = costCenters.find(cc => cc.description.toLowerCase() === pendingCostCenterNameRef.current.trim().toLowerCase());
        if (match) {
            const forRateio = pendingCostCenterForRateioRef.current;
            pendingCostCenterNameRef.current = null;
            pendingCostCenterForRateioRef.current = false;
            if (forRateio) pickRateioCostCenter(match); else pickFirstCostCenter(match);
        }
    }, [costCenters]);

    useEffect(() => {
        if (step === 'amount') setTimeout(() => amountRef.current?.focus(), 50);
        if (step === 'installments' && !showInstallmentDetail) setTimeout(() => installmentsRef.current?.focus(), 50);
        // Ao chegar no Tipo via Tab (a partir do Valor), foca o botão "Saída"
        // para permitir continuar navegando com Tab até Entrada/Transferência.
        if (step === 'flowType') setTimeout(() => flowTypeFirstBtnRef.current?.focus(), 50);
    }, [step, showInstallmentDetail]);

    // Pré-preenche a Descrição com o nome do fornecedor ao chegar nessa
    // etapa pela primeira vez — o usuário ainda pode ajustar antes de gravar.
    useEffect(() => {
        if (step === 'description' && !values.description && values.beneficiary?.name) {
            setValues(v => ({ ...v, description: v.beneficiary?.name || '' }));
        }
    }, [step]);

    const advance = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
    const goBack = () => setStepIndex(i => Math.max(i - 1, 0));

    const amountNumber = () => parseFloat(String(values.amount).replace(',', '.')) || 0;

    // Enter no campo Valor já assume Saída (o caso mais comum) e pula direto
    // o passo Tipo. Quem precisa de Entrada/Transferência usa Tab a partir
    // do campo Valor, que leva ao passo Tipo para escolher manualmente.
    const handleAmountSubmit = () => {
        const n = amountNumber();
        if (!n || n <= 0) return;
        setValues(v => ({ ...v, amount: n, dc_type: 'D', type: 'Expense' }));
        setStepIndex(i => Math.min(i + 2, STEPS.length - 1));
    };

    const handleAmountTab = (e) => {
        const n = amountNumber();
        if (!n || n <= 0) return;
        e.preventDefault();
        setValues(v => ({ ...v, amount: n }));
        advance();
    };

    // ── Calculadora (mesmo teclado/lógica usada no resto do app) ───────────
    const calcPress = (key) => {
        if (key === 'C') { setCalcDisplay(''); return; }
        if (key === '⌫') { setCalcDisplay(d => d.slice(0, -1)); return; }
        if (key === '=') {
            try {
                const safeExpr = calcDisplay.replace(/,/g, '.').replace(/[^0-9+\-*/.()]/g, '');
                // eslint-disable-next-line no-new-func
                const result = Function('"use strict"; return (' + safeExpr + ')')();
                const rounded = Math.round(result * 100) / 100;
                setCalcDisplay(String(rounded));
                if (calcTarget && typeof calcTarget === 'object') {
                    updateCcAmount(calcTarget.cc, rounded);
                } else {
                    setValues(v => ({ ...v, amount: rounded }));
                }
            } catch { /* ignora expressão inválida */ }
            return;
        }
        setCalcDisplay(d => d + key);
    };

    const handleInstallmentsSubmit = () => {
        const n = Math.max(1, Math.round(parseFloat(String(values.installments).replace(',', '.')) || 1));
        setValues(v => ({ ...v, installments: n }));
        // Sempre pede o vencimento (mesmo com 1 parcela só — normalmente é o
        // vencimento da fatura no mês subsequente à emissão, já pré-preenchido).
        setShowInstallmentDetail(true);
    };

    const filteredBeneficiaries = beneficiaries.filter(b =>
        b.name.toLowerCase().includes(beneficiarySearch.trim().toLowerCase())
    );
    const exactBeneficiaryMatch = beneficiaries.some(b => b.name.toLowerCase() === beneficiarySearch.trim().toLowerCase());

    // Guarda o lançamento em andamento e manda para o cadastro completo de
    // Fornecedores; ao voltar, o efeito acima seleciona o recém-criado e segue.
    const handleGoRegisterBeneficiary = () => {
        const name = beneficiarySearch.trim();
        if (!name) return;
        sessionStorage.setItem(NEW_TX_RESUME_KEY, JSON.stringify({
            accountId: account.id,
            stepIndex,
            values,
            pendingBeneficiaryName: name,
        }));
        navigate(`/beneficiaries?returnTo=/transactions/${account.id}&prefill=${encodeURIComponent(name)}`);
    };

    const filteredChartAccounts = chartAccounts.filter(coa => {
        const q = chartAccountSearch.trim().toLowerCase();
        if (!q) return true;
        return coa.description.toLowerCase().includes(q) || (coa.code || '').toLowerCase().includes(q);
    });

    const matchCostCenter = (cc, q) => cc.description.toLowerCase().includes(q) || (cc.full_code || '').toLowerCase().includes(q);
    const filteredCostCenters = costCenters.filter(cc => !costCenterSearch.trim() || matchCostCenter(cc, costCenterSearch.trim().toLowerCase()));
    const exactCostCenterMatch = costCenters.some(cc => cc.description.toLowerCase() === costCenterSearch.trim().toLowerCase());

    const availableRateioCostCenters = costCenters.filter(cc => !values.costCenterItems.some(it => it.id === cc.id));
    const filteredRateioCostCenters = availableRateioCostCenters.filter(cc => !rateioCostCenterSearch.trim() || matchCostCenter(cc, rateioCostCenterSearch.trim().toLowerCase()));
    const exactRateioCostCenterMatch = availableRateioCostCenters.some(cc => cc.description.toLowerCase() === rateioCostCenterSearch.trim().toLowerCase());

    // Guarda o lançamento em andamento e manda para o cadastro completo de
    // Centro de Custos; ao voltar, o efeito abaixo seleciona o recém-criado.
    const handleGoRegisterCostCenter = (forRateio) => {
        const name = (forRateio ? rateioCostCenterSearch : costCenterSearch).trim();
        if (!name) return;
        sessionStorage.setItem(NEW_TX_RESUME_KEY, JSON.stringify({
            accountId: account.id,
            stepIndex,
            values,
            pendingCostCenterName: name,
            pendingCostCenterForRateio: !!forRateio,
        }));
        navigate(`/cost-centers?returnTo=/transactions/${account.id}&prefill=${encodeURIComponent(name)}`);
    };

    const resolveBeneficiaryId = async () => {
        if (values.beneficiary?.id) return values.beneficiary.id;
        const name = (values.beneficiary?.name || '').trim();
        if (!name) return null;
        const { data: existing } = await supabase.from('beneficiaries').select('id').ilike('name', name).maybeSingle();
        if (existing?.id) return existing.id;
        const { data: created } = await supabase.from('beneficiaries').insert([{ name, level: 2 }]).select().single();
        return created?.id || null;
    };

    // ── Centro de Custos / Rateio ───────────────────────────────────────────
    const ccAllocated = values.costCenterItems.reduce((s, it) => s + Number(it.amount || 0), 0);
    const ccRemaining = Math.round((amountNumber() - ccAllocated) * 100) / 100;

    const pickFirstCostCenter = (cc) => {
        setValues(v => ({ ...v, costCenterItems: [{ ...cc, amount: amountNumber() }] }));
    };
    const pickRateioCostCenter = (cc) => {
        setValues(v => ({ ...v, costCenterItems: [...v.costCenterItems, { ...cc, amount: ccRemaining }] }));
        setRateioPickerOpen(false);
    };
    const updateCcAmount = (idx, amount) => {
        setValues(v => ({ ...v, costCenterItems: v.costCenterItems.map((it, i) => i === idx ? { ...it, amount } : it) }));
    };
    const removeCcItem = (idx) => {
        setValues(v => ({ ...v, costCenterItems: v.costCenterItems.filter((_, i) => i !== idx) }));
    };

    const handleCcAdvance = () => {
        if (ccRemaining !== 0) { alert('O restante a alocar precisa ser R$ 0,00 antes de avançar.'); return; }
        advance();
    };

    const handleConfirm = async () => {
        if (values.dc_type !== 'T' && ccRemaining !== 0) {
            alert('O restante a alocar do Centro de Custos precisa ser R$ 0,00.');
            setStepIndex(STEPS.indexOf('costCenter'));
            return;
        }
        setSaving(true);
        try {
            const ctx = await getSecurityContext();
            const today = todayISO();

            // ── Transferência entre contas ──────────────────────────────────
            if (values.dc_type === 'T') {
                if (!values.destinoAccount) throw new Error('Selecione a conta de destino.');
                const rows = [
                    {
                        account_id: account.id,
                        emission_date: today,
                        due_date: today,
                        description: `Transferência (Transf.Conta ${values.destinoAccount.name})`,
                        amount: values.amount,
                        dc_type: 'D',
                        type: 'Expense',
                        user_id: ctx?.user_id ?? null,
                        family_id: ctx?.family_id ?? null,
                    },
                    {
                        account_id: values.destinoAccount.id,
                        emission_date: today,
                        due_date: today,
                        description: `Transferência (Transf.Conta ${account.name})`,
                        amount: values.amount,
                        dc_type: 'C',
                        type: 'Income',
                        user_id: ctx?.user_id ?? null,
                        family_id: ctx?.family_id ?? null,
                    },
                ];
                const { error } = await supabase.from('transactions').insert(rows);
                if (error) throw error;
                onCreated?.();
                onClose();
                return;
            }

            // ── Saída / Entrada ──────────────────────────────────────────────
            const beneficiaryId = await resolveBeneficiaryId();
            const n = Number(values.installments) || 1;
            const dueBase = values.firstDueDate || today;
            const singleCc = values.costCenterItems.length === 1 ? values.costCenterItems[0].id : null;

            const rows = [];
            for (let i = 0; i < n; i++) {
                rows.push({
                    account_id: account.id,
                    emission_date: today,
                    due_date: addMonths(dueBase, i),
                    description: n > 1 ? `${values.description || values.beneficiary?.name || ''} (${i + 1}/${n})` : (values.description || values.beneficiary?.name || ''),
                    amount: values.amount / n,
                    dc_type: values.dc_type,
                    type: values.type,
                    beneficiary_id: beneficiaryId,
                    cost_center_id: singleCc,
                    transaction_type_id: values.chartAccount?.id ?? null,
                    user_id: ctx?.user_id ?? null,
                    family_id: ctx?.family_id ?? null,
                });
            }
            const { data: inserted, error } = await supabase.from('transactions').insert(rows).select('id, amount');
            if (error) throw error;

            // Rateio (mais de um Centro de Custos): replica a mesma proporção
            // digitada em cada parcela gerada — mesmo modelo usado no resto do
            // app (transaction_items), com cost_center_id nulo na transação.
            if (values.costCenterItems.length > 1 && inserted?.length) {
                const total = values.amount;
                const proporcoes = values.costCenterItems.map(it => ({
                    cost_center_id: it.id,
                    description: it.full_code ? `${it.full_code} - ${it.description}` : it.description,
                    ratio: Number(it.amount || 0) / total,
                }));
                const itemRows = [];
                inserted.forEach(row => {
                    proporcoes.forEach(p => {
                        itemRows.push({
                            transaction_id: row.id,
                            cost_center_id: p.cost_center_id,
                            description: p.description,
                            amount: Math.round(row.amount * p.ratio * 100) / 100,
                        });
                    });
                });
                const { error: itemsError } = await supabase.from('transaction_items').insert(itemRows);
                if (itemsError) throw itemsError;
            }

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
                            {STEPS.slice(0, stepIndex).includes('amount') && <DoneRow label="Valor" value={fmtBRL(values.amount)} />}
                            {STEPS.slice(0, stepIndex).includes('flowType') && <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : values.dc_type === 'T' ? 'Transferência' : 'Saída'} />}
                            {STEPS.slice(0, stepIndex).includes('installments') && <DoneRow label="Parcelas" value={`${values.installments}x`} />}
                            {STEPS.slice(0, stepIndex).includes('destinoAccount') && <DoneRow label="Conta Destino" value={values.destinoAccount?.name || '—'} />}
                            {STEPS.slice(0, stepIndex).includes('beneficiary') && <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} />}
                            {STEPS.slice(0, stepIndex).includes('costCenter') && (
                                values.costCenterItems.length > 1 ? (
                                    <>
                                        <DoneRow label="Centro de Custos" value={`${values.costCenterItems.length} (rateio)`} onEdit={() => setStepIndex(STEPS.indexOf('costCenter'))} />
                                        {values.costCenterItems.map((it, idx) => (
                                            <DoneRow key={idx} label={`↳ ${it.description}`} value={fmtBRL(it.amount)} onEdit={() => setStepIndex(STEPS.indexOf('costCenter'))} />
                                        ))}
                                    </>
                                ) : (
                                    <DoneRow label="Centro de Custos" value={values.costCenterItems[0]?.description || '—'} onEdit={() => setStepIndex(STEPS.indexOf('costCenter'))} />
                                )
                            )}
                        </div>
                    )}

                    {step === 'amount' && (
                        <Field label="Valor (R$)">
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    ref={amountRef}
                                    style={ov.input}
                                    value={values.amount}
                                    onChange={e => setValues(v => ({ ...v, amount: e.target.value }))}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleAmountSubmit();
                                        else if (e.key === 'Tab' && !e.shiftKey) handleAmountTab(e);
                                    }}
                                    placeholder="0,00"
                                    inputMode="decimal"
                                />
                                <button
                                    type="button"
                                    title="Calculadora"
                                    onClick={() => { setCalcDisplay(String(values.amount || '')); setCalcTarget(t => t === 'amount' ? null : 'amount'); }}
                                    style={{ ...ov.calcToggleBtn, background: calcTarget === 'amount' ? '#0f172a' : '#f1f5f9', color: calcTarget === 'amount' ? '#f1f5f9' : '#334155' }}
                                >
                                    🧮
                                </button>
                            </div>

                            {calcTarget === 'amount' && <CalcPanel display={calcDisplay} onPress={calcPress} />}

                            <button style={{ ...ov.primaryBtn, marginTop: 12, width: '100%' }} onClick={handleAmountSubmit}>Avançar</button>
                        </Field>
                    )}

                    {step === 'flowType' && (
                        <Field label="Tipo de Lançamento">
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    ref={flowTypeFirstBtnRef}
                                    style={{ ...ov.flowBtn, background: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' }}
                                    onClick={() => { setValues(v => ({ ...v, dc_type: 'D', type: 'Expense' })); advance(); }}
                                >↓ Saída</button>
                                <button
                                    style={{ ...ov.flowBtn, background: 'rgba(34,197,94,0.1)', borderColor: '#22c55e' }}
                                    onClick={() => { setValues(v => ({ ...v, dc_type: 'C', type: 'Income' })); advance(); }}
                                >↑ Entrada</button>
                                <button
                                    style={{ ...ov.flowBtn, background: 'rgba(21,101,192,0.1)', borderColor: '#1565c0' }}
                                    onClick={() => { setValues(v => ({ ...v, dc_type: 'T', type: 'Transfer' })); setStepIndex(2); }}
                                >⇄ Transferência</button>
                            </div>
                        </Field>
                    )}

                    {step === 'destinoAccount' && (
                        <Field label="Conta de Destino">
                            <div style={ov.pickList}>
                                {otherAccounts.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#888' }}>Nenhuma outra conta cadastrada.</div>}
                                {otherAccounts.map(acc => (
                                    <div key={acc.id} style={ov.pickRow} onClick={() => { setValues(v => ({ ...v, destinoAccount: acc })); advance(); }}>
                                        <strong>{acc.name}</strong>
                                        <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>{acc.account_type}</span>
                                    </div>
                                ))}
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
                            <button style={{ ...ov.primaryBtn, marginTop: 12, width: '100%' }} onClick={handleInstallmentsSubmit}>Avançar</button>
                        </Field>
                    )}

                    {step === 'installments' && showInstallmentDetail && (
                        <form onSubmit={e => { e.preventDefault(); setShowInstallmentDetail(false); advance(); }}>
                            <Field label={Number(values.installments) > 1 ? 'Vencimento da 1ª Parcela' : 'Vencimento'}>
                                <input
                                    type="date"
                                    style={ov.input}
                                    value={values.firstDueDate}
                                    onChange={e => setValues(v => ({ ...v, firstDueDate: e.target.value }))}
                                />
                            </Field>
                            {Number(values.installments) > 1 && (
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
                            )}
                            <button type="submit" style={ov.primaryBtn}>Continuar</button>
                        </form>
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
                                    <NotFoundLink label="Esse fornecedor ainda não está no cadastro." onClick={handleGoRegisterBeneficiary} />
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
                            {values.costCenterItems.length === 0 ? (
                                <>
                                    <input
                                        style={ov.input}
                                        value={costCenterSearch}
                                        onChange={e => setCostCenterSearch(e.target.value)}
                                        placeholder="Buscar centro de custos..."
                                        autoFocus
                                    />
                                    <div style={ov.pickList}>
                                        {costCenterSearch.trim() && !exactCostCenterMatch && (
                                            <NotFoundLink label="Esse centro de custos ainda não está no cadastro." onClick={() => handleGoRegisterCostCenter(false)} />
                                        )}
                                        {filteredCostCenters.map(cc => (
                                            <div key={cc.id} style={ov.pickRow} onClick={() => pickFirstCostCenter(cc)}>
                                                {cc.full_code ? `${cc.full_code} - ` : ''}{cc.description}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={ov.installmentList}>
                                        {values.costCenterItems.map((it, idx) => (
                                            <React.Fragment key={idx}>
                                                <div style={{ ...ov.installmentRow, alignItems: 'center' }}>
                                                    <span style={{ flex: 1 }}>{it.full_code ? `${it.full_code} - ` : ''}{it.description}</span>
                                                    <input
                                                        style={ov.ccAmountInput}
                                                        value={it.amount}
                                                        onChange={e => updateCcAmount(idx, e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && handleCcAdvance()}
                                                        inputMode="decimal"
                                                    />
                                                    <button
                                                        type="button"
                                                        title="Calculadora"
                                                        onClick={() => { setCalcDisplay(String(it.amount || '')); setCalcTarget(t => (t && t.cc === idx) ? null : { cc: idx }); }}
                                                        style={{ ...ov.calcToggleBtnSmall, background: calcTarget?.cc === idx ? '#0f172a' : '#f1f5f9', color: calcTarget?.cc === idx ? '#f1f5f9' : '#334155' }}
                                                    >
                                                        🧮
                                                    </button>
                                                    {values.costCenterItems.length > 1 && (
                                                        <button type="button" onClick={() => removeCcItem(idx)} style={ov.removeBtn}>✕</button>
                                                    )}
                                                </div>
                                                {calcTarget?.cc === idx && <CalcPanel display={calcDisplay} onPress={calcPress} />}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px', fontSize: 12, color: ccRemaining === 0 ? '#2e7d32' : '#e65100', fontWeight: 'bold' }}>
                                        <span>Restante a alocar</span>
                                        <span>{fmtBRL(ccRemaining)}</span>
                                    </div>

                                    {!rateioPickerOpen ? (
                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            <button type="button" style={ov.secondaryBtn} onClick={() => setRateioPickerOpen(true)}>↗ Rateio</button>
                                            <button
                                                style={{ ...ov.primaryBtn, opacity: ccRemaining !== 0 ? 0.4 : 1 }}
                                                onClick={handleCcAdvance}
                                            >Avançar</button>
                                        </div>
                                    ) : (
                                        <>
                                            {/* "Tela de rateio" fica aberta logo abaixo, dentro do próprio modal */}
                                            <div style={ov.rateioPanel}>
                                                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#1565c0', marginBottom: 6 }}>
                                                    SELECIONE OUTRO CENTRO DE CUSTOS PARA RATEAR
                                                </div>
                                                <input
                                                    style={ov.input}
                                                    value={rateioCostCenterSearch}
                                                    onChange={e => setRateioCostCenterSearch(e.target.value)}
                                                    placeholder="Buscar centro de custos..."
                                                    autoFocus
                                                />
                                                <div style={ov.pickList}>
                                                    {rateioCostCenterSearch.trim() && !exactRateioCostCenterMatch && (
                                                        <NotFoundLink label="Esse centro de custos ainda não está no cadastro." onClick={() => handleGoRegisterCostCenter(true)} />
                                                    )}
                                                    {filteredRateioCostCenters.map(cc => (
                                                        <div key={cc.id} style={ov.pickRow} onClick={() => pickRateioCostCenter(cc)}>
                                                            {cc.full_code ? `${cc.full_code} - ` : ''}{cc.description}
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" style={{ ...ov.secondaryBtn, marginTop: 8, width: '100%' }} onClick={() => setRateioPickerOpen(false)}>Fechar</button>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </Field>
                    )}

                    {step === 'chartAccount' && (
                        <Field label="Plano de Contas">
                            <input
                                style={ov.input}
                                value={chartAccountSearch}
                                onChange={e => setChartAccountSearch(e.target.value)}
                                placeholder="Buscar plano de contas..."
                                autoFocus
                            />
                            <div style={ov.pickList}>
                                {filteredChartAccounts.map(coa => (
                                    <div key={coa.id} style={ov.pickRow} onClick={() => { setValues(v => ({ ...v, chartAccount: coa })); advance(); }}>
                                        {coa.code ? `${coa.code} - ` : ''}{coa.description}
                                    </div>
                                ))}
                                {filteredChartAccounts.length === 0 && (
                                    <div style={{ padding: 12, fontSize: 12, color: '#888' }}>Nenhum resultado encontrado.</div>
                                )}
                            </div>
                        </Field>
                    )}

                    {step === 'description' && (
                        <Field label="Descrição do Lançamento">
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    style={ov.input}
                                    value={values.description}
                                    onChange={(e) => setValues(v => ({ ...v, description: e.target.value }))}
                                    placeholder="Ex.: Compra de material de escritório"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter') advance(); }}
                                />
                                <button
                                    type="button"
                                    title="Ditar por voz"
                                    disabled={listeningDescription}
                                    onClick={() => {
                                        if (!SpeechRecognitionAPI) { alert('Reconhecimento de voz não disponível neste navegador.'); return; }
                                        const recognition = new SpeechRecognitionAPI();
                                        recognition.lang = 'pt-BR';
                                        recognition.continuous = false;
                                        recognition.interimResults = false;
                                        recognition.onresult = (event) => {
                                            const text = event.results[0]?.[0]?.transcript || '';
                                            if (text) setValues(v => ({ ...v, description: text }));
                                        };
                                        recognition.onend = () => setListeningDescription(false);
                                        recognition.onerror = () => setListeningDescription(false);
                                        descriptionRecognitionRef.current = recognition;
                                        recognition.start();
                                        setListeningDescription(true);
                                    }}
                                    style={{ ...ov.calcToggleBtn, background: listeningDescription ? '#CCFF00' : '#f1f5f9', color: '#334155' }}
                                >🎤</button>
                            </div>
                            <button style={{ ...ov.primaryBtn, marginTop: 12, width: '100%' }} onClick={advance}>Avançar</button>
                        </Field>
                    )}

                    {step === 'review' && (
                        <>
                            <Field label="Conferência (clique em um campo para editar)">
                                <DoneRow label="Data" value={fmtDateBR(todayISO())} />
                                <DoneRow label="Valor" value={fmtBRL(values.amount)} onEdit={() => setStepIndex(STEPS.indexOf('amount'))} />
                                <DoneRow label="Tipo" value={values.dc_type === 'C' ? 'Entrada' : values.dc_type === 'T' ? 'Transferência' : 'Saída'} onEdit={() => setStepIndex(STEPS.indexOf('flowType'))} />
                                {values.dc_type === 'T' ? (
                                    <>
                                        <DoneRow label="Conta Origem" value={account.name} />
                                        <DoneRow label="Conta Destino" value={values.destinoAccount?.name || '—'} onEdit={() => setStepIndex(STEPS.indexOf('destinoAccount'))} />
                                    </>
                                ) : (
                                    <>
                                        <DoneRow label="Parcelas" value={`${values.installments}x`} onEdit={() => { setShowInstallmentDetail(false); setStepIndex(STEPS.indexOf('installments')); }} />
                                        <DoneRow label={Number(values.installments) > 1 ? '1º Vencimento' : 'Vencimento'} value={fmtDateBR(values.firstDueDate)} onEdit={() => { setShowInstallmentDetail(true); setStepIndex(STEPS.indexOf('installments')); }} />
                                        <DoneRow label="Conta" value={account.name} />
                                        <DoneRow label="Fornecedor" value={values.beneficiary?.name || '—'} onEdit={() => setStepIndex(STEPS.indexOf('beneficiary'))} />
                                        {values.costCenterItems.length <= 1 ? (
                                            <DoneRow label="Centro de Custos" value={values.costCenterItems[0]?.description || '—'} onEdit={() => setStepIndex(STEPS.indexOf('costCenter'))} />
                                        ) : (
                                            values.costCenterItems.map((it, idx) => (
                                                <DoneRow key={idx} label={`↳ ${it.description}`} value={fmtBRL(it.amount)} onEdit={() => setStepIndex(STEPS.indexOf('costCenter'))} />
                                            ))
                                        )}
                                        <DoneRow label="Plano de Contas" value={values.chartAccount?.description || '—'} onEdit={() => setStepIndex(STEPS.indexOf('chartAccount'))} />
                                        <DoneRow label="Descrição" value={values.description || '—'} onEdit={() => setStepIndex(STEPS.indexOf('description'))} />
                                    </>
                                )}
                            </Field>
                            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <button style={ov.secondaryBtn} onClick={goBack} disabled={saving}>‹ Voltar e Editar</button>
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

function NotFoundLink({ label, onClick }) {
    return (
        <div style={{ padding: '12px 14px', background: '#fff8e1', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#795548', marginBottom: 6 }}>{label}</div>
            <button
                type="button"
                onClick={onClick}
                style={{ background: 'none', border: 'none', padding: 0, color: '#1565c0', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
                📋 Clique aqui para cadastrar agora
            </button>
        </div>
    );
}

function CalcPanel({ display, onPress }) {
    const boxRef = useRef(null);

    // Foca a calculadora ao abrir, para o teclado físico funcionar direto,
    // sem precisar clicar em nenhum botão primeiro.
    useEffect(() => { boxRef.current?.focus(); }, []);

    const handleKeyDown = (e) => {
        const key = e.key;
        if (key >= '0' && key <= '9') { e.preventDefault(); onPress(key); return; }
        if (key === '.' || key === ',') { e.preventDefault(); onPress(','); return; }
        if (['+', '-', '*', '/'].includes(key)) { e.preventDefault(); onPress(key); return; }
        if (key === 'Backspace') { e.preventDefault(); onPress('⌫'); return; }
        if (key === 'Enter' || key === '=') { e.preventDefault(); onPress('='); return; }
        if (key === 'Escape' || key.toLowerCase() === 'c') { e.preventDefault(); onPress('C'); return; }
    };

    return (
        <div ref={boxRef} style={ov.calcBox} tabIndex={0} onKeyDown={handleKeyDown}>
            <div style={ov.calcDisplay}>{display || '0'}</div>
            {CALC_KEYS.map((row, ri) => (
                <div key={ri} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {row.map((k, ki) => k === '' ? (
                        <div key={ki} style={{ flex: 1 }} />
                    ) : k === '=' ? (
                        <button key={ki} type="button" onClick={() => onPress(k)} style={{ ...ov.calcKey, flex: 2, background: '#16a34a', color: '#fff' }}>✓</button>
                    ) : (
                        <button key={ki} type="button" onClick={() => onPress(k)} style={{ ...ov.calcKey, background: ['C', '⌫', '/', '*', '-', '+'].includes(k) ? '#475569' : '#334155', color: k === 'C' ? '#fca5a5' : '#f1f5f9' }}>{k}</button>
                    ))}
                </div>
            ))}
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

function DoneRow({ label, value, onEdit }) {
    return (
        <div
            onClick={onEdit}
            style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px',
                borderBottom: '1px solid #eee', fontSize: 13,
                cursor: onEdit ? 'pointer' : 'default', borderRadius: 4,
            }}
            onMouseEnter={e => { if (onEdit) e.currentTarget.style.background = '#f5f5f5'; }}
            onMouseLeave={e => { if (onEdit) e.currentTarget.style.background = 'transparent'; }}
        >
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 'bold', color: '#222' }}>{value}</span>
                {onEdit && <span style={{ color: '#1565c0', fontSize: 12 }}>✎</span>}
            </span>
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
    input: { flex: 1, width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 15, boxSizing: 'border-box' },
    flowBtn: { flex: 1, padding: '16px 8px', borderRadius: 8, border: '1px solid', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 },
    primaryBtn: { flex: 1, background: '#CCFF00', color: '#0f172a', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 },
    secondaryBtn: { flex: 1, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 },
    pickList: { maxHeight: 260, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, marginTop: 8 },
    pickRow: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', fontSize: 13 },
    installmentList: { border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' },
    installmentRow: { display: 'flex', padding: '8px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 13, gap: 8 },
    ccAmountInput: { width: 90, padding: '4px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, textAlign: 'right' },
    removeBtn: { background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' },
    rateioPanel: { marginTop: 10, padding: 10, background: '#e3f2fd', borderRadius: 8, border: '1px solid #90caf9' },
    calcToggleBtn: { width: 44, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 18, cursor: 'pointer' },
    calcToggleBtnSmall: { width: 26, height: 26, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, cursor: 'pointer', flexShrink: 0 },
    calcBox: { marginTop: 8, background: '#1e293b', borderRadius: 8, padding: 10, outline: 'none' },
    calcDisplay: { background: '#0f172a', borderRadius: 4, padding: '6px 10px', marginBottom: 8, textAlign: 'right', fontSize: 18, fontWeight: 'bold', color: '#f1f5f9', minHeight: 32, letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    calcKey: { flex: 1, padding: '9px 0', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
};
