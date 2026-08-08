import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Users, Menu, X } from 'lucide-react';
import { getSecurityContext, signOut } from '../lib/auth';

const NAV_ITEMS = [
    { to: '/accounts',     label: 'GERENCIADOR', match: p => p === '/accounts' || p.startsWith('/categories') || p === '/cost-centers' || p === '/chart-of-accounts' || p === '/beneficiaries' || p === '/anotacoes' },
    { to: '/transactions', label: 'LANÇAMENTOS',  match: p => p.startsWith('/transactions') || p.startsWith('/import') || p.startsWith('/export') || p.startsWith('/cotacao-precos') },
    { to: '/reports',      label: 'RELATÓRIOS',   match: p => p.startsWith('/reports') || p.startsWith('/fornecedores-relatorio') },
    { to: '/gestao',       label: 'GESTÃO',       match: p => p.startsWith('/gestao') },
];

const SIDEBAR_MAP = [
    {
        test: p => p.startsWith('/gestao'),
        items: [
            { to: '/gestao/dashboard',          label: 'DashBoard' },
            { to: '/gestao/saldo-contas',       label: 'Saldo das Contas' },
            { to: '/gestao/ponto-equilibrio',   label: 'Equilíbrio Financeiro' },
            { to: '/gestao/analise-financeira', label: 'Análise Financeira' },
        ],
    },
    {
        test: p => p.startsWith('/reports') || p.startsWith('/fornecedores-relatorio'),
        items: [
            { to: '/reports/cash-flow',       label: 'Fluxo de Caixa' },
            { to: '/reports/balancetes',      label: 'Centro de Custos' },
            { to: '/reports/plano-contas',    label: 'Plano de Contas' },
            { to: '/fornecedores-relatorio',  label: 'Fornecedores' },
        ],
    },
    {
        test: p => p === '/accounts' || p.startsWith('/categories') || p === '/cost-centers' || p === '/chart-of-accounts' || p === '/beneficiaries' || p === '/anotacoes',
        items: [
            { to: '/accounts',          label: 'Contas' },
            { to: '/cost-centers',      label: 'Centro de Custo' },
            { to: '/chart-of-accounts', label: 'Plano de Contas' },
            { to: '/beneficiaries',     label: 'Fornecedores' },
            { to: '/anotacoes',         label: 'Anotações' },
        ],
    },
    {
        test: p => p.startsWith('/integracao'),
        items: [
            { to: '/integracao/nfce',   label: 'NFC-e / Cupom Fiscal' },
            { to: '/integracao/mobile', label: 'NFC-App Agilis' },
        ],
    },
    {
        test: () => true,
        items: [
            { to: '/transactions',    label: 'Movimentação' },
            { to: '/integracao/nfce', label: 'Integração' },
            { to: '/cotacao-precos',  label: 'Cotação de Preços' },
        ],
    },
];

const MainLayout = ({ children, showSidebar = true, hideNav = false }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = React.useState(null);
    const [sidebarOpen, setSidebarOpen] = React.useState(false);

    React.useEffect(() => {
        getSecurityContext().then(setUser);
    }, []);

    // Fecha sidebar ao navegar
    React.useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    const handleSignOut = async () => {
        await signOut();
        navigate('/');
    };

    const sidebarItems = SIDEBAR_MAP.find(m => m.test(location.pathname))?.items || [];

    return (
        <div className="app-container" style={!showSidebar ? { gridTemplateColumns: '1fr' } : {}}>

            {/* ── Top Navigation Bar ─────────────────────────────────────── */}
            {!hideNav && (
                <nav className="top-nav">
                    {/* Hamburger (mobile) */}
                    {showSidebar && (
                        <button
                            className="hamburger-btn"
                            onClick={() => setSidebarOpen(o => !o)}
                            aria-label="Menu"
                        >
                            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    )}

                    {/* Logo */}
                    <button onClick={handleSignOut} className="logo-btn" title="Sair do Sistema"
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.25)'}
                    >
                        💰 <span className="logo-text">AGILI$</span>
                    </button>

                    {/* Nav links (desktop) */}
                    <div className="top-nav-links">
                        {NAV_ITEMS.map(({ to, label, match }) => {
                            const active = match(location.pathname);
                            return (
                                <Link key={label} to={to} className={`nav-link ${active ? 'nav-link-active' : ''}`}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.72)'; }}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                        <span className="nav-link-disabled">CONFIGURAÇÕES</span>
                    </div>

                    {/* User area */}
                    <div className="top-nav-user">
                        {user?.email ? (
                            <>
                                <div className="user-info">
                                    <span className="user-email">{user.email}</span>
                                    <span className="user-role">{user.role}</span>
                                </div>
                                {user?.role?.split(',').map(r => r.trim()).includes('Suporte') && (
                                    <button onClick={() => navigate('/users')} className="icon-btn" title="Gerenciar Usuários"
                                        style={{ color: location.pathname === '/users' ? '#a5d6a7' : 'rgba(255,255,255,0.7)' }}
                                    >
                                        <Users size={18} />
                                    </button>
                                )}
                                <button onClick={handleSignOut} className="icon-btn" title="Sair"
                                    onMouseEnter={e => e.currentTarget.style.color = '#ff8a80'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                                    style={{ color: 'rgba(255,255,255,0.7)' }}
                                >
                                    <LogOut size={18} />
                                </button>
                            </>
                        ) : (
                            <span style={{ fontSize: '10px', opacity: 0.5, color: 'white' }}>...</span>
                        )}
                    </div>
                </nav>
            )}

            {/* ── Overlay mobile (fecha sidebar ao clicar fora) ──────────── */}
            {sidebarOpen && showSidebar && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}

            {/* ── Sidebar ────────────────────────────────────────────────── */}
            {showSidebar && (
                <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
                    {/* Cabeçalho do menu mobile */}
                    <div className="sidebar-mobile-header">
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#CCFF00', letterSpacing: '0.05em' }}>MENU</span>
                        <button onClick={() => setSidebarOpen(false)} className="sidebar-close-btn"><X size={16} /></button>
                    </div>

                    <div className="sidebar-items-container">
                        {sidebarItems.map(({ to, label }) => (
                            <Link
                                key={to}
                                to={to}
                                className={`sidebar-item ${location.pathname === to ? 'active' : ''}`}
                                style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                                {label}
                            </Link>
                        ))}
                    </div>
                </aside>
            )}

            {/* ── Main Content ───────────────────────────────────────────── */}
            <main className="main-content" style={!showSidebar ? { gridColumn: '1 / -1' } : {}}>
                {children}
            </main>
        </div>
    );
};

export default MainLayout;
