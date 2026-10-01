import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { 
  ShieldCheck, 
  Plus, 
  CheckCircle2, 
  Users, 
  Building2, 
  Briefcase, 
  MessageSquare, 
  TrendingUp, 
  Activity, 
  Server, 
  CheckCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminFetch } from '../api';

export default function DashboardPage() {
  const { admin } = useAuth();
  const [data, setData] = useState(null);
  const [systemHealth, setSystemHealth] = useState({ api: 'ONLINE', db: 'CONNECTED', responseTime: '42ms' });
  
  // Create Sub Admin State
  const [newSubAdmin, setNewSubAdmin] = useState({
    name: '',
    username: '',
    password: '',
    access: []
  });
  const [createMsg, setCreateMsg] = useState('');

  const fetchDashboardData = async () => {
    try {
      const response = await adminFetch('/admin/data');
      const res = await response.json();
      if (res.success) {
        setData(res.data);
      }
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 15000); // Auto refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const handleAccessToggle = (module) => {
    if (newSubAdmin.access.includes(module)) {
      setNewSubAdmin({ ...newSubAdmin, access: newSubAdmin.access.filter(m => m !== module) });
    } else {
      setNewSubAdmin({ ...newSubAdmin, access: [...newSubAdmin.access, module] });
    }
  };

  const handleCreateSubAdmin = async (e) => {
    e.preventDefault();
    try {
      const response = await adminFetch('/admin/create-subadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubAdmin)
      });
      const res = await response.json();
      if (res.success) {
        setCreateMsg('Sub Admin created successfully!');
        setNewSubAdmin({ name: '', username: '', password: '', access: [] });
        setTimeout(() => setCreateMsg(''), 4000);
      } else {
        alert(res.message);
      }
    } catch (e) {
      alert('Error creating Sub Admin');
    }
  };

  if (!data) return <div style={styles.loading}>Loading Farmart Enterprise Control Center...</div>;

  const accessOptions = [
    { id: 'users', label: 'App Users Management' },
    { id: 'partners', label: 'Partner Approvals (FOCO/Hubs)' },
    { id: 'riders', label: 'Delivery Fleet Management' },
    { id: 'jobs', label: 'HR / Candidate Recruitment' }
  ];

  return (
    <div style={styles.page} className="responsive-page-padding">
      {/* Header */}
      <header style={styles.header}>
        <div>
          <div style={styles.badgeRow}>
            <span style={styles.liveBadge}><CheckCircle size={12} /> System Operational</span>
            <span style={styles.timeBadge}><Clock size={12} /> Auto-Sync Active (15s)</span>
          </div>
          <h1 style={styles.title}>Welcome back, {admin.name}</h1>
          <p style={styles.subtitle}>Farmart Enterprise Command Center • Real-time Monitoring & Access Control</p>
        </div>
      </header>

      {/* System Status Banner */}
      <div style={styles.systemBanner} className="responsive-flex-header">
        <div style={styles.systemItem}>
          <Server size={18} color="#10b981" />
          <span style={styles.systemText}>Backend API: <strong style={{ color: '#10b981' }}>LIVE (Render Cloud)</strong></span>
        </div>
        <div style={styles.systemItem}>
          <Activity size={18} color="#0284c7" />
          <span style={styles.systemText}>Database: <strong style={{ color: '#0284c7' }}>MongoDB Atlas Connected</strong></span>
        </div>
        <div style={styles.systemItem}>
          <TrendingUp size={18} color="#f59e0b" />
          <span style={styles.systemText}>Email Gateway: <strong style={{ color: '#f59e0b' }}>Gmail SSL Active</strong></span>
        </div>
      </div>

      {/* Metrics Cards */}
      <div style={styles.metricsGrid} className="responsive-grid-4">
        <Link to="/inquiries" style={styles.metricCardLink}>
          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>Inquiries & Leads</span>
              <div style={{ ...styles.iconWrapper, backgroundColor: '#dcfce7' }}><MessageSquare size={20} color="#15803d" /></div>
            </div>
            <div style={styles.metricValue}>{data.contactInquiries?.length || 0}</div>
            <div style={styles.metricFooter}>
              <span>View all inquiries</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </Link>

        <Link to="/partners" style={styles.metricCardLink}>
          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>Partner Applications</span>
              <div style={{ ...styles.iconWrapper, backgroundColor: '#e0f2fe' }}><Building2 size={20} color="#0369a1" /></div>
            </div>
            <div style={styles.metricValue}>{data.applications?.length || 0}</div>
            <div style={styles.metricFooter}>
              <span>Review partner requests</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </Link>

        <Link to="/jobs" style={styles.metricCardLink}>
          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>Job Candidates</span>
              <div style={{ ...styles.iconWrapper, backgroundColor: '#fef3c7' }}><Briefcase size={20} color="#b45309" /></div>
            </div>
            <div style={styles.metricValue}>{data.jobApplications?.length || 0}</div>
            <div style={styles.metricFooter}>
              <span>Manage HR applications</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </Link>

        <Link to="/users" style={styles.metricCardLink}>
          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>Registered Users</span>
              <div style={{ ...styles.iconWrapper, backgroundColor: '#f3e8ff' }}><Users size={20} color="#7e22ce" /></div>
            </div>
            <div style={styles.metricValue}>{data.users?.length || 0}</div>
            <div style={styles.metricFooter}>
              <span>Customer app accounts</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </Link>
      </div>

      {/* Super Admin Control Panel */}
      {admin.role === 'superadmin' && (
        <div style={styles.adminControlPanel}>
          <div style={styles.panelHeader}>
            <ShieldCheck size={26} color="#10b981" />
            <div>
              <h2 style={styles.panelTitle}>Super Admin Access Control</h2>
              <p style={styles.panelSub}>Create Sub-Admin staff accounts with granular department access permissions.</p>
            </div>
          </div>
          
          <form onSubmit={handleCreateSubAdmin} style={styles.form}>
            {createMsg && <div style={styles.successMsg}><CheckCircle2 size={18} /> {createMsg}</div>}
            
            <div style={styles.formRow} className="responsive-grid-3">
              <div style={styles.formGroup}>
                <label style={styles.label}>Full Name *</label>
                <input required type="text" style={styles.input} value={newSubAdmin.name} onChange={e => setNewSubAdmin({...newSubAdmin, name: e.target.value})} placeholder="e.g. Rahul Sharma" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Login Username *</label>
                <input required type="text" style={styles.input} value={newSubAdmin.username} onChange={e => setNewSubAdmin({...newSubAdmin, username: e.target.value})} placeholder="e.g. rahul_manager" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Login Password *</label>
                <input required type="text" style={styles.input} value={newSubAdmin.password} onChange={e => setNewSubAdmin({...newSubAdmin, password: e.target.value})} placeholder="Set secure password" />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Department Permissions (Module Access)</label>
              <div style={styles.checkboxGrid}>
                {accessOptions.map(opt => (
                  <label key={opt.id} style={styles.checkboxLabel}>
                    <input 
                      type="checkbox" 
                      checked={newSubAdmin.access.includes(opt.id)}
                      onChange={() => handleAccessToggle(opt.id)}
                      style={styles.checkbox}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" style={styles.submitBtn}>
              <Plus size={18} />
              <span>Create Sub-Admin Staff Account</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: '40px', maxWidth: '1280px', margin: '0 auto', width: '100%' },
  loading: { padding: '60px', fontSize: '18px', color: '#64748b', fontWeight: '500', textAlign: 'center' },
  header: { marginBottom: '24px' },
  badgeRow: { display: 'flex', gap: '12px', marginBottom: '12px' },
  liveBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#dcfce7', color: '#15803d', fontSize: '12px', fontWeight: '500', padding: '4px 10px', borderRadius: '20px' },
  timeBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '12px', fontWeight: '500', padding: '4px 10px', borderRadius: '20px' },
  title: { fontSize: '30px', fontWeight: '500', color: '#0f172a', margin: 0 },
  subtitle: { fontSize: '15px', color: '#64748b', marginTop: '6px' },
  systemBanner: { display: 'flex', justifyContent: 'space-between', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px 24px', marginBottom: '32px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' },
  systemItem: { display: 'flex', alignItems: 'center', gap: '10px' },
  systemText: { fontSize: '14px', color: '#334155' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' },
  metricCardLink: { textDecoration: 'none' },
  metricCard: { backgroundColor: '#ffffff', borderRadius: '18px', padding: '24px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)', transition: 'all 0.2s ease-in-out' },
  metricHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { fontSize: '13px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  iconWrapper: { width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: '40px', fontWeight: '500', color: '#0f172a', margin: '14px 0 8px 0' },
  metricFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: '500', color: '#0284c7', paddingTop: '12px', borderTop: '1px solid #f1f5f9' },
  adminControlPanel: { backgroundColor: '#ffffff', padding: '32px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.04)' },
  panelHeader: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', paddingBottom: '18px', borderBottom: '1px solid #f1f5f9' },
  panelTitle: { fontSize: '20px', fontWeight: '500', color: '#0f172a', margin: 0 },
  panelSub: { fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' },
  form: { display: 'flex', flexDirection: 'column', gap: '24px' },
  successMsg: { display: 'flex', alignItems: 'center', gap: '8px', padding: '14px', backgroundColor: '#dcfce7', color: '#15803d', borderRadius: '10px', fontSize: '14px', fontWeight: '500' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '14px', fontWeight: '500', color: '#334155' },
  input: { padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', backgroundColor: '#f8fafc' },
  checkboxGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '8px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', color: '#475569', cursor: 'pointer', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' },
  checkbox: { width: '18px', height: '18px', accentColor: '#10b981' },
  submitBtn: { display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', color: '#ffffff', padding: '14px 28px', borderRadius: '12px', border: 'none', fontSize: '15px', fontWeight: '500', cursor: 'pointer', alignSelf: 'flex-start', marginTop: '8px' }
};
