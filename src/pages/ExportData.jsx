import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import MainLayout from '../components/MainLayout';
import { FileDown, FileText, FileSpreadsheet, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const ExportData = () => {
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [transactionTypes, setTransactionTypes] = useState([]);
    const [security, setSecurity] = useState(null);
    const [loading, setLoading] = useState(false);

    const [filters, setFilters] = useState({
        accountId: '',
        startDate: '',
        endDate: '',
        costCenterId: '',
        transactionTypeId: ''
    });

    useEffect(() => {
        const init = async () => {
            const context = await getSecurityContext();
            setSecurity(context);
            if (context?.family_id) {
                fetchFilterOptions(context.family_id);
            }
        };
        init();
    }, []);

    const fetchFilterOptions = async (familyId) => {
        const [accRes, ccRes, ttRes] = await Promise.all([
            supabase.from('accounts').select('id, name').eq('family_id', familyId).order('name'),
            supabase.from('cost_centers').select('id, description, full_code').eq('family_id', familyId).order('full_code'),
            supabase.from('chart_of_accounts').select('id, description, code').order('code')
        ]);
        if (accRes.data) setAccounts(accRes.data);
        if (ccRes.data) setCostCenters(ccRes.data);
        if (ttRes.data) setTransactionTypes(ttRes.data);
    };

    const fetchExportData = async () => {
        if (!security?.family_id) return [];
        setLoading(true);
        let query = supabase
            .from('transactions')
            .select(`
                *,
                account:accounts(name),
                cost_center:cost_centers(description, full_code),
                transaction_type:chart_of_accounts(code, description)
            `)
            .eq('family_id', security.family_id)
            .order('emission_date', { ascending: true })
            .order('created_at', { ascending: true });

        if (filters.accountId) query = query.eq('account_id', filters.accountId);
        if (filters.startDate) query = query.gte('emission_date', filters.startDate);
        if (filters.endDate) query = query.lte('emission_date', filters.endDate);
        if (filters.costCenterId) query = query.eq('cost_center_id', filters.costCenterId);
        if (filters.transactionTypeId) query = query.eq('transaction_type_id', filters.transactionTypeId);

        const { data, error } = await query;
        setLoading(false);
        if (error) {
            console.error('Export Error:', error);
            alert('Erro ao buscar dados: ' + error.message);
            return [];
        }
        return data || [];
    };

    const processDataForExport = (rawData) => {
        let currentBalance = 0;
        let totalIncome = 0;
        let totalExpense = 0;

        const formatted = rawData.map(item => {
            const amount = Number(item.amount);
            const isCredit = item.dc_type === 'C';
            if (isCredit) totalIncome += amount;
            else totalExpense += amount;

            currentBalance += (isCredit ? amount : -amount);

            return {
                Data: new Date(item.emission_date + 'T00:00:00').toLocaleDateString('pt-BR'),
                Categoria: item.transaction_type ? `${item.transaction_type.code || ''} ${item.transaction_type.description}`.trim() : 'Não Classificado',
                'Centro de Custo': item.cost_center ? `${item.cost_center.full_code || ''} ${item.cost_center.description}`.trim() : 'Não Classificado',
                Descrição: item.description || '',
                Valor: isCredit ? amount : -amount,
                Conta: item.account?.name || 'Múltiplas',
                'Saldo Projetado': currentBalance
            };
        });

        return { formatted, totalIncome, totalExpense, finalBalance: currentBalance };
    };

    const handleExportCSV = async () => {
        const rawData = await fetchExportData();
        if (!rawData.length) return alert('Nenhum dado encontrado para exportação.');

        const { formatted } = processDataForExport(rawData);

        const headers = Object.keys(formatted[0]);
        let csvContent = '\uFEFF'; // BOM
        csvContent += headers.join(';') + '\n';

        formatted.forEach(item => {
            const row = headers.map(header => {
                let cell = item[header];
                if (typeof cell === 'number') {
                    // Force CSV to use comma for decimals if pt-BR is assumed, but standard CSV uses dot.
                    // We'll use comma separator and quotes.
                    cell = cell.toFixed(2).replace('.', ',');
                }
                if (typeof cell === 'string') {
                    cell = `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            });
            csvContent += row.join(';') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `agilis_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportXLSX = async () => {
        const rawData = await fetchExportData();
        if (!rawData.length) return alert('Nenhum dado encontrado para exportação.');

        const { formatted } = processDataForExport(rawData);

        // Map numeric to standard numbers so excel formats them natively
        const excelData = formatted.map(item => ({
            Data: item.Data,
            Categoria: item.Categoria,
            'Centro de Custo': item['Centro de Custo'],
            Descrição: item.Descrição,
            Valor: item.Valor,
            Conta: item.Conta,
            'Saldo Projetado': item['Saldo Projetado']
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);

        // Add Autofilter
        ws['!autofilter'] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws['!ref'])) };

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transações");

        XLSX.writeFile(wb, `agilis_extrato_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportPDF = async () => {
        const rawData = await fetchExportData();
        if (!rawData.length) return alert('Nenhum dado encontrado para exportação.');

        const { formatted, totalIncome, totalExpense, finalBalance } = processDataForExport(rawData);

        const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

        const formatCurrency = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Add Agilis Text Header (Top Left Context)
        const generateHeader = (data) => {
            doc.setFontSize(22);
            doc.setTextColor(0, 77, 64); // Dark Green
            doc.text('Agili$', 14, 20);

            doc.setFontSize(10);
            doc.setTextColor(150, 150, 150);
            doc.text('Relatório Financeiro', 14, 26);

            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            const periodStr = (filters.startDate && filters.endDate)
                ? `Período: ${new Date(filters.startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(filters.endDate + 'T00:00:00').toLocaleDateString('pt-BR')}`
                : 'Período: Completo';
            doc.text(periodStr, doc.internal.pageSize.width - 80, 20);
            doc.text(`Conta: ${filters.accountId ? accounts.find(a => a.id === filters.accountId)?.name : 'Todas as Contas'}`, doc.internal.pageSize.width - 80, 26);
        };

        const tableBody = formatted.map(item => [
            item.Data,
            item.Categoria,
            item['Centro de Custo'],
            item.Descrição,
            formatCurrency(item.Valor),
            item.Conta,
            formatCurrency(item['Saldo Projetado'])
        ]);

        autoTable(doc, {
            startY: 35,
            head: [['Data', 'Categoria', 'Centro de Custo', 'Descrição', 'Valor', 'Conta', 'Saldo']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [0, 77, 64], halign: 'center' },
            columnStyles: {
                0: { cellWidth: 25, halign: 'center' },
                4: { cellWidth: 35, halign: 'right' },
                6: { cellWidth: 35, halign: 'right' }
            },
            styles: { fontSize: 8 },
            didDrawPage: generateHeader,
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 4) {
                    const rawVal = formatted[data.row.index].Valor;
                    if (rawVal < 0) data.cell.styles.textColor = [211, 47, 47]; // Red
                    else if (rawVal > 0) data.cell.styles.textColor = [56, 142, 60]; // Green
                }
            }
        });

        // Footer Totals
        const finalY = doc.lastAutoTable.finalY + 15;
        if (finalY < doc.internal.pageSize.height - 30) {
            doc.setFontSize(11);
            doc.setTextColor(50, 50, 50);
            doc.text('Resumo do Relatório:', 14, finalY);

            doc.setFontSize(10);
            doc.setTextColor(56, 142, 60); // Green
            doc.text(`Entradas (+): ${formatCurrency(totalIncome)}`, 14, finalY + 8);

            doc.setTextColor(211, 47, 47); // Red
            doc.text(`Saídas (-): ${formatCurrency(totalExpense)}`, 14, finalY + 14);

            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.setFont(undefined, 'bold');
            doc.text(`Saldo Projetado (Período): ${formatCurrency(finalBalance)}`, 14, finalY + 22);
        }

        doc.save(`agilis_relatorio_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    return (
        <MainLayout title="Exportação e Relatórios">
            <div className="flex flex-col h-full bg-slate-50 p-6 md:p-10 gap-8 overflow-y-auto">
                <div className="glass-card max-w-4xl w-full mx-auto p-8 rounded-2xl shadow-lg border border-white">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-6">
                        <Download className="text-money-green-dark" /> Filtros de Exportação
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-gray-600 uppercase">Conta Bancária</label>
                            <select
                                value={filters.accountId}
                                onChange={e => setFilters({ ...filters, accountId: e.target.value })}
                                className="input-money"
                            >
                                <option value="">Todas as Contas...</option>
                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                            </select>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex flex-col gap-2 flex-1">
                                <label className="text-sm font-bold text-gray-600 uppercase">Data Inicial</label>
                                <input
                                    type="date"
                                    className="input-money"
                                    value={filters.startDate}
                                    onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-2 flex-1">
                                <label className="text-sm font-bold text-gray-600 uppercase">Data Final</label>
                                <input
                                    type="date"
                                    className="input-money"
                                    value={filters.endDate}
                                    onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-gray-600 uppercase">Centro de Custo</label>
                            <select
                                value={filters.costCenterId}
                                onChange={e => setFilters({ ...filters, costCenterId: e.target.value })}
                                className="input-money"
                            >
                                <option value="">Todos...</option>
                                {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.full_code} {cc.description}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-gray-600 uppercase">Plano de Contas (Categoria)</label>
                            <select
                                value={filters.transactionTypeId}
                                onChange={e => setFilters({ ...filters, transactionTypeId: e.target.value })}
                                className="input-money"
                            >
                                <option value="">Todas...</option>
                                {transactionTypes.map(tt => <option key={tt.id} value={tt.id}>{tt.code} {tt.description}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mx-auto">
                    <button
                        onClick={handleExportPDF}
                        disabled={loading}
                        className="glass-card p-6 rounded-2xl shadow hover:shadow-lg transition-all flex flex-col items-center gap-4 group cursor-pointer border-t-[4px] border-red-500"
                    >
                        <div className="p-4 bg-red-100 text-red-600 rounded-full group-hover:scale-110 transition-transform">
                            <FileText size={40} />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-lg text-gray-800">Exportar PDF</h3>
                            <p className="text-sm text-gray-500 mt-1">Layout Executivo Timbrado</p>
                        </div>
                    </button>

                    <button
                        onClick={handleExportXLSX}
                        disabled={loading}
                        className="glass-card p-6 rounded-2xl shadow hover:shadow-lg transition-all flex flex-col items-center gap-4 group cursor-pointer border-t-[4px] border-green-500"
                    >
                        <div className="p-4 bg-green-100 text-green-700 rounded-full group-hover:scale-110 transition-transform">
                            <FileSpreadsheet size={40} />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-lg text-gray-800">Exportar Excel</h3>
                            <p className="text-sm text-gray-500 mt-1">Formato .XLSX com Filtros</p>
                        </div>
                    </button>

                    <button
                        onClick={handleExportCSV}
                        disabled={loading}
                        className="glass-card p-6 rounded-2xl shadow hover:shadow-lg transition-all flex flex-col items-center gap-4 group cursor-pointer border-t-[4px] border-blue-500"
                    >
                        <div className="p-4 bg-blue-100 text-blue-600 rounded-full group-hover:scale-110 transition-transform">
                            <FileDown size={40} />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-lg text-gray-800">Exportar CSV</h3>
                            <p className="text-sm text-gray-500 mt-1">Para importação em outros sistemas</p>
                        </div>
                    </button>
                </div>
            </div>
            <style>{`
                .input-money {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    font-size: 14px;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .input-money:focus {
                    border-color: #0d9488;
                    box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
                }
            `}</style>
        </MainLayout>
    );
};

export default ExportData;
