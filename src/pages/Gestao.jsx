import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';

const cards = [
    {
        to: '/gestao/dashboard',
        icon: '📊',
        title: 'DashBoard',
        desc: 'Visão geral dos saldos, entradas e saídas de todas as contas',
        color: '#1565c0',
        bg: '#e3f2fd',
    },
    {
        to: '/gestao/ponto-equilibrio',
        icon: '⚖️',
        title: 'Equilíbrio Financeiro',
        desc: 'Análise do equilíbrio financeiro entre receitas e despesas',
        color: '#2e7d32',
        bg: '#e8f5e9',
    },
    {
        to: '/gestao/analise-financeira',
        icon: '📈',
        title: 'Análise Financeira',
        desc: 'Indicadores e análise detalhada da saúde financeira',
        color: '#6a1b9a',
        bg: '#f3e5f5',
    },
];

const Gestao = () => {
    const navigate = useNavigate();
    return (
        <MainLayout title="Gestão">
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', gap: 24, padding: 32,
            }}>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 'bold', color: '#00695c', letterSpacing: '0.1em', textTransform: 'uppercase' }}>GESTÃO FINANCEIRA</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Selecione um módulo</div>
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {cards.map(card => (
                        <div
                            key={card.to}
                            onClick={() => navigate(card.to)}
                            style={{
                                width: 220, padding: '28px 20px', borderRadius: 12,
                                background: '#fff', border: `2px solid ${card.bg}`,
                                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                cursor: 'pointer', textAlign: 'center',
                                transition: 'all 0.18s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = card.color;
                                e.currentTarget.style.boxShadow = `0 6px 24px ${card.color}33`;
                                e.currentTarget.style.transform = 'translateY(-3px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = card.bg;
                                e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            <div style={{ fontSize: 40, marginBottom: 12 }}>{card.icon}</div>
                            <div style={{ fontSize: 14, fontWeight: 'bold', color: card.color, marginBottom: 8 }}>{card.title}</div>
                            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>{card.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </MainLayout>
    );
};

export default Gestao;
