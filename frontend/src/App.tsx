import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { PortfolioList } from './pages/PortfolioList';
import { PortfolioDetail } from './pages/PortfolioDetail';
import { Dashboard } from './pages/Dashboard';
import { ScenarioSimulator } from './pages/ScenarioSimulator';
import { Optimizer } from './pages/Optimizer';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/portfolios"
            element={
              <ProtectedRoute>
                <PortfolioList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolios/:id"
            element={
              <ProtectedRoute>
                <PortfolioDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolios/:id/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolios/:id/scenario"
            element={
              <ProtectedRoute>
                <ScenarioSimulator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolios/:id/optimize"
            element={
              <ProtectedRoute>
                <Optimizer />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/portfolios" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;

