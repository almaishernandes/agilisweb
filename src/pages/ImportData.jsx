import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSecurityContext } from '../lib/auth';
import { seedChartOfAccountsIfEmpty } from '../lib/seedChartOfAccounts';
import MainLayout from '../components/MainLayout';
import { Upload, Check, AlertTriangle, FileText, Save, X } from 'lucide-react';

const ImportData = () => {
    const [searchParams] = useSearchParams();
    const [file, setFile] = useState(null);
    const [importedData, setImportedData] = useState([]);
    const [step, setStep] = useState(1); // 1: Upload, 2: Classification, 3: Success
    const [loading, setLoading] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [options, setOptions] = useState({
        costCenters: [],
        chartOfAccounts: []
    });
    const [editingCell, setEditingCell] = useState(null);
    const [globalDueDate, setGlobalDueDate] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const [securityContext, setSecurityContext] = useState({ user_id: null, family_id: null });

    useEffect(() => {
        const init = async () => {
            const context = await getSecurityContext();
            setSecurityContext(context);
            await fetchOptions(context.family_id);
            await fetchAccounts();
            
            // Handle auto-selection from URL
            const urlAccountId = searchParams.get('accountId');
            if (urlAccountId) {
                setSelectedAccountId(urlAccountId);
                // Trigger file explorer after a short delay to ensure DOM is ready
                setTimeout(() => {
                    if (fileInputRef.current) {
                        fileInputRef.current.click();
                    }
                }, 500);
            }
        };
        init();
    }, [searchParams]);

    const fetchAccounts = async () => {
        const { data } = await supabase.from('accounts').select('id, name, account_type');
        if (data) setAccounts(data);
    };

    const fetchOptions = async (familyId) => {
        if (familyId) await seedChartOfAccountsIfEmpty(familyId);

        let coaQuery = supabase.from('chart_of_accounts').select('id, code, description').order('code');
        if (familyId) coaQuery = coaQuery.eq('family_id', familyId);

        const [cc, coa] = await Promise.all([
            supabase.from('cost_centers').select('id, full_code, description').order('full_code'),
            coaQuery
        ]);
        setOptions({
            costCenters: (cc.data || []).map(item => ({ ...item, displayName: `${item.full_code || ''} ${item.description || ''}`.trim() })),
            chartOfAccounts: (coa.data || []).map(item => ({ ...item, displayName: `${item.code || ''} ${item.description || ''}`.trim() }))
        });
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseFile(selectedFile);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.ofc') || droppedFile.name.endsWith('.txt'))) {
            setFile(droppedFile);
            parseFile(droppedFile);
        } else if (droppedFile) {
            alert('Por favor, selecione um arquivo .OFC ou .TXT');
        }
    };

    const parseFile = (file) => {
        setLoading(true);
        const reader = new FileReader();
        reader.readAsText(file, 'ISO-8859-1');

        reader.onload = (e) => {
            const content = e.target.result;
            const transactions = [];
            const trnRegex = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|$)/g;
            let match;

            while ((match = trnRegex.exec(content)) !== null) {
                const trnContent = match[1];
                const dtPostedMatch = trnContent.match(/<DTPOSTED>(\d{8})/);
                const trnAmtMatch = trnContent.match(/<TRNAMT>([-+]?\d+([,.]\d+)?)/);
                const nameMatch = trnContent.match(/<NAME>([^<\r\n]+)/);
                const memoMatch = trnContent.match(/<MEMO>([^<\r\n]+)/);

                if (dtPostedMatch && trnAmtMatch) {
                    const dateStr = dtPostedMatch[1];
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    const formattedDate = `${year}-${month}-${day}`;

                    const amountStr = trnAmtMatch[1].replace(',', '.');
                    const amount = parseFloat(amountStr);
                    const description = (nameMatch ? nameMatch[1].trim() : '') +
                        (memoMatch ? ' ' + memoMatch[1].trim() : '');

                    transactions.push({
                        id: Math.random().toString(36).substr(2, 9),
                        emission_date: formattedDate,
                        due_date: formattedDate,
                        description: description.trim(),
                        amount: Math.abs(amount),
                        dc_type: amount >= 0 ? 'C' : 'D',
                        cost_center_id: '',
                        transaction_type_id: ''
                    });
                }
            }

            setImportedData(transactions);
            setStep(2);
            setLoading(false);
        };
    };

    const handleRowChange = (id, field, value) => {
        setImportedData(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const handleGlobalDueDateChange = (date) => {
        setGlobalDueDate(date);
        setImportedData(prev => prev.map(item => ({ ...item, due_date: date })));
    };

    const handleImport = async () => {
        if (!selectedAccountId) {
            alert('Por favor, selecione uma conta de destino.');
            return;
        }

        setLoading(true);
        try {
            const payloads = importedData.map(item => ({
                account_id: selectedAccountId,
                emission_date: item.emission_date,
                due_date: item.due_date,
                description: item.description,
                amount: item.amount,
                dc_type: item.dc_type,
                type: item.dc_type === 'C' ? 'Income' : 'Expense',
                cost_center_id: item.cost_center_id || null,
                transaction_type_id: item.transaction_type_id || null,
                user_id: securityContext.user_id,
                family_id: securityContext.family_id
            }));

            const { error } = await supabase.from('transactions').insert(payloads);
            if (error) throw error;
            setStep(3);
        } catch (error) {
            console.error('Import error:', error);
            alert('Erro ao importar dados: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { label: 'Data', key: 'emission_date', width: '90px' },
        { label: 'Vencimento', key: 'due_date', width: '90px' },
        { label: 'Descrição', key: 'description' },
        { label: 'Valor', key: 'amount', width: '100px', type: 'number' },
        { label: 'Centro de Custo', key: 'cost_center_id', type: 'combobox', options: options.costCenters.map(cc => ({ id: cc.id, label: cc.description })) },
        { label: 'Plano de Contas', key: 'transaction_type_id', type: 'combobox', options: options.chartOfAccounts.map(coa => ({ id: coa.id, label: coa.name })) }
    ];

    const renderStep1 = () => (
        <div className="flex flex-col items-center justify-center h-full py-20 px-4">
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`max-w-md w-full glass-card p-10 flex flex-col items-center gap-6 border-2 border-dashed transition-all cursor-pointer relative group ${
                    isDragging 
                    ? 'border-money-green-dark bg-money-green-light/30 scale-105 shadow-xl' 
                    : 'border-money-green-mid/30 hover:border-money-green-mid/60'
                }`}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ofc,.txt"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className={`p-6 bg-money-green-light rounded-full transition-transform ${isDragging ? 'scale-110 bg-money-green-mid/20' : 'group-hover:scale-110'}`}>
                    <Upload size={48} className={isDragging ? 'text-money-green-dark' : 'text-money-green-dark'} />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-bold text-money-green-dark">
                        {isDragging ? 'Solte para importar' : 'Importar Extrato Bancário'}
                    </h2>
                    <p className="text-sm text-text-muted mt-2">
                        {isDragging ? 'O arquivo será processado imediatamente' : 'Arraste seu arquivo .OFC ou .TXT aqui ou clique para selecionar'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <span className="px-3 py-1 bg-money-accent/20 text-xs font-bold rounded-full">MS MONEY / TXT</span>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">ISO-8859-1</span>
                </div>
            </div>
        </div>
    );

    const SearchableSelect = ({ value, onChange, options, placeholder }) => {
        const [search, setSearch] = useState('');
        const [isOpen, setIsOpen] = useState(false);
        const containerRef = useRef(null);

        const filteredOptions = options.filter(opt =>
            (opt.label || '').toLowerCase().includes(search.toLowerCase())
        );

        const selectedOption = options.find(opt => opt.id === value);

        useEffect(() => {
            const handleClickOutside = (e) => {
                if (containerRef.current && !containerRef.current.contains(e.target)) {
                    setIsOpen(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        return (
            <div ref={containerRef} className="relative w-full h-full flex items-center">
                <input
                    type="text"
                    className="w-full h-full text-[11px] px-2 py-1 border-none bg-transparent outline-none focus:bg-white"
                    placeholder={placeholder}
                    value={isOpen ? search : (selectedOption ? selectedOption.label : '')}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => {
                        setIsOpen(true);
                        setSearch('');
                    }}
                />
                {isOpen && (
                    <div className="absolute left-0 top-full z-[100] w-64 mt-1 bg-white border border-gray-300 rounded shadow-2xl max-h-80 overflow-auto">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => (
                                <div
                                    key={opt.id}
                                    className="p-2 text-[10px] border-b border-gray-100 hover:bg-blue-50 cursor-pointer font-medium text-gray-700"
                                    onClick={() => {
                                        onChange(opt.id);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                >
                                    {opt.label}
                                </div>
                            ))
                        ) : (
                            <div className="p-3 text-[10px] text-gray-400 italic">Nenhum resultado encontrado</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderStep2 = () => {
        const selectedAccount = accounts.find(a => a.id === selectedAccountId);
        const isCreditCard = (selectedAccount?.account_type || '').toLowerCase().includes('cart');

        return (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="p-4 bg-gray-50 border-b flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-6 flex-1">
                        <div className="flex flex-col gap-1 w-64">
                            <label className="text-[10px] font-bold uppercase text-gray-500">Conta de Destino</label>
                            <select
                                value={selectedAccountId}
                                onChange={(e) => {
                                    setSelectedAccountId(e.target.value);
                                    setGlobalDueDate(''); // Reset when account changes
                                }}
                                className="p-2 border border-blue-200 rounded-md bg-white text-sm outline-none focus:ring-2 focus:ring-money-green-mid"
                            >
                                <option value="">Selecione a conta...</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>

                        {isCreditCard && (
                            <div className="flex flex-col gap-1 w-48 animate-in fade-in slide-in-from-left-2">
                                <label className="text-[10px] font-bold uppercase text-money-green-dark">Vencimento Único (Cartão)</label>
                                <input
                                    type="date"
                                    value={globalDueDate}
                                    onChange={(e) => handleGlobalDueDateChange(e.target.value)}
                                    className="p-2 border border-money-green-mid rounded-md bg-white text-sm outline-none focus:ring-2 focus:ring-money-green-dark"
                                />
                            </div>
                        )}

                        <div className="text-xs text-text-muted">
                            <strong>{importedData.length}</strong> lançamentos encontrados no arquivo.
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setStep(1)} className="btn-money bg-white">Limpar</button>
                        <button
                            onClick={handleImport}
                            disabled={loading || !selectedAccountId}
                            className="btn-money bg-money-green-dark text-white hover:bg-money-green-mid disabled:opacity-50"
                        >
                            {loading ? 'Processando...' : 'Gravar Lançamentos'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <table className="money-table">
                        <thead>
                            <tr>
                                {columns.map(col => (
                                    <th key={col.key} style={{ width: col.width }}>{col.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {importedData.map((item) => (
                                <tr key={item.id} className="hover:bg-blue-50/30">
                                    <td className="p-2 border-r text-center">{new Date(item.emission_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                    <td className="p-2 border-r text-center">
                                        {isCreditCard ? (
                                            <span className={`px-2 py-0.5 rounded font-bold ${item.due_date ? 'bg-money-green-light text-money-green-dark' : 'bg-red-50 text-red-600 animate-pulse'}`}>
                                                {item.due_date ? new Date(item.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Definir...'}
                                            </span>
                                        ) : (
                                            <input
                                                type="date"
                                                value={item.due_date}
                                                onChange={(e) => handleRowChange(item.id, 'due_date', e.target.value)}
                                                className="w-full bg-transparent text-center text-[11px] border-none outline-none focus:bg-white"
                                            />
                                        )}
                                    </td>
                                    <td className="p-2 border-r italic text-gray-600">{item.description}</td>
                                    <td className={`p-2 border-r text-right font-bold ${item.dc_type === 'D' ? 'text-red-600' : 'text-green-600'}`}>
                                        {item.dc_type === 'D' ? '-' : '+'}{Number(item.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                    <td className="p-0 border-r h-full relative">
                                        <SearchableSelect
                                            value={item.cost_center_id}
                                            onChange={(val) => handleRowChange(item.id, 'cost_center_id', val)}
                                            options={options.costCenters.map(cc => ({ id: cc.id, label: cc.displayName }))}
                                            placeholder="-- Classificar --"
                                        />
                                    </td>
                                    <td className="p-0 h-full relative">
                                        <SearchableSelect
                                            value={item.transaction_type_id}
                                            onChange={(val) => handleRowChange(item.id, 'transaction_type_id', val)}
                                            options={options.chartOfAccounts.map(coa => ({ id: coa.id, label: coa.displayName }))}
                                            placeholder="-- Plano Contas --"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderStep3 = () => (
        <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center animate-in zoom-in-50 duration-500">
                <Check size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Sucesso!</h2>
            <p className="text-text-muted">Os lançamentos foram importados para a conta selecionada.</p>
            <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="btn-money">Nova Importação</button>
                <button onClick={() => window.location.href = '/transactions'} className="btn-money bg-money-green-dark text-white">Ver Movimentação</button>
            </div>
        </div>
    );

    return (
        <MainLayout title="Importação de Dados">
            <div className="h-full bg-white flex flex-col">
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
            </div>
        </MainLayout>
    );
};

export default ImportData;
