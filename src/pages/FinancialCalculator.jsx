import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

// ── Juros Simples ─────────────────────────────────────────────────────────────
const JurosSimples = () => {
    const [pv, setPv] = useState('');
    const [taxa, setTaxa] = useState('');
    const [n, setN] = useState('');
    const [res, setRes] = useState(null);
    const calc = () => {
        const P = parseFloat(pv), i = parseFloat(taxa) / 100, t = parseFloat(n);
        if (!P || !i || !t) return;
        const juros = P * i * t;
        setRes({ juros, montante: P + juros });
    };
    return (
        <Section title="Juros Simples" color="#1565c0">
            <Row label="Capital (R$)"><Input value={pv} onChange={setPv} /></Row>
            <Row label="Taxa (% a.m.)"><Input value={taxa} onChange={setTaxa} /></Row>
            <Row label="Período (meses)"><Input value={n} onChange={setN} /></Row>
            <Btn onClick={calc} />
            {res && <Result items={[['Juros', `R$ ${fmt(res.juros)}`], ['Montante', `R$ ${fmt(res.montante)}`]]} />}
        </Section>
    );
};

// ── Juros Compostos ───────────────────────────────────────────────────────────
const JurosCompostos = () => {
    const [pv, setPv] = useState('');
    const [taxa, setTaxa] = useState('');
    const [n, setN] = useState('');
    const [res, setRes] = useState(null);
    const calc = () => {
        const P = parseFloat(pv), i = parseFloat(taxa) / 100, t = parseFloat(n);
        if (!P || !i || !t) return;
        const montante = P * Math.pow(1 + i, t);
        setRes({ juros: montante - P, montante });
    };
    return (
        <Section title="Juros Compostos" color="#2e7d32">
            <Row label="Capital (R$)"><Input value={pv} onChange={setPv} /></Row>
            <Row label="Taxa (% a.m.)"><Input value={taxa} onChange={setTaxa} /></Row>
            <Row label="Período (meses)"><Input value={n} onChange={setN} /></Row>
            <Btn onClick={calc} />
            {res && <Result items={[['Juros', `R$ ${fmt(res.juros)}`], ['Montante', `R$ ${fmt(res.montante)}`]]} />}
        </Section>
    );
};

