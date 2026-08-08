import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Componente reutilizável para gerenciar listas simples (account_types / institutions)
const SimpleListManager = ({ title, tableName, onClose }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const [newValue, setNewValue] = useState('');
    const inputRef = useRef(null);
    const newInputRef = useRef(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from(tableName).select('id, name').order('name');
        setRows(data || []);
        setLoading(false);
    }, [tableName]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (editingId && inputRef.current) inputRef.current.focus();
    }, [editingId]);

    const startEdit = (row) => {
        setEditingId(row.id);
        setEditingValue(row.name);
    };

    const saveEdit = async () => {
        if (!editingValue.trim()) { setEditingId(null); return; }
        await supabase.from(tableName).update({ name: editingValue.trim() }).eq('id', editingId);
        setEditingId(null);
        fetchData();
    };

    const deleteRow = async (id) => {
        if (!window.confirm('Excluir este item?')) return;
        await supabase.from(tableName).delete().eq('id', id);
        fetchData();
    };

    const addNew = async () => {
        if (!newValue.trim()) return;
        await supabase.from(tableName).insert([{ name: newValue.trim() }]);
        setNewValue('');
        fetchData();
        newInputRef.current?.focus();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{
                background: '#fff', borderRadius: '12px', padding: '24px',
                width: '380px', boxShadow: '0 16px 48px rgba(0,0,0,0.4)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#004d40' }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#999' }}>✕</button>
                </div>

                {/* Adicionar novo */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    <input
                        ref={newInputRef}
                        type="text"
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addNew()}
                        placeholder="Novo item..."
                        style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px', outline: 'none' }}
                        autoFocus
                    />
                    <button onClick={addNew} style={{
                        padding: '6px 14px', background: '#00695c', color: '#fff',
                        border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '700'
                    }}>+ Adicionar</button>
                </div>

                {/* Lista */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: '#888', padding: '20px', fontSize: '12px' }}>Carregando...</div>
                    ) : rows.map(row => (
                        <div key={row.id} style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '4px 0', borderBottom: '1px solid #f0f0f0'
                        }}>
                            {editingId === row.id ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onBlur={saveEdit}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #00695c', fontSize: '12px', outline: 'none' }}
                                />
                            ) : (
                                <span
                                    style={{ flex: 1, fontSize: '12px', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }}
                                    onClick={() => startEdit(row)}
                                    title="Clique para editar"
                                >
                                    {row.name}
                                </span>
                            )}
                            <button
                                onClick={() => deleteRow(row.id)}
                                style={{ background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
                                title="Excluir"
                            >🗑</button>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: '10px', fontSize: '10px', color: '#aaa', textAlign: 'center' }}>
                    Clique em um item para editar | ENTER para confirmar | ESC para cancelar
                </div>
            </div>
        </div>
    );
};

export default SimpleListManager;
