import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Navigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { adminFetch } from '../api';

export default function UsersPage() {
  const { admin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async (signal) => {
    setLoading(true);
    setError(null);

    try {
      const res = await adminFetch('/admin/data?module=users', { signal });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setUsers(data.data?.users || []);
      } else {
        setError(data?.message || `Server returned error (${res.status})`);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Users fetch error:', err);
      setError(err.message || 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (admin?.role === 'superadmin' || admin?.access?.includes('users')) {
      const controller = new AbortController();
      fetchData(controller.signal);
      return () => controller.abort();
    }
  }, []);

  if (admin?.role !== 'superadmin' && !admin?.access?.includes('users')) {
    return <Navigate to="/" />;
  }

  return (
    <div style={styles.page} className="responsive-page-padding">
      <header style={styles.header} className="responsive-flex-header">
        <div>
          <h1 style={styles.title}>Registered Customers</h1>
          <p style={styles.subtitle}>View customer app accounts and referral program earnings.</p>
        </div>
        <button 
          style={styles.refreshBtn} 
          onClick={() => fetchData()}
          disabled={loading}
        >
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          <span>Refresh List</span>
        </button>
      </header>

      {/* Actionable Error Alert */}
      {error && (
        <div style={styles.errorAlert}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#dc2626" />
            <div>
              <div style={{ fontWeight: '600', color: '#991b1b' }}>Failed to load registered customers</div>
              <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '2px' }}>{error}</div>
            </div>
          </div>
          <button style={styles.retryBtn} onClick={() => fetchData()}>
            Retry
          </button>
        </div>
      )}

      <div style={styles.tableCard} className="table-responsive-wrapper">
        {loading ? (
          <div style={{ padding: '36px', color: '#64748b', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading registered users...</span>
          </div>
        ) : users.length === 0 && !error ? (
          <div style={{ padding: '36px', color: '#64748b', textAlign: 'center' }}>No users registered yet.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHead}>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Password</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => (
                <tr key={user.id || user._id || idx} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: '500', color: '#0f172a' }}>{user.name}</div>
                  </td>
                  <td style={styles.td}>{user.phone}</td>
                  <td style={styles.td}>
                     <span style={styles.pwdPill}>Hidden</span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.activePill}>Active</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%' },
  header: { marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '28px', fontWeight: '500', color: '#0f172a', margin: 0 },
  subtitle: { fontSize: '15px', color: '#64748b', marginTop: '8px' },
  refreshBtn: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '13px', fontWeight: '500', color: '#0f172a', cursor: 'pointer' },
  errorAlert: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '16px 20px', borderRadius: '12px', marginBottom: '24px' },
  retryBtn: { backgroundColor: '#dc2626', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  tableCard: { backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' },
  th: { padding: '16px 24px', fontSize: '13px', fontWeight: '500', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '16px 24px', fontSize: '15px', color: '#334155' },
  activePill: { display: 'inline-block', backgroundColor: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
  pwdPill: { display: 'inline-block', backgroundColor: '#f1f5f9', color: '#94a3b8', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }
};
