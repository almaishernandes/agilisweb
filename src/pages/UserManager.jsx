import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import MainLayout from '../components/MainLayout';
import { getSecurityContext } from '../lib/auth';
import { adminCreateUser, adminUpdateUser, adminDeleteUser } from '../lib/adminApi';

const UserManager = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [security, setSecurity] = useState({ role: null, family_id: null, email: '' });
    const [editingCell, setEditingCell] = useState(null); // { id, field }
    const inputRef = useRef(null);
    const isTabbing = useRef(false);

    const roles = ['Administrador', 'Gestor', 'Operacional', 'Suporte'];

    useEffect(() => {
        const init = async () => {
            const context = await getSecurityContext();
            setSecurity(context);
            await fetchUsers(context.family_id, context);
        };
        init();
    }, []);

    const fetchUsers = async (familyId, ctx) => {
        const resolved = ctx || security;
        setLoading(true);
        let query = supabase.from('profiles').select('*');

        // Se não for Suporte, filtra apenas pela família do usuário
        const isSupport = resolved.role?.includes('Suporte') || resolved.email?.toLowerCase() === 'almaishernandes@gmail.com';
        if (!isSupport) {
            query = query.eq('family_id', familyId);
        }

        const { data, error } = await query
            .order('role')
            .order('full_name');

        const newTempId = `temp-${Date.now()}`;
        if (error || !data || data.length === 0) {
            if (error) console.warn('Error fetching users, using mock data:', error);
            const mockUsers = [
                { id: '1', full_name: 'Francisco Hernandes', email: 'almaishernandes@gmail.com', role: 'Suporte,Administrador,Gestor,Operacional' },
                { id: '2', full_name: 'Ana Souza', email: 'ana.souza@agilis.com.br', role: 'Administrador' },
                { id: '3', full_name: 'Carlos Oliveira', email: 'carlos.oliveira@agilis.com.br', role: 'Gestor' },
                { id: '4', full_name: 'Mariana Santos', email: 'mariana.santos@agilis.com.br', role: 'Operacional' }
            ];
            setUsers([
                ...mockUsers,
                { id: newTempId, full_name: '', email: '', password: '', role: 'Operacional', isNew: true }
            ]);
        } else {
            setUsers([
                ...(data || []),
                { id: newTempId, full_name: '', email: '', password: '', role: 'Operacional', isNew: true }
            ]);
        }
        setLoading(false);
    };

    const isSuporte = () => security.role?.split(',').map(r => r.trim()).includes('Suporte');

    const handleSave = async (id, currentField) => {
        if (!isSuporte()) return;
        const user = users.find(u => u.id === id);
        if (!user) return;

        // Don't save if new and empty
        if (user.isNew && !user.full_name && !user.email) {
            setEditingCell(prev => (prev?.id === id && prev?.field === currentField) ? null : prev);
            return;
        }

        try {
            const { isNew, ...userData } = user;
            const payload = {
                ...userData,
                family_id: security.family_id
            };

            if (isNew) {
                if (!payload.email || !payload.password) {
                    return;
                }
                await adminCreateUser(payload);
            } else {
                await adminUpdateUser({ user_id: id, ...payload });
            }

            fetchUsers(security.family_id);
            setEditingCell(prev => (prev?.id === id && prev?.field === currentField) ? null : prev);
        } catch (err) {
            alert('Erro: ' + err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!isSuporte()) return;
        if (!window.confirm('Tem certeza que deseja excluir este usuário?')) return;
        try {
            await adminDeleteUser(id);
            fetchUsers(security.family_id);
        } catch (err) {
            alert('Erro: ' + err.message);
        }
    };

    const handleUpdateUser = (id, field, value) => {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
    };

    const handleRoleToggle = async (user, roleName, isChecked) => {
        if (!isSuporte()) return;
        let arr = (user.role || '').split(',').map(r => r.trim()).filter(Boolean);
        if (isChecked && !arr.includes(roleName)) arr.push(roleName);
        else if (!isChecked) arr = arr.filter(r => r !== roleName);
        const newRole = arr.join(',');

        handleUpdateUser(user.id, 'role', newRole);

        if (!user.isNew) {
            try {
                await adminUpdateUser({ user_id: user.id, role: newRole });
                const context = await getSecurityContext();
                if (context.family_id) fetchUsers(context.family_id);
            } catch (err) {
                alert('Erro ao atualizar nível de acesso: ' + err.message);
            }
        }
    };

    const handleKeyDown = (e, id, fields, idx, currentField) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            isTabbing.current = true;
            const next = e.shiftKey ? idx - 1 : idx + 1;
            if (next >= 0 && next < fields.length) {
                setEditingCell({ id, field: fields[next] });
            } else {
                handleSave(id, currentField);
            }
            setTimeout(() => { isTabbing.current = false; }, 150);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            // Force save and alert if new item but missing fields
            const user = users.find(u => u.id === id);
            if (user && user.isNew && (!user.email || !user.password)) {
                alert('E-mail e senha são obrigatórios para criar um usuário.');
                return;
            }
            handleSave(id, currentField);
            setEditingCell(null);
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const getRowClass = (roleStr) => {
        const rolesArr = (roleStr || '').split(',').map(r => r.trim());
        if (rolesArr.includes('Suporte')) return 'row-type-support'; // Teal palette
        if (rolesArr.includes('Administrador')) return 'row-type-admin'; // Black/Gold palette
        if (rolesArr.includes('Gestor')) return 'row-type-manager'; // Blue palette
        if (rolesArr.includes('Operacional')) return 'row-type-ops'; // Green palette
        return '';
    };

    const columns = [
        { label: 'Nome Completo', key: 'full_name' },
        { label: 'E-mail de Acesso', key: 'email' },
        { label: 'Senha (Acesso Rápido)', key: 'password', type: 'password' },
        { label: 'Suporte', key: 'role_suporte', type: 'checkbox', roleName: 'Suporte' },
        { label: 'Administrador', key: 'role_admin', type: 'checkbox', roleName: 'Administrador' },
        { label: 'Gestor', key: 'role_gestor', type: 'checkbox', roleName: 'Gestor' },
        { label: 'Operacional', key: 'role_operacional', type: 'checkbox', roleName: 'Operacional' },
        { label: '', key: 'actions', type: 'actions' }
    ];

    if (loading && !users.length) {
        return (
            <MainLayout title="Equipe Agili$">
                <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">Sincronizando equipe...</p>
                </div>
            </MainLayout>
        );
    }

    const isAuthorized = security.role?.split(',').map(r => r.trim()).includes('Suporte') || security.email?.toLowerCase() === 'almaishernandes@gmail.com';

    if (!isAuthorized) {
        return (
            <MainLayout title="Acesso Restrito">
                <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                    <div className="text-8xl mb-6">🔒</div>
                    <h2 className="text-3xl font-bold text-gray-800 mb-4 font-inter">Acesso Exclusivo Suporte</h2>
                    <p className="text-gray-500 max-w-lg text-lg leading-relaxed">
                        Esta área é reservada para administração técnica do Agili$.
                        Apenas usuários com perfil de <strong>Suporte</strong> podem gerenciar a equipe.
                    </p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout title="Gerenciamento de Equipe v2">
            <div className="w-full h-full flex flex-col">
                <table className="money-table">
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th key={col.key}>{col.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user, idx) => (
                            <tr
                                key={user.id}
                                className={user.isNew ? 'new-row-highlight-green' : getRowClass(user.role)}
                            >
                                {columns.map(col => (
                                    <td
                                        key={col.key}
                                        className="editable-cell"
                                        style={{ textAlign: col.type === 'select' ? 'center' : 'left', cursor: 'pointer' }}
                                        onClick={() => setEditingCell({ id: user.id, field: col.key })}
                                    >
                                        {col.type === 'actions' ? (
                                            !user.isNew ? (
                                                <div className="flex justify-center items-center w-full">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(user.id); }} className="text-red-500 hover:text-red-700 text-lg" title="Excluir">
                                                        🗑️
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-center items-center w-full">
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!user.email || !user.password) {
                                                            alert('E-mail e senha são obrigatórios para criar um usuário.');
                                                            return;
                                                        }
                                                        handleSave(user.id, null);
                                                        setEditingCell(null);
                                                    }} className="text-teal-600 hover:text-teal-800 text-lg" title="Gravar Cadastro">
                                                        💾
                                                    </button>
                                                </div>
                                            )
                                        ) : col.type === 'checkbox' ? (
                                            <div className="flex justify-center items-center h-full">
                                                <input
                                                    type="checkbox"
                                                    checked={(user.role || '').split(',').map(r => r.trim()).includes(col.roleName)}
                                                    onChange={(e) => handleRoleToggle(user, col.roleName, e.target.checked)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 cursor-pointer accent-teal-600"
                                                />
                                            </div>
                                        ) : editingCell?.id === user.id && editingCell?.field === col.key ? (
                                            <input
                                                autoFocus
                                                ref={inputRef}
                                                type={col.type === 'password' ? 'text' : 'text'}
                                                className="spreadsheet-input"
                                                value={user[col.key] || ''}
                                                onChange={(e) => handleUpdateUser(user.id, col.key, e.target.value)}
                                                onBlur={() => { if (!isTabbing.current) handleSave(user.id, col.key); }}
                                                onKeyDown={e => handleKeyDown(e, user.id, columns.map(c => c.key).filter(k => k !== 'actions' && !k.startsWith('role_')), columns.findIndex(c => c.key === col.key), col.key)}
                                            />
                                        ) : (
                                            <div style={{ minHeight: '14px' }}>
                                                {user[col.key] || ' '}
                                            </div>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="p-2 text-[10px] text-text-muted mt-auto border-t border-dashed bg-white">
                    <strong>Dica:</strong> TAB para navegar em todos os campos | ENTER para gravar onde estiver | O novo cadastro é a última linha em branco
                </div>
            </div>
        </MainLayout>
    );
};

export default UserManager;
