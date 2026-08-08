import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signIn, signUp, resetPassword } from '../lib/auth';
import { supabase } from '../lib/supabase';

const Auth = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const typeParam = searchParams.get('type');

    const modeParam = searchParams.get('mode');
    const [mode, setMode] = useState(typeParam === 'recovery' ? 'recovery' : modeParam === 'forgot' ? 'forgot' : 'login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('Operacional');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        // Check if user is already logged in
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();
                navigate('/transactions');
            }
        });
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            if (mode === 'login') {
                const { error } = await signIn(email, password);
                if (error) throw error;
                navigate('/transactions');
            } else if (mode === 'register') {
                const { error } = await signUp(email, password, { role });
                if (error) throw error;
                setMessage({ type: 'success', text: 'Cadastro realizado! Verifique seu e-mail para confirmar.' });
            } else if (mode === 'forgot') {
                const { error } = await resetPassword(email);
                if (error) throw error;
                setMessage({ type: 'success', text: 'E-mail de recuperação enviado!' });
            } else if (mode === 'recovery') {
                const { error } = await supabase.auth.updateUser({ password });
                if (error) throw error;
                setMessage({ type: 'success', text: 'Senha atualizada com sucesso!' });
                setTimeout(() => setMode('login'), 2000);
            }
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Ocorreu um erro.' });
        } finally {
            setLoading(false);
        }
    };

    const roles = ['Administrador', 'Gestor', 'Operacional', 'Suporte'];

    return (
        <div style={styles.container}>
            <div style={styles.glassCard}>
                <div style={styles.header}>
                    <div style={styles.logoCircle}>$</div>
                    <h1 style={styles.title}>Agili$</h1>
                    <p style={styles.subtitle}>Agilidade Financeira</p>
                </div>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <h2 style={styles.formTitle}>
                        {mode === 'login' ? 'Entrar' :
                            mode === 'register' ? 'Criar Conta' :
                                mode === 'forgot' ? 'Recuperar Senha' : 'Nova Senha'}
                    </h2>

                    {message.text && (
                        <div style={{
                            ...styles.alert,
                            ...(message.type === 'error' ? styles.alertError : styles.alertSuccess)
                        }}>
                            {message.text}
                        </div>
                    )}

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>E-mail</label>
                        <input
                            type="email"
                            required
                            disabled={mode === 'recovery'}
                            style={styles.input}
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    {mode !== 'forgot' && (
                        <div style={styles.inputGroup}>
                            <label style={styles.label}>Senha</label>
                            <input
                                type="password"
                                required
                                style={styles.input}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    )}

                    {mode === 'register' && (
                        <div style={styles.inputGroup}>
                            <label style={styles.label}>Tipo de Usuário</label>
                            <select
                                style={styles.input}
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                            >
                                {roles.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    )}

                    <button type="submit" disabled={loading} style={styles.button}>
                        {loading ? 'Aguarde...' :
                            mode === 'login' ? 'Entrar no Sistema' :
                                mode === 'register' ? 'Cadastrar' :
                                    mode === 'forgot' ? 'Enviar E-mail' : 'Salvar Senha'}
                    </button>
                </form>

                <div style={styles.footer}>
                    {mode === 'login' ? (
                        <>
                            <span style={styles.link} onClick={() => setMode('forgot')}>Esqueceu a senha?</span>
                            <br />
                            Não tem conta? <span style={styles.linkBold} onClick={() => setMode('register')}>Cadastre-se</span>
                        </>
                    ) : (
                        <span style={styles.linkBold} onClick={() => setMode('login')}>Voltar para o Login</span>
                    )}
                </div>
            </div>

            {/* Background decorative elements */}
            <div style={styles.orb1}></div>
            <div style={styles.orb2}></div>
        </div>
    );
};

const styles = {
    container: {
        height: '100vh',
        width: '100vw',
        background: 'linear-gradient(135deg, #004d40 0%, #00695c 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif"
    },
    glassCard: {
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: '24px',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    },
    header: {
        textAlign: 'center',
        marginBottom: '30px'
    },
    logoCircle: {
        width: '60px',
        height: '60px',
        background: '#fbc02d',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
        fontWeight: 'bold',
        color: '#004d40',
        margin: '0 auto 15px',
        boxShadow: '0 4px 12px rgba(251, 192, 45, 0.4)'
    },
    title: {
        fontSize: '28px',
        color: '#004d40',
        fontWeight: '800',
        margin: 0,
        letterSpacing: '-1px'
    },
    subtitle: {
        fontSize: '14px',
        color: '#666',
        margin: '5px 0 0'
    },
    form: {
        width: '100%'
    },
    formTitle: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#2d3436',
        marginBottom: '20px',
        textAlign: 'center'
    },
    inputGroup: {
        marginBottom: '20px'
    },
    label: {
        display: 'block',
        fontSize: '12px',
        fontWeight: '600',
        color: '#636e72',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
    },
    input: {
        width: '100%',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '2px solid #eee',
        fontSize: '14px',
        transition: 'all 0.2s ease',
        outline: 'none',
        background: '#fafafa'
    },
    button: {
        width: '100%',
        padding: '14px',
        borderRadius: '12px',
        background: '#00695c',
        color: 'white',
        fontSize: '16px',
        fontWeight: '600',
        border: 'none',
        cursor: 'pointer',
        transition: 'transform 0.2s, background 0.2s',
        marginTop: '10px'
    },
    footer: {
        marginTop: '30px',
        fontSize: '14px',
        color: '#636e72',
        textAlign: 'center'
    },
    link: {
        color: '#00695c',
        cursor: 'pointer',
        fontSize: '13px'
    },
    linkBold: {
        color: '#004d40',
        fontWeight: '700',
        cursor: 'pointer'
    },
    alert: {
        padding: '12px',
        borderRadius: '8px',
        fontSize: '13px',
        marginBottom: '20px',
        textAlign: 'center'
    },
    alertError: {
        background: '#ffe4e4',
        color: '#d63031'
    },
    alertSuccess: {
        background: '#d1f7e3',
        color: '#27ae60'
    },
    orb1: {
        position: 'absolute',
        width: '400px',
        height: '400px',
        background: 'rgba(251, 192, 45, 0.15)',
        borderRadius: '50%',
        top: '-100px',
        right: '-100px',
        filter: 'blur(80px)'
    },
    orb2: {
        position: 'absolute',
        width: '300px',
        height: '300px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '50%',
        bottom: '-50px',
        left: '-50px',
        filter: 'blur(60px)'
    }
};

export default Auth;
