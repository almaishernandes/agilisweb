import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Save, Edit3, Trash2, CheckCircle, AlertCircle } from 'lucide-react';

const TransactionDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [transaction, setTransaction] = useState(null);
    const [items, setItems] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);

    useEffect(() => {
        fetchData();
    }, [id]);

    async function fetchData() {
        setLoading(true);

        // Fetch transaction header
        const { data: tData } = await supabase
            .from('transactions')
            .select('*, accounts(name)')
            .eq('id', id)
            .single();

        setTransaction(tData);

        // Fetch items
        const { data: iData } = await supabase
            .from('transaction_items')
            .select('*, cost_centers(description)')
            .eq('transaction_id', id);

        setItems(iData || []);

        // Fetch CCs for dropdown
        const { data: ccData } = await supabase.from('cost_centers').select('*');
        setCostCenters(ccData || []);

        setLoading(false);
    }

    const handleCCChange = (itemId, newCCId) => {
        setItems(items.map(item =>
            item.id === itemId ? { ...item, cost_center_id: newCCId } : item
        ));
    };

    async function handleSave() {
        setSaving(true);
        setStatus(null);

        const updates = items.map(item => ({
            id: item.id,
            cost_center_id: item.cost_center_id
        }));

        // In a real app we'd batch this, for now loops or a specific RPC
        for (const update of updates) {
            await supabase
                .from('transaction_items')
                .update({ cost_center_id: update.cost_center_id })
                .eq('id', update.id);
        }

        setSaving(false);
        setStatus('success');
        setTimeout(() => setStatus(null), 3000);
    }

    if (loading) return <div className="p-10 text-center">Carregando detalhes...</div>;
    if (!transaction) return <div className="p-10 text-center">Transação não encontrada.</div>;

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-hover rounded-full transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h2 className="text-2xl font-bold">{transaction.description || 'Lançamento sem descrição'}</h2>
                    <p className="text-text-muted">{new Date(transaction.emission_date).toLocaleDateString('pt-BR')} • {transaction.accounts?.name}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="glass-card p-6 border-l-4 border-l-primary">
                    <p className="text-text-muted text-sm mb-1">Valor Total</p>
                    <h3 className="text-2xl font-bold">R$ {Number(transaction.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                </div>
                <div className="glass-card p-6">
                    <p className="text-text-muted text-sm mb-1">Total de Itens</p>
                    <h3 className="text-2xl font-bold">{items.length}</h3>
                </div>
                <div className="glass-card p-6">
                    <p className="text-text-muted text-sm mb-1">Origem</p>
                    <h3 className="text-lg font-medium truncate">{transaction.type || 'WhatsApp'}</h3>
                </div>
            </div>

            <section className="glass-card">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Edit3 size={20} className="text-primary" />
                        Detalhes dos Itens
                    </h3>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary flex items-center gap-2"
                    >
                        {saving ? 'Salvando...' : (
                            <>
                                <Save size={18} />
                                <span>Salvar Alterações</span>
                            </>
                        )}
                    </button>
                </div>

                {status === 'success' && (
                    <div className="m-6 p-3 bg-success/20 border border-success/30 text-success text-sm rounded-lg flex items-center gap-2 animate-in fade-in zoom-in-95">
                        <CheckCircle size={16} />
                        Lançamentos atualizados com sucesso!
                    </div>
                )}

                <div className="divide-y divide-border">
                    {items.map((item) => (
                        <div key={item.id} className="p-4 md:p-6 hover:bg-white/5 transition-colors">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex-1">
                                    <p className="font-semibold text-lg">{item.description}</p>
                                    <p className="text-sm font-bold text-primary">R$ {Number(item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>

                                <div className="flex flex-col gap-1 w-full md:w-64">
                                    <label className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Centro de Custo</label>
                                    <select
                                        value={item.cost_center_id || ''}
                                        onChange={(e) => handleCCChange(item.id, e.target.value)}
                                        className="w-full text-sm py-2 px-3 focus:ring-2 focus:ring-primary/50"
                                    >
                                        <option value="">Selecione...</option>
                                        {costCenters.map(cc => (
                                            <option key={cc.id} value={cc.id}>{cc.description}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <div className="mt-8 flex justify-between items-center text-text-muted text-sm px-6">
                <div className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>A IA sugeriu estes centros de custo baseados no seu histórico.</span>
                </div>
                <button className="flex items-center gap-2 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                    Excluir Lançamento
                </button>
            </div>
        </div>
    );
};

export default TransactionDetail;
