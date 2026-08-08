import { useState, useEffect, useRef, Fragment } from 'react';
import { Plus, Trash2, FileSpreadsheet, X, Printer, MessageCircle, Search } from 'lucide-react';
import MainLayout from '../components/MainLayout';
import { supabase } from '../lib/supabase';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function SupplierSelect({ value, options, onChange }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const onClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const filtered = search
        ? options.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
        : options;

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            <button type="button" onClick={() => setOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, border: 'none', background: 'transparent', fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', cursor: 'pointer', padding: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{value}</span>
                <span style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
            </button>
            {open && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 260, maxHeight: 320, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>
                        <Search size={13} color="#94a3b8" />
                        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Pesquisar fornecedor..."
                            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, color: '#1e293b', textAlign: 'left' }} />
                    </div>
                    <div style={{ overflowY: 'auto', maxHeight: 270 }}>
                        {filtered.length > 0 ? filtered.map(b => (
                            <div key={b.id} onClick={() => { onChange(b.name); setOpen(false); setSearch(''); }}
                                style={{
                                    padding: '8px 12px', fontSize: 12, textAlign: 'left', cursor: 'pointer', color: '#1e293b',
                                    background: b.name === value ? '#0ea5e914' : 'transparent',
                                    fontWeight: b.name === value ? 700 : 400,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseLeave={e => e.currentTarget.style.background = b.name === value ? '#0ea5e914' : 'transparent'}>
                                {b.name}
                            </div>
                        )) : (
                            <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8', textAlign: 'left' }}>Nenhum fornecedor encontrado</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const UNIDADES_MEDIDA = [
    'UN', 'PC', 'PAR', 'KG', 'G', 'TON', 'L', 'ML', 'M', 'CM', 'M²', 'M³',
    'CX', 'PT', 'FD', 'PCT', 'SC', 'GL', 'RL', 'DZ', 'RESMA', 'FRD', 'AMP',
];

const SUPPLIER_COLORS = [
    { solid: '#0ea5e9', dark: '#0369a1' },
    { solid: '#8b5cf6', dark: '#6d28d9' },
    { solid: '#64748b', dark: '#334155' },
];

let uid = 0;
const newRow = () => ({
    id: `row-${++uid}`,
    produto: '',
    qtd: '',
    medida: '',
    fornecedores: [
        { unit: '' },
        { unit: '' },
        { unit: '' },
    ],
});

let cotacaoUid = 0;
const newCotacao = () => ({
    id: `cot-${++cotacaoUid}`,
    titulo: `Orçamento ${cotacaoUid}`,
    supplierNames: ['FORNECEDOR 1', 'FORNECEDOR 2', 'FORNECEDOR 3'],
    rows: [newRow(), newRow(), newRow()],
    detalhes: ['', '', ''],
    notasGerais: '',
    emails: ['', '', ''],
    telefones: ['', '', ''],
});

const STORAGE_KEY = 'agilis:cotacoes-precos';

const loadStoredCotacoes = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.cotacoes) || parsed.cotacoes.length === 0) return null;

        // Recalibra os contadores de id para não colidir com novos itens/cotações
        parsed.cotacoes.forEach(c => {
            const n = Number(String(c.id).replace('cot-', ''));
            if (n > cotacaoUid) cotacaoUid = n;
            if (!Array.isArray(c.detalhes)) c.detalhes = ['', '', ''];
            if (typeof c.notasGerais !== 'string') c.notasGerais = '';
            if (!Array.isArray(c.emails)) c.emails = ['', '', ''];
            if (!Array.isArray(c.telefones)) c.telefones = ['', '', ''];
            c.rows.forEach(r => {
                const rn = Number(String(r.id).replace('row-', ''));
                if (rn > uid) uid = rn;
            });
        });
        return parsed;
    } catch {
        return null;
    }
};

