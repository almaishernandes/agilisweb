import { useState, useEffect } from 'react';
import { CreditCard, Landmark } from 'lucide-react';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TYPE_ORDER = [
    'CARTÃO DE CRÉDITO',
    'CONTA CORRENTE',
    'POUPANÇA',
    'DINHEIRO',
    'FORNECEDOR',
];

const typeColor = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('crédito') || t.includes('credito')) return '#ef4444';
    if (t.includes('poupança') || t.includes('poupanca') || t.includes('invest')) return '#10b981';
    if (t.includes('dinheiro')) return '#f59e0b';
    return '#0ea5e9';
};

export default function SaldoContas() {
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState([]);

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        const ctx = await getSecurityContext();

        const { data: accs } = await supabase
            .from('accounts')
            .select('id, name, account_type, initial_balance')
            .eq('family_id', ctx.family_id);

        const { data: allTxs } = await supabase
            .from('transactions')
            .select('amount, dc_type, account_id')
            .eq('family_id', ctx.family_id);

        const balanceByAccount = {};
        (accs || []).forEach(a => { balanceByAccount[a.id] = Number(a.initial_balance || 0); });
        (allTxs || []).forEach(t => {
            if (!balanceByAccount.hasOwnProperty(t.account_id)) return;
            const amt = Number(t.amount || 0);
            balanceByAccount[t.account_id] += t.dc_type === 'C' ? amt : -amt;
        });

        const accountsWithBalance = (accs || []).map(a => ({
            ...a, saldo: balanceByAccount[a.id] || 0,
        }));

        const byType = {};
        accountsWithBalance.forEach(a => {
            const type = (a.account_type || 'OUTROS').toUpperCase();
            if (!byType[type]) byType[type] = [];
            byType[type].push(a);
        });

        const orderedTypes = [
            ...TYPE_ORDER.filter(t => byType[t]),
            ...Object.keys(byType).filter(t => !TYPE_ORDER.includes(t)).sort(),
        ];

        const grouped = orderedTypes.map(type => {
            const list = byType[type].sort((a, b) => a.name.localeCompare(b.name));
            const subtotal = list.reduce((s, a) => s + a.saldo, 0);
            return { type, accounts: list, subtotal };
        });

        setGroups(grouped);
        setLoading(false);
    }

    if (loading) return (
        <MainLayout title="Saldo das Contas">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>
                Carregando saldos...
            </div>
        </MainLayout>
    );

    return (
        <MainLayout title="Saldo das Contas">
            <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%', background: '#f1f5f9' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Saldo das Contas</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Saldo atual de cada conta, agrupado por tipo</div>
                    </div>
                </div>

                {/* Grupos por tipo */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {groups.map(group => {
                        const color = typeColor(group.type);
                        return (
                            <div key={group.type} style={{ background: `linear-gradient(135deg, ${color}14 0%, #ffffff 55%)`, borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', border: `1px solid ${color}22` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                        <Landmark size={14} color={color} style={{ flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.type}</span>
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: group.subtotal < 0 ? '#ef4444' : color, whiteSpace: 'nowrap' }}>
                                        {fmtBRL(group.subtotal)}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {group.accounts.map(acc => (
                                        <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <CreditCard size={12} color={color} />
                                                <span style={{ fontSize: 12, color: '#475569' }}>{acc.name}</span>
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 'bold', color: acc.saldo < 0 ? '#ef4444' : '#1e293b' }}>{fmtBRL(acc.saldo)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>
        </MainLayout>
    );
}
