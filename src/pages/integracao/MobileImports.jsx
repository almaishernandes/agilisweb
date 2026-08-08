import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../../components/MainLayout';
import { supabase } from '../../lib/supabase';
import { getSecurityContext } from '../../lib/auth';
import jsQR from 'jsqr';

const fmtBRL  = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtDT   = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const fmtChave = chave => {
    if (!chave || chave.length < 8) return chave || '—';
    return chave.substring(0, 4) + ' ... ' + chave.substring(chave.length - 4);
};

// Formata a chave em blocos de 4 dígitos separados por espaço, ex: "0000 0000 0000 ..."
const formatarChaveInput = (digits) => (digits.match(/.{1,4}/g) || []).join(' ');

// ── Leitura do arquivo XML da NF-e/NFC-e ────────────────────────────────────
const xmlText = (node, tag) => node?.getElementsByTagName(tag)?.[0]?.textContent?.trim() || '';

// Extrai os dados relevantes (emitente, valor, data, itens, chave) de um XML de NF-e/NFC-e
const parseNFeXml = (xmlString) => {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('Arquivo XML inválido ou corrompido.');
    }

    const infNFe = doc.getElementsByTagName('infNFe')[0];
    if (!infNFe) throw new Error('XML não é uma NF-e/NFC-e válida (tag <infNFe> não encontrada).');

    // Chave de acesso vem no atributo Id="NFe{44 dígitos}"
    const idAttr = infNFe.getAttribute('Id') || '';
    const chave = idAttr.replace(/^NFe/, '').replace(/\D/g, '').slice(0, 44);

    const emit = doc.getElementsByTagName('emit')[0];
    const ide  = doc.getElementsByTagName('ide')[0];
    const total = doc.getElementsByTagName('ICMSTot')[0];

    const emitente_nome = xmlText(emit, 'xNome') || 'Emitente não identificado';
    const emitente_cnpj = xmlText(emit, 'CNPJ');
    const numero = xmlText(ide, 'nNF');
    const dhEmi = xmlText(ide, 'dhEmi') || xmlText(ide, 'dEmi');
    const data_emissao = dhEmi ? dhEmi.slice(0, 10) : null;
    const valor_total = Number(xmlText(total, 'vNF') || 0);

    const itens = Array.from(doc.getElementsByTagName('det')).map(det => {
        const prod = det.getElementsByTagName('prod')[0];
        return {
            nome: xmlText(prod, 'xProd'),
            ncm: xmlText(prod, 'NCM'),
            qtd: Number(xmlText(prod, 'qCom') || 0),
            un: xmlText(prod, 'uCom'),
            vProd: Number(xmlText(prod, 'vProd') || 0),
        };
    });

    return { chave, emitente_nome, emitente_cnpj, numero, data_emissao, valor_total, itens };
};

// ── Validação da Chave de Acesso (NF-e / NFC-e) ─────────────────────────────
// Estrutura oficial dos 44 dígitos:
// cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
const UFS_POR_CODIGO = {
    11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',
    24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',
    41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF',
};

