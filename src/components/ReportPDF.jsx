import React, { useRef } from 'react';

/**
 * Envolve o conteúdo do relatório e fornece botão "Visualizar PDF".
 * Ao clicar, abre uma janela de impressão com apenas o conteúdo do relatório,
 * permitindo salvar como PDF ou imprimir diretamente.
 *
 * Props:
 *   title    – título que aparece no cabeçalho do PDF
 *   children – conteúdo do relatório (tabelas, gráficos, etc.)
 */
const ReportPDF = ({ title = 'Relatório', children }) => {
    const contentRef = useRef(null);

    const handlePrint = () => {
        const html = contentRef.current?.innerHTML;
        if (!html) return;

        const now = new Date();
        const dataHora = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const win = window.open('', '_blank', 'width=1100,height=800');
        win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #222; background: white; padding: 16px 20px; }
    .report-header { display: flex; justify-content: space-between; align-items: baseline;
                     border-bottom: 2px solid #b2dfdb; padding-bottom: 6px; margin-bottom: 12px; }
    .report-header h1 { font-size: 13px; font-weight: 700; color: #004d40; text-transform: uppercase;
                        letter-spacing: 0.06em; margin: 0; }
    .report-header .brand { font-size: 11px; font-weight: 700; color: #00695c; white-space: nowrap; }
    .report-header .datetime { font-size: 9px; color: #888; white-space: nowrap; margin-left: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead th { background: #CCFF00; color: #000000; font-weight: bold; padding: 5px 7px;
               border-bottom: 2px solid #e0e0e0; text-align: right; white-space: nowrap; }
    thead th:first-child { text-align: left; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody td { padding: 3px 7px; text-align: right; border-bottom: 1px solid #f0f0f0; }
    tbody td:first-child { text-align: left; }
    tfoot td { background: #89962F; color: #ffffff; font-weight: bold; padding: 5px 7px; text-align: right; }
    tfoot td:first-child { text-align: left; color: #ffffff; }
    /* remove sticky positioning for print */
    thead { position: static !important; }
    tfoot { position: static !important; }
    td[style*="sticky"], th[style*="sticky"] { position: static !important; }
    /* bar chart colors */
    [style*="background: rgb(76, 175, 80)"], [style*="background:#4caf50"] { background: #4caf50 !important; }
    [style*="background: rgb(244, 67, 54)"], [style*="background:#f44336"] { background: #f44336 !important; }
    @page { size: A4 landscape; margin: 12mm 10mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${title}</h1>
    <div style="display:flex;align-items:baseline;gap:10px">
      <span class="datetime">${dataHora}</span>
      <span class="brand">Agilis — Agilidade Financeira</span>
    </div>
  </div>
  ${html}
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`);
        win.document.close();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* área capturada para PDF */}
            <div ref={contentRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                {children}
            </div>

            {/* barra inferior com botão PDF */}
            <div style={{
                flexShrink: 0,
                background: '#89962F',
                borderTop: '2px solid #b2dfdb',
                padding: '6px 14px',
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
                gap: '8px',
            }}>
                <button
                    onClick={handlePrint}
                    style={{
                        background: '#004d40',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        height: '36px',
                        padding: '0 16px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        letterSpacing: '0.03em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    🖨 Visualizar PDF / Imprimir
                </button>
                <span style={{ fontSize: '10px', color: '#000000' }}>
                    Gere o PDF e depois use o botão de impressão do seu navegador para imprimir.
                </span>
            </div>
        </div>
    );
};

export default ReportPDF;
