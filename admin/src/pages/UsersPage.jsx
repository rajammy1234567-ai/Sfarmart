import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Navigate } from 'react-router-dom';
import { adminFetch } from '../api';

export default function UsersPage() {
  const { admin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (admin.role === 'superadmin' || admin.access?.includes('users')) {
      adminFetch('/admin/data')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setUsers(data.data.users);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, []);

  if (admin.role !== 'superadmin' && !admin.access?.includes('users')) {
    return <Navigate to="/" />;
  }

  return (
    <div style={styles.page} className="responsive-page-padding">
      <header style={styles.header} className="responsive-flex-header">
        <h1 style={styles.title}>Registered Customers</h1>
        <p style={styles.subtitle}>View customer app accounts and referral program earnings.</p>
      </header>

      <div style={styles.tableCard} className="table-responsive-wrapper">
        {loading ? (
          <div style={{ padding: '24px', color: '#64748b' }}>Loading users...</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '24px', color: '#64748b' }}>No users registered yet.</div>
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
                <tr key={idx} style={styles.tr}>
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
  header: { marginBottom: '32px' },
  title: { fontSize: '28px', fontWeight: '500', color: '#0f172a', margin: 0 },
  subtitle: { fontSize: '15px', color: '#64748b', marginTop: '8px' },
  tableCard: { backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  trHead: { borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' },
  th: { padding: '16px 24px', fontSize: '13px', fontWeight: '500', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '16px 24px', fontSize: '15px', color: '#334155' },
  activePill: { display: 'inline-block', backgroundColor: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
  pwdPill: { display: 'inline-block', backgroundColor: '#f1f5f9', color: '#94a3b8', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' }
};
