import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Navigate } from 'react-router-dom';
import { Check, X, FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import { adminFetch } from '../api';

export default function JobsPage() {
  const { admin } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchData = async (signal) => {
    setLoading(true);
    setError(null);

    try {
      const res = await adminFetch('/admin/data?module=jobs', { signal });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setJobs(data.data?.jobApplications || []);
      } else {
        setError(data?.message || `Server returned error (${res.status})`);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Jobs fetch error:', err);
      setError(err.message || 'Failed to load candidate applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (admin?.role === 'superadmin' || admin?.access?.includes('jobs')) {
      const controller = new AbortController();
      fetchData(controller.signal);
      return () => controller.abort();
    }
  }, []);

  if (admin?.role !== 'superadmin' && !admin?.access?.includes('jobs')) {
    return <Navigate to="/" />;
  }

  const updateStatus = async (id, status) => {
    if (updatingId) return; // Prevent duplicate concurrent status updates
    setUpdatingId(id);

    try {
      const response = await adminFetch('/admin/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type: 'job', status })
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        await fetchData();
      } else {
        alert(data?.message || 'Error updating candidate status');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating status: ' + (err.message || 'Network error'));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={styles.page} className="responsive-page-padding">
      <header style={styles.header} className="responsive-flex-header">
        <div>
          <h1 style={styles.title}>HR & Hiring Portal</h1>
          <p style={styles.subtitle}>Manage Job Candidates and Promoter Registrations.</p>
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

      {/* Actionable Error State */}
      {error && (
        <div style={styles.errorAlert}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#dc2626" />
            <div>
              <div style={{ fontWeight: '600', color: '#991b1b' }}>Failed to load candidate data</div>
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
            <span>Loading candidate data...</span>
          </div>
        ) : jobs.length === 0 && !error ? (
          <div style={{ padding: '36px', color: '#64748b', textAlign: 'center' }}>No job applications found.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHead}>
                <th style={styles.th}>Candidate</th>
                <th style={styles.th}>Role / Location</th>
                <th style={styles.th}>Profile</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: '500', color: '#0f172a' }}>{j.fullName}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{j.phone} • {j.email}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: '500', color: '#334155' }}>{j.jobTitle}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{j.location}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontSize: '13px' }}><strong>Exp:</strong> {j.experience}</div>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}><strong>Edu:</strong> {j.qualification}</div>
                    <div style={{ fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', color: '#2563eb' }}>
                      <FileText size={14} /> {j.resumeName}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: j.status === 'SHORTLISTED' ? '#dbeafe' : j.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                      color: j.status === 'SHORTLISTED' ? '#2563eb' : j.status === 'REJECTED' ? '#ef4444' : '#d97706'
                    }}>
                      {j.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {j.status === 'RECEIVED' && (
                      <div style={styles.actions}>
                        <button 
                          onClick={() => updateStatus(j.id, 'SHORTLISTED')} 
                          style={{
                            ...styles.approveBtn,
                            opacity: updatingId === j.id ? 0.6 : 1,
                            cursor: updatingId === j.id ? 'not-allowed' : 'pointer'
                          }}
                          disabled={updatingId === j.id}
                        >
                          <Check size={16} /> {updatingId === j.id ? 'Updating...' : 'Shortlist'}
                        </button>
                        <button 
                          onClick={() => updateStatus(j.id, 'REJECTED')} 
                          style={{
                            ...styles.rejectBtn,
                            opacity: updatingId === j.id ? 0.6 : 1,
                            cursor: updatingId === j.id ? 'not-allowed' : 'pointer'
                          }}
                          disabled={updatingId === j.id}
                        >
                          <X size={16} /> {updatingId === j.id ? 'Updating...' : 'Reject'}
                        </button>
                      </div>
                    )}
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
  td: { padding: '16px 24px', fontSize: '15px', color: '#334155', verticalAlign: 'top' },
  statusBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
  actions: { display: 'flex', flexDirection: 'column', gap: '8px' },
  approveBtn: { display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  rejectBtn: { display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }
};
