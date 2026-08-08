import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { supabase } from '../../lib/supabase';
import { getSecurityContext } from '../../lib/auth';

// ── Mapeamento de palavras-chave → Centro de Custo sugerido ─────────────────
const CC_KEYWORDS = [
    { keywords: ['notebook','computador','mouse','teclado','monitor','hd','ssd','pendrive','cabo usb','hdmi','impressora','toner','cartucho','roteador','switch','no-break'], cc: 'TI / Informática' },
    { keywords: ['papel','caneta','lápis','borracha','grampo','clipe','pasta','arquivo','envelope','etiqueta','bloco','caderno','agenda'], cc: 'Material de Escritório' },
    { keywords: ['arroz','feijão','café','açúcar','óleo','sal','macarrão','pão','leite','manteiga','queijo','presunto','frango','carne','peixe','refrigerante','suco','água','biscoito'], cc: 'Alimentação' },
    { keywords: ['detergente','sabão','desinfetante','alvejante','vassoura','rodo','pano','esponja','papel higiênico','papel toalha','saco de lixo','água sanitária'], cc: 'Limpeza / Higiene' },
    { keywords: ['combustível','gasolina','etanol','diesel','óleo motor','filtro','pneu','manutenção veículo'], cc: 'Veículos / Combustível' },
    { keywords: ['cimento','tinta','pincel','rolo','lixa','parafuso','prego','fio','tomada','lâmpada','disjuntor','mangueira','cano','vedante'], cc: 'Manutenção / Reformas' },
    { keywords: ['remédio','medicamento','vitamina','suplemento','material hospitalar','luva','máscara'], cc: 'Saúde' },
    { keywords: ['frete','transporte','motoboy','entrega','sedex','correios'], cc: 'Logística / Frete' },
];

function suggestCC(productName) {
    const lower = (productName || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const { keywords, cc } of CC_KEYWORDS) {
        if (keywords.some(kw => lower.includes(kw))) return cc;
    }
    return '';
}

// ── Parser de XML NFC-e (browser DOMParser) ──────────────────────────────────
function parseNFCeXML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML inválido ou corrompido.');

    const get = (el, tag) => el?.querySelector(tag)?.textContent?.trim() || '';

    const infNFe = doc.querySelector('infNFe');
    if (!infNFe) throw new Error('Arquivo não é uma NFC-e válida (tag infNFe não encontrada).');

    // Emitente
    const emit = infNFe.querySelector('emit');
    const emitente = {
        cnpj: get(emit, 'CNPJ'),
        nome: get(emit, 'xNome'),
        fantasia: get(emit, 'xFant') || get(emit, 'xNome'),
        uf: get(emit?.querySelector('enderEmit'), 'UF'),
    };

    // Identificação
    const ide = infNFe.querySelector('ide');
    const chave = infNFe.getAttribute('Id')?.replace('NFe', '') || '';
    const numero = get(ide, 'nNF');
    const serie = get(ide, 'serie');
    const rawDate = get(ide, 'dhEmi');
    const dataEmissao = rawDate ? rawDate.substring(0, 10) : new Date().toISOString().split('T')[0];

    // Totais
    const total = infNFe.querySelector('total > ICMSTot') || infNFe.querySelector('total');
    const valorTotal = parseFloat(get(total, 'vNF') || get(total, 'vProd') || '0');
    const valorDesconto = parseFloat(get(total, 'vDesc') || '0');
    const valorFrete = parseFloat(get(total, 'vFrete') || '0');

    // Itens
    const dets = [...infNFe.querySelectorAll('det')];
    const itens = dets.map(det => {
        const prod = det.querySelector('prod');
        const nome = get(prod, 'xProd');
        const ncm = get(prod, 'NCM');
        const qtd = parseFloat(get(prod, 'qCom') || '1');
        const un = get(prod, 'uCom');
        const vUnit = parseFloat(get(prod, 'vUnCom') || '0');
        const vProd = parseFloat(get(prod, 'vProd') || '0');
        const vDesc = parseFloat(det.querySelector('prod > vDesc')?.textContent || '0');
        return { nome, ncm, qtd, un, vUnit, vProd, vDesc, ccSugerido: suggestCC(nome) };
    });

    return { chave, numero, serie, dataEmissao, emitente, valorTotal, valorDesconto, valorFrete, itens };
}

