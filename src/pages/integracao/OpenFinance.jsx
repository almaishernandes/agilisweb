import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { supabase } from '../../lib/supabase';
import { getSecurityContext } from '../../lib/auth';

const PLUGGY_CONNECT_SCRIPT_URL = 'https://cdn.pluggy.ai/pluggy-connect.js';

const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const STATUS_LABEL = {
    CONNECTED: { label: '✔ Conectado', bg: '#e8f5e9', color: '#2e7d32' },
    UPDATING: { label: '↻ Atualizando', bg: '#e3f2fd', color: '#1565c0' },
    LOGIN_ERROR: { label: '⚠ Erro de login', bg: '#ffebee', color: '#c62828' },
    OUTDATED: { label: '⏱ Desatualizado', bg: '#fff3e0', color: '#e65100' },
    WAITING_USER_INPUT: { label: '… Aguardando', bg: '#f5f5f5', color: '#888' },
    DISCONNECTED: { label: '✕ Desconectado', bg: '#f5f5f5', color: '#888' },
};

export default function OpenFinance() {
    const [connections, setConnections] = useState([]);
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState('');
    const [secCtx, setSecCtx] = useState({ family_id: null });
    const [editRow, setEditRow] = useState(null); // { id, beneficiary_id, cost_center_id, transaction_type_id }
    const [accounts, setAccounts] = useState([]);
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [chartAccounts, setChartAccounts] = useState([]);
    const channelRef = useRef(null);

    useEffect(() => {
        getSecurityContext().then(ctx => {
            setSecCtx(ctx);
            if (ctx.family_id) {
                fetchAll(ctx.family_id);
                subscribeRealtime(ctx.family_id);
            }
        });
        return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
    }, []);

    const fetchAll = async (familyId) => {
        setLoading(true);
        const [conn, stg, accs, bens, ccs, coas] = await Promise.all([
            supabase.from('bank_connections').select('*').eq('family_id', familyId).order('created_at', { ascending: false }),
            supabase.from('bank_transactions_staging').select('*').eq('family_id', familyId).eq('status', 'PENDING').order('transaction_date', { ascending: false }),
            supabase.from('accounts').select('id, name').eq('family_id', familyId),
            supabase.from('beneficiaries').select('id, name'),
            supabase.from('cost_centers').select('id, name, full_code').eq('family_id', familyId),
            supabase.from('chart_of_accounts').select('id, description, code').eq('family_id', familyId),
        ]);
        setConnections(conn.data || []);
        setPending(stg.data || []);
        setAccounts(accs.data || []);
        setBeneficiaries(bens.data || []);
        setCostCenters(ccs.data || []);
        setChartAccounts(coas.data || []);
        setLoading(false);
    };

    // Tempo real: quando o webhook grava novas linhas em staging ou atualiza
    // uma conexão, a tela reflete instantaneamente, sem precisar recarregar.
    const subscribeRealtime = (familyId) => {
        const channel = supabase
            .channel('open_finance_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bank_transactions_staging', filter: `family_id=eq.${familyId}` },
                (payload) => { if (payload.new.status === 'PENDING') setPending(prev => [payload.new, ...prev]); })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bank_transactions_staging', filter: `family_id=eq.${familyId}` },
                (payload) => {
                    setPending(prev => payload.new.status === 'PENDING'
                        ? prev.map(p => p.id === payload.new.id ? payload.new : p)
                        : prev.filter(p => p.id !== payload.new.id));
                })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_connections', filter: `family_id=eq.${familyId}` },
                (payload) => {
                    setConnections(prev => {
                        if (payload.eventType === 'DELETE') return prev.filter(c => c.id !== payload.old.id);
                        const exists = prev.some(c => c.id === payload.new.id);
                        return exists ? prev.map(c => c.id === payload.new.id ? payload.new : c) : [payload.new, ...prev];
                    });
                })
            .subscribe();
        channelRef.current = channel;
    };

    const loadPluggyScript = () => new Promise((resolve, reject) => {
        if (window.PluggyConnect) return resolve();
        const script = document.createElement('script');
        script.src = PLUGGY_CONNECT_SCRIPT_URL;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Falha ao carregar o widget de conexão bancária.'));
        document.body.appendChild(script);
    });

    // ── Conectar Nova Conta Bancária ─────────────────────────────────────────
    const handleConnectAccount = async () => {
        setConnectError('');
        setConnecting(true);
        try {
            await loadPluggyScript();

            const { data, error } = await supabase.functions.invoke('open-finance-connect-token', {
                body: { action: 'create' },
            });
            if (error || data?.error) throw new Error(data?.error || error.message);

            const pluggyConnect = new window.PluggyConnect({
                connectToken: data.connectToken,
                includeSandbox: false,
                onSuccess: async (itemData) => {
                    const { data: reg, error: regErr } = await supabase.functions.invoke('open-finance-connect-token', {
                        body: { action: 'register-item', itemId: itemData.item.id },
                    });
                    if (regErr || reg?.error) {
                        setConnectError(reg?.error || regErr.message);
                    } else {
                        setConnections(prev => [reg.connection, ...prev.filter(c => c.id !== reg.connection.id)]);
                    }
                    setConnecting(false);
                },
                onError: (err) => {
                    setConnectError(err?.message || 'Erro ao conectar conta bancária.');
                    setConnecting(false);
                },
                onClose: () => setConnecting(false),
            });
            pluggyConnect.init();
        } catch (err) {
            setConnectError(err.message);
            setConnecting(false);
        }
    };

    // ── Aprovação de Conciliação ──────────────────────────────────────────────
    const openEdit = (row) => setEditRow({
        id: row.id,
        beneficiary_id: row.suggested_beneficiary_id || '',
        cost_center_id: row.suggested_cost_center_id || '',
        transaction_type_id: row.suggested_chart_account_id || '',
        agilis_account_id: row.agilis_account_id || accounts[0]?.id || '',
    });

    const handleApprove = async (row, overrides = {}) => {
        const ctx = await getSecurityContext();
        const fields = { ...row, ...overrides };
        if (!fields.agilis_account_id) { alert('Selecione a conta AGILI$ para lançar esta transação.'); return; }

        const { data: inserted, error } = await supabase.from('transactions').insert([{
            account_id: fields.agilis_account_id,
            family_id: ctx.family_id,
            emission_date: row.transaction_date,
            due_date: row.transaction_date,
            description: row.description_raw || row.description,
            amount: row.amount,
            dc_type: row.dc_type,
            type: row.dc_type === 'C' ? 'Income' : 'Expense',
            beneficiary_id: fields.beneficiary_id || null,
            cost_center_id: fields.cost_center_id || null,
            transaction_type_id: fields.transaction_type_id || null,
            external_transaction_id: row.id,
            origin: 'OPEN_FINANCE',
            is_conciliated: true,
            user_id: ctx.user_id,
        }]).select().single();

        if (error) { alert('Erro ao lançar transação: ' + error.message); return; }

        await supabase.from('bank_transactions_staging').update({
            status: 'IMPORTED',
            matched_transaction_id: inserted.id,
            agilis_account_id: fields.agilis_account_id,
        }).eq('id', row.id);

        setPending(prev => prev.filter(p => p.id !== row.id));
        setEditRow(null);
    };

    const handleIgnore = async (row) => {
        await supabase.from('bank_transactions_staging').update({ status: 'IGNORED' }).eq('id', row.id);
        setPending(prev => prev.filter(p => p.id !== row.id));
    };

    // ── Estilos ──────────────────────────────────────────────────────────────
    const hdr = { background: '#89962F', color: '#fff', padding: '10px 16px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 };
    const card = { background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '16px 20px', marginBottom: '16px' };
    const thS = { padding: '7px 10px', background: '#f5f5f5', fontSize: '10px', fontWeight: 'bold', color: '#444', textAlign: 'left', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' };
    const tdS = { padding: '6px 10px', fontSize: '11px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' };
    const selectStyle = { width: '100%', border: '1px solid #ddd', borderRadius: '4px', padding: '4px 6px', fontSize: '11px' };

    return (
        <MainLayout>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5', overflowY: 'auto' }}>

                <div style={hdr}>
                    <span style={{ fontSize: '18px' }}>🏦</span>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                        Open Finance — Sincronização Bancária Automática
                    </span>
                    <button onClick={handleConnectAccount} disabled={connecting}
                        style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: '4px', padding: '4px 14px', fontSize: '10px', cursor: connecting ? 'wait' : 'pointer', fontWeight: 'bold' }}>
                        {connecting ? '⏳ Conectando...' : '➕ Conectar Nova Conta Bancária'}
                    </button>
                </div>

                {connectError && (
                    <div style={{ background: '#ffebee', color: '#c62828', padding: '8px 16px', fontSize: '11px', display: 'flex', gap: '10px' }}>
                        <span style={{ flex: 1 }}>⚠ {connectError}</span>
                        <button onClick={() => setConnectError('')} style={{ background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer' }}>✕</button>
                    </div>
                )}

                <div style={{ padding: '16px' }}>

                    {/* Conexões bancárias */}
                    <div style={card}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>
                            Contas Conectadas ({connections.length})
                        </div>
                        {connections.length === 0 ? (
                            <div style={{ color: '#aaa', fontSize: '12px', padding: '12px 0' }}>
                                Nenhuma conta bancária conectada ainda. Clique em "Conectar Nova Conta Bancária" para iniciar.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {connections.map(c => {
                                    const st = STATUS_LABEL[c.status] || STATUS_LABEL.WAITING_USER_INPUT;
                                    return (
                                        <div key={c.id} style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '10px 14px', minWidth: '220px' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#004d40' }}>{c.institution_name}</div>
                                            <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>Última sync: {c.last_synced_at ? new Date(c.last_synced_at).toLocaleString('pt-BR') : '—'}</div>
                                            <span style={{ marginTop: '6px', display: 'inline-block', fontSize: '9px', fontWeight: 'bold', background: st.bg, color: st.color, borderRadius: '4px', padding: '2px 8px' }}>
                                                {st.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Aprovação de Conciliação */}
                    <div style={card}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>
                            Aprovação de Conciliação — Pendentes ({pending.length})
                        </div>
                        {loading ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>Carregando...</div>
                        ) : pending.length === 0 ? (
                            <div style={{ color: '#aaa', fontSize: '12px', padding: '12px 0' }}>
                                Nenhuma transação pendente de revisão. Tudo conciliado! 🎉
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={thS}>Data</th>
                                        <th style={thS}>Descrição (banco)</th>
                                        <th style={{ ...thS, textAlign: 'right' }}>Valor</th>
                                        <th style={thS}>Sugestão</th>
                                        <th style={{ ...thS, textAlign: 'center' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pending.map(row => {
                                        const isEditing = editRow?.id === row.id;
                                        const suggestedCC = costCenters.find(c => c.id === row.suggested_cost_center_id);
                                        const suggestedCoa = chartAccounts.find(c => c.id === row.suggested_chart_account_id);
                                        return (
                                            <React.Fragment key={row.id}>
                                                <tr style={{ background: isEditing ? '#e3f2fd' : 'white' }}>
                                                    <td style={tdS}>{fmtDate(row.transaction_date)}</td>
                                                    <td style={tdS}>{row.description_raw || row.description}</td>
                                                    <td style={{ ...tdS, textAlign: 'right', fontWeight: 'bold', color: row.dc_type === 'D' ? '#c62828' : '#2e7d32' }}>
                                                        {row.dc_type === 'D' ? '-' : '+'} {fmtBRL(row.amount)}
                                                    </td>
                                                    <td style={tdS}>
                                                        {suggestedCC || suggestedCoa
                                                            ? <span style={{ fontSize: '9px', color: '#1565c0' }}>{suggestedCC?.name} {suggestedCoa ? `· ${suggestedCoa.description}` : ''}</span>
                                                            : <span style={{ fontSize: '9px', color: '#bbb' }}>Sem sugestão</span>}
                                                    </td>
                                                    <td style={{ ...tdS, textAlign: 'center' }}>
                                                        {!isEditing ? (
                                                            <>
                                                                <button onClick={() => openEdit(row)} style={{ background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: '4px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold', marginRight: '4px' }}>✓ Revisar</button>
                                                                <button onClick={() => handleIgnore(row)} style={{ background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '4px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold' }}>✕ Ignorar</button>
                                                            </>
                                                        ) : (
                                                            <button onClick={() => setEditRow(null)} style={{ background: '#f5f5f5', color: '#555', border: '1px solid #ddd', borderRadius: '4px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer' }}>Fechar</button>
                                                        )}
                                                    </td>
                                                </tr>
                                                {isEditing && (
                                                    <tr style={{ background: '#e3f2fd' }}>
                                                        <td colSpan={5} style={{ padding: '10px 16px' }}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', alignItems: 'end' }}>
                                                                <div>
                                                                    <label style={{ fontSize: '9px', color: '#555', fontWeight: 'bold' }}>Conta AGILI$</label>
                                                                    <select style={selectStyle} value={editRow.agilis_account_id} onChange={e => setEditRow(r => ({ ...r, agilis_account_id: e.target.value }))}>
                                                                        <option value="">Selecione...</option>
                                                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label style={{ fontSize: '9px', color: '#555', fontWeight: 'bold' }}>Fornecedor</label>
                                                                    <select style={selectStyle} value={editRow.beneficiary_id} onChange={e => setEditRow(r => ({ ...r, beneficiary_id: e.target.value }))}>
                                                                        <option value="">—</option>
                                                                        {beneficiaries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label style={{ fontSize: '9px', color: '#555', fontWeight: 'bold' }}>Centro de Custo</label>
                                                                    <select style={selectStyle} value={editRow.cost_center_id} onChange={e => setEditRow(r => ({ ...r, cost_center_id: e.target.value }))}>
                                                                        <option value="">—</option>
                                                                        {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label style={{ fontSize: '9px', color: '#555', fontWeight: 'bold' }}>Plano de Contas</label>
                                                                    <select style={selectStyle} value={editRow.transaction_type_id} onChange={e => setEditRow(r => ({ ...r, transaction_type_id: e.target.value }))}>
                                                                        <option value="">—</option>
                                                                        {chartAccounts.map(c => <option key={c.id} value={c.id}>{c.description}</option>)}
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => handleApprove(row, editRow)}
                                                                style={{ marginTop: '10px', background: '#00695c', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 18px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                                ✔ Aprovar e Lançar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
