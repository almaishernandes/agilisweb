import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Wallet, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Link } from 'react-router-dom';

const Dashboard = () => {
    const [data, setData] = useState({ transactions: [], totals: { income: 5000, expense: 0 } });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        setError(null);
        try {
            // Fetch last transactions
            const { data: transactions, error: tError } = await supabase
                .from('transactions')
                .select('*, accounts(name)')
                .order('emission_date', { ascending: false })
                .limit(10);

            if (tError) throw tError;

            // Fetch totals
            const { data: expenses, error: eError } = await supabase
                .from('transactions')
                .select('amount, dc_type');
            
            if (eError) throw eError;

            const totalExpense = expenses?.reduce((acc, curr) => {
                if (curr.dc_type === 'D') return acc + Number(curr.amount);
                if (curr.dc_type === 'C') return acc - Number(curr.amount);
                return acc;
            }, 0) || 0;

            setData({
                transactions: transactions || [],
                totals: { income: 5000, expense: totalExpense }
            });
        } catch (err) {
            console.error('Erro no Dashboard:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const chartData = [
        { name: 'Orçado', value: data.totals.income, fill: '#334155' },
        { name: 'Realizado', value: data.totals.expense, fill: data.totals.expense > data.totals.income ? '#ef4444' : '#10b981' },
    ];

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in fade-in duration-500">
            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-6">
                    <strong>Erro de Conexão:</strong> {error}
                </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Termômetro de Equilíbrio */}
                <div className="lg:col-span-2 glass-card p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <TrendingUp className="text-success" size={20} />
                            Termômetro de Equilíbrio
                        </h3>
                        <span className="text-xs font-medium px-2 py-1 bg-surface-hover rounded text-text-muted">MÊS ATUAL</span>
                    </div>

                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 40 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" scale="band" stroke="#94a3b8" fontSize={12} width={80} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-4 flex justify-between items-end">
                        <div>
                            <p className="text-sm text-text-muted">Consumo do Orçamento</p>
                            <p className="text-2xl font-bold">
                                {((data.totals.expense / data.totals.income) * 100).toFixed(1)}%
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-text-muted">Saldo Restante</p>
                            <p className="text-xl font-semibold text-success">
                                R$ {(data.totals.income - data.totals.expense).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="flex flex-col gap-4">
                    <div className="glass-card p-6 flex-1">
                        <p className="text-text-muted text-sm mb-1">Total Gastos</p>
                        <h4 className="text-3xl font-bold text-red-400">
                            R$ {data.totals.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h4>
                        <div className="mt-4 flex items-center gap-2 text-xs text-red-500 bg-red-500/10 p-2 rounded">
                            <TrendingDown size={14} />
                            <span>+12.5% em relação ao mês anterior</span>
                        </div>
                    </div>
                    <div className="glass-card p-6 flex-1 border-l-4 border-l-primary">
                        <p className="text-text-muted text-sm mb-1">Frequência de Registro</p>
                        <h4 className="text-3xl font-bold">Alta</h4>
                        <div className="mt-4 flex items-center gap-2 text-xs text-primary bg-primary/10 p-2 rounded">
                            <Wallet size={14} />
                            <span>Automação rodando com 98% de precisão</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Transactions */}
            <section className="glass-card overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="font-semibold text-lg">Últimos Lançamentos</h3>
                    <Link to="/reports" className="text-primary text-sm hover:underline flex items-center gap-1">
                        Ver todos <ArrowRight size={14} />
                    </Link>
                </div>

                <div className="divide-y divide-border">
                    {data.transactions.length === 0 ? (
                        <div className="p-10 text-center text-text-muted">
                            Nenhum lançamento encontrado. Comece via WhatsApp!
                        </div>
                    ) : (
                        data.transactions.map((t) => (
                            <Link key={t.id} to={`/transaction/${t.id}`} className="block p-4 hover:bg-surface-hover transition-colors group">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold group-hover:text-primary transition-colors">{t.description || 'Lançamento sem descrição'}</p>
                                        <p className="text-xs text-text-muted">{t.accounts?.name} • {new Date(t.emission_date).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-lg">R$ {Number(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        <span className="text-[10px] bg-surface-hover px-2 py-0.5 rounded text-text-muted uppercase">{t.type}</span>
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