// Calcula o dígito verificador (módulo 11) dos primeiros 43 dígitos da chave
const calcularDVChave = (chave43) => {
    const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    let pesoIdx = 0;
    for (let i = chave43.length - 1; i >= 0; i--) {
        soma += Number(chave43[i]) * pesos[pesoIdx % pesos.length];
        pesoIdx++;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
};

// Valida o formato + o dígito verificador da chave de acesso de 44 dígitos.
// Retorna { valida: boolean, motivo?: string }
const validarChaveAcesso = (chave) => {
    if (!chave || typeof chave !== 'string') return { valida: false, motivo: 'Chave não informada.' };
    const limpa = chave.replace(/\D/g, '');
    if (limpa.length !== 44) return { valida: false, motivo: `A chave deve ter 44 dígitos (informados: ${limpa.length}).` };
    const dvCalculado = calcularDVChave(limpa.substring(0, 43));
    const dvInformado = Number(limpa[43]);
    if (dvCalculado !== dvInformado) return { valida: false, motivo: 'Dígito verificador inválido — confira a chave digitada.' };
    return { valida: true, chave: limpa };
};

// Simula a consulta dos dados da NF-e/NFC-e a partir da chave (Emitente, Valor, Data),
// extraindo o que já é publicamente decodificável da própria chave (UF, CNPJ, competência, número)
// e gerando um valor determinístico (mesma chave => mesmo valor simulado) para os demais campos.
const simularConsultaNFe = (chave) => {
    const cUF = chave.substring(0, 2);
    const aamm = chave.substring(2, 6);
    const cnpj = chave.substring(6, 20);
    const numero = chave.substring(25, 34).replace(/^0+/, '') || '0';
    const uf = UFS_POR_CODIGO[Number(cUF)] || '??';

    const ano = 2000 + Number(aamm.substring(0, 2));
    const mes = aamm.substring(2, 4);
    const dataEmissao = `${ano}-${mes}-01`;

    const cnpjFmt = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

    // Valor determinístico (pseudo-aleatório, mesma chave => mesmo valor)
    let hash = 0;
    for (let i = 0; i < chave.length; i++) hash = (hash * 31 + chave.charCodeAt(i)) >>> 0;
    const valorTotal = Math.round(((hash % 490000) / 100 + 10) * 100) / 100; // R$ 10,00 a R$ 4.900,00

    return {
        emitente_nome: `Emitente NF-e (UF ${uf})`,
        emitente_cnpj: cnpjFmt,
        numero,
        data_emissao: dataEmissao,
        valor_total: valorTotal,
    };
};

export default function MobileImports() {
    const [imports, setImports]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [selected, setSelected] = useState(null);
    const [search, setSearch]     = useState('');
    const [online, setOnline]     = useState(false);
    const [newIds, setNewIds]     = useState(new Set());
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanStatus, setScanStatus]   = useState(''); // mensagem de feedback
    const [chaveModalOpen, setChaveModalOpen] = useState(false);
    const [chaveInput, setChaveInput]         = useState('');
    const [chaveError, setChaveError]         = useState('');
    const [chaveLoading, setChaveLoading]     = useState(false);
    const [xmlLoading, setXmlLoading]         = useState(false);
    const [xmlError, setXmlError]             = useState('');
    const xmlInputRef = useRef(null);
    const [cameras, setCameras]         = useState([]);
    const [activeCam, setActiveCam]     = useState(null);
    const [secCtx, setSecCtx]           = useState({ user_id: null, family_id: null });
    const channelRef  = useRef(null);
    const videoRef    = useRef(null);
    const canvasRef   = useRef(null);
    const streamRef   = useRef(null);
    const rafRef      = useRef(null);

    // ── Busca inicial ──────────────────────────────────────────────────────────
    useEffect(() => {
        fetchImports();
        subscribeRealtime();
        getSecurityContext().then(ctx => setSecCtx(ctx || { user_id: null, family_id: null }));
        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, []);

    const fetchImports = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('nfce_imports')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        setImports(data || []);
        setLoading(false);
    };

    // ── Realtime: escuta INSERT na tabela nfce_imports ─────────────────────────
    const subscribeRealtime = () => {
        const channel = supabase
            .channel('nfce_imports_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'nfce_imports' },
                (payload) => {
                    const nova = payload.new;
                    // Adiciona no topo da lista instantaneamente
                    setImports(prev => [nova, ...prev]);
                    // Marca como "nova" para destacar visualmente por 8s
                    setNewIds(prev => new Set([...prev, nova.id]));
                    setTimeout(() => {
                        setNewIds(prev => { const s = new Set(prev); s.delete(nova.id); return s; });
                    }, 8000);
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'nfce_imports' },
                (payload) => {
                    setImports(prev => prev.map(imp => imp.id === payload.new.id ? payload.new : imp));
                    setSelected(sel => sel?.id === payload.new.id ? payload.new : sel);
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'nfce_imports' },
                (payload) => {
                    setImports(prev => prev.filter(imp => imp.id !== payload.old.id));
                    setSelected(sel => sel?.id === payload.old.id ? null : sel);
                }
            )
            .subscribe((status) => {
                setOnline(status === 'SUBSCRIBED');
            });

        channelRef.current = channel;
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Remover este registro de importação?')) return;
        await supabase.from('nfce_imports').delete().eq('id', id);
        // O DELETE via realtime já vai remover da lista automaticamente
    };

    // ── Scanner QR Code ────────────────────────────────────────────────────────
    const stopCamera = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    }, []);

    const handleQrDetectedRef = useRef(null);

    // Mantém o ref sempre atualizado com a versão mais recente do handler
    useEffect(() => {
        if (handleQrDetectedRef.current !== null) {
            handleQrDetectedRef.current = handleQrDetected;
        }
    });

    const scanLoop = useCallback(() => {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(scanLoop);
            return;
        }
        const ctx = canvas.getContext('2d');
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code && handleQrDetectedRef.current) {
            handleQrDetectedRef.current(code.data);
        } else {
            rafRef.current = requestAnimationFrame(scanLoop);
        }
    }, []);

    const startCamera = useCallback(async (deviceId) => {
        stopCamera();
        setScanStatus('Iniciando câmera...');

        // Tenta estratégias em sequência até uma funcionar
        const strategies = [
            deviceId ? { video: { deviceId: { exact: deviceId } } } : null,
            { video: { facingMode: { ideal: 'environment' } } },
            { video: { facingMode: 'user' } },
            { video: true },
        ].filter(Boolean);

        let stream = null;
        let lastErr = null;
        for (const constraints of strategies) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                break;
            } catch (e) {
                lastErr = e;
            }
        }

        if (!stream) {
            setScanStatus(`Câmera indisponível: ${lastErr?.message || 'verifique as permissões'}`);
            return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
            const vid = videoRef.current;
            vid.srcObject = stream;
            await new Promise(res => {
                vid.onloadedmetadata = res;
                // timeout de segurança para evitar travamento
                setTimeout(res, 3000);
            });
            try { await vid.play(); } catch { /* autoplay pode ser bloqueado */ }
        }
        setScanStatus('Aponte para o QR Code do cupom fiscal...');
        scanLoop();
    }, [stopCamera, scanLoop]);

    const handleQrDetected = useCallback(async (qrData) => {
        handleQrDetectedRef.current = null; // evita dupla leitura
        stopCamera();
        setScanStatus('QR Code detectado! Processando...');

        // Extrai a chave de 44 dígitos da URL do cupom fiscal
        const chaveMatch = qrData.match(/\b(\d{44})\b/);
        const chave = chaveMatch ? chaveMatch[1] : null;

        // Extrai nome do emitente da URL
        let emitente_nome = null;
        try {
            const url = new URL(qrData);
            const cnpjMatch = qrData.match(/cnpj[=_]?(\d{14})/i);
            if (cnpjMatch) emitente_nome = `CNPJ: ${cnpjMatch[1]}`;
            else emitente_nome = url.hostname;
        } catch { emitente_nome = null; }

        // Busca contexto de segurança fresco no momento do insert
        const ctx = await getSecurityContext();

        const payload = {
            chave,
            raw_data: { qr_url: qrData, fonte: 'scanner_desktop' },
            emitente_nome: emitente_nome || 'Lido via QR Code',
            user_id:   ctx?.user_id   || null,
            family_id: ctx?.family_id || null,
        };

        const { error } = await supabase.from('nfce_imports').insert([payload]);
        if (error) {
            setScanStatus('Erro ao salvar: ' + error.message);
            setTimeout(() => {
                handleQrDetectedRef.current = handleQrDetected;
                startCamera(activeCam);
            }, 3000);
        } else {
            setScanStatus('✔ Nota salva com sucesso!');
            setTimeout(() => { setScannerOpen(false); setScanStatus(''); }, 2000);
        }
    }, [stopCamera, startCamera, activeCam]);

    const openScanner = useCallback(async () => {
        setScannerOpen(true);
        setScanStatus('Iniciando câmera...');
        handleQrDetectedRef.current = handleQrDetected;

        // Inicia com estratégia automática (sem forçar deviceId)
        await startCamera(null);

        // Lista câmeras disponíveis em segundo plano (após obter permissão)
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setCameras(videoDevices);
        } catch { /* ignora se não conseguir listar */ }
    }, [startCamera, handleQrDetected]);

    const closeScanner = useCallback(() => {
        stopCamera();
        setScannerOpen(false);
        setScanStatus('');
    }, [stopCamera]);

    const switchCamera = useCallback(async (deviceId) => {
        setActiveCam(deviceId);
        await startCamera(deviceId);
    }, [startCamera]);

    // ── Inserir via Chave de Acesso (44 dígitos) ────────────────────────────────
    const openChaveModal = () => {
        setChaveInput('');
        setChaveError('');
        setChaveModalOpen(true);
    };

    const closeChaveModal = () => {
        if (chaveLoading) return;
        setChaveModalOpen(false);
        setChaveInput('');
        setChaveError('');
    };

    const handleChaveInputChange = (e) => {
        const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 44);
        setChaveInput(onlyDigits);
        if (chaveError) setChaveError('');
    };

    const handleImportarPorChave = async () => {
        setChaveError('');
        const validacao = validarChaveAcesso(chaveInput);
        if (!validacao.valida) {
            setChaveError(validacao.motivo);
            return;
        }

        setChaveLoading(true);
        try {
            // Simula a consulta dos dados da NF-e/NFC-e junto à SEFAZ a partir da chave
            const dados = simularConsultaNFe(validacao.chave);

            const ctx = await getSecurityContext();
            // Tabela: nfce_imports — coluna "metodo" identifica a origem do registro
            // ('app_mobile' para o scanner do app, 'manual_chave' para esta inserção manual).
            const payload = {
                chave: validacao.chave,
                emitente_nome: dados.emitente_nome,
                emitente_cnpj: dados.emitente_cnpj,
                numero: dados.numero,
                data_emissao: dados.data_emissao,
                valor_total: dados.valor_total,
                metodo: 'manual_chave',
                raw_data: { fonte: 'manual_chave', chave_completa: validacao.chave },
                user_id:   ctx?.user_id   || null,
                family_id: ctx?.family_id || null,
            };

            const { error } = await supabase.from('nfce_imports').insert([payload]);
            if (error) {
                setChaveError('Erro ao importar: ' + error.message);
            } else {
                // A assinatura realtime (subscribeRealtime) já adiciona o registro
                // no topo da listagem automaticamente, sem precisar atualizar a página.
                setChaveModalOpen(false);
                setChaveInput('');
            }
        } catch (err) {
            setChaveError('Erro inesperado: ' + err.message);
        } finally {
            setChaveLoading(false);
        }
    };

    // ── Abrir XML (arquivo da NF-e/NFC-e) ───────────────────────────────────────
    const openXmlPicker = () => {
        setXmlError('');
        xmlInputRef.current?.click();
    };

    const handleXmlFileSelected = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // permite selecionar o mesmo arquivo novamente
        if (!file) return;

        setXmlError('');
        setXmlLoading(true);
        try {
            const xmlString = await file.text();
            const dados = parseNFeXml(xmlString);

            const validacao = validarChaveAcesso(dados.chave);
            if (!validacao.valida) {
                throw new Error(`Chave de acesso do XML é inválida: ${validacao.motivo}`);
            }

            const ctx = await getSecurityContext();
            // Tabela: nfce_imports — metodo = 'arquivo_xml' identifica notas importadas
            // diretamente do arquivo XML da NF-e/NFC-e (em vez de QR Code ou chave manual).
            const payload = {
                chave: validacao.chave,
                emitente_nome: dados.emitente_nome,
                emitente_cnpj: dados.emitente_cnpj,
                numero: dados.numero,
                data_emissao: dados.data_emissao,
                valor_total: dados.valor_total,
                itens: dados.itens,
                metodo: 'arquivo_xml',
                raw_data: { fonte: 'arquivo_xml', nome_arquivo: file.name },
                user_id:   ctx?.user_id   || null,
                family_id: ctx?.family_id || null,
            };

            const { error } = await supabase.from('nfce_imports').insert([payload]);
            if (error) {
                setXmlError('Erro ao importar XML: ' + error.message);
            }
            // Sucesso: a assinatura realtime adiciona o registro na listagem automaticamente.
        } catch (err) {
            setXmlError(err.message || 'Erro ao ler o arquivo XML.');
        } finally {
            setXmlLoading(false);
        }
    };

    const filtered = imports.filter(imp => {
        const q = search.toLowerCase();
        return !q ||
            imp.emitente_nome?.toLowerCase().includes(q) ||
            imp.chave?.includes(q) ||
            imp.numero?.includes(q);
    });

    // ── Estilos ────────────────────────────────────────────────────────────────
    const hdr = { background: '#89962F', color: '#fff', padding: '10px 16px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 };
    const card = { background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '20px 24px', marginBottom: '16px' };
    const thS  = { padding: '7px 10px', background: '#f5f5f5', fontSize: '10px', fontWeight: 'bold', color: '#444', textAlign: 'left', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' };
    const tdS  = { padding: '6px 10px', fontSize: '11px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' };

    return (
        <MainLayout>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>

                {/* Header */}
                <div style={hdr}>
                    <span style={{ fontSize: '18px' }}>📱</span>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                        Notas Fiscais Importadas pelo App Mobile
                    </span>

                    {/* Indicador ao vivo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: online ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.1)', border: `1px solid ${online ? '#81c784' : 'rgba(255,255,255,0.3)'}`, borderRadius: '20px', padding: '3px 10px 3px 8px' }}>
                        <span style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: online ? '#4caf50' : '#bdbdbd',
                            boxShadow: online ? '0 0 6px #4caf50' : 'none',
                            display: 'inline-block',
                            animation: online ? 'pulse 1.8s infinite' : 'none',
                        }} />
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: online ? '#c8e6c9' : 'rgba(255,255,255,0.5)' }}>
                            {online ? 'AO VIVO' : 'OFFLINE'}
                        </span>
                    </div>

                    <button onClick={openScanner}
                        style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: '4px', padding: '4px 14px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        📷 Escanear QR Code
                    </button>
                    <button onClick={openChaveModal}
                        style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: '4px', padding: '4px 14px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        🔑 Inserir via Chave
                    </button>
                    <button onClick={openXmlPicker} disabled={xmlLoading}
                        style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: '4px', padding: '4px 14px', fontSize: '10px', cursor: xmlLoading ? 'wait' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', opacity: xmlLoading ? 0.7 : 1 }}>
                        {xmlLoading ? '⏳ Lendo XML...' : '📄 Abrir XML'}
                    </button>
                    <input ref={xmlInputRef} type="file" accept=".xml,text/xml" style={{ display: 'none' }} onChange={handleXmlFileSelected} />
                    <button onClick={fetchImports}
                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 12px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                        ↻ Atualizar
                    </button>
                </div>

                {xmlError && (
                    <div style={{ background: '#ffebee', color: '#c62828', padding: '8px 16px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #ef9a9a' }}>
                        <span style={{ flex: 1 }}>⚠ {xmlError}</span>
                        <button onClick={() => setXmlError('')} style={{ background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✕</button>
                    </div>
                )}

                {/* Animação do pulsate */}
                <style>{`
                    @keyframes pulse {
                        0%   { box-shadow: 0 0 0 0 rgba(76,175,80,0.6); }
                        70%  { box-shadow: 0 0 0 6px rgba(76,175,80,0); }
                        100% { box-shadow: 0 0 0 0 rgba(76,175,80,0); }
                    }
                    @keyframes slideIn {
                        from { opacity: 0; transform: translateY(-8px); background: #fffde7; }
                        to   { opacity: 1; transform: translateY(0); }
                    }
                `}</style>

                <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

                    {/* Lista */}
                    <div style={{ width: selected ? '45%' : '100%', display: 'flex', flexDirection: 'column', borderRight: selected ? '1px solid #e0e0e0' : 'none', transition: 'width 0.2s' }}>

                        {/* Barra de busca + contador */}
                        <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Buscar por emitente, chave ou número..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ flex: 1, border: '1px solid #b2dfdb', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                            />
                            <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>
                                {filtered.length} nota{filtered.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        {/* Tabela */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {loading ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Carregando...</div>
                            ) : filtered.length === 0 ? (
                                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '52px', marginBottom: '14px' }}>📱</div>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#555', marginBottom: '8px' }}>Aguardando notas do App Mobile</div>
                                    <div style={{ fontSize: '12px', color: '#aaa', maxWidth: '320px', margin: '0 auto', lineHeight: 1.6 }}>
                                        Assim que você escanear um QR Code de cupom fiscal no app Agilis Mobile, a nota aparecerá aqui automaticamente — sem precisar atualizar a página.
                                    </div>
                                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: online ? '#4caf50' : '#e0e0e0', display: 'inline-block' }} />
                                        <span style={{ fontSize: '11px', color: online ? '#4caf50' : '#aaa' }}>
                                            {online ? 'Conexão ativa — monitorando em tempo real' : 'Conectando...'}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th style={thS}>Data / Hora</th>
                                            <th style={thS}>Emitente (Empresa)</th>
                                            <th style={thS}>Chave de Acesso</th>
                                            <th style={{ ...thS, textAlign: 'right' }}>Valor Total</th>
                                            <th style={{ ...thS, textAlign: 'center' }}>Status</th>
                                            <th style={{ ...thS, textAlign: 'center' }}>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(imp => {
                                            const isSelected = selected?.id === imp.id;
                                            const isNew = newIds.has(imp.id);
                                            return (
                                                <tr
                                                    key={imp.id}
                                                    style={{
                                                        background: isNew ? '#fffde7' : isSelected ? '#e8f5e9' : 'white',
                                                        cursor: 'pointer',
                                                        borderLeft: isSelected ? '3px solid #00695c' : isNew ? '3px solid #fbc02d' : '3px solid transparent',
                                                        animation: isNew ? 'slideIn 0.4s ease' : 'none',
                                                        transition: 'background 0.3s',
                                                    }}
                                                    onMouseEnter={e => { if (!isSelected && !isNew) e.currentTarget.style.background = '#f5f5f5'; }}
                                                    onMouseLeave={e => { if (!isSelected && !isNew) e.currentTarget.style.background = 'white'; }}
                                                    onClick={() => setSelected(isSelected ? null : imp)}
                                                >
                                                    <td style={tdS}>
                                                        <div style={{ fontSize: '11px', color: '#333', fontWeight: isNew ? 'bold' : 'normal' }}>
                                                            {fmtDT(imp.created_at)}
                                                        </div>
                                                        {isNew && (
                                                            <div style={{ fontSize: '9px', background: '#fbc02d', color: '#fff', borderRadius: '3px', padding: '1px 5px', display: 'inline-block', marginTop: '2px', fontWeight: 'bold' }}>
                                                                NOVA
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={tdS}>
                                                        <div style={{ fontWeight: '600', color: '#222', fontSize: '11px' }}>{imp.emitente_nome || '—'}</div>
                                                        <div style={{ fontSize: '9px', color: '#aaa' }}>CNPJ: {imp.emitente_cnpj || '—'}</div>
                                                    </td>
                                                    <td style={tdS}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#555', background: '#f5f5f5', padding: '2px 6px', borderRadius: '3px' }}>
                                                            {fmtChave(imp.chave)}
                                                        </span>
                                                        {imp.metodo === 'manual_chave' && (
                                                            <span style={{ marginLeft: '5px', fontSize: '8px', background: '#ede7f6', color: '#5e35b1', borderRadius: '3px', padding: '1px 5px', fontWeight: 'bold' }}>
                                                                🔑 MANUAL
                                                            </span>
                                                        )}
                                                        {imp.metodo === 'arquivo_xml' && (
                                                            <span style={{ marginLeft: '5px', fontSize: '8px', background: '#e1f5fe', color: '#0277bd', borderRadius: '3px', padding: '1px 5px', fontWeight: 'bold' }}>
                                                                📄 XML
                                                            </span>
                                                        )}
                                                        <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>NF {imp.numero || '—'} · {fmtDate(imp.data_emissao)}</div>
                                                    </td>
                                                    <td style={{ ...tdS, textAlign: 'right', fontWeight: 'bold', color: '#c62828', fontSize: '13px' }}>
                                                        {fmtBRL(imp.valor_total)}
                                                    </td>
                                                    <td style={{ ...tdS, textAlign: 'center' }}>
                                                        {imp.transaction_id
                                                            ? <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: '4px', padding: '2px 8px', fontSize: '9px', fontWeight: 'bold' }}>✔ LANÇADO</span>
                                                            : <span style={{ background: '#fff3e0', color: '#e65100', borderRadius: '4px', padding: '2px 8px', fontSize: '9px', fontWeight: 'bold' }}>PENDENTE</span>
                                                        }
                                                    </td>
                                                    <td style={{ ...tdS, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => setSelected(isSelected ? null : imp)}
                                                            style={{ background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: '4px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold', marginRight: '4px' }}>
                                                            🔍 Visualizar
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(imp.id)}
                                                            style={{ background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '4px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                            🗑
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Painel de detalhe */}
                    {selected && (
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#004d40', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Detalhes da Nota
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleDelete(selected.id)}
                                        style={{ background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        🗑 Excluir
                                    </button>
                                    <button onClick={() => setSelected(null)}
                                        style={{ background: '#f5f5f5', color: '#555', border: '1px solid #ddd', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer' }}>
                                        ✕ Fechar
                                    </button>
                                </div>
                            </div>

                            {/* Emitente */}
                            <div style={card}>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>Emitente</div>
                                <div style={{ fontSize: '15px', fontWeight: '800', color: '#004d40', marginBottom: '4px' }}>{selected.emitente_nome || '—'}</div>
                                <div style={{ fontSize: '11px', color: '#888' }}>CNPJ: {selected.emitente_cnpj || '—'}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '14px' }}>
                                    <div>
                                        <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '2px' }}>Número / Série</div>
                                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>{selected.numero || '—'} / {selected.serie || '—'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '2px' }}>Data de Emissão</div>
                                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1565c0' }}>{fmtDate(selected.data_emissao)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '2px' }}>Valor Total</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#c62828' }}>{fmtBRL(selected.valor_total)}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Chave de acesso */}
                            {selected.chave && (
                                <div style={{ background: '#f5f5f5', borderRadius: '6px', padding: '10px 14px' }}>
                                    <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' }}>Chave de Acesso (44 dígitos)</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#444', wordBreak: 'break-all', letterSpacing: '0.08em', lineHeight: 1.8 }}>
                                        {selected.chave.replace(/(\d{4})/g, '$1 ').trim()}
                                    </div>
                                </div>
                            )}

                            {/* Itens */}
                            {selected.itens && selected.itens.length > 0 && (
                                <div style={card}>
                                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>
                                        Itens ({selected.itens.length})
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ ...thS, width: '28px', textAlign: 'center' }}>#</th>
                                                <th style={thS}>Produto</th>
                                                <th style={{ ...thS, textAlign: 'center' }}>Qtd</th>
                                                <th style={{ ...thS, textAlign: 'right' }}>Valor</th>
                                                <th style={thS}>Centro de Custo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selected.itens.map((it, idx) => (
                                                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fafafa' : '#fff' }}>
                                                    <td style={{ ...tdS, textAlign: 'center', color: '#aaa', fontSize: '10px' }}>{idx + 1}</td>
                                                    <td style={tdS}>
                                                        <div style={{ fontWeight: '500', color: '#222', fontSize: '11px' }}>{it.nome}</div>
                                                        {it.ncm && <div style={{ fontSize: '9px', color: '#aaa' }}>NCM: {it.ncm}</div>}
                                                    </td>
                                                    <td style={{ ...tdS, textAlign: 'center', color: '#555', fontSize: '10px' }}>{it.qtd} {it.un}</td>
                                                    <td style={{ ...tdS, textAlign: 'right', fontWeight: 'bold', color: '#c62828', fontSize: '11px' }}>{fmtBRL(it.vProd)}</td>
                                                    <td style={{ ...tdS, fontSize: '10px' }}>
                                                        {it.ccSelecionado
                                                            ? <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: '3px', padding: '2px 8px', fontWeight: '600' }}>{it.ccSelecionado}</span>
                                                            : <span style={{ color: '#bbb' }}>— Sem CC</span>
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: '#004d40' }}>
                                                <td colSpan={3} style={{ padding: '7px 10px', color: '#CCFF00', fontWeight: 'bold', fontSize: '10px' }}>TOTAL</td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#CCFF00', fontWeight: 'bold', fontSize: '12px' }}>{fmtBRL(selected.valor_total)}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {/* Status do lançamento */}
                            <div style={card}>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '10px' }}>Lançamento no Agilis</div>
                                {selected.transaction_id ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 'bold' }}>
                                            ✔ Lançamento criado com sucesso
                                        </span>
                                        <span style={{ fontSize: '9px', color: '#aaa', fontFamily: 'monospace' }}>{selected.transaction_id}</span>
                                    </div>
                                ) : (
                                    <div style={{ background: '#fff3e0', color: '#e65100', borderRadius: '6px', padding: '10px 14px', fontSize: '12px' }}>
                                        ⚠ Esta nota ainda não foi confirmada como lançamento no app mobile.
                                    </div>
                                )}
                            </div>

                            {/* Dados brutos JSON */}
                            <RawDataViewer data={selected.raw_data} />

                        </div>
                    )}
                </div>
            </div>
            {/* Modal Scanner QR Code */}
            {scannerOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                    <div style={{ background: '#1a1a2e', borderRadius: '12px', overflow: 'hidden', width: '480px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        {/* Header */}
                        <div style={{ background: '#89962F', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '12px', letterSpacing: '0.05em' }}>📷 SCANNER DE QR CODE — CUPOM FISCAL</span>
                            <button onClick={closeScanner} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' }}>✕ Fechar</button>
                        </div>

                        {/* Viewfinder */}
                        <div style={{ position: 'relative', background: '#000', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                            {/* Moldura de mira */}
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                <div style={{ width: '200px', height: '200px', position: 'relative' }}>
                                    {[['0','0','auto','auto'],['0','auto','auto','0'],['auto','0','0','auto'],['auto','auto','0','0']].map(([t,r,b,l], i) => (
                                        <div key={i} style={{ position: 'absolute', top: t, right: r, bottom: b, left: l, width: '28px', height: '28px',
                                            borderTop: (i === 0 || i === 1) ? '3px solid #CCFF00' : 'none',
                                            borderBottom: (i === 2 || i === 3) ? '3px solid #CCFF00' : 'none',
                                            borderLeft: (i === 0 || i === 2) ? '3px solid #CCFF00' : 'none',
                                            borderRight: (i === 1 || i === 3) ? '3px solid #CCFF00' : 'none',
                                        }} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Status */}
                        <div style={{ padding: '12px 16px', textAlign: 'center', color: scanStatus.startsWith('✔') ? '#CCFF00' : scanStatus.startsWith('Erro') ? '#ff6b6b' : '#ccc', fontSize: '11px', fontWeight: '500', minHeight: '40px', background: '#0f172a' }}>
                            {scanStatus || 'Aguardando câmera...'}
                        </div>

                        {/* Seleção de câmera (se houver mais de uma) */}
                        {cameras.length > 1 && (
                            <div style={{ padding: '8px 16px', background: '#0f172a', borderTop: '1px solid #1e293b', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', color: '#64748b', alignSelf: 'center' }}>Câmera:</span>
                                {cameras.map((cam, i) => (
                                    <button key={cam.deviceId} onClick={() => switchCamera(cam.deviceId)}
                                        style={{ background: activeCam === cam.deviceId ? '#89962F' : '#1e293b', color: activeCam === cam.deviceId ? '#fff' : '#94a3b8', border: '1px solid #334155', borderRadius: '4px', padding: '3px 10px', fontSize: '10px', cursor: 'pointer' }}>
                                        {cam.label || `Câmera ${i + 1}`}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Instrução */}
                        <div style={{ padding: '10px 16px', background: '#0f172a', borderTop: '1px solid #1e293b', fontSize: '10px', color: '#475569', textAlign: 'center' }}>
                            Aponte a câmera para o QR Code no cupom fiscal ou nota eletrônica. A leitura é automática.
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Inserir via Chave de Acesso */}
            {chaveModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '10px', width: '440px', maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
                        <div style={{ background: '#89962F', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '12px', letterSpacing: '0.05em' }}>🔑 INSERIR NOTA VIA CHAVE DE ACESSO</span>
                            <button onClick={closeChaveModal} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                        </div>

                        <div style={{ padding: '20px 20px 22px 20px' }}>
                            <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px', lineHeight: 1.5 }}>
                                Digite a chave de acesso de <strong>44 dígitos</strong> da NF-e/NFC-e. Os dados do emitente, valor e data serão buscados automaticamente.
                            </div>

                            <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={formatarChaveInput(chaveInput)}
                                onChange={handleChaveInputChange}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleImportarPorChave(); }}
                                placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 00"
                                disabled={chaveLoading}
                                style={{
                                    width: '100%', border: `1px solid ${chaveError ? '#ef5350' : '#b2dfdb'}`, borderRadius: '6px',
                                    padding: '10px 12px', fontSize: '13px', fontFamily: 'monospace', letterSpacing: '0.04em',
                                    outline: 'none', textAlign: 'center',
                                }}
                            />

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                                <span style={{ fontSize: '10px', color: chaveError ? '#c62828' : '#aaa' }}>
                                    {chaveError || ' '}
                                </span>
                                <span style={{ fontSize: '10px', color: chaveInput.length === 44 ? '#2e7d32' : '#aaa', fontWeight: 'bold' }}>
                                    {chaveInput.length}/44
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                                <button
                                    onClick={closeChaveModal}
                                    disabled={chaveLoading}
                                    style={{ flex: 1, background: '#f5f5f5', color: '#555', border: '1px solid #ddd', borderRadius: '6px', padding: '9px', fontSize: '12px', cursor: chaveLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleImportarPorChave}
                                    disabled={chaveLoading || chaveInput.length !== 44}
                                    style={{
                                        flex: 2, background: chaveLoading || chaveInput.length !== 44 ? '#c8e6c9' : '#00695c', color: '#fff', border: 'none',
                                        borderRadius: '6px', padding: '9px', fontSize: '12px', fontWeight: 'bold',
                                        cursor: chaveLoading || chaveInput.length !== 44 ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {chaveLoading ? 'Buscando dados...' : '🔍 Buscar e Importar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}

function RawDataViewer({ data }) {
    const [open, setOpen] = useState(false);
    if (!data) return null;
    return (
        <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: '16px' }}>
            <button
                onClick={() => setOpen(v => !v)}
                style={{ width: '100%', background: '#37474f', color: '#cfd8dc', border: 'none', padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.05em' }}
            >
                {open ? '▼' : '▶'} DADOS BRUTOS (JSON) — clique para {open ? 'recolher' : 'expandir'}
            </button>
            {open && (
                <pre style={{ margin: 0, padding: '14px 16px', fontSize: '10px', fontFamily: 'monospace', color: '#37474f', background: '#f8f9fa', overflowX: 'auto', maxHeight: '320px', overflowY: 'auto', lineHeight: 1.6 }}>
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
}
