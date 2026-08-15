import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import { seedChartOfAccountsIfEmpty } from '../lib/seedChartOfAccounts';
import AdvancedDatePicker from '../components/AdvancedDatePicker';
import { X } from 'lucide-react';
import html2canvas from 'html2canvas';

const headerBtnStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '10px', fontWeight: 'bold', height: '36px', padding: '0 10px', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' };

const Transactions = () => {
    const { accountId } = useParams();
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [options, setOptions] = useState({
        vendors: [],
        vendorOptions: [],
        costCenters: [],
        chartOfAccounts: []
    });
    const [editingCell, setEditingCell] = useState(null);
    const [headerFormOpen, setHeaderFormOpen] = useState(false);
    const [editingRowId, setEditingRowId] = useState(null);
    const [sortField] = useState('due_date');
    const [selectedRowIds, setSelectedRowIds] = useState(new Set());
    const [filters, setFilters] = useState({ sequential_id: '', emission_date: '', due_date: '', description: '', debit: '', credit: '', beneficiary_id: '' });
    const inputRef = useRef(null);
    const headerDescRef = useRef(null);
    const rowFieldRefs = useRef({});
    const ROW_FIELD_ORDER = ['emission_date', 'due_date', 'description', 'debit', 'credit', 'beneficiary_id', 'cost_center_id', 'transaction_type_id', 'saldo'];
    const focusRowField = (key) => rowFieldRefs.current[key]?.focus();
    const handleRowTab = (fromKey) => (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const idx = ROW_FIELD_ORDER.indexOf(fromKey);
        const nextKey = e.shiftKey ? ROW_FIELD_ORDER[idx - 1] : ROW_FIELD_ORDER[idx + 1];
        if (nextKey) focusRowField(nextKey);
    };
    const newRowRef = useRef(null);
    const tableRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const savingIdsRef = useRef(new Set());

    const [beneficiaryModalOpen, setBeneficiaryModalOpen] = useState(false);
    const [activeRowId, setActiveRowId] = useState(null);
    const [installmentModal, setInstallmentModal] = useState(null);
    const [rateioModal, setRateioModal] = useState(null); // { savedId, totalAmount, field }
    const [rateioItemsMap, setRateioItemsMap] = useState({}); // { transactionId: [items] }
    const [expandedRateio, setExpandedRateio] = useState(new Set()); // IDs com sub-linhas visíveis
    const [extratoOpen, setExtratoOpen] = useState(false);
    const [securityContext, setSecurityContext] = useState({ user_id: null, family_id: null });
    const [calculator, setCalculator] = useState({ isOpen: false, rowId: null, field: null, display: '', expression: '', pos: {} });
    const [calcPos, setCalcPos] = useState({ x: window.innerWidth / 2 - 90, y: window.innerHeight / 2 - 160 });
    const calcDragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
    const confirmCalculatorRef = useRef(null);
    const calcInputRef = useRef(null);

    useEffect(() => {
        const init = async () => {
            const context = await getSecurityContext();
            setSecurityContext(context);
            await fetchOptions(context.family_id);
            await fetchAccounts();
        };
        init();
    }, []);

    useEffect(() => {
        if (accountId && accounts.length > 0) {
            const acc = accounts.find(a => a.id === accountId);
            if (acc) {
                setSelectedAccount(acc);
                fetchTransactions(acc);
            }
        } else if (!accountId) {
            setSelectedAccount(null);
            setTransactions([]);
        }
    }, [accountId, accounts]);

    const fetchAccounts = async () => {
        const { data: accountsData } = await supabase.from('accounts').select('*').order('name');
        if (!accountsData) return;

        // Fetch all transactions to calculate balances for the account picker
        const { data: transactionsData } = await supabase
            .from('transactions')
            .select('account_id, amount, dc_type, type, emission_date');

        const today = new Date().toISOString().split('T')[0];

        const calculatedAccounts = accountsData.map(acc => {
            const accTransactions = (transactionsData || []).filter(t => t.account_id === acc.id);
            let currentBalance = Number(acc.initial_balance || 0);
            let predictedBalance = Number(acc.initial_balance || 0);

            accTransactions.forEach(t => {
                const amount = Number(t.amount || 0);
                const isCredit = t.dc_type === 'C' || t.type === 'Income';
                const isDebit = t.dc_type === 'D' || t.type === 'Expense' || t.type === 'Deduction' || t.type === 'Dedução';

                if (isCredit) {
                    predictedBalance += amount;
                    if (t.emission_date <= today) {
                        currentBalance += amount;
                    }
                } else if (isDebit) {
                    predictedBalance -= amount;
                    if (t.emission_date <= today) {
                        currentBalance -= amount;
                    }
                }
            });

            return {
                ...acc,
                current_balance: currentBalance,
                predicted_balance: predictedBalance
            };
        });

        setAccounts(calculatedAccounts);
    };

    const fetchOptions = async (familyId) => {
        // Garante que o plano de contas da family do usuário existe antes de carregar
        const fid = familyId ?? securityContext.family_id;
        if (fid) {
            await seedChartOfAccountsIfEmpty(fid);
        }
        let coaQuery = supabase.from('chart_of_accounts').select('id, code, description').order('code');
        if (fid) coaQuery = coaQuery.eq('family_id', fid);

        const [v, cc, coa] = await Promise.all([
            supabase.from('beneficiaries').select('id, name, level, category, full_code').order('full_code'),
            supabase.from('cost_centers').select('id, full_code, description').order('full_code'),
            coaQuery
        ]);
        const allBeneficiaries = v.data || [];
        const numSort = (a, b) => {
            const pa = (a.full_code || '').split('.').map(s => s.padStart(4, '0')).join('.');
            const pb = (b.full_code || '').split('.').map(s => s.padStart(4, '0')).join('.');
            return pa.localeCompare(pb);
        };
        const level1List = allBeneficiaries
            .filter(b => b.level === 1)
            .sort(numSort);
        // Apenas fornecedores reais: level=2 ou full_code com ponto (ex: '2.01')
        const vendors = allBeneficiaries
            .filter(b => b.level === 2 || (b.level == null && (b.full_code || '').includes('.')))
            .sort(numSort)
            .map(b => ({ ...b, displayName: b.category ? `${b.category} › ${b.name}` : b.name }));

        // Monta opções agrupadas para o dropdown: cabeçalhos nível 1 + itens nível 2
        const vendorOptions = [];
        level1List.forEach(cat => {
            vendorOptions.push({ label: `${cat.full_code} - ${cat.name}`, isHeader: true });
            vendors
                .filter(b => (b.full_code || '').startsWith((cat.full_code || '') + '.'))
                .forEach(b => vendorOptions.push({ label: `${b.full_code} - ${b.name}`, value: b.displayName }));
        });
        // Fornecedores sem categoria pai definida
        vendors
            .filter(b => !level1List.some(cat => (b.full_code || '').startsWith((cat.full_code || '') + '.')))
            .forEach(b => vendorOptions.push({ label: b.name, value: b.displayName }));

        setOptions({
            vendors,
            vendorOptions,
            costCenters: (cc.data || []).filter(item => item.full_code?.trim() || item.description?.trim()).map(item => ({ ...item, displayName: `${item.full_code || ''} ${item.description || ''}`.trim() })),
            chartOfAccounts: (coa.data || []).filter(item => item.code?.trim() || item.description?.trim()).map(item => ({ ...item, displayName: `${item.code || ''} ${item.description || ''}`.trim() }))
        });
    };

    const fetchTransactions = async (account) => {
        setLoading(true);
        let query = supabase.from('transactions').select('*');
        
        if (account && account.id !== 'all') {
            query = query.eq('account_id', account.id);
        }

        const { data, error } = await query
            .order('emission_date', { ascending: true })
            .order('sequential_id', { ascending: true });

        if (error) {
            console.error('Error fetching transactions:', error);
        } else {
            // Calculate base initial balance
            let totalInitial = Number(account?.initial_balance || 0);

            let currentSaldo = totalInitial;
            const today = new Date().toISOString().split('T')[0];

            const enriched = (data || []).map(t => {
                const amount = Number(t.amount || 0);
                const isCredit = t.dc_type === 'C' || t.type === 'Income';
                const isDebit = t.dc_type === 'D' || t.type === 'Expense' || t.type === 'Deduction' || t.type === 'Dedução';

                if (isCredit) currentSaldo += amount;
                else if (isDebit) currentSaldo -= amount;

                // Map IDs to names for UI display
                const vendorObj = options.vendors.find(v => v.id === t.beneficiary_id);
                const vendorName = vendorObj
                    ? (vendorObj.full_code ? `${vendorObj.full_code} - ${vendorObj.name}` : vendorObj.name)
                    : '';
                const ccObj = options.costCenters.find(c => c.id === t.cost_center_id);
                const coaObj = options.chartOfAccounts.find(c => c.id === t.transaction_type_id);

                return {
                    ...t,
                    saldo: currentSaldo,
                    debit: t.dc_type === 'D' ? t.amount : 0,
                    credit: t.dc_type === 'C' ? t.amount : 0,
                    beneficiary_id: vendorName,
                    cost_center_id: ccObj ? ccObj.displayName : '',
                    transaction_type_id: coaObj ? coaObj.displayName : ''
                };
            });

            // Fetch rateio (CC allocation) items for all transactions
            const txIds = (data || []).map(t => t.id);
            if (txIds.length > 0) {
                const { data: items } = await supabase
                    .from('transaction_items')
                    .select('transaction_id, cost_center_id, amount, description')
                    .in('transaction_id', txIds)
                    .not('cost_center_id', 'is', null);
                const imap = {};
                (items || []).forEach(item => {
                    if (!imap[item.transaction_id]) imap[item.transaction_id] = [];
                    imap[item.transaction_id].push(item);
                });
                setRateioItemsMap(imap);
            } else {
                setRateioItemsMap({});
            }

            setTransactions([
                ...enriched,
                {
                    id: 'new',
                    sequential_id: '---',
                    emission_date: new Date().toISOString().split('T')[0],
                    due_date: calculateDueDate(new Date().toISOString().split('T')[0], account),
                    beneficiary_id: '',
                    description: '',
                    cost_center_id: '',
                    transaction_type_id: '',
                    debit: 0,
                    credit: 0,
                    saldo: currentSaldo,
                    isNew: true
                }
            ]);
        }
        setLoading(false);
    };

    const calculateDueDate = (emissionDateStr, account) => {
        if (!emissionDateStr) return emissionDateStr;
        const type = (account?.account_type || '').toLowerCase();
        const isCreditCard = type.includes('cr\u00e9dito') || type.includes('credito');

        if (!isCreditCard || !account.closing_day || !account.due_day) {
            return emissionDateStr;
        }

        const [year, month, day] = emissionDateStr.split('-').map(Number);
        const closingDay = Number(account.closing_day);
        const dueDay = Number(account.due_day);

        // Emissão até o fechamento → vencimento no mês seguinte
        // Emissão após o fechamento → vencimento no segundo mês subsequente
        let targetMonth = month - 1; // 0-indexed (mês atual)
        if (day <= closingDay) {
            targetMonth += 1; // mês seguinte
        } else {
            targetMonth += 2; // segundo mês subsequente
        }

        const targetDate = new Date(year, targetMonth, dueDay);
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, '0');
        const d = String(targetDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // View starts at the top of the report as requested
    useEffect(() => {
        if (tableRef.current) {
            tableRef.current.parentElement.scrollTop = 0;
        }
    }, [accountId]);

    // Sorted view: keep 'new' row always last
    const getDateGroupBackground = (date) => {
        if (!date) return 'transparent';
        const d = new Date(date + 'T12:00:00');
        const day = d.getDate();
        return (day % 2 !== 0) ? { background: '#89962F', color: '#ffffff', fontWeight: 'bold' } : { background: '#CCFF00', color: '#000000', fontWeight: 'bold' };
    };

    const { sortedTransactions, saldoAnterior } = useMemo(() => {
        let startLimit = null;
        if (filters.emission_date) {
            if (filters.emission_date.includes(':')) {
                startLimit = filters.emission_date.split(':')[0];
            } else {
                startLimit = filters.emission_date;
            }
        }

        const filteredLocal = transactions.filter(t => {
            if (t.isNew) return true;

            for (const field of ['emission_date', 'due_date']) {
                const val = filters[field];
                if (val) {
                    if (val.includes(':')) {
                        const [start, end] = val.split(':');
                        if (t[field] < start || t[field] > end) return false;
                    } else if (t[field] !== val) {
                        return false;
                    }
                }
            }

            if (filters.beneficiary_id && !t.beneficiary_id?.toLowerCase().includes(filters.beneficiary_id.toLowerCase())) return false;
            if (filters.sequential_id && !String(t.sequential_id || '').includes(filters.sequential_id.trim())) return false;
            if (filters.description && !t.description?.toLowerCase().includes(filters.description.toLowerCase())) return false;
            if (filters.debit && !Number(t.debit || 0).toFixed(2).replace('.', ',').includes(filters.debit.trim())) return false;
            if (filters.credit && !Number(t.credit || 0).toFixed(2).replace('.', ',').includes(filters.credit.trim())) return false;

            return true;
        });

        const existing = filteredLocal.filter(t => !t.isNew);
        const newRow = transactions.filter(t => t.isNew);
        
        const sorted = [...existing].sort((a, b) => {
            const va = a[sortField] || '';
            const vb = b[sortField] || '';
            if (va !== vb) return va < vb ? -1 : 1;
            return (a.sequential_id || 0) - (b.sequential_id || 0);
        });

        let runningSaldoAnterior = Number(selectedAccount?.initial_balance || 0);

        if (startLimit) {
            transactions.forEach(t => {
                if (t.isNew || t.isVirtual) return;
                if (t.emission_date < startLimit) {
                    const amount = Number(t.amount || 0);
                    const isCredit = t.dc_type === 'C' || t.type === 'Income';
                    if (isCredit) runningSaldoAnterior += amount;
                    else runningSaldoAnterior -= amount;
                }
            });
        }

        let currentSaldo = runningSaldoAnterior;
        const withNewSaldo = sorted.map(t => {
            const amount = Number(t.amount || 0);
            const isCredit = t.dc_type === 'C' || t.type === 'Income';
            if (isCredit) currentSaldo += amount;
            else currentSaldo -= amount;
            return { ...t, saldo: currentSaldo };
        });

        return { 
            sortedTransactions: [...withNewSaldo, ...newRow],
            saldoAnterior: runningSaldoAnterior 
        };
    }, [transactions, sortField, filters, selectedAccount, accounts]);

    const getRowClass = (acc) => {
        if (!acc) return '';
        const type = (acc.account_type || '').toUpperCase();
        if (type.includes('CARTÃO') || type.includes('CREDITO')) return 'row-type-credit-card';
        if (type.includes('CORRENTE')) return 'row-type-checking';
        if (type.includes('POUPANÇA')) return 'row-type-savings';
        if (type.includes('DINHEIRO')) return 'row-type-cash';
        if (type.includes('INVESTIMENTO')) return 'row-type-investment';
        return 'row-type-other-1';
    };

    const columns = [
        { label: '', key: 'selection', width: '30px', readOnly: true },
        { label: 'Seq', key: 'sequential_id', width: '40px', readOnly: true },
        { label: 'Emissão', key: 'emission_date', type: 'date', width: '90px' },
        { label: 'Vencimento', key: 'due_date', type: 'date', width: '90px' },
        { label: 'Descrição', key: 'description', type: 'text', width: '220px' },
        { label: 'Saídas', key: 'debit', type: 'number', width: '90px', align: 'right' },
        { label: 'Entradas', key: 'credit', type: 'number', width: '90px', align: 'right' },
        { label: 'Fornecedor', key: 'beneficiary_id', type: 'combobox', options: options.vendorOptions, width: '180px' },
        { label: 'Valor CC', key: 'cc_valor', readOnly: true, width: '90px', align: 'center' },
        { label: 'Centro Custo', key: 'cost_center_id', type: 'combobox', options: options.costCenters.map(cc => cc.displayName), width: '160px' },
        { label: 'Plano Contas', key: 'transaction_type_id', type: 'combobox', options: options.chartOfAccounts.map(coa => coa.displayName), width: '160px' },
        { label: 'Saldo', key: 'saldo', type: 'number', width: '110px', readOnly: true, align: 'right' },
    ];

    const handleTableKeyDown = (e) => {
        if (!editingCell) return;

        const { id, field } = editingCell;
        const rowIndex = sortedTransactions.findIndex(t => t.id === id);
        const colIndex = columns.findIndex(c => c.key === field);

        if (rowIndex === -1 || colIndex === -1) return;

        const editableCols = columns.filter(c => !c.readOnly);
        const currentEditIdx = editableCols.findIndex(c => c.key === field);

        if (e.key === 'ArrowDown') {
            const nextRow = sortedTransactions[rowIndex + 1];
            if (nextRow && !nextRow.isVirtual) {
                e.preventDefault();
                handleSave(id);
                setEditingCell({ id: nextRow.id, field });
            }
        } else if (e.key === 'ArrowUp') {
            const prevRow = sortedTransactions[rowIndex - 1];
            if (prevRow && !prevRow.isVirtual) {
                e.preventDefault();
                handleSave(id);
                setEditingCell({ id: prevRow.id, field });
            }
        } else if (e.key === 'ArrowRight' && (e.target.tagName !== 'INPUT' || e.target.selectionEnd === e.target.value.length)) {
            const nextCol = editableCols[currentEditIdx + 1];
            if (nextCol) {
                e.preventDefault();
                handleSave(id);
                setEditingCell({ id, field: nextCol.key });
            }
        } else if (e.key === 'ArrowLeft' && (e.target.tagName !== 'INPUT' || e.target.selectionStart === 0)) {
            const prevCol = editableCols[currentEditIdx - 1];
            if (prevCol) {
                e.preventDefault();
                handleSave(id);
                setEditingCell({ id, field: prevCol.key });
            }
        }
    };

    // Mantém refs sempre atualizados para evitar closure desatualizado no listener
    useEffect(() => { confirmCalculatorRef.current = confirmCalculator; });
    useEffect(() => { calcInputRef.current = calcInput; });

    useEffect(() => {
        if (!calculator.isOpen) return;
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmCalculatorRef.current(); return; }
            if (e.key === 'Escape') { setCalculator(p => ({ ...p, isOpen: false })); return; }
            if (e.key === 'Backspace') { calcInputRef.current('⌫'); return; }
            if (/^[0-9]$/.test(e.key)) { calcInputRef.current(e.key); return; }
            if (e.key === ',') { calcInputRef.current(','); return; }
            if (e.key === '.') { calcInputRef.current(','); return; }
            if (['+', '-', '*', '/'].includes(e.key)) { calcInputRef.current(e.key); return; }
        };
        window.addEventListener('keydown', onKey, true); // capture=true: processa antes de outros listeners
        return () => window.removeEventListener('keydown', onKey, true);
    }, [calculator.isOpen]);

    // Foca o input quando a célula abre — uma única vez, sem scroll
    useLayoutEffect(() => {
        if (!editingCell || !inputRef.current) return;
        const el = inputRef.current;
        const inner = scrollContainerRef.current;
        const main = document.querySelector('.main-content');
        const savedInner = inner ? inner.scrollTop : 0;
        const savedMain  = main  ? main.scrollTop  : 0;
        el.focus({ preventScroll: true });
        if (inner) inner.scrollTop = savedInner;
        if (main)  main.scrollTop  = savedMain;
        const raf = requestAnimationFrame(() => {
            if (inner) inner.scrollTop = savedInner;
            if (main)  main.scrollTop  = savedMain;
        });
        return () => cancelAnimationFrame(raf);
    }, [editingCell]);


    // Navigate to next/prev editable column on Tab
    const handleTabKey = (e, rowId, colKey) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const editableCols = columns.filter(c => !c.readOnly);
        const currentIdx = editableCols.findIndex(c => c.key === colKey);
        const nextIdx = e.shiftKey ? currentIdx - 1 : currentIdx + 1;
        if (nextIdx >= 0 && nextIdx < editableCols.length) {
            setEditingCell({ id: rowId, field: editableCols[nextIdx].key });
        }
    };

    // Aceita formato brasileiro (1.234,56) e inglês (1234.56)
    const parseBRNum = (val) => {
        if (val == null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const s = String(val).trim().replace(/\s/g, '');
        // Detecta formato BR: tem vírgula como separador decimal
        const normalized = s.includes(',') 
            ? s.replace(/\./g, '').replace(',', '.')  // 1.234,56 → 1234.56
            : s;                                        // 1234.56 permanece
        const n = Number(normalized);
        return isNaN(n) ? 0 : n;
    };

    const handleSave = async (id, fieldOverrides = {}, forceRateio = false) => {
        // Guarda de reentrância: Enter e o blur que ele dispara ao desmontar o input
        // (via setEditingCell(null)) podem chamar handleSave duas vezes para o mesmo id,
        // duplicando o INSERT de um lançamento novo. Bloqueia chamadas concorrentes.
        if (savingIdsRef.current.has(id)) return;
        savingIdsRef.current.add(id);

        const base = transactions.find(t => t.id === id);
        if (!base) { savingIdsRef.current.delete(id); return; }
        const transaction = { ...base, ...fieldOverrides };

        // Build base payload
        const payload = {
            account_id: selectedAccount.id,
            emission_date: transaction.emission_date,
            due_date: transaction.due_date,
            description: transaction.description || null,
            user_id: securityContext.user_id,
            family_id: securityContext.family_id
        };

        // Fornecedor mapping: tenta por código-nome, displayName, nome ou ID
        const vendor = options.vendors.find(v => v.full_code && `${v.full_code} - ${v.name}` === transaction.beneficiary_id)
            || options.vendors.find(v => v.displayName === transaction.beneficiary_id)
            || options.vendors.find(v => v.name === transaction.beneficiary_id)
            || options.vendors.find(v => v.id === transaction.beneficiary_id);
        if (vendor) payload.beneficiary_id = vendor.id;
        else if (transaction.beneficiary_id) payload.beneficiary_id = null; // valor inválido, limpa

        // CC mapping: tenta por displayName, depois por ID direto
        const cc = options.costCenters.find(c => c.displayName === transaction.cost_center_id)
            || options.costCenters.find(c => c.id === transaction.cost_center_id);
        payload.cost_center_id = cc ? cc.id : null;

        // COA mapping: tenta por displayName, depois por ID direto
        const coa = options.chartOfAccounts.find(c => c.displayName === transaction.transaction_type_id)
            || options.chartOfAccounts.find(c => c.id === transaction.transaction_type_id);
        payload.transaction_type_id = coa ? coa.id : null;

        // Logic for C/D — aceita formato BR (vírgula) e inglês (ponto)
        const creditVal = parseBRNum(transaction.credit);
        const debitVal = parseBRNum(transaction.debit);
        if (creditVal > 0) {
            payload.amount = creditVal;
            payload.dc_type = 'C';
            payload.type = 'Income';
        } else if (debitVal > 0) {
            payload.amount = debitVal;
            payload.dc_type = 'D';
            payload.type = 'Expense';
        } else if (!transaction.isNew && Number(transaction.amount) > 0 && transaction.dc_type && transaction.type) {
            // Linha existente com debit/credit zerados no estado — preserva os valores do banco
            // para evitar violação da constraint NOT NULL na coluna "type"
            payload.amount = Number(transaction.amount);
            payload.dc_type = transaction.dc_type;
            payload.type = transaction.type;
        } else {
            // Sem valor válido — não grava (evita gravar type=null)
            setEditingCell(null);
            savingIdsRef.current.delete(id);
            return;
        }

        try {
            let result;
            if (transaction.isNew) {
                result = await supabase.from('transactions').insert([payload]).select();
            } else {
                result = await supabase.from('transactions').update(payload).eq('id', id).select();
            }

            if (result?.error) {
                console.error('Erro ao gravar lançamento:', result.error);
                if (result.error.message?.includes('transaction_type_id')) {
                    await fetchOptions();
                    alert('O Plano de Contas selecionado não é mais válido. Por favor, selecione novamente.');
                } else {
                    alert(`Erro ao gravar lançamento: ${result.error.message}`);
                }
                setEditingCell(null);
                return;
            }

            // ── Bulk edit: apply same field change to all other selected rows ──
            if (!transaction.isNew && selectedRowIds.size > 1 && selectedRowIds.has(id) && editingCell?.field) {
                const changedField = editingCell.field;
                const bulkPayload = {};
                if (changedField === 'emission_date') bulkPayload.emission_date = transaction.emission_date;
                if (changedField === 'due_date') bulkPayload.due_date = transaction.due_date;
                if (changedField === 'description') bulkPayload.description = transaction.description || null;
                if (changedField === 'beneficiary_id') bulkPayload.beneficiary_id = vendor?.id || null;
                if (changedField === 'cost_center_id') bulkPayload.cost_center_id = cc?.id || null;
                if (changedField === 'transaction_type_id') bulkPayload.transaction_type_id = coa?.id || null;

                // Ensure bulk update also respects RLS
                bulkPayload.user_id = securityContext.user_id;
                bulkPayload.family_id = securityContext.family_id;

                if (Object.keys(bulkPayload).length > 0) {
                    const otherIds = Array.from(selectedRowIds).filter(
                        sid => sid !== id && !(typeof sid === 'string' && sid.startsWith('temp-'))
                    );
                    if (otherIds.length > 0) {
                        await supabase.from('transactions').update(bulkPayload).in('id', otherIds);
                    }
                }
            }

            // ── Parcelamento para cartão de crédito ──
            // Abre apenas quando o campo editado for debit/credit (valor), nunca para datas ou outros campos
            const isCC = (selectedAccount?.account_type || '').toLowerCase().includes('cart');
            const editedValueField = transaction.isNew || editingCell?.field === 'debit' || editingCell?.field === 'credit';
            if (isCC && payload.dc_type === 'D' && payload.amount > 0 && editedValueField) {
                const savedId = transaction.isNew ? result?.data?.[0]?.id : id;
                if (savedId) {
                    setInstallmentModal({
                        savedId,
                        totalAmount: payload.amount,
                        description: payload.description || '',
                        emissionDate: payload.emission_date,
                    });
                    setEditingCell(null);
                    return;
                }
            }

            // ── Rateio de Centro de Custo — abre ao salvar cost_center_id ──
            const editingCC = editingCell?.field === 'cost_center_id' || forceRateio;
            if (editingCC && payload.cost_center_id && payload.amount > 0) {
                const savedId = transaction.isNew ? result?.data?.[0]?.id : id;
                if (savedId) {
                    setRateioModal({ savedId, totalAmount: payload.amount, field: 'cost_center_id' });
                    setEditingCell(null);
                    fetchTransactions(selectedAccount);
                    fetchAccounts();
                    return;
                }
            }

            fetchTransactions(selectedAccount);
            fetchAccounts();
        } catch (err) {
            console.error('Unexpected error during save:', err);
            alert('Erro inesperado ao gravar: ' + err.message);
        } finally {
            setEditingCell(null);
            savingIdsRef.current.delete(id);
        }
    };

    const handleInputChange = (id, field, value) => {
        setTransactions(prev => prev.map(t => {
            // Always update the directly edited row
            if (t.id === id) {
                const updated = { ...t, [field]: value };
                // Auto-calc due_date when emission_date changes (primarily for new rows)
                if (field === 'emission_date' && (t.isNew || !t.due_date)) {
                    updated.due_date = calculateDueDate(value, selectedAccount);
                }
                return updated;
            }
            // Propagate to all other selected existing rows in real-time
            if (!t.isNew && selectedRowIds.has(t.id) && selectedRowIds.has(id)) {
                return { ...t, [field]: value };
            }
            return t;
        }));
    };

    const handleRowSelectionClick = (e, id) => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedRowIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);

            if (next.size === 1) {
                const onlyId = Array.from(next)[0];
                const t = transactions.find(x => x.id === onlyId);
                if (t && !t.isNew) {
                    setEditingRowId(onlyId);
                    setHeaderFormOpen(true);
                }
            } else if (next.size > 1) {
                // Mais de uma linha selecionada: não é edição, apenas duplicação/exclusão em lote
                setEditingRowId(null);
                setHeaderFormOpen(true);
            } else {
                setEditingRowId(null);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        const visibleIds = sortedTransactions.map(t => t.id);
        const allVisibleSelected = visibleIds.every(id => selectedRowIds.has(id));

        setSelectedRowIds(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleIds.forEach(id => next.delete(id));
            } else {
                visibleIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const duplicateTransaction = async (idOrIds) => {
        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        const validIds = ids.filter(id => !(typeof id === 'string' && id.startsWith('temp-')));

        if (validIds.length === 0) {
            alert('Por favor, grave os lançamentos antes de duplicar.');
            return;
        }

        try {
            const { data: raws, error: fetchErr } = await supabase
                .from('transactions')
                .select('*')
                .in('id', validIds);

            if (fetchErr || !raws) {
                console.error('Erro ao buscar lançamentos:', fetchErr);
                return;
            }

            const payloads = raws.map(raw => {
                const { id: _, sequential_id: __, created_at: ___, ...payload } = raw;
                return payload;
            });

            const { error: insertErr } = await supabase
                .from('transactions')
                .insert(payloads);

            if (insertErr) {
                console.error('Erro ao duplicar:', insertErr);
                alert('Erro ao duplicar lançamentos.');
            } else {
                fetchTransactions(selectedAccount);
                fetchAccounts();
                setSelectedRowIds(new Set());
            }
        } catch (err) {
            console.error('Unexpected error during duplication:', err);
        }
    };

    const deleteTransaction = async (idOrIds) => {
        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        // Filtra: apenas IDs reais do banco (não temp-, não virtual-)
        const tempIds = ids.filter(id => typeof id === 'string' && id.startsWith('temp-'));
        const dbIds   = ids.filter(id => {
            if (typeof id !== 'string') return true;
            if (id === 'new')               return false;
            if (id.startsWith('temp-'))     return false;
            if (id.startsWith('virtual-'))  return false;
            return true;
        });

        const total = tempIds.length + dbIds.length;
        if (total === 0) return;

        if (window.confirm(`Deseja excluir ${total} lançamento(s)?`)) {
            try {
                if (tempIds.length > 0) {
                    setTransactions(prev => prev.filter(t => !tempIds.includes(t.id)));
                }
                if (dbIds.length > 0) {
                    // Deleta em lotes de 100 para evitar limite do Supabase
                    const BATCH = 100;
                    for (let i = 0; i < dbIds.length; i += BATCH) {
                        const batch = dbIds.slice(i, i + BATCH);
                        const { error } = await supabase.from('transactions').delete().in('id', batch);
                        if (error) {
                            console.error('Erro ao excluir lote:', error);
                            alert('Erro ao excluir: ' + error.message);
                            break;
                        }
                    }
                }
                fetchTransactions(selectedAccount);
                fetchAccounts();
                setSelectedRowIds(new Set());
            } catch (err) {
                console.error('Unexpected error during deletion:', err);
                alert('Erro inesperado ao excluir: ' + err.message);
            }
        }
    };

    const renderAccountPicker = () => {
        const groupedAccounts = accounts.reduce((acc, account) => {
            const type = (account.account_type || 'OUTROS').toUpperCase();
            if (!acc[type]) acc[type] = [];
            acc[type].push(account);
            return acc;
        }, {});

        // Explicit order: CC, Corrente, Poupança, Dinheiro, Fornecedor
        const prioritizedOrder = [
            'CARTÃO DE CRÉDITO',
            'CONTA CORRENTE',
            'POUPANÇA',
            'DINHEIRO',
            'FORNECEDOR'
        ];

        const availablePriorities = prioritizedOrder.filter(t => groupedAccounts[t]);
        const otherTypes = Object.keys(groupedAccounts)
            .filter(t => !prioritizedOrder.includes(t))
            .sort();

        const orderedTypes = [...availablePriorities, ...otherTypes];

        // Find the max number of accounts across all columns to align TOTAL rows
        const maxAccounts = Math.max(...orderedTypes.map(t => groupedAccounts[t].length));

        const getTypeColor = (index) => {
            // Alternating pattern: Even = Amarelo Creme | Odd = Verde Água
            return (index % 2 !== 0) ? { bg: '#89962F', text: '#ffffff' } : { bg: '#CCFF00', text: '#000000' };
        };

        return (
            <div style={{ display: 'flex', flexDirection: 'row', height: '100%', overflow: 'auto', borderTop: '1px solid #e0e0e0' }}>
                {orderedTypes.map((type, idx) => {
                    const { bg, text } = getTypeColor(idx);
                    const accountCount = groupedAccounts[type].length;
                    return (
                        <div key={type} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            width: '210px',
                            minWidth: '210px',
                            maxWidth: '210px',
                            borderRight: '1px solid #e0e0e0',
                            background: bg, // Apply background to the whole column
                            flexShrink: 0,
                            flexGrow: 0
                        }}>
                            {/* Column Header */}
                            <div
                                style={{
                                    background: bg === '#CCFF00' ? '#1565c0' : '#8d6e63',
                                    color: '#ffffff',
                                    padding: '8px 10px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.07em',
                                    textAlign: 'center',
                                    borderBottom: '2px solid rgba(0,0,0,0.15)',
                                    cursor: 'default',
                                    transition: 'background 0.15s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#000000'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = bg === '#CCFF00' ? '#1565c0' : '#8d6e63'; e.currentTarget.style.color = '#ffffff'; }}
                            >
                                {type}
                            </div>

                            {groupedAccounts[type].map((acc, aIdx) => (
                                <button
                                    key={acc.id}
                                    onClick={() => navigate(`/transactions/${acc.id}`)}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '5px 10px',
                                        fontSize: '11px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: '1px solid rgba(0,0,0,0.05)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        width: '100%',
                                        transition: 'background 0.12s'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = '#ffffff';
                                        e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.15)';
                                        e.currentTarget.querySelector('.acc-name').style.color = '#000000';
                                        e.currentTarget.querySelector('.acc-name').style.fontWeight = '700';
                                        e.currentTarget.querySelector('.acc-value').style.color = '#000000';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.boxShadow = 'none';
                                        e.currentTarget.querySelector('.acc-name').style.color = bg === '#89962F' ? '#ffffff' : '#212121';
                                        e.currentTarget.querySelector('.acc-name').style.fontWeight = '500';
                                        e.currentTarget.querySelector('.acc-value').style.color = bg === '#89962F' ? '#ffffff' : '#212121';
                                    }}
                                >
                                    <span className="acc-name" style={{ fontWeight: '500', color: bg === '#89962F' ? '#ffffff' : '#212121', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'all 0.1s' }}>
                                        {acc.name}
                                    </span>
                                    <span className="acc-value" style={{
                                        fontSize: '10px',
                                        color: bg === '#89962F' ? '#ffffff' : '#212121',
                                        fontWeight: 'bold',
                                        marginLeft: '8px',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.1s'
                                    }}>
                                        {(() => {
                                            const val = Number(acc.predicted_balance || 0);
                                            if (val === 0) return '-';
                                            const fmt = Math.abs(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                            return <>{fmt} <span className={`badge-cd ${val >= 0 ? 'badge-c' : 'badge-d'}`}>{val >= 0 ? 'C' : 'D'}</span></>;
                                        })()}
                                    </span>
                                </button>
                            ))}

                            {/* Spacer: push TOTAL to align with the tallest column */}
                            <div style={{ flex: 1, minHeight: accountCount < maxAccounts ? `${(maxAccounts - accountCount) * 27}px` : '0' }} />

                            {/* Footer: total per type */}
                            {(() => {
                                const total = groupedAccounts[type].reduce((sum, acc) => sum + Number(acc.predicted_balance || 0), 0);
                                const footerBg = bg === '#CCFF00' ? '#1565c0' : '#8d6e63';
                                return (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '6px 10px',
                                        borderTop: `2px solid rgba(0,0,0,0.15)`,
                                        background: footerBg
                                    }}>
                                        <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#ffffff' }}>Total</span>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            color: '#ffffff',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {(() => {
                                                if (total === 0) return '-';
                                                const fmt = Math.abs(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                                return <>{fmt} <span className={`badge-cd ${total >= 0 ? 'badge-c' : 'badge-d'}`}>{total >= 0 ? 'C' : 'D'}</span></>;
                                            })()}
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>
        );
    };

    // ── Gera uma imagem PNG do relatório (preserva o design exato, sem quebra de linha) ──
    const renderHtmlToImageDataUrl = (fullHtml) => {
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:100px;border:0;visibility:hidden;';
            document.body.appendChild(iframe);
            iframe.onload = async () => {
                try {
                    const doc = iframe.contentDocument;
                    const target = doc.body;
                    iframe.style.height = target.scrollHeight + 'px';
                    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, width: target.scrollWidth, windowWidth: target.scrollWidth });
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    console.error('Erro ao gerar imagem do relatório:', e);
                    resolve(null);
                } finally {
                    document.body.removeChild(iframe);
                }
            };
            iframe.srcdoc = fullHtml;
        });
    };

    // ── Prévia de impressão reutilizável ─────────────────────────────────────
    const openPreview = (bodyHtml, waMsg = '', imgDataUrl = null) => {
        const waUrl = waMsg ? `https://wa.me/?text=${encodeURIComponent(waMsg)}` : '';

        const previewStyles = `
        <style id="preview-style">
            /* Tela — ocupa quase toda a largura/altura disponível */
            @media screen {
                html { background: #c8c8c8; }
                body {
                    max-width: 96vw;
                    min-height: calc(100vh - 90px);
                    margin: 12px auto 70px auto !important;
                    background: #fff;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.28);
                    border-radius: 2px;
                    padding: 0;
                }
            }

            /* Paisagem na tela */
            body.landscape {
                max-width: 98vw !important;
            }

            /* Impressão */
            @media print {
                #toolbar { display: none !important }
                body { max-width: none !important; box-shadow: none; margin: 0 !important; }
            }
        </style>
        <style id="page-style">@page { size: A4 portrait; margin: 8mm; }</style>`;

        const toolbar = `
        <div id="toolbar" style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1a1a2e;color:#fff;padding:8px 20px;display:flex;align-items:center;gap:10px;box-shadow:0 -2px 10px rgba(0,0,0,0.4);font-family:Arial,sans-serif;font-size:13px">
            <span style="font-weight:bold;font-size:13px;opacity:0.85">📄 Pré-visualização</span>

            <!-- Toggle retrato / paisagem -->
            <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.3);border-radius:6px;overflow:hidden;margin-left:4px">
                <button id="btn-portrait"
                    onclick="setOrientation('portrait')"
                    style="padding:6px 14px;background:#6a1b9a;color:#fff;border:none;font-size:11px;font-weight:bold;cursor:pointer;border-right:1px solid rgba(255,255,255,0.2)">
                    ▯ Retrato
                </button>
                <button id="btn-landscape"
                    onclick="setOrientation('landscape')"
                    style="padding:6px 14px;background:transparent;color:rgba(255,255,255,0.6);border:none;font-size:11px;font-weight:bold;cursor:pointer">
                    ▭ Paisagem
                </button>
            </div>

            <span style="flex:1"></span>
            <button onclick="window.print()" style="padding:7px 18px;background:#6a1b9a;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer">🖨 Imprimir / Salvar PDF</button>
            ${imgDataUrl ? `<button id="btn-share-img" onclick="shareImage()" style="padding:7px 18px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer">📲 Enviar WhatsApp (imagem)</button>` : (waUrl ? `<button onclick="window.open('${waUrl.replace(/'/g, "\\'")}','_blank')" style="padding:7px 18px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer">📲 Enviar WhatsApp</button>` : '')}
            <button onclick="window.close()" style="padding:7px 14px;background:#555;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">✕ Fechar</button>
        </div>

        <script>
            function setOrientation(mode) {
                const body = document.body;
                const pageStyle = document.getElementById('page-style');
                const btnP = document.getElementById('btn-portrait');
                const btnL = document.getElementById('btn-landscape');
                const active  = 'background:#6a1b9a;color:#fff;';
                const inactive = 'background:transparent;color:rgba(255,255,255,0.6);';
                if (mode === 'landscape') {
                    body.classList.add('landscape');
                    pageStyle.textContent = '@page{size:A4 landscape;margin:8mm}';
                    btnL.style.cssText += active;
                    btnP.style.cssText += inactive;
                } else {
                    body.classList.remove('landscape');
                    pageStyle.textContent = '@page{size:A4 portrait;margin:8mm}';
                    btnP.style.cssText += active;
                    btnL.style.cssText += inactive;
                }
            }

            ${imgDataUrl ? `
            const __reportImageDataUrl = "${imgDataUrl}";
            async function shareImage() {
                const btn = document.getElementById('btn-share-img');
                try {
                    const res = await fetch(__reportImageDataUrl);
                    const blob = await res.blob();
                    const file = new File([blob], 'relatorio.png', { type: 'image/png' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: 'Relatório' });
                        return;
                    }
                } catch (e) { /* segue para o fallback abaixo */ }
                // Fallback: baixa a imagem (design intacto, sem quebra de linha) e abre o WhatsApp com um texto curto
                const a = document.createElement('a');
                a.href = __reportImageDataUrl;
                a.download = 'relatorio.png';
                a.click();
                ${waUrl ? `window.open('${waUrl.replace(/'/g, "\\'")}', '_blank');` : ''}
            }
            ` : ''}
        <\/script>`;

        // Remove @page existente do HTML gerado (será controlado pelo preview-style)
        const cleanedHtml = bodyHtml.replace(/@page\s*\{[^}]*\}/g, '');

        const fullHtml = cleanedHtml
            .replace('</head>', previewStyles + '</head>')
            .replace('</body>', toolbar + '</body>');

        const win = window.open('', '_blank');
        win.document.write(fullHtml);
        win.document.close();
        win.focus();
    };

    const handleVisualizarRelatorio = () => {
        const acc = selectedAccount;
        const fmtD = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
        const fmtV = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const rows = sortedTransactions.filter(t => !t.isNew && !t.isVirtual);

        const totalDebits = rows.reduce((s, t) => s + Number(t.debit || 0), 0);
        const totalCredits = rows.reduce((s, t) => s + Number(t.credit || 0), 0);
        const lastSaldo = rows.length ? rows[rows.length - 1].saldo : saldoAnterior;

        // ── Resumo do Cartão de Crédito (mesmo cálculo do painel exibido na tela) ──
        const isCC = (acc?.account_type || '').toLowerCase().includes('cart');
        let cartaoHtml = '';
        if (isCC) {
            const MONTH_NAMES_CC = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            const creditLimit = Number(acc?.credit_limit || 0);
            const realTxCC = rows.filter(t => t.due_date);
            const faturaMapCC = {};
            realTxCC.forEach(t => {
                const key = t.due_date?.slice(0, 7);
                if (!key) return;
                if (!faturaMapCC[key]) faturaMapCC[key] = [];
                faturaMapCC[key].push(t);
            });
            const monthTotalCC = (year, monthIdx) => {
                const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
                const txs = faturaMapCC[key] || [];
                return txs.reduce((s, t) => s + (t.dc_type === 'D' ? Number(t.amount || 0) : -Number(t.amount || 0)), 0);
            };
            const valorUtilizadoCC = realTxCC.filter(t => t.dc_type === 'D').reduce((s, t) => s + Number(t.amount || 0), 0)
                                   - realTxCC.filter(t => t.dc_type === 'C').reduce((s, t) => s + Number(t.amount || 0), 0);
            const saldoDisponivelCC = creditLimit > 0 ? creditLimit - Math.max(0, valorUtilizadoCC) : null;
            const currentYearCC = new Date().getFullYear();
            const anosComDadosCC = Object.keys(faturaMapCC).map(k => Number(k.slice(0, 4)));
            const maxYearCC = anosComDadosCC.length ? Math.max(currentYearCC, ...anosComDadosCC) : currentYearCC;
            const yearsToShowCC = [];
            for (let y = currentYearCC; y <= maxYearCC; y++) yearsToShowCC.push(y);
            const totalGeralCC = yearsToShowCC.reduce((s, y) => s + MONTH_NAMES_CC.reduce((s2, _, i) => s2 + monthTotalCC(y, i), 0), 0);

            const yearRowsHtml = yearsToShowCC.map(year => {
                const monthValues = MONTH_NAMES_CC.map((_, i) => monthTotalCC(year, i));
                const yearTotal = monthValues.reduce((s, v) => s + v, 0);
                const monthTds = monthValues.map(v => `<td style="text-align:right;padding:6px 8px;font-size:9px;border-bottom:1px solid #eee;color:${v === 0 ? '#78909c' : v > 0 ? '#c62828' : '#1b5e20'}">${v === 0 ? '—' : fmtV(v)}</td>`).join('');
                return `<tr>
                    <td style="text-align:left;font-weight:bold;color:#37474f;padding:6px 8px;font-size:9px;border-bottom:1px solid #eee">${year}</td>
                    ${monthTds}
                    <td style="text-align:right;font-weight:bold;padding:6px 8px;font-size:9px;color:${yearTotal > 0 ? '#c62828' : '#1b5e20'};border-left:1px solid #ddd;border-bottom:1px solid #eee">${fmtV(yearTotal)}</td>
                </tr>`;
            }).join('');

            cartaoHtml = `
            <div style="margin-top:10px;background:#fff;border:1px solid #ccc;border-radius:6px;overflow:hidden;color:#222">
                <div style="background:#004d40;padding:8px 14px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;border-bottom:1px solid #00695c;color:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact">
                    <span style="font-weight:bold;font-size:10px;text-transform:uppercase">💳 ${acc?.name || ''}</span>
                    <span style="font-size:9px;opacity:.85">Limite Total <strong style="font-size:11px">${creditLimit > 0 ? fmtV(creditLimit) : '—'}</strong></span>
                    <span style="font-size:9px;opacity:.85">Limite Usado <strong style="font-size:11px;color:${valorUtilizadoCC > 0 ? '#ffcdd2' : '#b9f6ca'}">${fmtV(valorUtilizadoCC)}</strong></span>
                    <span style="font-size:9px;opacity:.85">Limite Disponível <strong style="font-size:11px;color:${saldoDisponivelCC === null ? '#fff' : saldoDisponivelCC >= 0 ? '#b9f6ca' : '#ffcdd2'}">${saldoDisponivelCC === null ? '—' : fmtV(saldoDisponivelCC)}</strong></span>
                    <span style="font-size:9px;opacity:.85;margin-left:auto">Total Geral <strong style="font-size:13px;color:${totalGeralCC > 0 ? '#ffcdd2' : '#b9f6ca'}">${fmtV(totalGeralCC)}</strong></span>
                </div>
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr>
                        <th style="text-align:left;padding:6px 8px;font-size:9px;color:#555;text-transform:uppercase;border-bottom:1px solid #ddd">Ano</th>
                        ${MONTH_NAMES_CC.map(m => `<th style="text-align:right;padding:6px 8px;font-size:9px;color:#555;text-transform:uppercase;border-bottom:1px solid #ddd">${m}</th>`).join('')}
                        <th style="text-align:right;padding:6px 8px;font-size:9px;color:#00695c;text-transform:uppercase;border-left:1px solid #ddd;border-bottom:1px solid #ddd">Total</th>
                    </tr></thead>
                    <tbody>${yearRowsHtml}</tbody>
                </table>
            </div>`;
        }

        const filtersDesc = [
            filters.sequential_id && `Seq: ${filters.sequential_id}`,
            filters.emission_date && `Emissão: ${filters.emission_date}`,
            filters.due_date && `Vencimento: ${filters.due_date}`,
            filters.description && `Descrição: ${filters.description}`,
            filters.debit && `Saída: ${filters.debit}`,
            filters.credit && `Entrada: ${filters.credit}`,
            filters.beneficiary_id && `Fornecedor: ${filters.beneficiary_id}`,
        ].filter(Boolean).join('  |  ');

        const rowsHtml = rows.map((t, i) => {
            const vendorDisplay = t.beneficiary_id || '—';
            const ccDisplay = t.cost_center_id || '—';
            const coaDisplay = t.transaction_type_id || '—';
            const bg = i % 2 === 0 ? '#fff' : '#f9f9f9';
            return `<tr style="background:${bg}">
                <td style="text-align:center;color:#888">${t.sequential_id || '—'}</td>
                <td>${fmtD(t.emission_date)}</td>
                <td>${fmtD(t.due_date)}</td>
                <td>${vendorDisplay}</td>
                <td>${t.description || '—'}</td>
                <td style="font-size:9px;color:#555">${ccDisplay}</td>
                <td style="font-size:9px;color:#555">${coaDisplay}</td>
                <td style="text-align:right;color:#c62828;font-weight:bold">${t.debit > 0 ? fmtV(t.debit) : '—'}</td>
                <td style="text-align:right;color:#1b5e20;font-weight:bold">${t.credit > 0 ? fmtV(t.credit) : '—'}</td>
                <td style="text-align:right;font-weight:bold;color:${(t.saldo || 0) >= 0 ? '#1b5e20' : '#c62828'}">${fmtV(t.saldo || 0)}</td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Relatório — ${acc?.name || ''}</title>
        <style>
            *{box-sizing:border-box}
            body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:0;color:#222}
            .hdr{background:#fff;color:#004d40;padding:12px 16px;border-bottom:2px solid #00897b}
            .hdr h1{margin:0;font-size:14px}.hdr p{margin:1px 0;font-size:9px;color:#555}
            .info{display:flex;gap:14px;margin-top:7px;background:#e0f2f1;border-radius:5px;padding:5px 10px;font-size:9px;color:#00695c;flex-wrap:wrap}
            .filters{padding:5px 14px;background:#fffde7;font-size:9px;color:#555;border-bottom:1px solid #f9a825}
            .table-wrap{width:100%;overflow:hidden}
            table{width:100%;border-collapse:collapse;table-layout:fixed}
            th{background:#fff;color:#004d40;padding:5px 5px;font-size:9px;text-align:left;border-bottom:2px solid #00897b;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
            td{padding:3px 5px;border-bottom:1px solid #eee;font-size:9px;vertical-align:middle;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
            body.landscape .table-wrap{overflow:visible}
            body.landscape table{table-layout:auto;width:100%}
            body.landscape col{width:auto!important}
            body.landscape th,body.landscape td{overflow:visible;text-overflow:clip;white-space:nowrap;width:auto!important}
            .tot td{background:#fff;font-weight:bold;border-top:2px solid #00897b;color:#004d40}
            .sal td{background:#fff;color:#004d40;font-weight:bold;border-top:2px solid #00897b;border-bottom:2px solid #00897b}
            @page{size:A4 portrait;margin:8mm}
        </style></head><body>
        <div class="hdr">
            <h1>Relatório de Lançamentos — ${acc?.name || ''}</h1>
            <p>${acc?.institution || ''} ${acc?.account_type ? '· ' + acc.account_type : ''} ${acc?.account_number ? '· Conta ' + acc.account_number : ''}</p>
            <div class="info">
                <span>Período: <strong>${rows.length ? fmtD(rows[0].due_date) + ' a ' + fmtD(rows[rows.length - 1].due_date) : '—'}</strong></span>
                <span>Lançamentos: <strong>${rows.length}</strong></span>
                <span>Total Saídas: <strong style="color:#c62828">${fmtV(totalDebits)}</strong></span>
                <span>Total Entradas: <strong style="color:#1b5e20">${fmtV(totalCredits)}</strong></span>
                <span style="margin-left:auto">Emitido: <strong>${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
            </div>
        </div>
        ${filtersDesc ? `<div class="filters">Filtros ativos: ${filtersDesc}</div>` : ''}
        <div class="table-wrap">
        <table>
            <colgroup>
                <col style="width:32px"><col style="width:62px"><col style="width:62px"><col style="width:110px"><col>
                <col style="width:95px"><col style="width:95px"><col style="width:68px"><col style="width:68px"><col style="width:68px">
            </colgroup>
            <thead><tr>
                <th>Seq</th><th>Emissão</th><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th>
                <th>Centro Custo</th><th>Plano Contas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saldo</th>
            </tr></thead>
            <tbody>
                <tr style="background:#fff">
                    <td colspan="9" style="font-weight:bold;color:#e65100;font-size:10px">Saldo Anterior no Período</td>
                    <td style="text-align:right;font-weight:bold;color:${saldoAnterior >= 0 ? '#1b5e20' : '#c62828'}">${fmtV(saldoAnterior)}</td>
                </tr>
                ${rowsHtml}
            </tbody>
            <tfoot>
                <tr class="tot">
                    <td colspan="7">Totais do período</td>
                    <td style="text-align:right;color:#c62828">${fmtV(totalDebits)}</td>
                    <td style="text-align:right;color:#1b5e20">${fmtV(totalCredits)}</td>
                    <td style="text-align:right"></td>
                </tr>
                <tr class="sal">
                    <td colspan="9">Saldo Final</td>
                    <td style="text-align:right">${fmtV(lastSaldo)}</td>
                </tr>
            </tfoot>
        </table>
        </div>
        ${cartaoHtml}
        </body></html>`;

        // Texto curto (sem tabela de largura fixa) — evita que o WhatsApp quebre/corte as linhas.
        // A tabela completa vai como imagem (gerada via renderHtmlToImageDataUrl), preservando o layout exato.
        let waMovMsg = `💰 *MOVIMENTAÇÃO — ${(acc?.name || '').toUpperCase()}*\n`;
        waMovMsg += `${acc?.institution || ''} ${acc?.account_type ? '· ' + acc.account_type : ''}\n`;
        if (filtersDesc) waMovMsg += `Filtros: ${filtersDesc}\n`;
        waMovMsg += `Período: ${rows.length ? fmtD(rows[0].due_date) + ' a ' + fmtD(rows[rows.length - 1].due_date) : '—'}\n`;
        waMovMsg += `Lançamentos: ${rows.length}\n`;
        waMovMsg += `Total Saídas: ${fmtV(totalDebits)}\n`;
        waMovMsg += `Total Entradas: ${fmtV(totalCredits)}\n`;
        waMovMsg += `Saldo Final: ${fmtV(lastSaldo)}\n`;
        waMovMsg += `Emitido: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

        renderHtmlToImageDataUrl(html).then(imgDataUrl => {
            openPreview(html, waMovMsg, imgDataUrl);
        });
    };

    // ── Extrato de Fatura ────────────────────────────────────────────────────
    const ExtratoModal = ({ account, transactions: txList, onClose }) => {
        const fmtBRL  = (v) => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
        const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
        const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

        const dueDay     = account?.due_day     || 1;
        const closingDay = account?.closing_day || 25;
        const creditLimit = Number(account?.credit_limit || 0);

        const today    = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const todayMonthKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;

        const curYear = today.getFullYear();
        // selectedYear: null = "Saldo Anterior", number = ano selecionado
        const [selectedYear, setSelectedYear] = React.useState(curYear);
        // selectedMonth: null = visão anual (todos meses), 0..11 = mês específico
        const [selectedMonth, setSelectedMonth] = React.useState(null);
        // Pagamento
        const [paying, setPaying] = React.useState(false);
        const [payAccountId, setPayAccountId] = React.useState('');
        const [payAmount, setPayAmount] = React.useState('');
        const [payDate, setPayDate] = React.useState(todayStr);
        const [payDesc, setPayDesc] = React.useState('');
        const [payLoading, setPayLoading] = React.useState(false);

        const getFaturaKey = (dueDateStr) => {
            if (!dueDateStr) return null;
            const d = new Date(dueDateStr + 'T12:00:00');
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        };

        const realTx = txList.filter(t => !t.isNew && !t.isVirtual && t.due_date);

        // Mapa: "YYYY-MM" → transações
        const faturaMap = {};
        realTx.forEach(t => {
            const key = getFaturaKey(t.due_date);
            if (!key) return;
            if (!faturaMap[key]) faturaMap[key] = [];
            faturaMap[key].push(t);
        });

        // Total geral em aberto (debit com due_date >= hoje)
        const totalAberto = realTx
            .filter(t => t.due_date >= todayStr && t.dc_type === 'D')
            .reduce((s,t) => s + Number(t.amount || 0), 0);

        const valorUtilizado = realTx.filter(t=>t.dc_type==='D').reduce((s,t)=>s+Number(t.amount||0),0)
                             - realTx.filter(t=>t.dc_type==='C').reduce((s,t)=>s+Number(t.amount||0),0);
        const saldoDisponivel = creditLimit > 0 ? creditLimit - Math.max(0, valorUtilizado) : null;

        // Anos a exibir: ano atual + 4 próximos
        const yearRange = Array.from({ length: 5 }, (_, i) => curYear + i);

        // Saldo anterior = tudo antes do ano atual
        const saldoAnteriorTotal = realTx
            .filter(t => t.due_date < `${curYear}-01-01`)
            .reduce((s,t) => s + (t.dc_type==='D' ? -Number(t.amount||0) : Number(t.amount||0)), 0);

        // Transações do saldo anterior (anos < curYear)
        const txSaldoAnterior = realTx.filter(t => t.due_date < `${curYear}-01-01`);

        // Total por ano
        const getTotalAno = (y) =>
            realTx.filter(t => t.due_date?.startsWith(String(y)))
                .reduce((s,t) => s + (t.dc_type==='D' ? -Number(t.amount||0) : Number(t.amount||0)), 0);

        // Transações do ano selecionado
        const year = selectedYear; // alias para compatibilidade com código existente
        const txAno = selectedYear !== null
            ? realTx.filter(t => t.due_date?.startsWith(String(selectedYear)))
            : txSaldoAnterior;

        // Transações do mês selecionado
        const monthKey = (selectedYear !== null && selectedMonth !== null)
            ? `${selectedYear}-${String(selectedMonth+1).padStart(2,'0')}`
            : null;
        const txMes = monthKey ? (faturaMap[monthKey] || []) : [];
        const totalMes = txMes.reduce((s,t) => s + (t.dc_type==='D' ? -Number(t.amount||0) : Number(t.amount||0)), 0);

        // Totais por mês no ano selecionado
        const getTotalMes = (m) => {
            if (selectedYear === null) return 0;
            const key = `${selectedYear}-${String(m+1).padStart(2,'0')}`;
            return (faturaMap[key]||[]).reduce((s,t)=>s+(t.dc_type==='D'?-Number(t.amount||0):Number(t.amount||0)),0);
        };

        const isCurrentMonth = monthKey === todayMonthKey;

        const getDueDateStr = (mKey) => {
            if (!mKey) return '';
            const [y,m] = mKey.split('-');
            return `${y}-${m}-${String(dueDay).padStart(2,'0')}`;
        };
        const getClosingDateStr = (mKey) => {
            if (!mKey) return '';
            const [y,m] = mKey.split('-');
            const d = new Date(Number(y), Number(m)-2, closingDay);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(closingDay).padStart(2,'0')}`;
        };

        // Contas bancárias (não cartão)
        const bankAccounts = (accounts || []).filter(a => !(a.account_type||'').toLowerCase().includes('cart'));

        // Inicializar campos de pagamento quando abre
        React.useEffect(() => {
            if (paying && monthKey) {
                setPayAmount(String(Math.abs(totalMes).toFixed(2)).replace('.',','));
                setPayDate(getDueDateStr(monthKey));
                setPayDesc(`Pgto Fatura ${MONTH_NAMES[selectedMonth]}/${selectedYear} - ${account?.name||''}`);
                setPayAccountId(bankAccounts[0]?.id || '');
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [paying]);

        const handlePagar = async () => {
            if (!payAccountId) { alert('Selecione a conta bancária.'); return; }
            const amt = parseFloat(String(payAmount).replace(',','.'));
            if (!amt || amt <= 0) { alert('Valor inválido.'); return; }
            setPayLoading(true);
            const ctx = securityContext;
            const desc = payDesc || `Pgto Fatura ${account?.name}`;
            const base = { emission_date: payDate, due_date: payDate, description: desc, amount: amt, user_id: ctx.user_id, family_id: ctx.family_id };

            // 1. Débito na conta bancária pagadora
            const { error: e1 } = await supabase.from('transactions').insert([{
                ...base, account_id: payAccountId, dc_type: 'D', type: 'Expense',
            }]);
            if (e1) { setPayLoading(false); alert('Erro ao lançar débito: ' + e1.message); return; }

            // 2. Crédito na conta do cartão de crédito
            const { error: e2 } = await supabase.from('transactions').insert([{
                ...base, account_id: account.id, dc_type: 'C', type: 'Income',
            }]);
            if (e2) { setPayLoading(false); alert('Erro ao lançar crédito no cartão: ' + e2.message); return; }

            setPayLoading(false);
            setPaying(false);
            fetchAccounts();
            alert('Pagamento lançado com sucesso!');
        };

        // ── Tabela de lançamentos (reutilizável)
        const TxTable = ({ rows, footerLabel }) => {
            const sorted = [...rows].sort((a,b) => (a.due_date||'').localeCompare(b.due_date||''));
            const total  = sorted.reduce((s,t) => s + (t.dc_type==='D' ? -Number(t.amount||0) : Number(t.amount||0)), 0);
            return (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                    <thead>
                        <tr style={{ background:'#f5f5f5', color:'#555', borderBottom:'1px solid #e0e0e0' }}>
                            <th style={{ padding:'7px 10px', textAlign:'left' }}>Emissão</th>
                            <th style={{ padding:'7px 10px', textAlign:'left' }}>Vencimento</th>
                            <th style={{ padding:'7px 10px', textAlign:'left', width:'32%' }}>Descrição</th>
                            <th style={{ padding:'7px 10px', textAlign:'left' }}>Fornecedor</th>
                            <th style={{ padding:'7px 10px', textAlign:'right' }}>Valor</th>
                            <th style={{ padding:'7px 10px', textAlign:'center', width:'50px' }}>Tipo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 && (
                            <tr><td colSpan={6} style={{ padding:'20px', textAlign:'center', color:'#aaa', fontStyle:'italic' }}>Nenhum lançamento</td></tr>
                        )}
                        {sorted.map((t, i) => {
                            const isCredit = t.dc_type === 'C';
                            const vendor = options.vendors.find(v => v.id === t.beneficiary_id);
                            return (
                                <tr key={t.id} style={{ borderBottom:'1px solid #f5f5f5', background: i%2===0?'#fff':'#fafafa' }}>
                                    <td style={{ padding:'7px 10px', color:'#666' }}>{fmtDate(t.emission_date)}</td>
                                    <td style={{ padding:'7px 10px', color:'#555', fontWeight:'500' }}>{fmtDate(t.due_date)}</td>
                                    <td style={{ padding:'7px 10px', color:'#212121', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.description||'—'}</td>
                                    <td style={{ padding:'7px 10px', color:'#666' }}>{vendor?.name||'—'}</td>
                                    <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:'bold', color: isCredit?'#2e7d32':'#c62828' }}>
                                        {isCredit ? '' : '− '}{fmtBRL(Number(t.amount||0))}
                                    </td>
                                    <td style={{ padding:'7px 10px', textAlign:'center' }}>
                                        <span style={{ fontSize:'9px', padding:'2px 5px', borderRadius:'10px', fontWeight:'bold', background:isCredit?'#e8f5e9':'#ffebee', color:isCredit?'#2e7d32':'#c62828' }}>
                                            {isCredit?'Créd':'Déb'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {sorted.length > 0 && (
                        <tfoot>
                            <tr style={{ background:'#e3f2fd', borderTop:'2px solid #90caf9' }}>
                                <td colSpan={4} style={{ padding:'8px 10px', fontWeight:'bold', fontSize:'12px', color:'#1565c0' }}>
                                    {footerLabel || 'Total'}
                                </td>
                                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', fontSize:'13px', color: total<0?'#c62828':'#1b5e20' }}>
                                    {fmtBRL(Math.abs(total))}
                                </td>
                                <td />
                            </tr>
                        </tfoot>
                    )}
                </table>
            );
        };

        return (
            <div style={{ background:'#fff', borderRadius:'12px', boxShadow:'0 24px 80px rgba(0,0,0,0.35)', width:'760px', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>

                {/* ── Cabeçalho ── */}
                <div style={{ background:'linear-gradient(135deg,#1a237e 0%,#1565c0 60%,#0288d1 100%)', color:'#fff', padding:'18px 22px 14px', flexShrink:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div>
                            <div style={{ fontSize:'10px', opacity:0.7, letterSpacing:'0.1em', textTransform:'uppercase' }}>Extrato — Cartão de Crédito</div>
                            <div style={{ fontSize:'19px', fontWeight:'bold', marginTop:'2px' }}>{account?.name}</div>
                            <div style={{ fontSize:'11px', opacity:0.7, marginTop:'2px' }}>{account?.institution||''}</div>
                        </div>
                        {creditLimit > 0 && (
                            <div style={{ display:'flex', gap:'14px', alignItems:'flex-end' }}>
                                <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'9px', opacity:0.7, textTransform:'uppercase', letterSpacing:'0.05em' }}>Limite Total</div>
                                    <div style={{ fontSize:'14px', fontWeight:'bold' }}>{fmtBRL(creditLimit)}</div>
                                </div>
                                <div style={{ width:'1px', background:'rgba(255,255,255,0.25)', alignSelf:'stretch' }} />
                                <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'9px', opacity:0.7, textTransform:'uppercase', letterSpacing:'0.05em' }}>Utilizado</div>
                                    <div style={{ fontSize:'14px', fontWeight:'bold', color:'#ff8a80' }}>{fmtBRL(Math.max(0, valorUtilizado))}</div>
                                </div>
                                <div style={{ width:'1px', background:'rgba(255,255,255,0.25)', alignSelf:'stretch' }} />
                                <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'9px', opacity:0.7, textTransform:'uppercase', letterSpacing:'0.05em' }}>A Utilizar</div>
                                    <div style={{ fontSize:'14px', fontWeight:'bold', color: saldoDisponivel >= 0 ? '#b9f6ca' : '#ff8a80' }}>{fmtBRL(Math.max(0, saldoDisponivel))}</div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ display:'flex', gap:'16px', marginTop:'12px', background:'rgba(255,255,255,0.12)', borderRadius:'7px', padding:'7px 12px', flexWrap:'wrap' }}>
                        <span style={{ fontSize:'11px' }}><span style={{ opacity:0.75 }}>Fechamento: </span><strong>dia {String(closingDay).padStart(2,'0')}</strong></span>
                        <span style={{ fontSize:'11px' }}><span style={{ opacity:0.75 }}>Vencimento: </span><strong>dia {String(dueDay).padStart(2,'0')}</strong></span>
                        <span style={{ fontSize:'11px', marginLeft:'auto' }}><span style={{ opacity:0.75 }}>Em aberto (futuro): </span><strong style={{ color:'#ff8a80' }}>{fmtBRL(totalAberto)}</strong></span>
                    </div>
                </div>

                {/* ── Nível 1: Saldo Anterior + Anos ── */}
                <div style={{ flexShrink:0, background:'#f0f4ff', borderBottom: selectedYear !== null ? '1px solid #c5cae9' : '2px solid #7b1fa2' }}>
                    <div style={{ display:'grid', gridTemplateColumns:`80px repeat(${yearRange.length},1fr)` }}>
                        {/* Saldo Anterior */}
                        <button
                            onClick={() => { setSelectedYear(null); setSelectedMonth(null); }}
                            style={{
                                border:'none', borderBottom: selectedYear === null ? '3px solid #7b1fa2' : '3px solid transparent',
                                background: selectedYear === null ? '#f3e5f5' : 'transparent',
                                cursor:'pointer', padding:'7px 4px 5px', textAlign:'center',
                                color: selectedYear === null ? '#7b1fa2' : '#666',
                            }}
                        >
                            <div style={{ fontSize:'9px', fontWeight:'600', lineHeight:'1.2' }}>Saldo</div>
                            <div style={{ fontSize:'9px', fontWeight:'600', lineHeight:'1.2' }}>Ant.</div>
                            <div style={{ fontSize:'9px', fontWeight:'bold', color: saldoAnteriorTotal < 0 ? '#c62828' : txSaldoAnterior.length ? '#7b1fa2' : '#bbb', marginTop:'2px' }}>
                                {txSaldoAnterior.length ? fmtBRL(Math.abs(saldoAnteriorTotal)) : '—'}
                            </div>
                        </button>
                        {/* Anos */}
                        {yearRange.map((y, i) => {
                            const isSelYear = selectedYear === y;
                            const isCurYear = y === curYear;
                            const totalY = getTotalAno(y);
                            const hasTxY = realTx.some(t => t.due_date?.startsWith(String(y)));
                            return (
                                <button key={y}
                                    onClick={() => { setSelectedYear(y); setSelectedMonth(null); }}
                                    style={{
                                        border:'none', borderBottom: isSelYear ? '3px solid #1565c0' : '3px solid transparent',
                                        background: isSelYear ? '#e3f2fd' : 'transparent',
                                        cursor:'pointer', padding:'7px 4px 5px', textAlign:'center',
                                        color: isSelYear ? '#1565c0' : isCurYear ? '#e65100' : '#444',
                                        borderLeft:'1px solid #e0e0e0',
                                    }}
                                >
                                    <div style={{ fontSize:'10px', fontWeight: isCurYear ? 'bold' : '500' }}>{y}{isCurYear ? '★' : ''}</div>
                                    <div style={{ fontSize:'9px', fontWeight:'bold', color: totalY < 0 ? '#c62828' : hasTxY ? '#1565c0' : '#bbb', marginTop:'2px' }}>
                                        {hasTxY ? fmtBRL(Math.abs(totalY)) : '—'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Nível 2: 12 meses do ano selecionado ── */}
                {selectedYear !== null && (
                    <div style={{ flexShrink:0, background:'#f8f9ff', borderBottom:'2px solid #c5cae9' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(12,1fr)' }}>
                            {MONTH_NAMES.map((name, m) => {
                                const mKey = `${selectedYear}-${String(m+1).padStart(2,'0')}`;
                                const isSelected = selectedMonth === m;
                                const isCur = mKey === todayMonthKey;
                                const total = getTotalMes(m);
                                const hasTx = !!(faturaMap[mKey]?.length);
                                return (
                                    <button key={m} onClick={() => setSelectedMonth(m)}
                                        style={{
                                            border:'none', borderBottom: isSelected ? '3px solid #1565c0' : '3px solid transparent',
                                            background: isSelected ? '#e3f2fd' : 'transparent',
                                            cursor:'pointer', padding:'6px 2px 4px', textAlign:'center',
                                            color: isSelected ? '#1565c0' : isCur ? '#e65100' : '#444',
                                            borderLeft: m > 0 ? '1px solid #e8eaf6' : 'none',
                                        }}
                                    >
                                        <div style={{ fontSize:'10px', fontWeight: isCur ? 'bold' : '500' }}>{name}{isCur ? '★' : ''}</div>
                                        <div style={{ fontSize:'9px', fontWeight:'bold', color: total < 0 ? '#c62828' : hasTx ? '#2e7d32' : '#ccc', marginTop:'1px' }}>
                                            {hasTx ? fmtBRL(Math.abs(total)) : '—'}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Detalhe ── */}
                <div style={{ flex:1, overflowY:'auto' }}>
                    {/* Cabeçalho do período */}
                    <div style={{ padding:'10px 18px', background: selectedYear === null ? '#f3e5f5' : selectedMonth !== null ? '#e3f2fd' : '#e8eaf6', borderBottom:'1px solid #c5cae9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                        {selectedYear === null ? (
                            /* Saldo Anterior */
                            <div style={{ display:'flex', justifyContent:'space-between', width:'100%', alignItems:'center' }}>
                                <div>
                                    <div style={{ fontWeight:'bold', fontSize:'13px', color:'#7b1fa2' }}>Saldo Anterior — até {curYear - 1}</div>
                                    <div style={{ fontSize:'10px', color:'#555', marginTop:'2px' }}>Todos os lançamentos anteriores ao ano atual</div>
                                </div>
                                <div style={{ textAlign:'right' }}>
                                    <div style={{ fontSize:'10px', color:'#555' }}>Total acumulado</div>
                                    <div style={{ fontSize:'18px', fontWeight:'bold', color: saldoAnteriorTotal < 0 ? '#c62828' : '#7b1fa2' }}>{fmtBRL(Math.abs(saldoAnteriorTotal))}</div>
                                </div>
                            </div>
                        ) : selectedMonth !== null ? (
                            /* Mês específico */
                            <>
                                <div>
                                    <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1565c0', display:'flex', alignItems:'center', gap:'8px' }}>
                                        <button onClick={() => setSelectedMonth(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#1565c0', fontSize:'14px', padding:'0', lineHeight:1 }} title="Ver ano todo">‹</button>
                                        {MONTH_NAMES[selectedMonth]} / {selectedYear}
                                        {isCurrentMonth && <span style={{ fontSize:'10px', background:'#e65100', color:'#fff', borderRadius:'4px', padding:'1px 6px' }}>Mês atual</span>}
                                    </div>
                                    <div style={{ fontSize:'10px', color:'#555', marginTop:'2px' }}>
                                        Fechamento: {getClosingDateStr(monthKey) ? fmtDate(getClosingDateStr(monthKey)) : '—'}
                                        &nbsp;·&nbsp;
                                        Vencimento: {getDueDateStr(monthKey) ? fmtDate(getDueDateStr(monthKey)) : '—'}
                                    </div>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                                    <div style={{ textAlign:'right' }}>
                                        <div style={{ fontSize:'10px', color:'#555' }}>Total</div>
                                        <div style={{ fontSize:'18px', fontWeight:'bold', color: totalMes < 0 ? '#c62828' : '#1b5e20' }}>{fmtBRL(Math.abs(totalMes))}</div>
                                    </div>
                                    {isCurrentMonth && (
                                        <button
                                            onClick={() => setPaying(p => !p)}
                                            style={{ padding:'7px 14px', fontSize:'11px', fontWeight:'bold', border:'none', borderRadius:'6px', background: paying ? '#eee' : '#1565c0', color: paying ? '#555' : '#fff', cursor:'pointer' }}
                                        >
                                            {paying ? '✕ Cancelar' : '💳 Pagar Fatura'}
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Visão anual (nenhum mês selecionado) */
                            <div style={{ display:'flex', justifyContent:'space-between', width:'100%', alignItems:'center' }}>
                                <div>
                                    <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a237e' }}>Ano {selectedYear} — todos os lançamentos</div>
                                    <div style={{ fontSize:'10px', color:'#555', marginTop:'2px' }}>Selecione um mês acima para filtrar por período</div>
                                </div>
                                <div style={{ textAlign:'right' }}>
                                    <div style={{ fontSize:'10px', color:'#555' }}>Total do ano</div>
                                    <div style={{ fontSize:'18px', fontWeight:'bold', color: getTotalAno(selectedYear) < 0 ? '#c62828' : '#1b5e20' }}>{fmtBRL(Math.abs(getTotalAno(selectedYear)))}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Painel de pagamento */}
                    {paying && selectedMonth !== null && (
                        <div style={{ padding:'14px 18px', background:'#fffde7', borderBottom:'2px solid #ffe082', display:'flex', flexWrap:'wrap', gap:'12px', alignItems:'flex-end' }}>
                            <div style={{ display:'flex', flexDirection:'column', gap:'3px', flex:'1', minWidth:'180px' }}>
                                <label style={{ fontSize:'10px', fontWeight:'bold', color:'#e65100' }}>Conta bancária</label>
                                <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                                    style={{ padding:'5px 8px', borderRadius:'5px', border:'1px solid #ffb300', fontSize:'12px', outline:'none' }}>
                                    <option value=''>-- selecione --</option>
                                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                                <label style={{ fontSize:'10px', fontWeight:'bold', color:'#e65100' }}>Valor (R$)</label>
                                <input type='text' value={payAmount} onChange={e => setPayAmount(e.target.value)}
                                    style={{ width:'110px', padding:'5px 8px', borderRadius:'5px', border:'1px solid #ffb300', fontSize:'12px', fontWeight:'bold', outline:'none', textAlign:'right' }} />
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                                <label style={{ fontSize:'10px', fontWeight:'bold', color:'#e65100' }}>Data</label>
                                <input type='date' value={payDate} onChange={e => setPayDate(e.target.value)}
                                    style={{ padding:'5px 8px', borderRadius:'5px', border:'1px solid #ffb300', fontSize:'12px', outline:'none' }} />
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:'3px', flex:'2', minWidth:'200px' }}>
                                <label style={{ fontSize:'10px', fontWeight:'bold', color:'#e65100' }}>Descrição</label>
                                <input type='text' value={payDesc} onChange={e => setPayDesc(e.target.value)}
                                    style={{ padding:'5px 8px', borderRadius:'5px', border:'1px solid #ffb300', fontSize:'12px', outline:'none' }} />
                            </div>
                            <button onClick={handlePagar} disabled={payLoading}
                                style={{ padding:'7px 20px', fontSize:'12px', fontWeight:'bold', border:'none', borderRadius:'6px', background: payLoading ? '#aaa' : '#1b5e20', color:'#fff', cursor: payLoading ? 'wait' : 'pointer' }}>
                                {payLoading ? '⏳ Lançando...' : '✔ Confirmar Pagamento'}
                            </button>
                        </div>
                    )}

                    {/* Tabela de lançamentos */}
                    {selectedYear === null
                        ? <TxTable rows={txSaldoAnterior} footerLabel="Total Saldo Anterior" />
                        : selectedMonth !== null
                            ? <TxTable rows={txMes} footerLabel="Total da Fatura" />
                            : <TxTable rows={txAno} footerLabel={`Total ${selectedYear}`} />
                    }
                </div>

                {/* ── Rodapé ── */}
                <div style={{ padding:'8px 18px', borderTop:'1px solid #e0e0e0', background:'#f8f9ff', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                    <button
                        onClick={() => {
                            // Anos com lançamentos + ano atual
                            const allYears = [...new Set(realTx.map(t => t.due_date?.substring(0,4)).filter(Boolean))]
                                .map(Number).sort();
                            if (!allYears.includes(curYear)) allYears.push(curYear);
                            allYears.sort();

                            // Lançamentos do mês atual
                            const curMonthKey = `${curYear}-${String(today.getMonth()+1).padStart(2,'0')}`;
                            const curMonthTx = (faturaMap[curMonthKey]||[]).sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||''));
                            const curMonthDebits = curMonthTx.filter(t=>t.dc_type==='D').reduce((s,t)=>s+Number(t.amount||0),0);

                            const curMonthRowsHtml = curMonthTx.map((t,i)=>{
                                const vendor = options.vendors.find(v=>v.id===t.beneficiary_id);
                                const isC = t.dc_type==='C';
                                return `<tr style="background:${i%2===0?'#fff':'#f5f5f5'}">
                                    <td>${fmtDate(t.emission_date)}</td>
                                    <td>${fmtDate(t.due_date)}</td>
                                    <td>${t.description||'—'}</td>
                                    <td>${vendor?.name||'—'}</td>
                                    <td style="text-align:right;font-weight:bold;color:${isC?'#1b5e20':'#c62828'}">${isC?'':'-'}${fmtBRL(Number(t.amount||0))}</td>
                                    <td style="text-align:center"><span style="font-size:9px;padding:1px 5px;border-radius:8px;background:${isC?'#e8f5e9':'#ffebee'};color:${isC?'#1b5e20':'#c62828'}">${isC?'Crédito':'Débito'}</span></td>
                                </tr>`;
                            }).join('') || `<tr><td colspan="6" style="text-align:center;color:#aaa;font-style:italic">Nenhum lançamento no mês atual</td></tr>`;

                            // Status da fatura por mês/ano
                            const getFaturaStatus = (m, y) => {
                                const key = `${y}-${String(m+1).padStart(2,'0')}`;
                                const txs = faturaMap[key] || [];
                                if (!txs.length) return null;
                                const hasPagto = txs.some(t => t.dc_type === 'C');
                                if (hasPagto) return 'pago';
                                const dueDateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`;
                                return dueDateStr < todayStr ? 'vencido' : 'avencer';
                            };
                            const statusBadge = (status) => {
                                if (!status) return '';
                                const cfg = {
                                    pago:    { label:'Pago',     bg:'#e8f5e9', color:'#1b5e20' },
                                    vencido: { label:'Vencido',  bg:'#ffebee', color:'#c62828' },
                                    avencer: { label:'A Vencer', bg:'#fff8e1', color:'#e65100' },
                                };
                                const c = cfg[status];
                                return `<span style="font-size:8px;padding:1px 5px;border-radius:8px;background:${c.bg};color:${c.color};font-weight:bold;white-space:nowrap;print-color-adjust:exact;-webkit-print-color-adjust:exact">${c.label}</span>`;
                            };

                            // Totais por ano/mês
                            const getMesAnoDebits = (m, y) => {
                                const key = `${y}-${String(m+1).padStart(2,'0')}`;
                                return (faturaMap[key]||[]).filter(t=>t.dc_type==='D').reduce((s,t)=>s+Number(t.amount||0),0);
                            };
                            const getAnoTotal = (y) => MONTH_NAMES.reduce((s,_,m)=>s+getMesAnoDebits(m,y),0);

                            const yearColHeaders = allYears.map(y =>
                                `<th colspan="2" style="text-align:center;background:#1a237e;color:#fff;padding:5px 20px">${y}${y===curYear?' ★':''}</th>`
                            ).join('');
                            const yearSubHeaders = allYears.map(() =>
                                `<th style="text-align:right;background:#37474f;color:#ccc;font-size:9px;padding:4px 12px;white-space:nowrap">Valor</th><th style="text-align:center;background:#37474f;color:#ccc;font-size:9px;padding:4px 12px;white-space:nowrap">Status</th>`
                            ).join('');

                            const summaryRows = MONTH_NAMES.map((name, m) => {
                                const isCurM = m === today.getMonth() && allYears.includes(curYear);
                                const bg = isCurM ? '#fffde7' : m%2===0 ? '#fff' : '#f9f9f9';
                                const cols = allYears.map(y => {
                                    const v = getMesAnoDebits(m, y);
                                    const status = getFaturaStatus(m, y);
                                    if (!status) return `<td style="color:#ccc;text-align:right;padding:4px 12px;white-space:nowrap">—</td><td style="padding:4px 8px"></td>`;
                                    const statusC = status==='pago'?'#1b5e20':status==='vencido'?'#c62828':'#e65100';
                                    return `<td style="text-align:right;font-weight:bold;color:${statusC};padding:4px 12px;white-space:nowrap">${fmtBRL(v)}</td><td style="text-align:center;padding:4px 8px;white-space:nowrap">${statusBadge(status)}</td>`;
                                }).join('');
                                return `<tr style="background:${bg}">
                                    <td style="font-weight:${isCurM?'bold':'normal'};color:${isCurM?'#e65100':'#333'};padding:4px 16px;white-space:nowrap">${name}${isCurM?' ★':''}</td>
                                    ${cols}
                                </tr>`;
                            }).join('');

                            const anoTotalCols = allYears.map(y => {
                                const v = getAnoTotal(y);
                                return `<td style="text-align:right;font-weight:bold;background:#1565c0;color:#fff;padding:5px 12px;white-space:nowrap;print-color-adjust:exact;-webkit-print-color-adjust:exact">${v>0?fmtBRL(v):'—'}</td><td style="background:#1565c0;padding:5px 8px;print-color-adjust:exact;-webkit-print-color-adjust:exact"></td>`;
                            }).join('');

                            const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                            <title>Extrato ${account?.name||''}</title>
                            <style>
                                *{box-sizing:border-box}
                                body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:0;color:#222}
                                .header{background:linear-gradient(135deg,#1a237e,#1565c0,#0288d1);color:#fff;padding:12px 16px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
                                .header h1{margin:0;font-size:14px}.header p{margin:1px 0;font-size:9px;opacity:.8}
                                .info-bar{display:flex;gap:14px;margin-top:7px;background:rgba(255,255,255,0.15);border-radius:5px;padding:5px 10px;font-size:9px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
                                .sec-title{padding:6px 12px;font-weight:bold;font-size:11px;border-bottom:2px solid;margin-top:10px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
                                .sec-mes{background:#e3f2fd;color:#1565c0;border-color:#90caf9}
                                .sec-resumo{background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7}
                                table{width:100%;border-collapse:collapse}
                                th{padding:5px 7px;font-size:9px;border-bottom:2px solid #ddd;print-color-adjust:exact;-webkit-print-color-adjust:exact}
                                td{padding:4px 7px;border-bottom:1px solid #eee;font-size:10px}
                                .tot-row td{background:#e3f2fd;font-weight:bold;border-top:2px solid #90caf9;print-color-adjust:exact;-webkit-print-color-adjust:exact}
                                .grand-tot td{font-size:10px;border-top:2px solid #0d47a1}
                                @page{size:A4 portrait;margin:10mm}
                            </style></head><body>
                            <div class="header">
                                <h1>${account?.name||''} &nbsp;·&nbsp; Extrato Completo</h1>
                                <p>${account?.institution||''} &nbsp;·&nbsp; Cartão de Crédito</p>
                                <div class="info-bar">
                                    <span>Fechamento: <strong>dia ${String(closingDay).padStart(2,'0')}</strong></span>
                                    <span>Vencimento: <strong>dia ${String(dueDay).padStart(2,'0')}</strong></span>
                                    ${creditLimit>0?`
                                    <span style="border-left:1px solid rgba(255,255,255,0.3);padding-left:12px">Limite Total: <strong>${fmtBRL(creditLimit)}</strong></span>
                                    <span>Utilizado: <strong style="color:#ffcdd2">${fmtBRL(Math.max(0,valorUtilizado))}</strong></span>
                                    <span>A Utilizar: <strong style="color:#b9f6ca">${fmtBRL(Math.max(0,saldoDisponivel))}</strong></span>
                                    `:''}
                                    <span style="margin-left:auto">Emitido: <strong>${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</strong></span>
                                </div>
                            </div>

                            <div class="sec-title sec-mes">
                                Lançamentos — ${MONTH_NAMES[today.getMonth()]}/${curYear} (Mês atual) &nbsp;·&nbsp; Total débitos: ${fmtBRL(curMonthDebits)}
                            </div>
                            <table>
                                <thead><tr style="background:#f0f0f0">
                                    <th style="text-align:left">Emissão</th><th style="text-align:left">Vencimento</th>
                                    <th style="text-align:left">Descrição</th><th style="text-align:left">Fornecedor</th>
                                    <th style="text-align:right">Valor</th><th style="text-align:center">Tipo</th>
                                </tr></thead>
                                <tbody>${curMonthRowsHtml}</tbody>
                                <tfoot><tr class="tot-row">
                                    <td colspan="4">Total do mês</td>
                                    <td style="text-align:right;color:#c62828">${fmtBRL(curMonthDebits)}</td><td></td>
                                </tr></tfoot>
                            </table>

                            <div class="sec-title sec-resumo" style="margin-top:14px">
                                Resumo por Mês / Ano
                            </div>
                            <div style="display:flex;justify-content:center">
                            <table style="table-layout:auto;width:auto;border-collapse:collapse">
                                <thead>
                                    <tr>
                                        <th rowspan="2" style="text-align:left;background:#37474f;color:#fff;vertical-align:middle;padding:5px 16px;white-space:nowrap">Mês</th>
                                        ${yearColHeaders}
                                    </tr>
                                    <tr>${yearSubHeaders}</tr>
                                </thead>
                                <tbody>${summaryRows}</tbody>
                                <tfoot><tr class="grand-tot">
                                    <td style="font-weight:bold;background:#0d47a1;color:#fff;white-space:nowrap;padding:5px 16px;print-color-adjust:exact;-webkit-print-color-adjust:exact">Total Anual</td>
                                    ${anoTotalCols}
                                </tr></tfoot>
                            </table>
                            </div>
                            </body></html>`;

                            // Constrói msg WhatsApp para passar ao preview
                            const brl2 = (v) => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
                            const pad2 = (s,n,r=false) => { const str=String(s??''); return r?str.padStart(n):str.padEnd(n); };
                            const getMD = (m,y) => { const k=`${y}-${String(m+1).padStart(2,'0')}`; return (faturaMap[k]||[]).filter(t=>t.dc_type==='D').reduce((s,t)=>s+Number(t.amount||0),0); };
                            const getFS = (m,y) => { const k=`${y}-${String(m+1).padStart(2,'0')}`; const txs=faturaMap[k]||[]; if(!txs.length)return null; if(txs.some(t=>t.dc_type==='C'))return'PG'; const due=`${y}-${String(m+1).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`; return due<todayStr?'VE':'AV'; };
                            const COL2=13;
                            let waMsg2 = `💳 *EXTRATO — ${(account?.name||'').toUpperCase()}*\n_${account?.institution||''} · Cartão de Crédito_\nFechamento: dia *${String(closingDay).padStart(2,'0')}*  Vencimento: dia *${String(dueDay).padStart(2,'0')}*\n`;
                            if(creditLimit>0) waMsg2 += `\`\`\`Limite  : R$ ${brl2(creditLimit)}\nUtilizado: R$ ${brl2(Math.max(0,valorUtilizado))}\nDisponív: R$ ${brl2(Math.max(0,saldoDisponivel))}\`\`\`\n`;
                            waMsg2 += `_Emitido: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}_\n`;
                            const cMK2=`${curYear}-${String(today.getMonth()+1).padStart(2,'0')}`;
                            const cTx2=(faturaMap[cMK2]||[]).sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||''));
                            const cTot2=cTx2.filter(t=>t.dc_type==='D').reduce((s,t)=>s+Number(t.amount||0),0);
                            waMsg2+=`\n📋 *Lançamentos ${MONTH_NAMES[today.getMonth()]}/${curYear}*\n\`\`\`${'Vencto'.padEnd(11)}${'Descrição'.padEnd(22)}${'Valor'.padStart(11)}\n${'─'.repeat(44)}\n`;
                            if(!cTx2.length) waMsg2+='Nenhum lançamento\n'; else { cTx2.forEach(t=>{ const isC=t.dc_type==='C'; waMsg2+=`${fmtDate(t.due_date).padEnd(11)}${(t.description||'—').substring(0,21).padEnd(22)}${((isC?'+':'-')+brl2(Number(t.amount||0))).padStart(11)}\n`; }); waMsg2+=`${'─'.repeat(44)}\n${'Total'.padEnd(33)}${('R$'+brl2(cTot2)).padStart(11)}\n`; }
                            waMsg2+=`\`\`\`\n📊 *Resumo Anual*\n\`\`\`${pad2('Mês',4)}${allYears.map(y=>pad2(y,COL2,true)).join('')}\n${'─'.repeat(4+allYears.length*COL2)}\n`;
                            MONTH_NAMES.forEach((name,m)=>{ const isCur=m===today.getMonth()&&allYears.includes(curYear); const cols=allYears.map(y=>{ const v=getMD(m,y); const st=getFS(m,y); if(!st)return pad2('—',COL2,true); return pad2(brl2(v)+(st==='PG'?' PG':st==='VE'?' VE':' AV'),COL2,true); }).join(''); waMsg2+=`${isCur?'»':' '}${pad2(name,3)}${cols}\n`; });
                            waMsg2+=`${'─'.repeat(4+allYears.length*COL2)}\n ${pad2('TOT',3)}${allYears.map(y=>{ const v=MONTH_NAMES.reduce((s,_,m)=>s+getMD(m,y),0); return pad2(v>0?brl2(v):'—',COL2,true); }).join('')}\n\`\`\`\n_PG=Pago  VE=Vencido  AV=A Vencer  »=Mês atual_`;

                            openPreview(html, waMsg2);
                        }}
                        style={{ padding:'6px 16px', fontSize:'12px', border:'1px solid #1565c0', borderRadius:'5px', background:'#e3f2fd', cursor:'pointer', color:'#1565c0', fontWeight:'bold' }}
                    >
                        🖨 Imprimir PDF
                    </button>
                    <button onClick={onClose} style={{ padding:'6px 18px', fontSize:'12px', border:'1px solid #ccc', borderRadius:'5px', background:'#fff', cursor:'pointer', color:'#555', fontWeight:'bold' }}>
                        Fechar
                    </button>
                </div>
            </div>
        );
    };
    // ────────────────────────────────────────────────────────────────────────

    // ── Parcelamento ────────────────────────────────────────────────────────
    const calcInstallmentDates = (numParcelas, emissionDate) => {
        const dates = [];
        const d = new Date(emissionDate + 'T12:00:00');
        const dueDay    = selectedAccount?.due_day    || 1;
        const closingDay = selectedAccount?.closing_day || 25;
        const emDay = d.getDate();
        let firstMonth = d.getMonth(); // 0-indexed

        // Mesma regra de calculateDueDate:
        // emissão até o fechamento → vencimento no mês seguinte
        // emissão após o fechamento → vencimento no segundo mês subsequente
        if (emDay <= closingDay) {
            firstMonth += 1;
        } else {
            firstMonth += 2;
        }

        const baseYear = d.getFullYear();
        for (let i = 0; i < numParcelas; i++) {
            const m = firstMonth + i;
            const y = baseYear + Math.floor(m / 12);
            const mm = String((m % 12) + 1).padStart(2, '0');
            const dd = String(dueDay).padStart(2, '0');
            dates.push(`${y}-${mm}-${dd}`);
        }
        return dates;
    };

    const saveRateio = async (modal, itens) => {
        const { savedId, allIds } = modal;
        // Lista de todos os IDs afetados (parcelas ou único lançamento)
        const targets = allIds && allIds.length > 0 ? allIds : [{ id: savedId, amount: modal.totalAmount }];

        // Apaga itens de rateio anteriores de todos os lançamentos afetados
        const allTxIds = targets.map(t => t.id);
        await supabase.from('transaction_items').delete().in('transaction_id', allTxIds).not('cost_center_id', 'is', null);

        if (itens.length === 0) {
            // Pular — sem atribuição de CC

        } else if (itens.length === 1) {
            // Um único CC: salva direto em cada lançamento (sem sub-linhas)
            const ccObj = options.costCenters.find(c => c.displayName === itens[0].label);
            const ccId = ccObj ? ccObj.id : null;
            for (const tx of targets) {
                await supabase.from('transactions').update({ cost_center_id: ccId }).eq('id', tx.id);
            }

        } else {
            // Rateio: calcula proporções da 1ª parcela e replica proporcionalmente
            const baseTotal = modal.totalAmount;
            const proporcoes = itens.map(it => ({ label: it.label, ratio: it.valor / baseTotal }));

            const rows = [];
            for (const tx of targets) {
                await supabase.from('transactions').update({ cost_center_id: null }).eq('id', tx.id);
                proporcoes.forEach(p => {
                    const ccObj = options.costCenters.find(c => c.displayName === p.label);
                    rows.push({
                        transaction_id: tx.id,
                        cost_center_id: ccObj ? ccObj.id : null,
                        description:    p.label,
                        amount:         Math.round(tx.amount * p.ratio * 100) / 100,
                    });
                });
            }
            const { error } = await supabase.from('transaction_items').insert(rows);
            if (error) { alert('Erro ao salvar rateio: ' + error.message); return; }
        }

        setRateioModal(null);
        fetchTransactions(selectedAccount);
    };

    const createInstallments = async ({ savedId, totalAmount, description, emissionDate, numParcelas, installments }) => {
        const n = Number(numParcelas) || 1;
        const ctx = securityContext;
        const label = description || '';

        await supabase.from('transactions').delete().eq('id', savedId);

        const creditRows = installments.map((inst, i) => ({
            account_id: selectedAccount.id,
            emission_date: emissionDate,
            due_date: inst.date,
            description: n > 1 ? `${label} ${i + 1}/${n}` : label || null,
            amount: inst.valor,
            dc_type: 'D', type: 'Expense',
            user_id: ctx.user_id, family_id: ctx.family_id,
        }));
        const { data: inserted, error } = await supabase.from('transactions').insert(creditRows).select('id, amount');
        if (error) { alert('Erro ao criar parcelas: ' + error.message); return; }

        setInstallmentModal(null);

        // Abre rateio para a 1ª parcela; ao confirmar replica para todas
        if (inserted && inserted.length > 0) {
            setRateioModal({
                savedId:     inserted[0].id,
                totalAmount: inserted[0].amount,
                field:       'cost_center_id',
                allIds:      inserted.map(r => ({ id: r.id, amount: r.amount })),
            });
        }

        fetchTransactions(selectedAccount);
        fetchAccounts();
    };

    const RateioModal = ({ modal, onConfirm, onCancel }) => {
        const isParcelado = modal.allIds && modal.allIds.length > 1;
        const opts = options.costCenters.map(c => c.displayName);
        const fmtBRL = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const parseBR = (s) => parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;

        const [itens, setItens] = React.useState([]);
        const [selOpcao, setSelOpcao] = React.useState('');
        const [valorStr, setValorStr] = React.useState(modal.totalAmount.toFixed(2).replace('.', ','));

        const totalAlocado = itens.reduce((s, i) => s + i.valor, 0);
        const restante = Math.round((modal.totalAmount - totalAlocado) * 100) / 100;

        React.useEffect(() => {
            setValorStr(restante > 0 ? restante.toFixed(2).replace('.', ',') : '0,00');
        }, [restante]);

        const handleAdicionar = () => {
            if (!selOpcao) return;
            const valor = Math.min(parseBR(valorStr), restante);
            if (valor <= 0) return;
            setItens(prev => [...prev, { label: selOpcao, valor }]);
            setSelOpcao('');
        };

        const handleRemover = (idx) => setItens(prev => prev.filter((_, i) => i !== idx));

        const handleConfirmar = () => {
            if (restante !== 0) { alert(`Restam ${fmtBRL(restante)} sem alocação.`); return; }
            onConfirm(modal, itens);
        };

        const boxStyle = { background: '#fff', borderRadius: '8px', padding: '20px 24px', width: '520px', maxWidth: '96vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' };
        const labelStyle = { fontSize: '11px', color: '#555', marginBottom: '2px', display: 'block' };
        const inputStyle = { border: '1px solid #ccc', borderRadius: '4px', padding: '5px 8px', fontSize: '12px', width: '100%', outline: 'none' };
        const btnStyle = (bg, color='#fff') => ({ padding: '6px 18px', background: bg, color, border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' });

        return (
            <div style={boxStyle}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px', color: '#00695c' }}>
                    Rateio — Centro de Custo {isParcelado ? <span style={{ fontSize: '11px', background: '#1565c0', color: '#fff', borderRadius: '3px', padding: '1px 7px', marginLeft: '6px' }}>{modal.allIds.length} parcelas</span> : null}
                </div>
                {isParcelado && <div style={{ fontSize: '10px', color: '#888', marginBottom: '8px' }}>O rateio definido aqui será replicado para todas as {modal.allIds.length} parcelas proporcionalmente.</div>}
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '14px' }}>
                    Total: <strong>{fmtBRL(modal.totalAmount)}</strong> &nbsp;|&nbsp;
                    Alocado: <strong style={{ color: '#1565c0' }}>{fmtBRL(totalAlocado)}</strong> &nbsp;|&nbsp;
                    Restante: <strong style={{ color: restante > 0 ? '#c62828' : '#2e7d32' }}>{fmtBRL(restante)}</strong>
                </div>

                {/* Seleção */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px' }}>
                    <div style={{ flex: 2 }}>
                        <span style={labelStyle}>Centro de Custo</span>
                        <select value={selOpcao} onChange={e => setSelOpcao(e.target.value)} style={inputStyle} autoFocus>
                            <option value="">Selecionar...</option>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <span style={labelStyle}>Valor (R$)</span>
                        <input
                            type="text"
                            value={valorStr}
                            onChange={e => setValorStr(e.target.value)}
                            onFocus={e => e.target.select()}
                            style={{ ...inputStyle, textAlign: 'right' }}
                        />
                    </div>
                    <button onClick={handleAdicionar} style={btnStyle('#1565c0')} disabled={!selOpcao || restante <= 0}>
                        + Adicionar
                    </button>
                </div>

                {/* Tabela de itens */}
                {itens.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '12px' }}>
                        <thead>
                            <tr style={{ background: '#f5f5f5' }}>
                                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ddd' }}>Centro de Custo</th>
                                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ddd', width: '110px' }}>Valor</th>
                                <th style={{ width: '28px', borderBottom: '1px solid #ddd' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {itens.map((it, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '4px 8px' }}>{it.label}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#1565c0', fontWeight: 'bold' }}>{fmtBRL(it.valor)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span onClick={() => handleRemover(i)} style={{ color: '#c62828', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>✕</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {restante > 0 && itens.length > 0 && (
                    <div style={{ fontSize: '11px', color: '#c62828', marginBottom: '10px' }}>
                        ⚠ Ainda restam {fmtBRL(restante)} para alocar.
                    </div>
                )}

                {/* Botões */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                    <button onClick={() => onConfirm(modal, [])} style={btnStyle('#78909c')}>Pular</button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={onCancel} style={btnStyle('#9e9e9e')}>Cancelar</button>
                        <button onClick={handleConfirmar} style={btnStyle(restante === 0 && itens.length > 0 ? '#2e7d32' : '#bdbdbd')} disabled={restante !== 0 || itens.length === 0}>
                            Confirmar Rateio
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const addMonthsKeepDay = (dateStr, monthsToAdd) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const targetMonthIndex = (m - 1) + monthsToAdd;
        const targetYear = y + Math.floor(targetMonthIndex / 12);
        const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        const day = Math.min(d, lastDay);
        return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    const InstallmentModal = ({ modal, onConfirm, onCancel }) => {
        const [numParcelas, setNumParcelas] = React.useState(1);
        const [totalAmount, setTotalAmount] = React.useState(modal.totalAmount);
        const [totalStr, setTotalStr] = React.useState(String(modal.totalAmount));
        const [firstDueDate, setFirstDueDate] = React.useState(() => calcInstallmentDates(1, modal.emissionDate)[0]);
        const fmtBRL = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const buildInstallments = React.useCallback((n, total, baseDate) => {
            const valor = Math.round((total / n) * 100) / 100;
            const dates = Array.from({ length: n }, (_, i) => addMonthsKeepDay(baseDate, i));
            return dates.map(date => ({ date, valorStr: valor.toFixed(2), valor }));
        }, []);

        const [installments, setInstallments] = React.useState(() => buildInstallments(1, modal.totalAmount, firstDueDate));

        // Recalcula automaticamente ao mudar nº parcelas, total ou 1º vencimento
        const prevRef = React.useRef({ n: 1, total: modal.totalAmount, base: firstDueDate });
        React.useEffect(() => {
            const prev = prevRef.current;
            if (prev.n !== numParcelas || prev.total !== totalAmount || prev.base !== firstDueDate) {
                setInstallments(buildInstallments(numParcelas, totalAmount, firstDueDate));
                prevRef.current = { n: numParcelas, total: totalAmount, base: firstDueDate };
            }
        }, [numParcelas, totalAmount, firstDueDate, buildInstallments]);

        const updateInst = (i, field, value) => {
            setInstallments(prev => prev.map((inst, idx) => {
                if (idx !== i) return inst;
                if (field === 'date') return { ...inst, date: value };
                if (field === 'valorStr') {
                    const v = parseFloat(value.replace(',', '.'));
                    return { ...inst, valorStr: value, valor: isNaN(v) ? inst.valor : v };
                }
                return inst;
            }));
        };

        const handleTotalChange = (e) => {
            const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
            setTotalStr(e.target.value);
            const parsed = parseFloat(raw);
            if (!isNaN(parsed) && parsed > 0) setTotalAmount(parsed);
        };
        const handleTotalBlur = () => {
            const raw = totalStr.replace(/[^\d.,]/g, '').replace(',', '.');
            const parsed = parseFloat(raw);
            if (!isNaN(parsed) && parsed > 0) { setTotalAmount(parsed); setTotalStr(parsed.toFixed(2)); }
            else setTotalStr(totalAmount.toFixed(2));
        };

        const totalParcelas = installments.reduce((s, inst) => s + inst.valor, 0);
        const inputStyle = { border: '1px solid #b2dfdb', borderRadius: '3px', padding: '2px 4px', fontSize: '11px', outline: 'none', background: '#f9fffe' };

        return (
            <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '460px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', background: '#00695c', color: '#fff' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>💳 Parcelamento — Cartão de Crédito</div>
                    <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>{modal.description || 'Compra'}</div>
                </div>
                {/* Body */}
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>Valor total (R$)</label>
                            <input type="text" value={totalStr} onChange={handleTotalChange} onBlur={handleTotalBlur}
                                autoFocus
                                style={{ width: '100px', border: '2px solid #00695c', borderRadius: '4px', padding: '4px 8px', fontSize: '14px', fontWeight: 'bold', textAlign: 'right', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>Nº parcelas</label>
                            <input type="number" min="1" max="48" value={numParcelas}
                                onChange={e => setNumParcelas(Math.max(1, Math.min(48, Number(e.target.value) || 1)))}
                                style={{ width: '64px', border: '2px solid #00695c', borderRadius: '4px', padding: '4px 8px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>1º Vencimento</label>
                            <input type="date" value={firstDueDate}
                                onChange={e => setFirstDueDate(e.target.value)}
                                style={{ border: '2px solid #00695c', borderRadius: '4px', padding: '4px 8px', fontSize: '14px', fontWeight: 'bold', outline: 'none' }} />
                        </div>
                    </div>

                    {/* Tabela editável */}
                    <div style={{ border: '1px solid #e0e0e0', borderRadius: '6px', overflow: 'hidden', fontSize: '11px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px', background: '#e8f5e9', padding: '6px 10px', fontWeight: 'bold', color: '#1b5e20', borderBottom: '1px solid #c8e6c9' }}>
                            <span>Parc.</span><span>Vencimento</span><span style={{ textAlign: 'right' }}>Valor (R$)</span>
                        </div>
                        <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                            {installments.map((inst, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px', padding: '4px 10px', borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#f9fbe7', alignItems: 'center' }}>
                                    <span style={{ color: '#888', fontWeight: 'bold' }}>{i + 1}/{numParcelas}</span>
                                    <input type="date" value={inst.date}
                                        onChange={e => updateInst(i, 'date', e.target.value)}
                                        style={{ ...inputStyle, width: '120px' }} />
                                    <input type="text" value={inst.valorStr}
                                        onChange={e => updateInst(i, 'valorStr', e.target.value)}
                                        onBlur={e => {
                                            const v = parseFloat(e.target.value.replace(',', '.'));
                                            if (!isNaN(v)) updateInst(i, 'valorStr', v.toFixed(2));
                                        }}
                                        style={{ ...inputStyle, width: '80px', textAlign: 'right' }} />
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '5px 10px', background: '#f5f5f5', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
                            <span style={{ color: '#555' }}>Total:</span>
                            <span style={{ color: totalParcelas.toFixed(2) === totalAmount.toFixed(2) ? '#2e7d32' : '#c62828' }}>
                                {fmtBRL(totalParcelas)}
                            </span>
                        </div>
                    </div>
                </div>
                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', background: '#fafafa' }}>
                    <button onClick={onCancel}
                        style={{ padding: '8px 18px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '5px', background: '#fff', color: '#555', fontWeight: 'bold', cursor: 'pointer' }}>
                        ← Voltar
                    </button>
                    <button onClick={() => onConfirm({ ...modal, totalAmount, numParcelas, installments })}
                        style={{ padding: '8px 24px', fontSize: '13px', border: 'none', borderRadius: '5px', background: '#00695c', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                        ✔ Confirmar {numParcelas}x — {fmtBRL(totalParcelas)}
                    </button>
                </div>
            </div>
        );
    };
    // ────────────────────────────────────────────────────────────────────────

    const SearchableSelect = ({ value, onChange, options, onBlur, onKeyDown, onNavigate, autoFocus, onOpenRegister, startOpen = true, registerInput }) => {
        const [search, setSearch] = useState('');
        const [isOpen, setIsOpen] = useState(startOpen);
        const [dropdownStyle, setDropdownStyle] = useState({});
        const [highlightedIndex, setHighlightedIndex] = useState(-1);
        const containerRef = useRef(null);
        const inputRefLocal = useRef(null);

        const isStructured = options.length > 0 && typeof options[0] === 'object';

        const filteredOptions = (() => {
            if (isStructured) {
                if (!search.trim()) return options;
                const s = search.toLowerCase();
                const result = [];
                let pendingHeader = null;
                options.forEach(opt => {
                    if (opt.isHeader) {
                        pendingHeader = opt;
                    } else {
                        const label = (opt.label || '').toLowerCase();
                        const val   = (opt.value || '').toLowerCase();
                        const matches = label.includes(s) || val.includes(s) ||
                            (/^\d+$/.test(s) && label.replace(/\./g, '').startsWith(s));
                        if (matches) {
                            if (pendingHeader) { result.push(pendingHeader); pendingHeader = null; }
                            result.push(opt);
                        }
                    }
                });
                return result;
            }
            return options.filter(opt => {
                if (!opt || !opt.trim()) return false;
                if (!search) return true;
                const s = search.toLowerCase();
                if (/^\d+$/.test(s)) {
                    const codeRaw = opt.split(' ')[0].replace(/\./g, '').toLowerCase();
                    return codeRaw.startsWith(s);
                }
                return opt.toLowerCase().includes(s);
            });
        })();

        const selectableIndexes = filteredOptions
            .map((opt, i) => (typeof opt === 'object' && opt.isHeader) ? null : i)
            .filter(i => i !== null);

        useEffect(() => {
            setHighlightedIndex(-1);
        }, [search, isOpen]);

        const moveHighlight = (dir) => {
            if (selectableIndexes.length === 0) return;
            const curPos = selectableIndexes.indexOf(highlightedIndex);
            let nextPos;
            if (curPos === -1) nextPos = dir > 0 ? 0 : selectableIndexes.length - 1;
            else nextPos = (curPos + dir + selectableIndexes.length) % selectableIndexes.length;
            setHighlightedIndex(selectableIndexes[nextPos]);
        };

        const confirmHighlighted = () => {
            const idx = highlightedIndex !== -1 ? highlightedIndex : selectableIndexes[0];
            if (idx !== undefined && filteredOptions[idx] !== undefined) handleSelect(filteredOptions[idx]);
        };

        useEffect(() => {
            if (autoFocus && inputRefLocal.current) {
                inputRefLocal.current.focus();
            }
        }, [autoFocus]);

        useEffect(() => {
            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 2,
                left: '50%',
                transform: 'translateX(-50%)',
                width: Math.max(rect.width, 300),
                maxWidth: '460px',
                zIndex: 9999,
            });
        }, [isOpen, containerRef.current]);

        const handleSelect = (opt) => {
            const val = typeof opt === 'object' ? (opt.value || opt.label) : opt;
            onChange(val);
            setIsOpen(false);
            onBlur(val);
            if (onNavigate) onNavigate('next');
        };

        return (
            <div ref={containerRef} className="relative w-full h-full flex items-center">
                <input
                    ref={(el) => { inputRefLocal.current = el; if (registerInput) registerInput(el); }}
                    type="text"
                    className="spreadsheet-input"
                    value={isOpen ? search : (value || '')}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={value || '--'}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            confirmHighlighted();
                        } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            moveHighlight(1);
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            moveHighlight(-1);
                        } else if (e.key === 'Escape') {
                            setIsOpen(false);
                            onBlur();
                        } else if (onKeyDown) {
                            onKeyDown(e);
                        }
                    }}
                    onBlur={() => {
                        setTimeout(() => {
                            if (isOpen && !containerRef.current?.contains(document.activeElement)) {
                                setIsOpen(false);
                                onBlur();
                            }
                        }, 200);
                    }}
                />
                {isOpen && (
                    <div style={{ ...dropdownStyle, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 16px 48px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                        {/* Campo de busca embutido no topo */}
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="🔍 Filtrar..."
                                autoFocus
                                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px', padding: '5px 8px', fontSize: '11px', outline: 'none' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        confirmHighlighted();
                                    } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        moveHighlight(1);
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        moveHighlight(-1);
                                    } else if (e.key === 'Escape') { setIsOpen(false); onBlur(); }
                                    else if (e.key === 'Tab') {
                                        setIsOpen(false);
                                        if (onKeyDown) onKeyDown(e);
                                        return;
                                    }
                                    e.stopPropagation();
                                }}
                                onBlur={undefined}
                            />
                        </div>
                        {onOpenRegister && (
                            <div
                                onMouseDown={(e) => { e.preventDefault(); setIsOpen(false); onBlur(); onOpenRegister(search.trim()); }}
                                style={{ padding: '7px 10px', fontSize: '10px', cursor: 'pointer', color: '#1565c0', fontWeight: 700, borderBottom: '1px solid #e0e0e0', background: filteredOptions.length === 0 ? '#e3f2fd' : '#f5f5f5', display: 'flex', alignItems: 'center', gap: '6px' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#bbdefb'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = filteredOptions.length === 0 ? '#e3f2fd' : '#f5f5f5'}
                            >
                                {filteredOptions.length === 0
                                    ? <>📋 <strong>Cadastrar agora</strong>{search.trim() ? `: "${search.trim()}"` : ''}</>
                                    : <>📋 Abrir cadastro completo</>
                                }
                            </div>
                        )}
                        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt, i) => {
                                if (typeof opt === 'object' && opt.isHeader) {
                                    return (
                                        <div key={i} style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', color: '#1565c0', background: '#e3f2fd', borderBottom: '1px solid #bbdefb', cursor: 'default', userSelect: 'none' }}>
                                            {opt.label}
                                        </div>
                                    );
                                }
                                const label = typeof opt === 'object' ? opt.label : opt;
                                const isIndented = typeof opt === 'object' && !opt.isHeader;
                                const isHighlighted = i === highlightedIndex;
                                return (
                                    <div
                                        key={i}
                                        style={{ padding: '6px 10px', paddingLeft: isIndented ? '20px' : '10px', fontSize: '10px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', color: '#374151', fontWeight: isHighlighted ? 700 : 500, textAlign: 'left', backgroundColor: isHighlighted ? '#dbeafe' : 'transparent' }}
                                        title="Clique para selecionar, duplo-clique ou Enter para confirmar"
                                        onMouseDown={(e) => { e.preventDefault(); setHighlightedIndex(i); }}
                                        onDoubleClick={(e) => { e.preventDefault(); handleSelect(opt); }}
                                        onMouseEnter={(e) => { if (!isHighlighted) e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                                        onMouseLeave={(e) => { if (!isHighlighted) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    >
                                        {label}
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ padding: '10px 10px 4px', fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>
                                {search.trim() ? `Nenhum resultado para "${search.trim()}"` : 'Sem resultados'}
                            </div>
                        )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const openCalculator = (rowId, field, currentVal, anchorEl) => {
        const rect = anchorEl.getBoundingClientRect();
        const raw = Number(currentVal || 0);
        setCalculator({
            isOpen: true, rowId, field,
            display: raw > 0 ? String(raw) : '',
            expression: raw > 0 ? String(raw) : '',
            pos: { top: rect.bottom + 2, left: rect.left }
        });
    };

    const calcInput = (key) => {
        setCalculator(prev => {
            let { display, expression } = prev;
            if (key === 'C') return { ...prev, display: '', expression: '' };
            if (key === '⌫') {
                const nd = display.slice(0, -1);
                return { ...prev, display: nd, expression: nd };
            }
            if (key === '=') {
                try {
                    const safeExpr = expression.replace(/,/g, '.').replace(/[^0-9+\-*/.()]/g, '');
                    // eslint-disable-next-line no-new-func
                    const result = Function('"use strict"; return (' + safeExpr + ')')();
                    const rounded = Math.round(result * 100) / 100;
                    return { ...prev, display: String(rounded), expression: String(rounded) };
                } catch { return prev; }
            }
            const nd = display + key;
            return { ...prev, display: nd, expression: nd };
        });
    };

    const confirmCalculator = () => {
        const { rowId, field, expression } = calculator;
        try {
            const safeExpr = expression.replace(/,/g, '.').replace(/[^0-9+\-*/.()]/g, '');
            // eslint-disable-next-line no-new-func
            const result = Function('"use strict"; return (' + safeExpr + ')')();
            const rounded = Math.round(result * 100) / 100;
            if (rowId && field) {
                handleInputChange(rowId, field, rounded);
                handleSave(rowId, { [field]: rounded });
            }
            // Mostra resultado mas mantém calculadora aberta
            setCalculator(prev => ({ ...prev, display: String(rounded).replace('.', ','), expression: String(rounded) }));
        } catch { /* mantém valor atual */ }
    };

    const calcKeys = [
        ['7','8','9','/'],
        ['4','5','6','*'],
        ['1','2','3','-'],
        ['0',',','⌫','+'],
        ['C','','=',''],
    ];

    return (
        <MainLayout title={selectedAccount ? `Movimentação: ${selectedAccount.name}` : "Movimentação Financeira"}>
            {!selectedAccount && (
                <>
                    {renderAccountPicker()}
                </>
            )}

            <div
                onKeyDown={handleTableKeyDown}
                className="h-full overflow-auto flex flex-col"
            >
                {selectedAccount && (
                    <>

                        <div ref={scrollContainerRef} className="flex-1 overflow-auto">
                            <table className="money-table">
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                    {/* First Header Row: filtros alinhados às colunas + ações da conta */}
                                    <tr>
                                        {columns.map((col) => {
                                            if (col.key === 'cost_center_id') return null;
                                            const isCalcExtratoCell = col.key === 'cc_valor';
                                            return (
                                            <th key={col.key} colSpan={isCalcExtratoCell ? 2 : 1} style={{
                                                width: isCalcExtratoCell ? undefined : col.width,
                                                background: col.key === 'selection' ? '#0d47a1' : '#89962F',
                                                padding: 0,
                                                borderBottom: '1px solid #b2dfdb',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 11,
                                            }}>
                                                {col.key === 'selection' ? (
                                                    <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <svg viewBox="0 0 24 24" width="26" height="26" fill="#ffffff">
                                                            <path d="M2 9h11V5l9 7-9 7v-4H2z" />
                                                        </svg>
                                                    </div>
                                                ) : col.key === 'sequential_id' ? (
                                                    <input
                                                        type="text"
                                                        placeholder="Seq..."
                                                        title="Filtrar por Sequência"
                                                        style={{ ...headerBtnStyle, width: '100%', borderRadius: 0, background: '#fff', color: '#334155', border: '1px solid #cbd5e1', justifyContent: 'flex-start' }}
                                                        value={filters.sequential_id || ''}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, sequential_id: e.target.value }))}
                                                    />
                                                ) : col.key === 'emission_date' ? (
                                                    <div title="Filtrar por Emissão">
                                                        <AdvancedDatePicker
                                                            value={filters.emission_date}
                                                            onChange={(val) => setFilters(prev => ({ ...prev, emission_date: val }))}
                                                            placeholder="Emissão..."
                                                        />
                                                    </div>
                                                ) : col.key === 'due_date' ? (
                                                    <div title="Filtrar por Vencimento">
                                                        <AdvancedDatePicker
                                                            value={filters.due_date}
                                                            onChange={(val) => setFilters(prev => ({ ...prev, due_date: val }))}
                                                            placeholder="Vencimento..."
                                                        />
                                                    </div>
                                                ) : col.key === 'description' ? (
                                                    <div className="filter-input-container" title="Filtrar por Descrição">
                                                        <input
                                                            type="text"
                                                            placeholder="Descrição..."
                                                            className="column-filter-input"
                                                            style={{ marginTop: 0 }}
                                                            value={filters.description || ''}
                                                            onChange={(e) => setFilters(prev => ({ ...prev, description: e.target.value }))}
                                                        />
                                                        {filters.description && (
                                                            <button
                                                                className="clear-filter-input-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setFilters(prev => ({ ...prev, description: '' }));
                                                                }}
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : col.key === 'debit' ? (
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        placeholder="Saída..."
                                                        title="Filtrar por valor de Saída"
                                                        style={{ ...headerBtnStyle, width: '100%', borderRadius: 0, background: '#fff', color: '#334155', border: '1px solid #cbd5e1', justifyContent: 'flex-end', textAlign: 'right' }}
                                                        value={filters.debit || ''}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, debit: e.target.value }))}
                                                    />
                                                ) : col.key === 'credit' ? (
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        placeholder="Entrada..."
                                                        title="Filtrar por valor de Entrada"
                                                        style={{ ...headerBtnStyle, width: '100%', borderRadius: 0, background: '#fff', color: '#334155', border: '1px solid #cbd5e1', justifyContent: 'flex-end', textAlign: 'right' }}
                                                        value={filters.credit || ''}
                                                        onChange={(e) => setFilters(prev => ({ ...prev, credit: e.target.value }))}
                                                    />
                                                ) : col.key === 'beneficiary_id' ? (
                                                    <div className="filter-input-container" title="Filtrar por Fornecedor">
                                                        <input
                                                            type="text"
                                                            placeholder="Fornecedor..."
                                                            className="column-filter-input"
                                                            style={{ marginTop: 0 }}
                                                            value={filters.beneficiary_id || ''}
                                                            onChange={(e) => setFilters(prev => ({ ...prev, beneficiary_id: e.target.value }))}
                                                        />
                                                        {filters.beneficiary_id && (
                                                            <button
                                                                className="clear-filter-input-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setFilters(prev => ({ ...prev, beneficiary_id: '' }));
                                                                }}
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : isCalcExtratoCell ? (
                                                    <div style={{ display: 'flex', width: '100%' }}>
                                                        <button
                                                            title="Calculadora"
                                                            onClick={() => setCalculator(p => ({
                                                                ...p,
                                                                isOpen: !p.isOpen,
                                                                rowId: null, field: null,
                                                                display: '', expression: ''
                                                            }))}
                                                            className="btn-money"
                                                            style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: calculator.isOpen ? '#1e293b' : '#f1f5f9', color: calculator.isOpen ? '#f1f5f9' : '#334155', border: '1px solid #cbd5e1' }}
                                                        >
                                                            🧮 Calculadora
                                                        </button>
                                                        <button
                                                            title="Visualizar relatório em PDF"
                                                            onClick={handleVisualizarRelatorio}
                                                            className="btn-money"
                                                            style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: '#ede7f6', color: '#4527a0', border: '1px solid #b39ddb' }}
                                                        >
                                                            👁 Visualizar
                                                        </button>
                                                        {(selectedAccount?.account_type || '').toLowerCase().includes('cart') && (
                                                            <button
                                                                onClick={() => setExtratoOpen(true)}
                                                                className="btn-money"
                                                                style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9' }}
                                                            >
                                                                📄 Extrato Fatura
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : col.key === 'transaction_type_id' ? (
                                                    <button
                                                        title={`Conta selecionada (${selectedAccount.account_type || 'N/A'})`}
                                                        className="btn-money"
                                                        style={{ ...headerBtnStyle, width: '100%', borderRadius: 0, background: '#0d47a1', color: '#ffffff', border: '1px solid #0d47a1', cursor: 'default' }}
                                                    >
                                                        {selectedAccount.name}
                                                    </button>
                                                ) : col.key === 'saldo' ? (
                                                    <button
                                                        onClick={() => navigate('/transactions')}
                                                        title={`Voltar — ${selectedAccount.name} (${selectedAccount.account_type || 'N/A'})`}
                                                        className="btn-money"
                                                        style={{ ...headerBtnStyle, width: '100%', borderRadius: 0, background: '#0d47a1', color: '#ffffff', border: '1px solid #0d47a1', gap: '10px' }}
                                                    >
                                                        <span style={{ fontSize: '22px', lineHeight: 1 }}>&#x21A9;</span>
                                                        <span style={{ fontSize: '20px', fontWeight: '900', letterSpacing: '0.03em' }}>VOLTAR</span>
                                                    </button>
                                                ) : null}
                                            </th>
                                        );})}
                                    </tr>
                                    {/* Second Header Row: Column Titles only */}
                                    <tr style={{ background: '#CCFF00', color: '#000000', fontWeight: 'bold' }}>
                                        {columns.map((col) => (
                                            <th key={col.key} style={{
                                                width: col.width,
                                                background: '#CCFF00',
                                                borderBottom: '1px solid #cfd8dc',
                                                padding: '4px 10px',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                color: '#5d4037',
                                                textAlign: col.align || 'left',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: col.align === 'right' ? 'flex-end' : 'space-between', alignItems: 'center' }}>
                                                    {col.key === 'selection' ? (
                                                        <div
                                                            className={`selection-header ${sortedTransactions.length > 0 && sortedTransactions.every(t => selectedRowIds.has(t.id)) ? 'checked' : ''}`}
                                                            onClick={toggleSelectAll}
                                                        />
                                                    ) : col.label}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                    {/* Third Header Row: Formulário de inclusão/edição, alinhado a cada coluna */}
                                    {(() => {
                                        const newTx = transactions.find(t => t.isNew);
                                        if (!newTx) return null;
                                        const editingTx = editingRowId ? transactions.find(t => t.id === editingRowId) : null;
                                        const formTx = editingTx || newTx;
                                        const formId = formTx.id;
                                        const isEditingExisting = !!editingTx;
                                        const nextSeq = Math.max(0, ...transactions.filter(t => !t.isNew).map(t => Number(t.sequential_id) || 0)) + 1;
                                        const quickInputStyle = { ...headerBtnStyle, justifyContent: 'flex-start', width: '100%', borderRadius: 0, border: '1px solid #cfd8dc', background: '#fff', color: '#334155' };
                                        const openForNewEntry = () => {
                                            setHeaderFormOpen(true);
                                            setTimeout(() => headerDescRef.current?.focus(), 50);
                                        };
                                        const handleQuick = (field, value) => handleInputChange(formId, field, value);
                                        const handleQuickBlur = (overrides) => handleSave(formId, overrides || {});
                                        const closeForm = () => {
                                            setEditingRowId(null);
                                            setSelectedRowIds(new Set());
                                            setHeaderFormOpen(false);
                                        };
                                        const handleIncluir = async () => {
                                            await handleSave(formId, {});
                                            closeForm();
                                        };
                                        const handleRastreio = () => {
                                            const amt = parseBRNum(formTx.debit) || parseBRNum(formTx.credit);
                                            if (!formTx.cost_center_id || !amt) {
                                                alert('Informe o Centro de Custo e o valor (Saída/Entrada) antes de rastrear.');
                                                return;
                                            }
                                            handleSave(formId, {}, true);
                                        };
                                        const handleDuplicar = async () => {
                                            await duplicateTransaction(formId);
                                            closeForm();
                                        };
                                        const handleExcluir = async () => {
                                            await deleteTransaction(formId);
                                            closeForm();
                                        };
                                        const bulkMode = selectedRowIds.size > 1;
                                        const handleDuplicarLote = async () => {
                                            await duplicateTransaction(Array.from(selectedRowIds));
                                            closeForm();
                                        };
                                        const handleExcluirLote = async () => {
                                            await deleteTransaction(Array.from(selectedRowIds));
                                            closeForm();
                                        };
                                        return (
                                            <tr style={{ background: '#eef7d8' }}>
                                                {columns.map((col) => {
                                                    const isPlusCell = col.key === 'selection' && !headerFormOpen;
                                                    if (col.key === 'sequential_id' && !headerFormOpen && !bulkMode) return null;
                                                    return (
                                                    <th key={col.key} colSpan={isPlusCell ? 2 : 1} style={{ width: isPlusCell ? undefined : col.width, padding: 0, borderBottom: '2px solid #cfd8dc', fontWeight: 'normal' }}>
                                                        {col.key === 'selection' ? (
                                                            !headerFormOpen ? (
                                                                <button
                                                                    onClick={openForNewEntry}
                                                                    title="Incluir novo lançamento"
                                                                    style={{ ...headerBtnStyle, width: '100%', height: '36px', borderRadius: 0, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: 0, gap: '8px' }}
                                                                >
                                                                    <span style={{ fontSize: '26px', lineHeight: 1 }}>+</span>
                                                                    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>INSERIR NOVO LANÇAMENTO</span>
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={closeForm}
                                                                    title="Fechar formulário"
                                                                    style={{ ...headerBtnStyle, width: '100%', height: '36px', borderRadius: 0, background: '#0d47a1', border: '1px solid #0d47a1', padding: 0 }}
                                                                >
                                                                    <svg viewBox="0 0 24 24" width="26" height="26" fill="#ffffff">
                                                                        <path d="M2 9h11V5l9 7-9 7v-4H2z" />
                                                                    </svg>
                                                                </button>
                                                            )
                                                        ) : !headerFormOpen ? (
                                                            <div style={{ height: '36px' }} />
                                                        ) : bulkMode && col.key === 'sequential_id' ? (
                                                            <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d47a1' }}>
                                                                <span style={{ fontSize: '10px', color: '#ffffff', fontWeight: 'bold' }}>{selectedRowIds.size}</span>
                                                            </div>
                                                        ) : bulkMode && col.key === 'saldo' ? (
                                                            <div style={{ display: 'flex', width: '100%', height: '36px' }}>
                                                                <button
                                                                    onClick={handleExcluirLote}
                                                                    title="Excluir lançamentos selecionados"
                                                                    style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: '#c62828', color: '#fff', border: '1px solid #c62828', padding: 0, fontSize: '9px' }}
                                                                >
                                                                    🗑 Excluir ({selectedRowIds.size})
                                                                </button>
                                                                <button
                                                                    onClick={handleDuplicarLote}
                                                                    title="Duplicar lançamentos selecionados"
                                                                    style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: '#6a1b9a', color: '#fff', border: '1px solid #6a1b9a', padding: 0, fontSize: '9px' }}
                                                                >
                                                                    ❐ Duplicar ({selectedRowIds.size})
                                                                </button>
                                                            </div>
                                                        ) : bulkMode ? (
                                                            <div style={{ height: '36px' }} />
                                                        ) : col.key === 'sequential_id' ? (
                                                            <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d47a1' }}>
                                                                <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 'bold' }}>{isEditingExisting ? formTx.sequential_id : nextSeq}</span>
                                                            </div>
                                                        ) : col.key === 'cc_valor' ? (
                                                            <button
                                                                onClick={handleRastreio}
                                                                title="Rastrear valores por Centro de Custo"
                                                                style={{ ...headerBtnStyle, width: '100%', borderRadius: 0, background: '#1565c0', color: '#fff', border: '1px solid #1565c0', fontSize: '9px' }}
                                                            >
                                                                Rastreio
                                                            </button>
                                                        ) : col.key === 'saldo' ? (
                                                            isEditingExisting ? (
                                                                <div style={{ display: 'flex', width: '100%', height: '36px' }}>
                                                                    <button
                                                                        onClick={handleExcluir}
                                                                        title="Excluir lançamento"
                                                                        style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: '#c62828', color: '#fff', border: '1px solid #c62828', padding: 0, fontSize: '9px' }}
                                                                    >
                                                                        🗑 Excluir
                                                                    </button>
                                                                    <button
                                                                        onClick={handleDuplicar}
                                                                        title="Duplicar lançamento"
                                                                        style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: '#6a1b9a', color: '#fff', border: '1px solid #6a1b9a', padding: 0, fontSize: '9px' }}
                                                                    >
                                                                        ❐ Duplicar
                                                                    </button>
                                                                    <button
                                                                        ref={(el) => { rowFieldRefs.current.saldo = el; }}
                                                                        onClick={handleIncluir}
                                                                        onKeyDown={handleRowTab('saldo')}
                                                                        style={{ ...headerBtnStyle, flex: 1, borderRadius: 0, background: '#00695c', color: '#fff', border: '1px solid #00695c', padding: 0, fontSize: '9px' }}
                                                                    >
                                                                        Salvar
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    ref={(el) => { rowFieldRefs.current.saldo = el; }}
                                                                    onClick={handleIncluir}
                                                                    onKeyDown={handleRowTab('saldo')}
                                                                    style={{ ...headerBtnStyle, width: '100%', borderRadius: 0, background: '#00695c', color: '#fff', border: '1px solid #00695c', fontSize: '9px' }}
                                                                >
                                                                    Incluir todos os dados digitados
                                                                </button>
                                                            )
                                                        ) : col.type === 'date' ? (
                                                            <input type="date" style={quickInputStyle}
                                                                ref={(el) => { rowFieldRefs.current[col.key] = el; }}
                                                                value={formTx[col.key] || ''}
                                                                onChange={(e) => handleQuick(col.key, e.target.value)}
                                                                onBlur={() => handleQuickBlur()}
                                                                onKeyDown={handleRowTab(col.key)} />
                                                        ) : col.type === 'number' ? (
                                                            <input type="text" inputMode="decimal" placeholder="0,00" style={{ ...quickInputStyle, textAlign: 'right' }}
                                                                ref={(el) => { rowFieldRefs.current[col.key] = el; }}
                                                                value={formTx[col.key] || ''}
                                                                onChange={(e) => handleQuick(col.key, e.target.value)}
                                                                onBlur={() => handleQuickBlur()}
                                                                onKeyDown={handleRowTab(col.key)} />
                                                        ) : col.type === 'combobox' ? (
                                                            <div style={{ width: '100%', height: '36px' }}>
                                                                <SearchableSelect
                                                                    value={formTx[col.key]}
                                                                    startOpen={false}
                                                                    registerInput={(el) => { rowFieldRefs.current[col.key] = el; }}
                                                                    onKeyDown={handleRowTab(col.key)}
                                                                    onChange={(val) => handleQuick(col.key, val)}
                                                                    options={col.options}
                                                                    onBlur={(val) => handleQuickBlur(val !== undefined ? { [col.key]: val } : {})}
                                                                    onOpenRegister={
                                                                        col.key === 'beneficiary_id' ? (val) => {
                                                                            const q = val ? `&prefill=${encodeURIComponent(val)}` : '';
                                                                            navigate(`/beneficiaries?returnTo=/transactions/${selectedAccount?.id}${q}`);
                                                                        }
                                                                        : col.key === 'cost_center_id' ? (val) => {
                                                                            const q = val ? `&prefill=${encodeURIComponent(val)}` : '';
                                                                            navigate(`/cost-centers?returnTo=/transactions/${selectedAccount?.id}${q}`);
                                                                        }
                                                                        : col.key === 'transaction_type_id' ? (val) => {
                                                                            const q = val ? `&prefill=${encodeURIComponent(val)}` : '';
                                                                            navigate(`/chart-of-accounts?returnTo=/transactions/${selectedAccount?.id}${q}`);
                                                                        }
                                                                        : undefined
                                                                    }
                                                                />
                                                            </div>
                                                        ) : (
                                                            <input type="text" style={quickInputStyle}
                                                                ref={(el) => { rowFieldRefs.current[col.key] = el; if (col.key === 'description') headerDescRef.current = el; }}
                                                                placeholder={col.label + '...'}
                                                                value={formTx[col.key] || ''}
                                                                onChange={(e) => handleQuick(col.key, e.target.value)}
                                                                onBlur={() => handleQuickBlur()}
                                                                onKeyDown={handleRowTab(col.key)} />
                                                        )}
                                                    </th>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })()}
                                </thead>
                                <tbody ref={tableRef}>
                                    <tr style={{ background: 'rgba(34, 197, 94, 0.25)', borderLeft: '4px solid #22c55e' }}>
                                        <td colSpan={columns.length} style={{
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            color: '#333',
                                            borderBottom: '2px solid #ddd',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>SALDO ANTERIOR NO PERÍODO</span>
                                                <span style={{ color: saldoAnterior < 0 ? '#c62828' : '#2e7d32', fontSize: '12px', display: 'flex', alignItems: 'center' }}>
                                                    {saldoAnterior === 0 ? '-' : Math.abs(saldoAnterior).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    {saldoAnterior !== 0 && <span className={`badge-cd ${saldoAnterior >= 0 ? 'badge-c' : 'badge-d'}`}>{saldoAnterior >= 0 ? 'C' : 'D'}</span>}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {sortedTransactions.map((t) => {
                                        const tRateioItems = rateioItemsMap[t.id] || [];
                                        const hasRateio = tRateioItems.length > 0;
                                        return (
                                        <React.Fragment key={t.id}>
                                        <tr
                                            ref={t.isNew ? newRowRef : null}
                                            className={`transaction-row ${t.isNew ? 'new-row-highlight-green' : ''} ${selectedRowIds.has(t.id) ? 'selected-row-highlight' : ''}`}
                                            style={{
                                                cursor: t.isNew ? 'default' : 'pointer',
                                                background: t.isNew ? undefined : getDateGroupBackground(t.emission_date),
                                                borderLeft: t.isNew ? undefined : '4px solid #22c55e'
                                            }}
                                        >
                                            {columns.map((col, idx) => (
                                                <td
                                                    key={col.key}
                                                    style={{
                                                        textAlign: col.type === 'number' ? 'right' : 'center',
                                                        width: col.width,
                                                        background: t.isVirtual ? '#f1f5f9' : 'transparent',
                                                        fontWeight: t.isVirtual ? 'bold' : 'normal',
                                                        color: t.isVirtual ? '#475569' : 'inherit'
                                                    }}
                                                >
                                                    {col.key === 'selection' ? (
                                                        <div
                                                            className={`selection-indicator ${selectedRowIds.has(t.id) ? 'checked' : ''}`}
                                                            onClick={(e) => handleRowSelectionClick(e, t.id)}
                                                        />
                                                    ) : (
                                                        <>
                                                            {!t.isNew && editingCell?.id === t.id && editingCell?.field === col.key ? (
                                                                col.type === 'combobox' ? (
                                                                    <div className="flex w-full h-full items-center">
                                                                        <SearchableSelect
                                                                            value={t[col.key]}
                                                                            onChange={(val) => handleInputChange(t.id, col.key, val)}
                                                                            options={col.options}
                                                                            onBlur={(val) => handleSave(t.id, val !== undefined ? { [col.key]: val } : {})}
                                                                            onNavigate={(dir) => { const fakeE = { key: 'Tab', shiftKey: dir === 'back', preventDefault: () => {} }; handleTabKey(fakeE, t.id, col.key); }}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Tab') handleTabKey(e, t.id, col.key);
                                                                            }}
                                                                            autoFocus
                                                                            onOpenRegister={
                                                                                col.key === 'beneficiary_id' ? (val) => {
                                                                                    const q = val ? `&prefill=${encodeURIComponent(val)}` : '';
                                                                                    navigate(`/beneficiaries?returnTo=/transactions/${selectedAccount?.id}${q}`);
                                                                                }
                                                                                : col.key === 'cost_center_id' ? (val) => {
                                                                                    const q = val ? `&prefill=${encodeURIComponent(val)}` : '';
                                                                                    navigate(`/cost-centers?returnTo=/transactions/${selectedAccount?.id}${q}`);
                                                                                }
                                                                                : col.key === 'transaction_type_id' ? (val) => {
                                                                                    const q = val ? `&prefill=${encodeURIComponent(val)}` : '';
                                                                                    navigate(`/chart-of-accounts?returnTo=/transactions/${selectedAccount?.id}${q}`);
                                                                                }
                                                                                : undefined
                                                                            }
                                                                        />
                                                                        {col.key === 'beneficiary_id' && (
                                                                            <button 
                                                                                title="Abrir Cadastro de Fornecedores"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setActiveRowId(t.id);
                                                                                    setBeneficiaryModalOpen(true);
                                                                                }}
                                                                                style={{ 
                                                                                    padding: '2px 6px', 
                                                                                    background: '#00695c', 
                                                                                    color: 'white', 
                                                                                    border: 'none', 
                                                                                    borderRadius: '2px', 
                                                                                    marginLeft: '4px', 
                                                                                    cursor: 'pointer', 
                                                                                    fontSize: '10px',
                                                                                    fontWeight: 'bold',
                                                                                    flexShrink: 0
                                                                                }}
                                                                            >
                                                                                ...
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : col.type === 'number' ? (
                                                                    <input
                                                                        ref={inputRef}
                                                                        className="spreadsheet-input"
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        style={{ textAlign: 'right' }}
                                                                        value={!t[col.key] || t[col.key] === 0 ? '' : t[col.key]}
                                                                        onChange={(e) => handleInputChange(t.id, col.key, e.target.value)}
                                                                        onBlur={() => handleSave(t.id)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Tab') handleTabKey(e, t.id, col.key);
                                                                            if (e.key === 'Enter') handleSave(t.id);
                                                                        }}
                                                                        onFocus={(e) => e.target.select()}
                                                                    />
                                                                ) : (
                                                                    <input
                                                                        ref={inputRef}
                                                                        className="spreadsheet-input"
                                                                        type={col.type === 'date' ? 'date' : 'text'}
                                                                        value={t[col.key] || ''}
                                                                        onChange={(e) => handleInputChange(t.id, col.key, e.target.value)}
                                                                        onBlur={() => handleSave(t.id)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') { e.preventDefault(); handleSave(t.id); }
                                                                            else if (e.key === 'Tab') handleTabKey(e, t.id, col.key);
                                                                        }}
                                                                        onFocus={(e) => col.type !== 'date' && e.target.select()}
                                                                    />
                                                                )
                                                            ) : (
                                                                <div style={{ minHeight: '14px', textAlign: col.type === 'number' ? 'right' : (col.key === 'sequential_id' || col.type === 'date' ? 'center' : 'left') }}>
                                                                    {col.type === 'number'
                                                                        ? (() => {
                                                                            const v = Number(t[col.key] || 0);
                                                                            if (Math.round(Math.abs(v) * 100) === 0) return '-';
                                                                            const str = `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                                                            if (col.key === 'saldo') return <>{str} <span className={`badge-cd ${v >= 0 ? 'badge-c' : 'badge-d'}`}>{v >= 0 ? 'C' : 'D'}</span></>;
                                                                            return str;
                                                                          })()
                                                                        : col.key === 'cost_center_id' && hasRateio
                                                                            ? <button onClick={(e) => { e.stopPropagation(); setExpandedRateio(prev => { const n = new Set(prev); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; }); }} style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 8px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>{expandedRateio.has(t.id) ? '▲ RATEIO' : '▼ RATEIO'}</button>
                                                                        : col.key === 'cc_valor'
                                                                            ? (() => {
                                                                                if (hasRateio) return null;
                                                                                const v = Number(t.debit || 0) > 0 ? Number(t.debit) : Number(t.credit || 0);
                                                                                if (!t.cost_center_id || v === 0) return null;
                                                                                return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                                                              })()
                                                                        : col.type === 'date' && t[col.key]
                                                                            ? (() => { const [y, m, d] = t[col.key].split('-'); return `${d}/${m}/${y}`; })()
                                                                        : col.key === 'description'
                                                                            ? <>
                                                                                {t.origin === 'OPEN_FINANCE' && (
                                                                                    <span title={t.is_conciliated ? 'Importado via Open Finance \u2014 conciliado' : 'Importado via Open Finance \u2014 pendente de revis\u00E3o'}
                                                                                        style={{ marginRight: '5px', fontSize: '10px', background: t.is_conciliated ? '#e8f5e9' : '#fff3e0', color: t.is_conciliated ? '#2e7d32' : '#e65100', borderRadius: '3px', padding: '1px 4px', fontWeight: 'bold' }}>
                                                                                        \uD83C\uDFE6{t.is_conciliated ? '\u2713' : ''}
                                                                                    </span>
                                                                                )}
                                                                                {t.description || '\u00A0'}
                                                                              </>
                                                                            : (t[col.key] || '\u00A0')
                                                                    }
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                        {hasRateio && expandedRateio.has(t.id) && tRateioItems.map((item, idx) => {
                                            const ccObj = options.costCenters.find(c => c.id === item.cost_center_id);
                                            const ccName = ccObj ? ccObj.displayName : item.description || '—';
                                            const fmtBRL = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                            return (
                                                <tr key={`ri-${t.id}-${idx}`} style={{ background: '#e8f5e9' }}>
                                                    {columns.map((col) => (
                                                        <td key={col.key} style={{ padding: '2px 6px', fontSize: '10px', color: '#2e7d32', borderBottom: '1px solid #c8e6c9', textAlign: col.key === 'cc_valor' ? 'right' : 'left' }}>
                                                            {col.key === 'cost_center_id' ? (
                                                                <span style={{ paddingLeft: '12px', color: '#1b5e20', fontStyle: 'italic' }}>↳ {ccName}</span>
                                                            ) : col.key === 'cc_valor' ? (
                                                                <span style={{ fontWeight: 'bold', color: '#1565c0' }}>{fmtBRL(item.amount)}</span>
                                                            ) : null}
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                        </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {/* ── Painel Resumo Cartão de Crédito ── */}
                        {(() => {
                            const isCC = (selectedAccount?.account_type || '').toLowerCase().includes('cart');
                            if (!isCC) return null;

                            const todayStr = new Date().toISOString().split('T')[0];
                            const currentYear = Number(todayStr.slice(0, 4));
                            const creditLimit = Number(selectedAccount?.credit_limit || 0);
                            const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

                            const realTx = sortedTransactions.filter(t => !t.isNew && !t.isVirtual && t.due_date);

                            // Agrupar por mês de vencimento (YYYY-MM)
                            const faturaMap = {};
                            realTx.forEach(t => {
                                const key = t.due_date?.slice(0, 7);
                                if (!key) return;
                                if (!faturaMap[key]) faturaMap[key] = [];
                                faturaMap[key].push(t);
                            });

                            const monthTotal = (year, monthIdx) => {
                                const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
                                const txs = faturaMap[key] || [];
                                return txs.reduce((s, t) => s + (t.dc_type === 'D' ? Number(t.amount || 0) : -Number(t.amount || 0)), 0);
                            };

                            const fmtBRL = (v) => Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            const valorUtilizado = realTx.filter(t => t.dc_type === 'D').reduce((s,t) => s + Number(t.amount||0), 0)
                                                 - realTx.filter(t => t.dc_type === 'C').reduce((s,t) => s + Number(t.amount||0), 0);
                            const saldoDisponivel = creditLimit > 0 ? creditLimit - Math.max(0, valorUtilizado) : null;

                            // Anos a exibir: ano atual até o maior ano com dados no futuro
                            const anosComDados = Object.keys(faturaMap).map(k => Number(k.slice(0, 4)));
                            const maxYear = anosComDados.length ? Math.max(currentYear, ...anosComDados) : currentYear;
                            const yearsToShow = [];
                            for (let y = currentYear; y <= maxYear; y++) yearsToShow.push(y);

                            const cellStyle = { padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '13px' };
                            const totalGeral = yearsToShow.reduce((s, y) => s + MONTH_NAMES.reduce((s2, _, i) => s2 + monthTotal(y, i), 0), 0);

                            return (
                                <div style={{ flexShrink: 0, margin: '12px 0 4px 0' }}>
                                    <div style={{ background: '#0d2137', border: '1px solid #1a5276', borderRadius: '8px', overflow: 'hidden', fontSize: '13px', color: '#e0e0e0', width: '100%' }}>

                                        {/* Linha única: Nome do cartão + limites + total geral */}
                                        <div style={{ background: 'linear-gradient(90deg, #1a3a52, #0d2137)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '24px', borderBottom: '1px solid #1a5276', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '14px' }}>💳</span>
                                                <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#CCFF00', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {selectedAccount.name}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                <span style={{ fontSize: '10px', color: '#90a4ae', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Limite Total</span>
                                                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#CCFF00' }}>{creditLimit > 0 ? fmtBRL(creditLimit) : '—'}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                <span style={{ fontSize: '10px', color: '#90a4ae', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Limite Usado</span>
                                                <span style={{ fontSize: '16px', fontWeight: 'bold', color: valorUtilizado > 0 ? '#ff6b6b' : '#69db7c' }}>{fmtBRL(valorUtilizado)}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                <span style={{ fontSize: '10px', color: '#90a4ae', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Limite Disponível</span>
                                                <span style={{ fontSize: '16px', fontWeight: 'bold', color: saldoDisponivel === null ? '#546e7a' : saldoDisponivel >= 0 ? '#69db7c' : '#ff6b6b' }}>
                                                    {saldoDisponivel === null ? '—' : fmtBRL(saldoDisponivel)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginLeft: 'auto' }}>
                                                <span style={{ fontSize: '10px', color: '#90a4ae', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Geral</span>
                                                <span style={{ fontSize: '18px', fontWeight: 'bold', color: totalGeral > 0 ? '#ff6b6b' : '#69db7c' }}>{fmtBRL(totalGeral)}</span>
                                            </div>
                                        </div>

                                        {/* Linhas: um ano por linha, colunas Jan..Dez + Total */}
                                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                            <thead>
                                                <tr style={{ borderTop: '1px solid #1a5276' }}>
                                                    <th style={{ ...cellStyle, textAlign: 'left', color: '#90a4ae', textTransform: 'uppercase' }}>Ano</th>
                                                    {MONTH_NAMES.map(m => (
                                                        <th key={m} style={{ ...cellStyle, color: '#90a4ae', textTransform: 'uppercase' }}>{m}</th>
                                                    ))}
                                                    <th style={{ ...cellStyle, color: '#CCFF00', textTransform: 'uppercase', borderLeft: '1px solid #1a5276' }}>Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {yearsToShow.map(year => {
                                                    const monthValues = MONTH_NAMES.map((_, i) => monthTotal(year, i));
                                                    const yearTotal = monthValues.reduce((s, v) => s + v, 0);
                                                    return (
                                                        <tr key={year} style={{ borderTop: '1px solid #1a5276' }}>
                                                            <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 'bold', color: '#b0bec5' }}>{year}</td>
                                                            {monthValues.map((v, i) => (
                                                                <td key={i} style={{ ...cellStyle, color: v === 0 ? '#546e7a' : v > 0 ? '#ff8a80' : '#69db7c' }}>
                                                                    {v === 0 ? '—' : fmtBRL(v)}
                                                                </td>
                                                            ))}
                                                            <td style={{ ...cellStyle, fontWeight: 'bold', color: yearTotal > 0 ? '#ff6b6b' : '#69db7c', borderLeft: '1px solid #1a5276' }}>
                                                                {fmtBRL(yearTotal)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="p-2 text-[10px] text-text-muted mt-2 border-t border-dashed flex-shrink-0">
                            <strong>Dica:</strong> ENTER para gravar o campo | BOTÃO DIREITO para excluir ou incluir novo | Clique na conta para trocar
                        </div>
                    </>
                )}
            </div>

            {calculator.isOpen && (
                <div
                    style={{ position: 'fixed', top: calcPos.y, left: calcPos.x, zIndex: 99999, background: '#1e293b', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: '0', width: '184px', userSelect: 'none' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmCalculator(); } }}
                    tabIndex={-1}
                >
                    {/* Header arrastável */}
                    <div
                        style={{ padding: '6px 10px', background: '#0f172a', borderRadius: '8px 8px 0 0', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseDown={e => {
                            e.preventDefault();
                            calcDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: calcPos.x, origY: calcPos.y };
                            const onMove = (ev) => {
                                if (!calcDragRef.current.dragging) return;
                                setCalcPos({ x: calcDragRef.current.origX + ev.clientX - calcDragRef.current.startX, y: calcDragRef.current.origY + ev.clientY - calcDragRef.current.startY });
                            };
                            const onUp = () => { calcDragRef.current.dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                        }}
                    >
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>🧮 Calculadora</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button onClick={() => navigate('/financial-calculator')} title="Calculadora Financeira" style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', padding: '0 2px', textDecoration: 'underline', whiteSpace: 'nowrap' }}>Financeira</button>
                            <button onClick={() => setCalculator(p => ({ ...p, isOpen: false }))} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}>✕</button>
                        </div>
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                        {/* Display */}
                        <div style={{ background: '#0f172a', borderRadius: '4px', padding: '6px 10px', marginBottom: '8px', textAlign: 'right', fontSize: '18px', fontWeight: 'bold', color: '#f1f5f9', minHeight: '32px', letterSpacing: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {calculator.display || '0'}
                        </div>
                        {calcKeys.map((row, ri) => (
                            <div key={ri} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                                {row.map((k, ki) => k === '' ? (
                                    <div key={ki} style={{ flex: 1 }} />
                                ) : k === '=' ? (
                                    <button key={ki} onClick={confirmCalculator} style={{ flex: 2, padding: '9px 0', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}>✓</button>
                                ) : (
                                    <button key={ki} onClick={() => calcInput(k)} style={{ flex: 1, padding: '9px 0', background: ['C','⌫','/','*','-','+'].includes(k) ? '#475569' : '#334155', color: k === 'C' ? '#fca5a5' : '#f1f5f9', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>{k}</button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {extratoOpen && (
                <div className="modal-overlay" onClick={() => setExtratoOpen(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <ExtratoModal
                            account={selectedAccount}
                            transactions={transactions}
                            onClose={() => setExtratoOpen(false)}
                        />
                    </div>
                </div>
            )}

            {installmentModal && (
                <div className="modal-overlay">
                    <InstallmentModal
                        modal={installmentModal}
                        onConfirm={createInstallments}
                        onCancel={async () => {
                            if (installmentModal?.savedId) await supabase.from('transactions').delete().eq('id', installmentModal.savedId);
                            setInstallmentModal(null); fetchTransactions(selectedAccount); fetchAccounts();
                        }}
                    />
                </div>
            )}

            {rateioModal && (
                <div className="modal-overlay">
                    <RateioModal
                        modal={rateioModal}
                        onConfirm={saveRateio}
                        onCancel={() => setRateioModal(null)}
                    />
                </div>
            )}


            {beneficiaryModalOpen && (
                <div className="modal-overlay" onClick={() => setBeneficiaryModalOpen(false)}>
                    <div className="modal-box bg-white rounded-lg shadow-2xl w-[600px] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-[#00695c]">Selecionar Fornecedor</h3>
                            <button onClick={() => setBeneficiaryModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-4 overflow-auto">
                            <input 
                                type="text" 
                                placeholder="🔍 Pesquisar fornecedor..." 
                                className="w-full p-2 mb-4 border rounded text-sm outline-none focus:border-[#00695c]" 
                                autoFocus
                                onChange={(e) => {
                                    const q = e.target.value.toLowerCase();
                                    const items = document.querySelectorAll('.beneficiary-item');
                                    items.forEach(item => {
                                        const text = item.textContent.toLowerCase();
                                        item.style.display = text.includes(q) ? 'flex' : 'none';
                                    });
                                }}
                            />
                            <div className="space-y-1">
                                {options.vendors.map(v => (
                                    <div 
                                        key={v.id} 
                                        className="beneficiary-item flex justify-between p-2 hover:bg-gray-100 rounded cursor-pointer text-sm border-b border-gray-50 last:border-0"
                                        onClick={() => {
                                            handleInputChange(activeRowId, 'beneficiary_id', v.name);
                                            setBeneficiaryModalOpen(false);
                                            handleSave(activeRowId);
                                        }}
                                    >
                                        <span className="font-medium">{v.name}</span>
                                        <span className="text-[10px] text-gray-400">ID: {v.id.substring(0, 8)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default Transactions;

