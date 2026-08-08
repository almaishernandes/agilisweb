import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';

import Home from './pages/Home';
import AccountManager from './pages/AccountManager';
import Transactions from './pages/Transactions';
import GestaoDashboard from './pages/GestaoDashboard';
import SaldoContas from './pages/SaldoContas';
import CashFlow from './pages/reports/CashFlow';
import Balancetes from './pages/reports/Balancetes';
import PlanoContasReport from './pages/reports/PlanoContasReport';
import FinancialAnalysis from './pages/reports/FinancialAnalysis';
import FinancialBalance from './pages/reports/FinancialBalance';
import TransactionDetail from './pages/TransactionDetail';
import CategoryManager from './pages/CategoryManager';
import CostCenterManager from './pages/CostCenterManager';
import ChartOfAccountsManager from './pages/ChartOfAccountsManager';
import BeneficiariesManager from './pages/BeneficiariesManager';
import Notes from './pages/Notes';
import ImportData from './pages/ImportData';
import Auth from './pages/Auth';
import UserManager from './pages/UserManager';
import ExportData from './pages/ExportData';
import FinancialCalculator from './pages/FinancialCalculator';
import Compras from './pages/Compras';
import FornecedoresRelatorio from './pages/FornecedoresRelatorio';
import NFCeIntegracao from './pages/integracao/NFCeIntegracao';
import MobileImports from './pages/integracao/MobileImports';
import CotacaoPrecos from './pages/CotacaoPrecos';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        setSession(session);
        setRole(profile?.role || null);
      } else {
        setSession(null);
        setRole(null);
      }
      setLoading(false);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setSession(null); setRole(null); }
      else checkUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Aguarde...</div>;
  if (!session) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (requiredRole && !role?.split(',').map(r => r.trim()).includes(requiredRole)) return <Navigate to="/accounts" replace />;

  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />

      <Route path="/" element={<Home />} />
      <Route path="/accounts" element={<ProtectedRoute><AccountManager /></ProtectedRoute>} />
      <Route path="/categories" element={<Navigate to="/categories/cost-centers" replace />} />
      <Route path="/categories/:type" element={<ProtectedRoute><CategoryManager /></ProtectedRoute>} />
      <Route path="/cost-centers" element={<ProtectedRoute><CostCenterManager /></ProtectedRoute>} />
      <Route path="/chart-of-accounts" element={<ProtectedRoute><ChartOfAccountsManager /></ProtectedRoute>} />
      <Route path="/beneficiaries" element={<ProtectedRoute><BeneficiariesManager /></ProtectedRoute>} />
      <Route path="/anotacoes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
      <Route path="/transactions/:accountId" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
      <Route path="/reports" element={<Navigate to="/reports/cash-flow" replace />} />
      <Route path="/reports/cash-flow" element={<ProtectedRoute><CashFlow /></ProtectedRoute>} />
      <Route path="/reports/balancetes" element={<ProtectedRoute><Balancetes /></ProtectedRoute>} />
      <Route path="/reports/plano-contas" element={<ProtectedRoute><PlanoContasReport /></ProtectedRoute>} />
      <Route path="/compras" element={<ProtectedRoute><Compras /></ProtectedRoute>} />
      <Route path="/fornecedores-relatorio" element={<ProtectedRoute><FornecedoresRelatorio /></ProtectedRoute>} />
      <Route path="/transaction/:id" element={<ProtectedRoute><TransactionDetail /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><ImportData /></ProtectedRoute>} />
      <Route path="/export" element={<ProtectedRoute><ExportData /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute requiredRole="Suporte"><UserManager /></ProtectedRoute>} />
      <Route path="/financial-calculator" element={<ProtectedRoute><FinancialCalculator /></ProtectedRoute>} />
      <Route path="/integracao" element={<Navigate to="/integracao/nfce" replace />} />
      <Route path="/integracao/nfce" element={<ProtectedRoute><NFCeIntegracao /></ProtectedRoute>} />
      <Route path="/integracao/mobile" element={<ProtectedRoute><MobileImports /></ProtectedRoute>} />
      <Route path="/cotacao-precos" element={<ProtectedRoute><CotacaoPrecos /></ProtectedRoute>} />
      <Route path="/gestao" element={<Navigate to="/gestao/dashboard" replace />} />
      <Route path="/gestao/dashboard" element={<ProtectedRoute><GestaoDashboard /></ProtectedRoute>} />
      <Route path="/gestao/saldo-contas" element={<ProtectedRoute><SaldoContas /></ProtectedRoute>} />
      <Route path="/gestao/ponto-equilibrio" element={<ProtectedRoute><FinancialBalance /></ProtectedRoute>} />
      <Route path="/gestao/analise-financeira" element={<ProtectedRoute><FinancialAnalysis /></ProtectedRoute>} />

      {/* Redirect any other path to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
