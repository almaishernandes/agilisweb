import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';
import { signIn } from '../lib/auth';

const Home = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loginModal, setLoginModal] = useState(null); // { email: '' }
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    useEffect(() => {

        supabase.functions.invoke('public-users').then(({ data, error }) => {
            if (!error && data) setUsers(data);
        });
    }, [navigate]);

    const openLoginModal = (userEmail) => {
        setLoginEmail(userEmail || '');
        setLoginPassword('');
        setLoginError('');
        setLoginModal(true);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError('');
        try {
            const { error } = await signIn(loginEmail, loginPassword);
            if (error) throw error;
            navigate('/transactions');
        } catch (err) {
            setLoginError(err.message || 'E-mail ou senha inválidos.');
        } finally {
            setLoginLoading(false);
        }
    };

    const getCardStyle = (role) => {
        switch (role) {
            case 'Todos':
                return {
                    background: 'linear-gradient(135deg, #37474f 0%, #212121 100%)',
                    accent: '#00e5ff',
                    text: '#ffffff'
                };
            case 'Administrador':
                return {
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #000000 100%)',
                    accent: '#fbc02d',
                    text: '#ffffff'
                };
            case 'Gestor':
                return {
                    background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
                    accent: '#dae0e6',
                    text: '#ffffff'
                };
            case 'Operacional':
                return {
                    background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
                    accent: '#ffffff',
                    text: '#ffffff'
                };
            case 'Suporte':
                return {
                    background: 'linear-gradient(135deg, #006064 0%, #00838f 100%)',
                    accent: '#e0f7fa',
                    text: '#ffffff'
                };
            default:
                return {
                    background: 'linear-gradient(135deg, #424242 0%, #212121 100%)',
                    accent: '#ffffff',
                    text: '#ffffff'
                };
        }
    };

    const RoleCard = ({ role }) => {
        const style = getCardStyle(role);

        return (
            <div
                style={{
                    ...styles.card,
                    background: style.background,
                    color: style.text,
                    transform: 'none',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
                }}
                className="user-credit-card"
            >
                <div style={styles.cardHeader}>
                    <div style={{ ...styles.chip, background: `linear-gradient(135deg, ${style.accent} 0%, ${style.accent}cc 100%)` }}>
                        <div style={styles.chipLine}></div>
                        <div style={styles.chipLine}></div>
                        <div style={styles.chipLine}></div>
                    </div>
                    <div style={styles.logoArea}>
                        <span style={{ ...styles.cardLogo, color: style.accent }}>Agili$</span>
                        <span style={styles.cardSubLogo}>FINANCEIRO</span>
                    </div>
                </div>

                <div style={styles.cardCenter}>
                    <div style={{ ...styles.roleTitle, color: style.accent, border: `1px solid ${style.accent}44`, padding: '4px 16px', borderRadius: '40px' }}>
                        {role.toUpperCase()}
                    </div>
                </div>

                <div style={styles.cardFooter}>
                    <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', opacity: 0.8 }}>
                        {role?.split(',').map(r => r.trim()).includes('Suporte') ? 'DEV MASTER' : 'ACESSO SEGURO'}
                    </div>
                    <div style={styles.visaLogo}>
                        <div style={styles.visaCircle1}></div>
                        <div style={styles.visaCircle2}></div>
                    </div>
                </div>
            </div>
        );
    };

    const UserColumnCard = ({ user, accentColor }) => (
        <div
            onClick={() => openLoginModal(user.email)}
            style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '8px 12px',
                border: `1px solid ${accentColor}44`,
                cursor: 'pointer',
            }}
            className="user-column-card"
        >
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.full_name || 'Usuário'}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
            </div>
        </div>
    );

    return (
        <MainLayout title="" showSidebar={false} hideNav={true}>
            <div style={styles.container}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.1, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <div style={{ fontSize: '20vw', fontWeight: '900', letterSpacing: '-5px', transform: 'rotate(-5deg)', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.05)' }}>Agili$</div>
                </div>

                <div style={styles.columnsContainer}>
                    {['Suporte', 'Administrador', 'Gestor', 'Operacional'].map(role => {
                        const style = getCardStyle(role);
                        const roleUsers = users.filter(u => {
                            const userRole = (u.role || '').toLowerCase();
                            return userRole.includes(role.toLowerCase());
                        });

                        return (
                            <div key={role} style={styles.column}>
                                <RoleCard role={role} />
                                
                                <div style={styles.usersListContainer}>
                                    {roleUsers.length > 0 ? (
                                        roleUsers.map(u => (
                                            <UserColumnCard 
                                                key={u.id} 
                                                user={u} 
                                                accentColor={style.accent} 
                                            />
                                        ))
                                    ) : (
                                        <div style={styles.emptyText}>
                                            Nenhum usuário cadastrado
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Login Modal */}
            {loginModal && (
                <div className="modal-overlay" onClick={() => setLoginModal(null)}>
                    <div className="modal-box" style={{ background: '#fff', borderRadius: '20px', padding: '40px', width: '360px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ width: '52px', height: '52px', background: '#fbc02d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold', color: '#004d40', margin: '0 auto 12px' }}>$</div>
                            <h2 style={{ margin: 0, fontSize: '20px', color: '#004d40', fontWeight: '800' }}>Entrar no Sistema</h2>
                            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#888' }}>Informe suas credenciais de acesso</p>
                        </div>
                        <form onSubmit={handleLogin}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#636e72', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>E-mail</label>
                                <input
                                    type="email"
                                    required
                                    autoFocus
                                    value={loginEmail}
                                    onChange={e => setLoginEmail(e.target.value)}
                                    style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '2px solid #eee', fontSize: '14px', outline: 'none', background: '#fafafa', boxSizing: 'border-box' }}
                                    placeholder="seu@email.com"
                                />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#636e72', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Senha</label>
                                <input
                                    type="password"
                                    required
                                    value={loginPassword}
                                    onChange={e => setLoginPassword(e.target.value)}
                                    style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '2px solid #eee', fontSize: '14px', outline: 'none', background: '#fafafa', boxSizing: 'border-box' }}
                                    placeholder="••••••••"
                                />
                            </div>
                            {loginError && (
                                <div style={{ background: '#ffe4e4', color: '#d63031', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
                                    {loginError}
                                </div>
                            )}
                            <button type="submit" disabled={loginLoading} style={{ width: '100%', padding: '13px', borderRadius: '12px', background: '#00695c', color: '#fff', fontWeight: '700', fontSize: '15px', border: 'none', cursor: 'pointer' }}>
                                {loginLoading ? 'Aguarde...' : 'Entrar'}
                            </button>
                        </form>
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                            <span style={{ fontSize: '12px', color: '#00695c', cursor: 'pointer' }}
                                onClick={() => { setLoginModal(null); navigate('/auth?mode=forgot'); }}>
                                Esqueceu a senha?
                            </span>
                        </div>
                        <button onClick={() => setLoginModal(null)} style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
                    </div>
                </div>
            )}

            <style>{`
                .user-credit-card {
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    position: relative;
                    overflow: hidden;
                }
                .user-credit-card:hover {
                    transform: translateY(-15px) scale(1.03);
                    box-shadow: 0 40px 80px rgba(0,0,0,0.5);
                }
                .user-credit-card::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: linear-gradient(
                        45deg,
                        transparent 0%,
                        rgba(255,255,255,0.05) 45%,
                        rgba(255,255,255,0.1) 50%,
                        rgba(255,255,255,0.05) 55%,
                        transparent 100%
                    );
                    transform: rotate(45deg);
                    animation: shine 4s infinite;
                }
                @keyframes shine {
                    0% { transform: translateX(-100%) rotate(45deg); }
                    100% { transform: translateX(100%) rotate(45deg); }
                }
            `}</style>
        </MainLayout>
    );
};

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #004d40 0%, #00695c 100%)',
        position: 'relative',
        overflow: 'hidden' // ensure watermark doesn't cause scrolling
    },
    columnsContainer: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        width: '100%',
        maxWidth: '1200px',
        gap: '24px',
        zIndex: 5,
        marginTop: '40px',
        flexWrap: 'wrap'
    },
    column: {
        display: 'flex',
        flexDirection: 'column',
        width: '270px',
        gap: '16px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '24px',
        padding: '16px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        backdropFilter: 'blur(8px)',
        height: 'fit-content',
        minHeight: '450px'
    },
    usersListContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%'
    },
    emptyText: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontStyle: 'italic',
        fontSize: '11px',
        textAlign: 'center',
        padding: '24px 0',
        background: 'rgba(0, 0, 0, 0.1)',
        borderRadius: '12px',
        border: '1px dashed rgba(255, 255, 255, 0.05)'
    },
    card: {
        width: '100%',
        height: '115px', // slightly smaller to fit perfectly
        borderRadius: '16px',
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
        color: 'white',
        border: '1px solid rgba(255,255,255,0.1)',
        transition: 'all 0.3s ease'
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    },
    chip: {
        width: '40px',
        height: '28px',
        borderRadius: '6px',
        padding: '6px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
    },
    chipLine: {
        height: '1px',
        background: 'rgba(0,0,0,0.2)',
        width: '100%'
    },
    logoArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end'
    },
    cardLogo: {
        fontSize: '20px',
        fontWeight: '900',
        letterSpacing: '-1px'
    },
    cardSubLogo: {
        fontSize: '9px',
        fontWeight: 'bold',
        opacity: 0.8,
        letterSpacing: '1.5px'
    },
    cardCenter: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
    },
    roleTitle: {
        fontSize: '15px',
        fontWeight: '800',
        letterSpacing: '1.5px'
    },
    cardFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    accessBtn: {
        padding: '5px 18px',
        borderRadius: '8px',
        fontSize: '11px',
        fontWeight: '800',
        letterSpacing: '1px'
    },
    visaLogo: {
        display: 'flex',
        position: 'relative',
        width: '36px',
        height: '22px'
    },
    visaCircle1: {
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: 'rgba(235, 0, 27, 0.8)',
        position: 'absolute',
        left: 0
    },
    visaCircle2: {
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: 'rgba(247, 158, 27, 0.8)',
        position: 'absolute',
        right: 0
    },
    logoWatermark: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 0.04,
        width: '800px',
        pointerEvents: 'none',
        zIndex: 0
    },
    watermarkImg: {
        width: '100%',
        height: 'auto'
    },
    actions: {
        marginTop: '60px',
        zIndex: 5,
        display: 'flex',
        gap: '20px'
    },
    signOutBtn: {
        background: 'rgba(255,255,255,0.8)',
        border: '1px solid #ddd',
        color: '#666',
        fontSize: '14px',
        fontWeight: '700',
        cursor: 'pointer',
        padding: '12px 24px',
        borderRadius: '12px',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    }
};

export default Home;
