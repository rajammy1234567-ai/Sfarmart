import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import PartnersPage from './pages/PartnersPage';
import JobsPage from './pages/JobsPage';
import RidersPage from './pages/RidersPage';
import InquiriesPage from './pages/InquiriesPage';

const ProtectedRoute = ({ children }) => {
  const { admin, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!admin) return <Navigate to="/login" />;
  return children;
};

function AppRoutes() {
  const { admin, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={admin ? <Navigate to="/" /> : <LoginPage />} />
      
      <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="inquiries" element={<InquiriesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="riders" element={<RidersPage />} />
        <Route path="jobs" element={<JobsPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