// ── Agrupamento de itens por CC sugerido ─────────────────────────────────────
function agruparPorCC(itens) {
    const mapa = {};
    itens.forEach(it => {
        const cc = it.ccSugerido || 'Sem CC';
        if (!mapa[cc]) mapa[cc] = { cc, valor: 0, itens: [] };
        mapa[cc].valor += it.vProd;
        mapa[cc].itens.push(it);
    });
    return Object.values(mapa);
}

const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

// ═══════════════════════════════════════════════════════════════════════════════
export default function NFCeIntegracao() {
    const navigate = useNavigate();
    const fileRef = useRef(null);
    const dragRef = useRef(null);

    const [step, setStep] = useState('upload'); // upload | review | confirm
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState('');
    const [parsed, setParsed] = useState(null);        // dados extraídos do XML
    const [itens, setItens] = useState([]);            // itens com CC editável
    const [conta, setConta] = useState('');            // conta destino
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [saving, setSaving] = useState(false);
    const [secCtx, setSecCtx] = useState({ user_id: null, family_id: null });

    useEffect(() => {
        getSecurityContext().then(setSecCtx);
        supabase.from('accounts').select('id, name, account_type').order('name').then(({ data }) => setAccounts(data || []));
        supabase.from('cost_centers').select('id, description, full_code').order('full_code').then(({ data }) => setCostCenters(data || []));
        supabase.from('beneficiaries').select('id, name, full_code').order('name').then(({ data }) => setBeneficiaries(data || []));
    }, []);

    // ── Drag & Drop ────────────────────────────────────────────────────────────
    const handleDrop = (e) => {
        e.preventDefault(); setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
    };

    const loadFile = (file) => {
        setError('');
        if (!file.name.match(/\.(xml|nfe|nfce)$/i)) { setError('Selecione um arquivo XML de NFC-e.'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = parseNFCeXML(ev.target.result);
                setParsed(data);
                setItens(data.itens.map(it => ({ ...it, ccSelecionado: it.ccSugerido })));
                setStep('review');
            } catch (err) {
                setError('Erro ao processar XML: ' + err.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    // ── Atualiza CC de um item ─────────────────────────────────────────────────
    const setCCItem = (idx, cc) => setItens(prev => prev.map((it, i) => i === idx ? { ...it, ccSelecionado: cc } : it));

    // ── Rateio agrupado por CC ─────────────────────────────────────────────────
    const grupos = agruparPorCC(itens.map(it => ({ ...it, ccSugerido: it.ccSelecionado })));
    const totalItens = itens.reduce((s, it) => s + it.vProd, 0);

    // ── Busca fornecedor pelo nome/CNPJ ────────────────────────────────────────
    const matchBenef = parsed ? (
        beneficiaries.find(b => b.name?.toLowerCase() === parsed.emitente.nome?.toLowerCase()) ||
        beneficiaries.find(b => b.name?.toLowerCase().includes(parsed.emitente.fantasia?.toLowerCase()))
    ) : null;

    // ── Confirmação: cria lançamento + itens de rateio ─────────────────────────
    const handleConfirmar = async () => {
        if (!conta) { setError('Selecione a conta de destino.'); return; }
        if (!parsed) return;
        setSaving(true);
        setError('');

        // Determina fornecedor
        const benefId = matchBenef ? matchBenef.id : null;

        // Cria o lançamento principal
        const { data: tx, error: txErr } = await supabase.from('transactions').insert([{
            account_id:   conta,
            emission_date: parsed.dataEmissao,
            due_date:     parsed.dataEmissao,
            description:  `NF-e ${parsed.numero}/${parsed.serie} — ${parsed.emitente.fantasia || parsed.emitente.nome}`,
            amount:       parsed.valorTotal,
            dc_type:      'D',
            type:         'Expense',
            beneficiary_id: benefId,
            user_id:      secCtx.user_id,
            family_id:    secCtx.family_id,
        }]).select('id');

        if (txErr) { setError('Erro ao criar lançamento: ' + txErr.message); setSaving(false); return; }
        const txId = tx[0].id;

        // Cria itens de rateio se houver mais de 1 CC
        const gruposValidos = grupos.filter(g => g.cc !== 'Sem CC');
        if (gruposValidos.length > 1) {
            const rows = gruposValidos.map(g => {
                const ccObj = costCenters.find(c => c.description === g.cc || `${c.full_code} ${c.description}`.trim() === g.cc);
                return {
                    transaction_id: txId,
                    cost_center_id: ccObj ? ccObj.id : null,
                    description:    g.cc,
                    amount:         Math.round(g.valor * 100) / 100,
                };
            });
            const { error: itemErr } = await supabase.from('transaction_items').insert(rows);
            if (itemErr) { setError('Lançamento criado, mas erro no rateio: ' + itemErr.message); setSaving(false); return; }
        } else if (gruposValidos.length === 1) {
            // CC único: salva direto no lançamento
            const ccObj = costCenters.find(c => c.description === gruposValidos[0].cc || `${c.full_code} ${c.description}`.trim() === gruposValidos[0].cc);
            if (ccObj) {
                await supabase.from('transactions').update({ cost_center_id: ccObj.id }).eq('id', txId);
            }
        }

        setSaving(false);
        navigate(`/transactions/${conta}`);
    };

    // ════════════════════════════════════════════════════════════════════════════
    // Estilos base
    const hdr = { background: '#89962F', color: '#fff', padding: '10px 16px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 };
    const card = { background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '20px 24px', marginBottom: '16px' };
    const label = { fontSize: '10px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' };
    const inp = { border: '1px solid #b2dfdb', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', outline: 'none', width: '100%' };
    const thS = { padding: '6px 10px', background: '#f5f5f5', fontSize: '10px', fontWeight: 'bold', color: '#444', textAlign: 'left', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' };
    const tdS = { padding: '5px 10px', fontSize: '11px', borderBottom: '1px solid #f0f0f0' };

    // ── STEP: Upload ────────────────────────────────────────────────────────────
    if (step === 'upload') return (
        <MainLayout>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
                <div style={hdr}>
                    <span style={{ fontSize: '18px' }}>🧾</span>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Integração — NFC-e / Cupom Fiscal Eletrônico</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px', margin: '0 auto', width: '100%' }}>

                    {/* Informativo */}
                    <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '14px 18px', fontSize: '12px', color: '#2e7d32', lineHeight: 1.6 }}>
                        <strong>Como funciona:</strong><br />
                        1. Faça o download do XML da NFC-e no portal da SEFAZ do seu estado ou solicite ao fornecedor.<br />
                        2. Arraste o arquivo XML para a área abaixo (ou clique para selecionar).<br />
                        3. O sistema extrai automaticamente: valor, data, fornecedor e itens.<br />
                        4. Revise a sugestão de Centro de Custo por item e confirme o lançamento.
                    </div>

                    {/* Drop Zone */}
                    <div
                        ref={dragRef}
                        onDragEnter={() => setDragging(true)}
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                        style={{
                            border: `2px dashed ${dragging ? '#00695c' : '#b2dfdb'}`,
                            borderRadius: '12px',
                            background: dragging ? '#e8f5e9' : '#fafffe',
                            padding: '48px 24px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#004d40', marginBottom: '6px' }}>
                            Arraste o arquivo XML da NFC-e aqui
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>ou clique para selecionar o arquivo (.xml)</div>
                        <input ref={fileRef} type="file" accept=".xml,.nfe,.nfce" style={{ display: 'none' }} onChange={e => e.target.files[0] && loadFile(e.target.files[0])} />
                    </div>

                    {error && (
                        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#c62828' }}>
                            ⚠ {error}
                        </div>
                    )}

                    {/* Links úteis SEFAZ por UF */}
                    <div style={{ ...card, padding: '16px 20px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', marginBottom: '10px', textTransform: 'uppercase' }}>Portais SEFAZ para download do XML</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '11px' }}>
                            {[
                                { uf: 'SP', url: 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica' },
                                { uf: 'RJ', url: 'http://www.nfce.fazenda.rj.gov.br/consulta' },
                                { uf: 'MG', url: 'https://portalsped.fazenda.mg.gov.br/portalnfce' },
                                { uf: 'PR', url: 'https://www.nfce.pr.gov.br/nfce/consulta' },
                                { uf: 'RS', url: 'https://www.sefaz.rs.gov.br/nfce/nfce-cons-qr-code.aspx' },
                                { uf: 'SC', url: 'https://sat.sef.sc.gov.br/tax.NET/sat.consulta.aspx' },
                                { uf: 'BA', url: 'https://nfe.sefaz.ba.gov.br/servicos/nfce/modulos/geral/NFCEC_consulta_chave_acesso.aspx' },
                                { uf: 'GO', url: 'https://nfce.go.gov.br/post/ver/214413/consulta-nfc-e' },
                            ].map(({ uf, url }) => (
                                <a key={uf} href={url} target="_blank" rel="noopener noreferrer"
                                    style={{ background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: '4px', padding: '3px 10px', textDecoration: 'none', fontWeight: 'bold' }}>
                                    {uf}
                                </a>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </MainLayout>
    );

    // ── STEP: Review ────────────────────────────────────────────────────────────
    return (
        <MainLayout>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
                <div style={hdr}>
                    <span style={{ fontSize: '18px' }}>🧾</span>
                    <span style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revisão do Cupom Fiscal</span>
                    <button onClick={() => { setStep('upload'); setParsed(null); setError(''); }}
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 12px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                        ← Novo Arquivo
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', alignItems: 'start' }}>

                    {/* Coluna principal */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* Cabeçalho do documento */}
                        <div style={card}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                <div>
                                    <span style={label}>Emitente (Fornecedor)</span>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#004d40' }}>{parsed.emitente.nome}</div>
                                    <div style={{ fontSize: '10px', color: '#888' }}>CNPJ: {parsed.emitente.cnpj} · UF: {parsed.emitente.uf}</div>
                                    {matchBenef
                                        ? <div style={{ marginTop: '4px', fontSize: '10px', background: '#e8f5e9', color: '#2e7d32', borderRadius: '3px', padding: '2px 6px', display: 'inline-block' }}>✔ Vinculado: {matchBenef.name}</div>
                                        : <div style={{ marginTop: '4px', fontSize: '10px', color: '#f57c00' }}>⚠ Fornecedor não cadastrado</div>
                                    }
                                </div>
                                <div>
                                    <span style={label}>Data de Emissão</span>
                                    <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1565c0' }}>{fmtDate(parsed.dataEmissao)}</div>
                                    <div style={{ fontSize: '10px', color: '#888' }}>NF {parsed.numero}/{parsed.serie}</div>
                                </div>
                                <div>
                                    <span style={label}>Valor Total</span>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c62828' }}>{fmtBRL(parsed.valorTotal)}</div>
                                    {parsed.valorDesconto > 0 && <div style={{ fontSize: '10px', color: '#888' }}>Desc: {fmtBRL(parsed.valorDesconto)}</div>}
                                </div>
                            </div>
                            {parsed.chave && (
                                <div style={{ marginTop: '12px', fontSize: '9px', color: '#aaa', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                    Chave: {parsed.chave}
                                </div>
                            )}
                        </div>

                        {/* Tabela de itens */}
                        <div style={card}>
                            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#004d40', marginBottom: '12px' }}>
                                Itens do Cupom — Atribua o Centro de Custo a cada item
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ ...thS, width: '36px', textAlign: 'center' }}>#</th>
                                            <th style={thS}>Produto</th>
                                            <th style={{ ...thS, textAlign: 'center' }}>Qtd</th>
                                            <th style={{ ...thS, textAlign: 'right' }}>Valor</th>
                                            <th style={{ ...thS, minWidth: '180px' }}>Centro de Custo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itens.map((it, idx) => (
                                            <tr key={idx} style={{ background: idx % 2 === 0 ? '#fafafa' : '#fff' }}>
                                                <td style={{ ...tdS, textAlign: 'center', color: '#aaa' }}>{idx + 1}</td>
                                                <td style={tdS}>
                                                    <div style={{ fontWeight: '500', color: '#222' }}>{it.nome}</div>
                                                    <div style={{ fontSize: '9px', color: '#aaa' }}>NCM: {it.ncm} · {it.qtd} {it.un}</div>
                                                </td>
                                                <td style={{ ...tdS, textAlign: 'center', color: '#555' }}>{it.qtd} {it.un}</td>
                                                <td style={{ ...tdS, textAlign: 'right', fontWeight: 'bold', color: '#c62828' }}>{fmtBRL(it.vProd)}</td>
                                                <td style={tdS}>
                                                    <select
                                                        value={it.ccSelecionado}
                                                        onChange={e => setCCItem(idx, e.target.value)}
                                                        style={{ ...inp, padding: '3px 6px', fontSize: '10px' }}
                                                    >
                                                        <option value="">— Sem CC —</option>
                                                        {costCenters.map(cc => (
                                                            <option key={cc.id} value={cc.description}>{cc.full_code} {cc.description}</option>
                                                        ))}
                                                        {/* Sugestão automática se não está no cadastro */}
                                                        {it.ccSugerido && !costCenters.find(c => c.description === it.ccSugerido) && (
                                                            <option value={it.ccSugerido}>💡 {it.ccSugerido} (sugerido)</option>
                                                        )}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: '#004d40' }}>
                                            <td colSpan={3} style={{ padding: '7px 10px', fontWeight: 'bold', color: '#CCFF00', fontSize: '11px' }}>TOTAL</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: '#CCFF00', fontSize: '12px' }}>{fmtBRL(parsed.valorTotal)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                    </div>

                    {/* Coluna lateral: resumo e ação */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* Resumo de rateio por CC */}
                        <div style={card}>
                            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#004d40', marginBottom: '12px' }}>Rateio por Centro de Custo</div>
                            {grupos.map((g, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: '600', color: g.cc === 'Sem CC' ? '#bbb' : '#333' }}>{g.cc}</div>
                                        <div style={{ fontSize: '9px', color: '#aaa' }}>{g.itens.length} item{g.itens.length > 1 ? 's' : ''}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: g.cc === 'Sem CC' ? '#bbb' : '#1565c0', textAlign: 'right' }}>{fmtBRL(g.valor)}</div>
                                        <div style={{ fontSize: '9px', color: '#aaa', textAlign: 'right' }}>{totalItens > 0 ? ((g.valor / totalItens) * 100).toFixed(1) : 0}%</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Conta destino */}
                        <div style={card}>
                            <span style={label}>Conta de Destino *</span>
                            <select value={conta} onChange={e => setConta(e.target.value)} style={inp}>
                                <option value="">Selecionar conta...</option>
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name} — {a.account_type}</option>
                                ))}
                            </select>
                        </div>

                        {error && (
                            <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '6px', padding: '10px 14px', fontSize: '11px', color: '#c62828' }}>
                                ⚠ {error}
                            </div>
                        )}

                        {/* Botão confirmar */}
                        <button
                            onClick={handleConfirmar}
                            disabled={saving || !conta}
                            style={{
                                padding: '14px', fontSize: '13px', fontWeight: 'bold', border: 'none', borderRadius: '8px',
                                background: saving || !conta ? '#bdbdbd' : '#004d40', color: '#fff',
                                cursor: saving || !conta ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 12px rgba(0,77,64,0.3)',
                            }}
                        >
                            {saving ? '⏳ Gravando...' : `✔ Confirmar Lançamento — ${fmtBRL(parsed.valorTotal)}`}
                        </button>

                        <div style={{ fontSize: '10px', color: '#aaa', textAlign: 'center' }}>
                            Será criado 1 lançamento de saída{grupos.filter(g => g.cc !== 'Sem CC').length > 1 ? ` com rateio em ${grupos.filter(g => g.cc !== 'Sem CC').length} centros de custo` : ''}.
                        </div>
                    </div>

                </div>
            </div>
        </MainLayout>
    );
}