// ── Prestação (Price) ─────────────────────────────────────────────────────────
const TabelaPrice = () => {
    const [pv, setPv] = useState('');
    const [taxa, setTaxa] = useState('');
    const [n, setN] = useState('');
    const [res, setRes] = useState(null);
    const calc = () => {
        const P = parseFloat(pv), i = parseFloat(taxa) / 100, t = parseInt(n);
        if (!P || !i || !t) return;
        const pmt = P * (i * Math.pow(1 + i, t)) / (Math.pow(1 + i, t) - 1);
        const rows = [];
        let saldo = P;
        for (let k = 1; k <= t; k++) {
            const juros = saldo * i;
            const amort = pmt - juros;
            saldo -= amort;
            rows.push({ k, pmt, juros, amort, saldo: Math.max(saldo, 0) });
        }
        setRes({ pmt, rows });
    };
    return (
        <Section title="Tabela Price (Prestação Fixa)" color="#6a1b9a">
            <Row label="Valor Financiado (R$)"><Input value={pv} onChange={setPv} /></Row>
            <Row label="Taxa (% a.m.)"><Input value={taxa} onChange={setTaxa} /></Row>
            <Row label="Parcelas"><Input value={n} onChange={setN} /></Row>
            <Btn onClick={calc} />
            {res && (
                <>
                    <div style={{ marginTop: 8, padding: '6px 10px', background: '#f3e5f5', borderRadius: 4, fontSize: 12, fontWeight: 'bold', color: '#4a148c' }}>
                        Prestação mensal: R$ {fmt(res.pmt)} &nbsp;|&nbsp; Total pago: R$ {fmt(res.pmt * res.rows.length)}
                    </div>
                    <div style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto', fontSize: 11 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#e1bee7', position: 'sticky', top: 0 }}>
                                    {['#', 'Prestação', 'Juros', 'Amort.', 'Saldo'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'right', color: '#4a148c' }}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {res.rows.map(r => (
                                    <tr key={r.k} style={{ background: r.k % 2 ? '#fff' : '#fce4ec' }}>
                                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#888' }}>{r.k}</td>
                                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(r.pmt)}</td>
                                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#c62828' }}>{fmt(r.juros)}</td>
                                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#2e7d32' }}>{fmt(r.amort)}</td>
                                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(r.saldo)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </Section>
    );
};

// ── Desconto Comercial ────────────────────────────────────────────────────────
const Desconto = () => {
    const [vf, setVf] = useState('');
    const [taxa, setTaxa] = useState('');
    const [n, setN] = useState('');
    const [res, setRes] = useState(null);
    const calc = () => {
        const F = parseFloat(vf), d = parseFloat(taxa) / 100, t = parseFloat(n);
        if (!F || !d || !t) return;
        const desconto = F * d * t;
        setRes({ desconto, liquido: F - desconto });
    };
    return (
        <Section title="Desconto Comercial (por Fora)" color="#c62828">
            <Row label="Valor Futuro (R$)"><Input value={vf} onChange={setVf} /></Row>
            <Row label="Taxa desconto (% a.m.)"><Input value={taxa} onChange={setTaxa} /></Row>
            <Row label="Período (meses)"><Input value={n} onChange={setN} /></Row>
            <Btn onClick={calc} />
            {res && <Result items={[['Desconto', `R$ ${fmt(res.desconto)}`], ['Valor Líquido', `R$ ${fmt(res.liquido)}`]]} />}
        </Section>
    );
};

// ── Conversão de Taxas ────────────────────────────────────────────────────────
const ConversaoTaxas = () => {
    const [taxa, setTaxa] = useState('');
    const [de, setDe] = useState('mensal');
    const [para, setPara] = useState('anual');
    const [res, setRes] = useState(null);
    const periodos = { diario: 1 / 30, mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
    const calc = () => {
        const i = parseFloat(taxa) / 100;
        if (!i) return;
        const mensal = Math.pow(1 + i, periodos[de]) - 1;
        const convertida = (Math.pow(1 + mensal, 1 / periodos[para]) - 1) * 100;
        setRes(convertida);
    };
    const sel = { border: '1px solid #ccc', borderRadius: 4, padding: '4px 6px', fontSize: 12, outline: 'none' };
    return (
        <Section title="Conversão de Taxas" color="#00695c">
            <Row label="Taxa (%)"><Input value={taxa} onChange={setTaxa} /></Row>
            <Row label="De">
                <select value={de} onChange={e => setDe(e.target.value)} style={sel}>
                    {Object.keys(periodos).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </Row>
            <Row label="Para">
                <select value={para} onChange={e => setPara(e.target.value)} style={sel}>
                    {Object.keys(periodos).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </Row>
            <Btn onClick={calc} />
            {res !== null && <Result items={[[`Taxa ${para}`, `${pct(res)} %`]]} />}
        </Section>
    );
};

// ── Utilitários de UI ─────────────────────────────────────────────────────────
const Section = ({ title, color, children }) => (
    <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: color, color: '#fff', padding: '6px 10px', fontWeight: 'bold', fontSize: 11 }}>{title}</div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
);
const Row = ({ label, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 11, color: '#555', width: 130, flexShrink: 0 }}>{label}</label>
        {children}
    </div>
);
const Input = ({ value, onChange }) => (
    <input type="number" value={value} onChange={e => onChange(e.target.value)}
        style={{ border: '1px solid #ccc', borderRadius: 4, padding: '3px 6px', fontSize: 12, width: '100%', outline: 'none' }} />
);
const Btn = ({ onClick }) => (
    <button onClick={onClick}
        style={{ alignSelf: 'flex-start', padding: '4px 14px', background: '#00695c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>
        Calcular
    </button>
);
const Result = ({ items }) => (
    <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 4, padding: '5px 8px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {items.map(([label, value]) => (
            <div key={label}>
                <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: '#1b5e20' }}>{value}</div>
            </div>
        ))}
    </div>
);

// ── Página Principal ──────────────────────────────────────────────────────────
const FinancialCalculator = () => {
    const navigate = useNavigate();
    return (
        <MainLayout title="Calculadora Financeira">
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #e0e0e0', background: '#f9f9f9' }}>
                <button
                    onClick={() => navigate(-1)}
                    style={{ padding: '5px 16px', background: '#00695c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}
                >
                    ← Voltar para Movimentação
                </button>
            </div>
            <div style={{ padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, overflowY: 'auto' }}>
                <JurosSimples />
                <JurosCompostos />
                <TabelaPrice />
                <Desconto />
                <ConversaoTaxas />
            </div>
        </MainLayout>
    );
};

export default FinancialCalculator;