export default function CotacaoPrecos() {
    const stored = loadStoredCotacoes();
    const [cotacoes, setCotacoes] = useState(() => stored?.cotacoes || [newCotacao()]);
    const [activeId, setActiveId] = useState(() => stored?.activeId || cotacoes[0].id);
    const [beneficiaries, setBeneficiaries] = useState([]);
    const medidaRefs = useRef({});

    useEffect(() => { loadBeneficiaries(); }, []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ cotacoes, activeId }));
    }, [cotacoes, activeId]);

    async function loadBeneficiaries() {
        const { data } = await supabase
            .from('beneficiaries')
            .select('id, name, phone, level')
            .order('name');
        setBeneficiaries((data || []).filter(b => b.name && b.level !== 1));
    }

    const cotacao = cotacoes.find(c => c.id === activeId) || cotacoes[0];
    const { supplierNames, rows, detalhes, notasGerais, emails, telefones } = cotacao;

    const updateCotacao = (patch) => {
        setCotacoes(prev => prev.map(c => c.id === cotacao.id ? { ...c, ...patch } : c));
    };

    const updateSupplierName = (idx, value) => {
        updateCotacao({ supplierNames: supplierNames.map((n, i) => i === idx ? value : n) });
    };

    const updateDetalhe = (idx, value) => {
        updateCotacao({ detalhes: detalhes.map((d, i) => i === idx ? value : d) });
    };

    const updateNotasGerais = (value) => {
        updateCotacao({ notasGerais: value });
    };

    const updateRow = (rowId, field, value) => {
        updateCotacao({ rows: rows.map(r => r.id === rowId ? { ...r, [field]: value } : r) });
    };

    const updateUnitPrice = (rowId, fIdx, value) => {
        updateCotacao({
            rows: rows.map(r => {
                if (r.id !== rowId) return r;
                const fornecedores = r.fornecedores.map((f, i) => i === fIdx ? { ...f, unit: value } : f);
                return { ...r, fornecedores };
            }),
        });
    };

    const addRow = () => updateCotacao({ rows: [...rows, newRow()] });
    const removeRow = (rowId) => updateCotacao({ rows: rows.filter(r => r.id !== rowId) });

    const incluirNovaCotacao = () => {
        const cot = newCotacao();
        setCotacoes(prev => [...prev, cot]);
        setActiveId(cot.id);
    };

    const removerCotacao = (id) => {
        if (cotacoes.length <= 1) return;
        if (!window.confirm('Remover esta cotação de preços?')) return;
        setCotacoes(prev => {
            const next = prev.filter(c => c.id !== id);
            if (id === activeId) setActiveId(next[0].id);
            return next;
        });
    };

    const totalRow = (row, fIdx) => {
        const qtd = Number(row.qtd || 0);
        const unit = Number(row.fornecedores[fIdx]?.unit || 0);
        return qtd * unit;
    };

    const bestIndexForRow = (row) => {
        let best = -1;
        let bestVal = Infinity;
        row.fornecedores.forEach((f, i) => {
            const unit = Number(f.unit || 0);
            if (unit > 0 && unit < bestVal) { bestVal = unit; best = i; }
        });
        return best;
    };

    const grandTotals = supplierNames.map((_, fIdx) =>
        rows.reduce((s, r) => s + totalRow(r, fIdx), 0)
    );

    const bestOverallIdx = grandTotals.reduce((bestIdx, val, idx, arr) => {
        if (val <= 0) return bestIdx;
        if (bestIdx === -1 || val < arr[bestIdx]) return idx;
        return bestIdx;
    }, -1);

    const handleImprimir = () => {
        window.print();
    };

    const itensCadastrados = () => rows.filter(r => (r.produto || '').trim());

    const abrirJanelaRelatorio = () => {
        const itens = itensCadastrados();
        if (itens.length === 0) {
            alert('Esta cotação ainda não possui produtos cadastrados. Inclua os itens antes de enviar.');
            return;
        }

        const linhasTabela = itens.map(r => `
            <tr>
                <td>${r.produto}</td>
                <td style="text-align:right">${r.qtd || 0}</td>
                <td style="text-align:right">${r.medida || '—'}</td>
                <td style="text-align:right">___</td>
                <td style="text-align:right">___</td>
            </tr>
        `).join('');

        const tituloConvite = `Convite para Cotação de Preços — ${cotacao.titulo}`;
        const textoMensagem = `Olá! Você foi convidado a participar da nossa Cotação de Preços "${cotacao.titulo}". `
            + 'Pedimos a gentileza de preencher o Valor Unitário e o Valor Total de cada item na tabela em anexo e nos retornar. Agradecemos desde já a sua participação!';

        const html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>${cotacao.titulo}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
                    h1 { font-size: 18px; margin-bottom: 4px; }
                    p { font-size: 13px; color: #475569; margin-top: 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 13px; }
                    th { background: #0f172a; color: #fff; text-align: left; }
                    .acoes { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
                    .acoes button { display: flex; align-items: center; gap: 6px; border: none; border-radius: 20px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; color: #fff; }
                    .btn-print { background: #64748b; }
                    .btn-whats { background: #25D366; }
                    .btn-email { background: #0ea5e9; }
                    .btn-cidade { background: #6366f1; }
                    @media print { .acoes { display: none; } }
                </style>
            </head>
            <body>
                <div class="acoes">
                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir/Salvar em PDF</button>
                    <button class="btn-whats" onclick="window.open('https://wa.me/?text=' + encodeURIComponent(document.getElementById('msg').innerText), '_blank')">💬 Enviar pelo WhatsApp</button>
                    <button class="btn-email" onclick="window.location.href = 'mailto:?subject=' + encodeURIComponent(document.title) + '&body=' + encodeURIComponent(document.getElementById('msg').innerText)">✉️ Enviar por E-Mail</button>
                    <button class="btn-cidade" onclick="alert('Convite de cotação enviado via Cidade Digital.')">🏛️ Enviar pela Cidade Digital</button>
                </div>
                <h1>${tituloConvite}</h1>
                <p id="msg">${textoMensagem}</p>
                <table>
                    <thead>
                        <tr><th>Produto</th><th style="text-align:right">Quantidade</th><th style="text-align:right">Unidade</th><th style="text-align:right">Valor Unitário</th><th style="text-align:right">Valor Total</th></tr>
                    </thead>
                    <tbody>${linhasTabela}</tbody>
                </table>
            </body>
            </html>
        `;

        const janela = window.open('', '_blank');
        if (!janela) return;
        janela.document.write(html);
        janela.document.close();
        janela.focus();
    };

    const handleEnviarWhatsApp = () => {
        abrirJanelaRelatorio();
    };

    const buscarBeneficiario = (nome) => beneficiaries.find(b => b.name === nome);

    const abrirJanelaFornecedor = (fIdx) => {
        const itensVencidos = rows.filter(r => bestIndexForRow(r) === fIdx && r.produto);
        if (itensVencidos.length === 0) return;

        const subtotal = itensVencidos.reduce((s, r) => s + totalRow(r, fIdx), 0);
        const telefoneAtual = telefones[fIdx] || buscarBeneficiario(supplierNames[fIdx])?.phone || '';
        const emailAtual = emails[fIdx] || '';

        const linhasTabela = itensVencidos.map(r => `
            <tr>
                <td>${r.produto}</td>
                <td style="text-align:right">${r.qtd || 0}</td>
                <td style="text-align:right">${r.medida || '—'}</td>
                <td style="text-align:right">${fmtBRL(r.fornecedores[fIdx]?.unit)}</td>
                <td style="text-align:right">${fmtBRL(totalRow(r, fIdx))}</td>
            </tr>
        `).join('');

        const html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>Pedido — ${supplierNames[fIdx]}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
                    h1 { font-size: 18px; margin-bottom: 4px; }
                    p { font-size: 13px; color: #475569; margin-top: 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 13px; }
                    th { background: #0f172a; color: #fff; text-align: left; }
                    tfoot td { font-weight: bold; background: #f0fdf4; }
                    .acoes { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
                    .acoes button { display: flex; align-items: center; gap: 6px; border: none; border-radius: 20px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; color: #fff; }
                    .btn-print { background: #64748b; }
                    .btn-whats { background: #25D366; }
                    .btn-email { background: #0ea5e9; }
                    .btn-cidade { background: #6366f1; }
                    @media print { .acoes { display: none; } }
                </style>
            </head>
            <body>
                <div class="acoes">
                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir/Salvar em PDF</button>
                    <button class="btn-whats" onclick="(function(){ var tel = '${telefoneAtual}'.replace(/\\D/g, ''); if (!tel) { tel = (prompt('Informe o WhatsApp de ${supplierNames[fIdx]} (com DDD):') || '').replace(/\\D/g, ''); } if (!tel) return; window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(document.getElementById('msg').innerText), '_blank'); })()">💬 Enviar pelo WhatsApp</button>
                    <button class="btn-email" onclick="(function(){ var mail = '${emailAtual}'; if (!mail) { mail = prompt('Informe o e-mail de ${supplierNames[fIdx]}:') || ''; } if (!mail) return; window.location.href = 'mailto:' + mail + '?subject=' + encodeURIComponent(document.title) + '&body=' + encodeURIComponent(document.getElementById('msg').innerText); })()">✉️ Enviar por E-Mail</button>
                    <button class="btn-cidade" onclick="alert('Pedido enviado via Cidade Digital.')">🏛️ Enviar pela Cidade Digital</button>
                </div>
                <h1>Pedido de Cotação — ${supplierNames[fIdx]}</h1>
                <p id="msg">Referente: ${cotacao.titulo}. Segue o pedido com os itens em que sua empresa apresentou o melhor preço.${detalhes[fIdx] ? ` Condições: ${detalhes[fIdx]}.` : ''}</p>
                <table>
                    <thead>
                        <tr><th>Produto</th><th style="text-align:right">Quantidade</th><th style="text-align:right">Unidade</th><th style="text-align:right">Valor Unitário</th><th style="text-align:right">Valor Total</th></tr>
                    </thead>
                    <tbody>${linhasTabela}</tbody>
                    <tfoot>
                        <tr><td colspan="4">Subtotal</td><td style="text-align:right">${fmtBRL(subtotal)}</td></tr>
                    </tfoot>
                </table>
            </body>
            </html>
        `;

        const janela = window.open('', '_blank');
        if (!janela) return;
        janela.document.write(html);
        janela.document.close();
        janela.focus();
    };

    return (
        <MainLayout title="Cotação de Preços">
            <style>{`.cotacao-field:focus { outline: 2px solid #0ea5e9 !important; outline-offset: -2px; background: #eff6ff !important; }`}</style>
            <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%', background: '#f1f5f9' }}>

                {/* Cabeçalho em 4 colunas, uma única linha */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', gap: 16, alignItems: 'center', background: 'linear-gradient(135deg, #e0f2fe 0%, #f8fafc 100%)', border: '1px solid #bae6fd', borderBottom: 'none', borderRadius: '10px 10px 0 0', padding: '12px 16px' }}>

                    {/* Coluna 1: título */}
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <FileSpreadsheet size={20} color="#0ea5e9" />
                        Cotação de Preços
                    </div>

                    {/* Coluna 2: nova cotação */}
                    <button onClick={incluirNovaCotacao} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff', border: 'none', borderRadius: 20, padding: '6px 14px 6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer', boxShadow: '0 2px 6px #0ea5e94d', whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Nova Cotação
                    </button>

                    {/* Coluna 3: incluir novo item */}
                    <button onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 20, padding: '6px 14px 6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer', boxShadow: '0 2px 6px #10b9814d', whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Novo Item nessa Cotação
                    </button>

                    {/* Coluna 4: melhor proposta geral */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-start' }}>
                        {bestOverallIdx !== -1 ? (
                            <>
                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Melhor Proposta:</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>
                                    {supplierNames[bestOverallIdx]} — {fmtBRL(grandTotals[bestOverallIdx])}
                                </span>
                            </>
                        ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Aguardando preços...</span>
                        )}
                        <button onClick={handleImprimir}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginLeft: 8, whiteSpace: 'nowrap' }}>
                            <Printer size={14} /> Imprimir/Salvar em PDF
                        </button>
                        <button onClick={handleEnviarWhatsApp}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#25D366', color: '#fff', border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <MessageCircle size={14} /> Enviar para o Fornecedor
                        </button>
                    </div>
                </div>

                {/* Segunda linha do cabeçalho: abas de orçamentos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, overflowX: 'auto', background: 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)', border: '1px solid #cbd5e1', borderRadius: '0 0 10px 10px', padding: '8px 10px' }}>
                    {cotacoes.map(c => {
                        const active = c.id === activeId;
                        return (
                            <div key={c.id} onClick={() => setActiveId(c.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0,
                                    background: active ? '#fff' : '#e2e8f0', color: active ? '#0ea5e9' : '#64748b',
                                    border: active ? '1px solid #0ea5e9' : '1px solid transparent',
                                    borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700,
                                    boxShadow: active ? '0 1px 4px rgba(14,165,233,0.25)' : 'none',
                                }}>
                                <input value={c.titulo} onClick={e => e.stopPropagation()}
                                    onChange={e => setCotacoes(prev => prev.map(x => x.id === c.id ? { ...x, titulo: e.target.value } : x))}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11, fontWeight: 700, color: 'inherit', width: `${Math.max(8, c.titulo.length)}ch` }} />
                                {cotacoes.length > 1 && (
                                    <X size={12} onClick={e => { e.stopPropagation(); removerCotacao(c.id); }} style={{ opacity: 0.6 }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Tabela */}
                <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0ea5e9 100%)' }}>
                                <th style={{ ...thStyleDark, width: 220 }}>Produto</th>
                                <th style={{ ...thStyleDark, width: 70, textAlign: 'right' }}>Qtd</th>
                                <th style={{ ...thStyleDark, width: 90, textAlign: 'right' }}>Unidade</th>
                                {supplierNames.map((name, i) => {
                                    const c = SUPPLIER_COLORS[i % SUPPLIER_COLORS.length];
                                    const options = beneficiaries.some(b => b.name === name)
                                        ? beneficiaries
                                        : [{ id: 'custom', name }, ...beneficiaries];
                                    return (
                                        <th key={i} colSpan={2} style={{ ...thStyleDark, textAlign: 'left', borderLeft: '1px solid rgba(255,255,255,0.15)', background: `linear-gradient(135deg, ${c.solid} 0%, ${c.dark} 100%)` }}>
                                            <SupplierSelect value={name} options={options} onChange={v => updateSupplierName(i, v)} />
                                        </th>
                                    );
                                })}
                                <th style={{ ...thStyleDark, width: 40 }} />
                            </tr>
                            <tr style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0ea5e9 100%)' }}>
                                <th style={thStyleSub} /><th style={thStyleSub} /><th style={thStyleSub} />
                                {supplierNames.map((_, i) => {
                                    const c = SUPPLIER_COLORS[i % SUPPLIER_COLORS.length];
                                    return (
                                        <Fragment key={i}>
                                            <th style={{ ...thStyleSub, borderLeft: '1px solid rgba(255,255,255,0.15)', background: `${c.dark}cc` }}>Vr.Unitário</th>
                                            <th style={{ ...thStyleSub, background: `${c.dark}cc` }}>Total</th>
                                        </Fragment>
                                    );
                                })}
                                <th style={thStyleSub} />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const bestIdx = bestIndexForRow(row);
                                return (
                                    <tr key={row.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        <td style={tdStyle}>
                                            <input value={row.produto} onChange={e => updateRow(row.id, 'produto', e.target.value)}
                                                placeholder="Descrição do produto" className="cotacao-field" style={inputStyle} />
                                        </td>
                                        <td style={tdStyle}>
                                            <input type="number" value={row.qtd} onChange={e => updateRow(row.id, 'qtd', e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Tab' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        medidaRefs.current[row.id]?.focus();
                                                    }
                                                }}
                                                className="cotacao-field" style={{ ...inputStyle, textAlign: 'right' }} />
                                        </td>
                                        <td style={tdStyle}>
                                            <select value={row.medida} onChange={e => updateRow(row.id, 'medida', e.target.value)}
                                                ref={el => { medidaRefs.current[row.id] = el; }}
                                                className="cotacao-field"
                                                style={{ ...inputStyle, textAlign: 'right', cursor: 'pointer' }}>
                                                <option value="">—</option>
                                                {UNIDADES_MEDIDA.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                        </td>
                                        {supplierNames.map((_, fIdx) => {
                                            const isBest = fIdx === bestIdx;
                                            const c = SUPPLIER_COLORS[fIdx % SUPPLIER_COLORS.length];
                                            const bg = isBest ? '#10b98116' : `${c.solid}0c`;
                                            return (
                                                <Fragment key={fIdx}>
                                                    <td style={{ ...tdStyle, width: 100, borderLeft: '1px solid #f1f5f9', background: bg }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                                            <span style={{ fontSize: 12, color: isBest ? '#10b981' : '#94a3b8', fontWeight: isBest ? 800 : 400 }}>R$</span>
                                                            <input type="number" step="0.01" value={row.fornecedores[fIdx].unit}
                                                                onChange={e => updateUnitPrice(row.id, fIdx, e.target.value)}
                                                                className="cotacao-field"
                                                                style={{ ...inputStyle, textAlign: 'right', fontSize: 12, fontWeight: isBest ? 800 : 400, color: isBest ? '#10b981' : '#1e293b' }} />
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, width: 100, background: bg }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                                            <span style={{ fontSize: 12, color: isBest ? '#10b981' : '#94a3b8', fontWeight: isBest ? 800 : 400 }}>R$</span>
                                                            <span style={{ fontSize: 12, fontWeight: isBest ? 800 : 400, color: isBest ? '#10b981' : '#1e293b' }}>
                                                                {Number(totalRow(row, fIdx) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </Fragment>
                                            );
                                        })}
                                        <td style={tdStyle}>
                                            <button onClick={() => removeRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #cbd5e1' }}>
                                <td style={{ ...tdStyle, fontWeight: 800, color: '#1e293b', background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)' }} colSpan={3}>TOTAL GERAL</td>
                                {supplierNames.map((_, fIdx) => {
                                    const c = SUPPLIER_COLORS[fIdx % SUPPLIER_COLORS.length];
                                    const isBest = fIdx === bestOverallIdx;
                                    const bg = isBest ? 'linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)' : `linear-gradient(135deg, ${c.solid}22 0%, ${c.solid}0a 100%)`;
                                    return (
                                        <Fragment key={fIdx}>
                                            <td style={{ ...tdStyle, borderLeft: '1px solid #cbd5e1', background: bg }} />
                                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: isBest ? '#10b981' : '#1e293b', background: bg }}>
                                                {fmtBRL(grandTotals[fIdx])}
                                            </td>
                                        </Fragment>
                                    );
                                })}
                                <td style={tdStyle} />
                            </tr>
                            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ ...tdStyle, verticalAlign: 'top', padding: '8px 12px', background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)' }} colSpan={3}>
                                    <textarea value={notasGerais} onChange={e => updateNotasGerais(e.target.value)}
                                        placeholder="Observações gerais sobre esta cotação (finalidade, urgência, aprovação, etc.)"
                                        rows={3}
                                        style={{ width: '100%', resize: 'vertical', border: '1px solid #cbd5e1', borderRadius: 6, background: 'rgba(255,255,255,0.8)', fontSize: 11, color: '#1e293b', padding: 6, outline: 'none', fontFamily: 'inherit' }} />
                                </td>
                                {supplierNames.map((_, fIdx) => {
                                    const c = SUPPLIER_COLORS[fIdx % SUPPLIER_COLORS.length];
                                    return (
                                        <td key={fIdx} colSpan={2} style={{ ...tdStyle, borderLeft: '1px solid #e2e8f0', verticalAlign: 'top', padding: '8px 12px', background: `linear-gradient(135deg, ${c.solid}14 0%, ${c.solid}05 100%)` }}>
                                            <textarea value={detalhes[fIdx] || ''} onChange={e => updateDetalhe(fIdx, e.target.value)}
                                                placeholder="Condições de pagamento, prazo de entrega, garantia..."
                                                rows={3}
                                                style={{ width: '100%', resize: 'vertical', border: `1px solid ${c.solid}55`, borderRadius: 6, background: 'rgba(255,255,255,0.75)', fontSize: 11, color: '#1e293b', padding: 6, outline: 'none', fontFamily: 'inherit' }} />
                                        </td>
                                    );
                                })}
                                <td style={tdStyle} />
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style={{ marginTop: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #10b981 100%)' }}>
                                    <th style={{ ...thStyleDark, width: 220, whiteSpace: 'nowrap' }}>Produto</th>
                                    <th style={{ ...thStyleDark, width: 70, textAlign: 'right', whiteSpace: 'nowrap' }}>Qtd</th>
                                    <th style={{ ...thStyleDark, width: 90, textAlign: 'right', whiteSpace: 'nowrap' }}>Unidade</th>
                                    <th style={{ ...thStyleDark, width: 180, whiteSpace: 'nowrap' }}>Melhor Preço</th>
                                    <th style={{ ...thStyleDark, whiteSpace: 'nowrap' }}>Anotações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => {
                                    const bestIdx = bestIndexForRow(row);
                                    return (
                                        <tr key={row.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{row.produto || '—'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.qtd || '—'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.medida || '—'}</td>
                                            <td style={{ ...tdStyle, background: '#10b98110', whiteSpace: 'nowrap' }}>
                                                {bestIdx !== -1 ? (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{supplierNames[bestIdx]}</span>
                                                        <span style={{ fontWeight: 800, color: '#10b981' }}>{fmtBRL(totalRow(row, bestIdx))}</span>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#94a3b8' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ ...tdStyle, color: '#475569', whiteSpace: 'nowrap' }}>
                                                {bestIdx !== -1 ? (detalhes[bestIdx] || '—') : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #cbd5e1', background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)' }}>
                                    <td style={{ ...tdStyle, fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>TOTAL GERAL</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>
                                        {rows.reduce((s, r) => s + Number(r.qtd || 0), 0)}
                                    </td>
                                    <td style={tdStyle} />
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>
                                        {fmtBRL(rows.reduce((s, r) => {
                                            const bestIdx = bestIndexForRow(r);
                                            return s + (bestIdx !== -1 ? totalRow(r, bestIdx) : 0);
                                        }, 0))}
                                    </td>
                                    <td style={tdStyle} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Relatório por fornecedor: itens em que cada um teve o melhor preço */}
                <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: `repeat(${supplierNames.length}, 1fr)`, gap: 12 }}>
                    {supplierNames.map((name, fIdx) => {
                        const c = SUPPLIER_COLORS[fIdx % SUPPLIER_COLORS.length];
                        const itensVencidos = rows.filter(r => bestIndexForRow(r) === fIdx && r.produto);
                        const subtotal = itensVencidos.reduce((s, r) => s + totalRow(r, fIdx), 0);
                        return (
                            <div key={fIdx} style={{ background: `linear-gradient(135deg, ${c.solid}14 0%, #ffffff 55%)`, border: `1px solid ${c.solid}44`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>{name}</span>
                                    <span style={{ fontSize: 10, color: '#fff', background: c.solid, padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>
                                        {itensVencidos.length} item{itensVencidos.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div style={{ marginBottom: 10, flex: 1 }}>
                                    {itensVencidos.length > 0 ? (
                                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                            <thead>
                                                <tr>
                                                    <th style={cardThStyle}>Produto</th>
                                                    <th style={{ ...cardThStyle, textAlign: 'right' }}>Qtde</th>
                                                    <th style={{ ...cardThStyle, textAlign: 'right' }}>Unidade</th>
                                                    <th style={{ ...cardThStyle, textAlign: 'right' }}>Vr.Unitário</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {itensVencidos.map(r => (
                                                    <tr key={r.id} style={{ borderTop: `1px solid ${c.solid}22` }}>
                                                        <td style={{ ...cardTdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }}>{r.produto}</td>
                                                        <td style={{ ...cardTdStyle, textAlign: 'right' }}>{r.qtd || 0}</td>
                                                        <td style={{ ...cardTdStyle, textAlign: 'right' }}>{r.medida || '—'}</td>
                                                        <td style={{ ...cardTdStyle, textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>{fmtBRL(r.fornecedores[fIdx]?.unit)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Nenhum item com melhor preço</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${c.solid}33`, marginBottom: 10, marginTop: 'auto' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Subtotal</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: c.solid }}>{fmtBRL(subtotal)}</span>
                                </div>
                                <button onClick={() => abrirJanelaFornecedor(fIdx)} disabled={itensVencidos.length === 0}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: itensVencidos.length ? c.solid : '#f1f5f9', color: itensVencidos.length ? '#fff' : '#cbd5e1', border: 'none', borderRadius: 20, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: itensVencidos.length ? 'pointer' : 'not-allowed' }}>
                                    <Printer size={12} /> Gerar Relatório / Enviar ao Fornecedor
                                </button>
                            </div>
                        );
                    })}
                </div>

            </div>
        </MainLayout>
    );
}

const thStyleDark = { padding: '10px 12px', fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'left' };
const thStyleSub = { padding: '4px 12px 8px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textAlign: 'right' };
const tdStyle = { padding: '6px 12px', fontSize: 12 };
const inputStyle = { width: '100%', border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', outline: 'none' };
const cardThStyle = { padding: '4px 4px 6px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'left' };
const cardTdStyle = { padding: '5px 4px', fontSize: 11 };
