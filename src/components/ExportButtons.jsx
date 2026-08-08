import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ExportButtons = ({ title, columns, rows, onImport }) => {
    const [showMenu, setShowMenu] = useState(false);
    const fileRef = useRef(null);

    const exportExcel = () => {
        const data = rows.map(row => {
            const obj = {};
            columns.forEach(col => { obj[col.label] = row[col.key] ?? ''; });
            return obj;
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
        XLSX.writeFile(wb, `${title}.xlsx`);
        setShowMenu(false);
    };

    const exportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(13);
        doc.text(title, 14, 15);
        autoTable(doc, {
            startY: 22,
            head: [columns.map(c => c.label)],
            body: rows.map(row => columns.map(col => row[col.key] ?? '')),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [137, 150, 47], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
        });
        doc.save(`${title}.pdf`);
        setShowMenu(false);
    };

    const exportGoogleSheets = () => {
        // Exporta CSV e abre Google Sheets para importar
        const header = columns.map(c => c.label).join(',');
        const csvRows = rows.map(row =>
            columns.map(col => {
                const val = String(row[col.key] ?? '').replace(/"/g, '""');
                return `"${val}"`;
            }).join(',')
        );
        const csv = [header, ...csvRows].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        // Abre Google Sheets após download
        setTimeout(() => window.open('https://sheets.google.com', '_blank'), 500);
        setShowMenu(false);
    };

    const handleImport = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
                if (onImport) onImport(data);
            } catch {
                alert('Erro ao ler o arquivo. Use CSV ou XLSX.');
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const btnBase = {
        padding: '3px 10px', fontSize: '11px', fontWeight: 'bold',
        borderRadius: '4px', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
    };

    return (
        <div style={{ display: 'flex', gap: '6px', position: 'relative', alignItems: 'center' }}>
            {/* Botão Exportar */}
            <div style={{ position: 'relative' }}>
                <button
                    style={{ ...btnBase, background: '#1565c0', color: '#fff' }}
                    onClick={() => setShowMenu(v => !v)}
                    title="Exportar dados"
                >
                    ↑ Exportar
                </button>
                {showMenu && (
                    <>
                        <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                            background: '#fff', border: '1px solid #ddd', borderRadius: '6px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: '160px', marginTop: '2px'
                        }}>
                            <div onClick={exportExcel} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f0f0f0' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                📊 Excel (.xlsx)
                            </div>
                            <div onClick={exportPDF} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f0f0f0' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                📄 PDF
                            </div>
                            <div onClick={exportGoogleSheets} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                🟢 Google Sheets
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Botão Importar */}
            {onImport && (
                <>
                    <button
                        style={{ ...btnBase, background: '#00695c', color: '#fff' }}
                        onClick={() => fileRef.current?.click()}
                        title="Importar CSV ou XLSX"
                    >
                        ↓ Importar
                    </button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        style={{ display: 'none' }}
                        onChange={handleImport}
                    />
                </>
            )}
        </div>
    );
};

export default ExportButtons;
