import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import SimpleListManager from './AccountTypesManager';
import Combobox from '../components/Combobox';

const AccountManager = () => {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [sortBy, setSortBy] = useState('account_type');
    const [sortDir, setSortDir] = useState('asc');
    const inputRef = useRef(null);
    const newRowRef = useRef(null);
    const accountsRef = useRef([]);

    const [accountTypes, setAccountTypes] = useState([]);
    const [institutions, setInstitutions] = useState([]);
    const [securityContext, setSecurityContext] = useState({ user_id: null, family_id: null });
    const [managerModal, setManagerModal] = useState(null); // 'account_types' | 'institutions'
    const [calculator, setCalculator] = useState({ isOpen: false, rowId: null, field: null, display: '', expression: '' });

    useEffect(() => {
        const init = async () => {
            const context = await getSecurityContext();
            setSecurityContext(context);
        };
        init();
    }, []);

    useEffect(() => {
        fetchAccounts().then(newTempId => {
            if (newTempId) setEditingCell({ id: newTempId, field: 'name' });
        });
        fetchOptions();
    }, [sortBy, sortDir]);

    const fetchOptions = async () => {
        const { data: types } = await supabase.from('account_types').select('name').order('name');
        const { data: insts } = await supabase.from('institutions').select('name').order('name');
        if (types) setAccountTypes(types.map(t => t.name));
        if (insts) setInstitutions(insts.map(i => i.name));
    };

    // Returns the new temp row ID — caller is responsible for setting editingCell
    const fetchAccounts = async () => {
        setLoading(true);
        const { data: accountsData, error: accountsError } = await supabase
            .from('accounts')
            .select('*')
            .order(sortBy, { ascending: sortDir === 'asc' })
            .order('name', { ascending: true });

        if (accountsError) {
            console.error('Error fetching accounts:', accountsError);
            setLoading(false);
            return null;
        }

        const { data: transactionsData } = await supabase
            .from('transactions')
            .select('account_id, amount, dc_type, type, emission_date');

        const today = new Date().toISOString().split('T')[0];

        const calculatedAccounts = (accountsData || []).map(acc => {
            const accTransactions = (transactionsData || []).filter(t => t.account_id === acc.id);
            let currentBalance = Number(acc.initial_balance || 0);
            let predictedBalance = Number(acc.initial_balance || 0);

            accTransactions.forEach(t => {
                const amount = Number(t.amount || 0);
                const isCredit = t.dc_type === 'C' || t.type === 'Income';
                const isDebit = t.dc_type === 'D' || t.type === 'Expense' || t.type === 'Deduction' || t.type === 'Dedução';

                if (isCredit) {
                    predictedBalance += amount;
                    if (t.emission_date <= today) currentBalance += amount;
                } else if (isDebit) {
                    predictedBalance -= amount;
                    if (t.emission_date <= today) currentBalance -= amount;
                }
            });

            return { ...acc, current_balance: currentBalance, predicted_balance: predictedBalance };
        });

        const newTempId = `temp-${Date.now()}`;
        const newAccounts = [
            ...calculatedAccounts,
            { id: newTempId, name: '', account_type: '', account_number: '', institution: '', closing_day: null, due_day: null, credit_limit: 0, initial_balance: 0, isNew: true }
        ];
        accountsRef.current = newAccounts;
        setAccounts(newAccounts);
        setLoading(false);
        return newTempId;
    };

    const accountTypeOptions = useMemo(() => accountTypes, [accountTypes]);
    const institutionOptions = useMemo(() => institutions, [institutions]);

    const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
    const isCartao = (type) => (type || '').toLowerCase().includes('cart');

    const getGroupBackground = (index) => {
        return (index % 2 !== 0)
            ? { background: '#fdd835', color: '#0d2137', fontWeight: 'bold' }
            : { background: '#e3f2fd', color: '#0d2137', fontWeight: 'bold' };
    };

    const columns = [
        { label: 'Nome',         key: 'name' },
        { label: 'Número',       key: 'account_number' },
        { label: 'Tipo',         key: 'account_type',   type: 'select', options: accountTypeOptions },
        { label: 'Instituição',  key: 'institution',    type: 'select', options: institutionOptions },
        { label: 'Limite',       key: 'credit_limit',   type: 'number', width: '100px', cardOnly: true },
        { label: 'Fechamento',   key: 'closing_day',    type: 'day',    width: '80px' },
        { label: 'Vencimento',   key: 'due_day',        type: 'day',    width: '80px' },
        { label: 'Saldo Inicial', key: 'initial_balance',   type: 'number' },
        { label: 'Saldo Atual',   key: 'current_balance',   type: 'number', readOnly: true },
        { label: 'Saldo Previsto',key: 'predicted_balance', type: 'number', readOnly: true },
    ];

    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingCell]);

    const openPicker = () => {
        try { inputRef.current?.showPicker(); } catch (e) {}
    };

    const handleHeaderClick = (key) => {
        if (key === sortBy) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortDir('asc');
        }
    };

    const handleCellClick = (id, field) => {
        setEditingCell({ id, field });
        setContextMenu(null);
    };

    const handleInputChange = (id, field, value) => {
        setAccounts(prev => {
            const next = prev.map(acc => acc.id === id ? { ...acc, [field]: value } : acc);
            accountsRef.current = next;
            return next;
        });
    };

    const handleKeyDown = (e, id, fieldIndex) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave(id, null);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const nextIdx = e.shiftKey ? fieldIndex - 1 : fieldIndex + 1;
            if (nextIdx >= 0 && nextIdx < columns.length) {
                handleSave(id, { id, field: columns[nextIdx].key });
            } else {
                handleSave(id, null);
            }
        }
    };

    // keepCell: { id, field } to restore editing after save, or null to close
    const handleSave = async (id, keepCell = null) => {
        const account = accountsRef.current.find(a => a.id === id) || accounts.find(a => a.id === id);
        if (!account) return;

        if (account.isNew && !account.name) {
            setEditingCell({ id, field: 'name' });
            return;
        }

        let context = securityContext;
        if (!context.family_id) {
            context = await getSecurityContext();
            setSecurityContext(context);
        }

        try {
            const { isNew } = account;
            const isCC = isCartao(account.account_type);
            const payload = {
                name:            account.name,
                account_type:    account.account_type   || null,
                account_number:  account.account_number || null,
                institution:     account.institution    || null,
                initial_balance: Number(account.initial_balance ?? 0),
                credit_limit:    isCC ? Number(account.credit_limit  ?? 0) : null,
                closing_day:     isCC ? (account.closing_day ?? null) : null,
                due_day:         isCC ? (account.due_day     ?? null) : null,
                family_id:       context.family_id
            };

            let result;
            if (isNew) {
                result = await supabase.from('accounts').insert([payload]).select();
            } else {
                result = await supabase.from('accounts').update(payload).eq('id', id).select();
            }

            if (result.error) {
                console.error('Supabase insert/update error:', result.error);
                alert(`Erro ao gravar conta: ${result.error.message}`);
                setEditingCell(null);
            } else if (!isNew && (!result.data || result.data.length === 0)) {
                alert('Conta não encontrada ou sem permissão.');
                setEditingCell(null);
            } else {
                const savedId = isNew ? result.data?.[0]?.id : null;
                const newTempId = await fetchAccounts();
                if (isNew && keepCell && savedId) {
                    // User tabbed to next field — stay on this row with real DB id
                    setEditingCell({ id: savedId, field: keepCell.field });
                } else if (isNew) {
                    // Enter or no keepCell — go to fresh blank row
                    setEditingCell({ id: newTempId, field: 'name' });
                } else {
                    // Editing existing row — stay on keepCell or close
                    setEditingCell(keepCell);
                }
            }
        } catch (err) {
            alert('Erro inesperado ao salvar: ' + err.message);
            setEditingCell(null);
        }
    };

    const addNewRow = () => {
        const newId = `temp-${Date.now()}`;
        setAccounts(prev => [
            ...prev,
            { id: newId, name: '', account_type: '', account_number: '', institution: '', closing_day: null, due_day: null, credit_limit: 0, initial_balance: 0, isNew: true }
        ]);
        setEditingCell({ id: newId, field: 'name' });
        setContextMenu(null);
    };

    const handleContextMenu = (e, id) => {
        e.preventDefault();
        const rowRect = e.currentTarget.getBoundingClientRect();
        const menuWidth = 200;
        let x = rowRect.right + 8;
        if (x + menuWidth > window.innerWidth) x = rowRect.left - menuWidth - 8;
        if (x < 8) x = 8;
        setContextMenu({ x, y: 0, id });
    };

    const deleteAccount = async (id) => {
        if (typeof id === 'string' && id.startsWith('temp-')) {
            setAccounts(prev => prev.filter(acc => acc.id !== id));
        } else {
            const { error } = await supabase.from('accounts').delete().eq('id', id);
            if (error) {
                console.error('Error deleting account:', error);
            } else {
                setAccounts(prev => prev.filter(acc => acc.id !== id));
            }
        }
        setContextMenu(null);
    };

    const fmtMoney = (v) => {
        const n = Number(v || 0);
        if (n === 0) return '—';
        return `R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    };

    const calcInput = (key) => {
        setCalculator(prev => {
            let { display, expression } = prev;
            if (key === 'C') return { ...prev, display: '', expression: '' };
            if (key === '⌫') { const nd = display.slice(0, -1); return { ...prev, display: nd, expression: nd }; }
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
            handleInputChange(rowId, field, rounded);
            handleSave(rowId, null);
        } catch { /* mantém valor atual */ }
        setCalculator(prev => ({ ...prev, isOpen: false }));
        setEditingCell(null);
    };

    const calcKeys = [
        ['7','8','9','/'],
        ['4','5','6','*'],
        ['1','2','3','-'],
        ['0',',','⌫','+'],
        ['C','','=',''],
    ];

    useEffect(() => {
        if (!calculator.isOpen) return;
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmCalculator(); return; }
            if (e.key === 'Escape') { setCalculator(p => ({ ...p, isOpen: false })); return; }
            if (e.key === 'Backspace') { calcInput('⌫'); return; }
            if (/^[0-9]$/.test(e.key)) { calcInput(e.key); return; }
            if (['+','-','*','/'].includes(e.key)) { calcInput(e.key); return; }
            if (e.key === ',' || e.key === '.') { calcInput(','); return; }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calculator.isOpen]);

    if (loading) {
        return (
            <MainLayout title="Gerenciador de contas">
                <div className="flex items-center justify-center h-full">
                    <p className="text-text-muted">Carregando contas...</p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout title="Gerenciador de contas">
            {managerModal && (
                <SimpleListManager
                    title={managerModal === 'account_types' ? 'Tipos de Conta' : 'Instituições'}
                    tableName={managerModal}
                    onClose={() => { setManagerModal(null); fetchOptions(); }}
                />
            )}
            <div onClick={() => setContextMenu(null)}>
                <table className="money-table">
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    style={{ width: col.width, cursor: 'pointer', textAlign: col.type === 'number' ? 'right' : 'left', paddingRight: col.type === 'number' ? '10px' : undefined }}
                                    onClick={() => handleHeaderClick(col.key)}
                                >
                                    <div className="flex items-center" style={{ justifyContent: col.type === 'number' ? 'flex-end' : 'space-between' }}>
                                        <span>{col.label}</span>
                                        {sortBy === col.key && (
                                            <span className="text-[10px] ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(() => {
                            let groupIndex = -1;
                            let lastType = null;

                            return accounts.map((account) => {
                                if (!account.isNew && account.account_type !== lastType) {
                                    groupIndex++;
                                    lastType = account.account_type;
                                }

                                return (
                                    <tr
                                        key={account.id}
                                        ref={account.isNew ? newRowRef : null}
                                        onContextMenu={(e) => handleContextMenu(e, account.id)}
                                        onDoubleClick={() => !account.isNew && navigate(`/transactions/${account.id}`)}
                                        className={account.isNew ? 'new-row-highlight-green' : ''}
                                        style={{
                                            cursor: account.isNew ? 'default' : 'pointer',
                                            ...(account.isNew ? {} : getGroupBackground(groupIndex))
                                        }}
                                    >
                                        {columns.map((col, idx) => {
                                            const isDay = col.type === 'day';
                                            const isSelect = col.type === 'select';
                                            const isCC = isCartao(account.account_type);
                                            const isDisabled = (isDay && !isCC) || (col.cardOnly && !isCC);
                                            const isEditing = !col.readOnly && editingCell?.id === account.id && editingCell?.field === col.key;
                                            const balVal = col.readOnly && col.type === 'number' ? Number(account[col.key] || 0) : null;

                                            return (
                                                <td
                                                    key={col.key}
                                                    className="editable-cell"
                                                    style={{
                                                        textAlign: isDay || col.type === 'number' ? 'right' : 'left',
                                                        paddingRight: col.type === 'number' ? '10px' : undefined,
                                                        background: isDisabled ? 'rgba(0,0,0,0.05)' : undefined,
                                                        color: balVal !== null
                                                            ? (balVal < 0 ? '#c62828' : balVal > 0 ? '#1b5e20' : '#555')
                                                            : isDisabled ? 'rgba(255,255,255,0.3)' : undefined,
                                                        fontWeight: col.readOnly && col.type === 'number' ? 'bold' : undefined,
                                                        overflow: (isEditing && isSelect) ? 'visible' : undefined,
                                                        cursor: col.readOnly ? 'default' : undefined,
                                                    }}
                                                    onClick={() => !isDisabled && !col.readOnly && handleCellClick(account.id, col.key)}
                                                    onDoubleClick={(e) => {
                                                        if (!isDisabled && col.type === 'number') {
                                                            e.stopPropagation();
                                                            const currentVal = Number(account[col.key] || 0);
                                                            setEditingCell(null);
                                                            setCalculator({ isOpen: true, rowId: account.id, field: col.key, display: currentVal > 0 ? String(currentVal) : '', expression: currentVal > 0 ? String(currentVal) : '' });
                                                        }
                                                    }}
                                                >
                                                    {isEditing && !isDisabled ? (
                                                        isDay ? (
                                                            <select
                                                                ref={inputRef}
                                                                className="spreadsheet-input"
                                                                value={account[col.key] || ''}
                                                                onChange={(e) => handleInputChange(account.id, col.key, e.target.value ? Number(e.target.value) : null)}
                                                                onBlur={() => handleSave(account.id, null)}
                                                                onKeyDown={(e) => handleKeyDown(e, account.id, idx)}
                                                                onFocus={openPicker}
                                                                onClick={openPicker}
                                                                autoFocus
                                                                style={{ width: '100%' }}
                                                            >
                                                                <option value="">-- selecione --</option>
                                                                {DAYS.map(d => <option key={d} value={Number(d)}>{d}</option>)}
                                                            </select>
                                                        ) : isSelect ? (
                                                            <Combobox
                                                                inputRef={inputRef}
                                                                value={account[col.key] || ''}
                                                                options={col.options}
                                                                onChange={(val) => handleInputChange(account.id, col.key, val)}
                                                                onAddNew={async (val) => {
                                                                    const table = col.key === 'account_type' ? 'account_types' : 'institutions';
                                                                    const { error } = await supabase.from(table).insert([{ name: val }]);
                                                                    if (error) { console.error('onAddNew error:', error); alert('Erro ao adicionar: ' + error.message); return; }
                                                                    await fetchOptions();
                                                                }}
                                                                onEditOption={async (oldVal, newVal) => {
                                                                    const table = col.key === 'account_type' ? 'account_types' : 'institutions';
                                                                    const { error } = await supabase.from(table).update({ name: newVal }).eq('name', oldVal);
                                                                    if (error) { console.error('onEditOption error:', error); alert('Erro ao editar: ' + error.message); return; }
                                                                    await fetchOptions();
                                                                }}
                                                                onDeleteOption={async (val) => {
                                                                    const table = col.key === 'account_type' ? 'account_types' : 'institutions';
                                                                    const { error } = await supabase.from(table).delete().eq('name', val);
                                                                    if (error) { console.error('onDeleteOption error:', error); alert('Erro ao excluir: ' + error.message); return; }
                                                                    await fetchOptions();
                                                                }}
                                                                onNavigate={(dir) => {
                                                                    const nextIdx = dir === 'back' ? idx - 1 : idx + 1;
                                                                    const nextCell = (nextIdx >= 0 && nextIdx < columns.length)
                                                                        ? { id: account.id, field: columns[nextIdx].key }
                                                                        : null;
                                                                    handleSave(account.id, nextCell);
                                                                }}
                                                                placeholder="Digite ou selecione..."
                                                            />
                                                        ) : (
                                                            <input
                                                                ref={inputRef}
                                                                className="spreadsheet-input"
                                                                type={col.type === 'number' ? 'number' : 'text'}
                                                                value={account[col.key] === null ? '' : account[col.key]}
                                                                onChange={(e) => handleInputChange(account.id, col.key, e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, account.id, idx)}
                                                                onBlur={() => handleSave(account.id, null)}
                                                                onFocus={(e) => e.target.select()}
                                                            />
                                                        )
                                                    ) : (
                                                        <div style={{ minHeight: '14px' }}>
                                                            {isDisabled
                                                                ? '—'
                                                                : isDay
                                                                    ? (account[col.key] ? String(account[col.key]).padStart(2, '0') : ' ')
                                                                    : col.type === 'number'
                                                                        ? fmtMoney(account[col.key])
                                                                        : (account[col.key] || ' ')
                                                            }
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            });
                        })()}
                    </tbody>
                </table>
            </div>

            <div className="p-2 text-[10px] text-text-muted mt-2 border-t border-dashed">
                <span><strong>Dica:</strong> TAB para navegar | ENTER para gravar ou avançar | BOTÃO DIREITO para incluir, editar, excluir</span>
            </div>

            {calculator.isOpen && (
                <div
                    style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 99999, background: '#1e293b', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: '10px', width: '180px' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmCalculator(); if (e.key === 'Escape') setCalculator(p => ({ ...p, isOpen: false })); }}
                    tabIndex={-1}
                >
                    <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '4px', textAlign: 'right' }}>
                        → {columns.find(c => c.key === calculator.field)?.label || calculator.field}
                    </div>
                    <div style={{ background: '#0f172a', borderRadius: '4px', padding: '6px 10px', marginBottom: '8px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold', color: '#f1f5f9', minHeight: '28px', letterSpacing: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {calculator.display || '0'}
                    </div>
                    {calcKeys.map((row, ri) => (
                        <div key={ri} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                            {row.map((k, ki) => k === '' ? (
                                <div key={ki} style={{ flex: 1 }} />
                            ) : k === '=' ? (
                                <button key={ki} onClick={confirmCalculator} style={{ flex: 2, padding: '8px 0', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>✓</button>
                            ) : (
                                <button key={ki} onClick={() => calcInput(k)} style={{ flex: 1, padding: '8px 0', background: ['C','⌫','/','*','-','+'].includes(k) ? '#475569' : '#334155', color: k === 'C' ? '#fca5a5' : '#f1f5f9', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>{k}</button>
                            ))}
                        </div>
                    ))}
                    <button onClick={() => setCalculator(p => ({ ...p, isOpen: false }))} style={{ width: '100%', marginTop: '2px', padding: '4px', background: '#374151', color: '#9ca3af', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>Fechar</button>
                </div>
            )}

            {contextMenu && (
                <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <div className="context-menu-item" onClick={() => addNewRow()}>Cadastrar</div>
                    <div className="context-menu-item" onClick={() => { setEditingCell({ id: contextMenu.id, field: 'name' }); setContextMenu(null); }}>Editar</div>
                    <div className="context-menu-item" onClick={() => { setSortBy('account_type'); setContextMenu(null); }}>Ordenar por Tipo</div>
                    <div className="context-menu-item" onClick={() => { setSortBy('institution'); setContextMenu(null); }}>Ordenar por Instituição</div>
                    <div className="context-menu-item" style={{ color: '#d32f2f' }} onClick={() => deleteAccount(contextMenu.id)}>Excluir</div>
                </div>
            )}
        </MainLayout>
    );
};

export default AccountManager;
