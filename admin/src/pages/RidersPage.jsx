import React from 'react';
import { useAuth } from '../AuthContext';
import { Navigate } from 'react-router-dom';
import { Bike, Map, AlertTriangle } from 'lucide-react';

export default function RidersPage() {
  const { admin } = useAuth();

  if (admin.role !== 'superadmin' && !admin.access.includes('riders')) {
    return <Navigate to="/" />;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Delivery Fleet Tracker</h1>
        <p style={styles.subtitle}>Monitor active riders, trips, and payouts across regions.</p>
      </header>

      <div style={styles.emptyState}>
        <div style={styles.iconCircle}>
          <Bike size={48} color="#f59e0b" />
        </div>
        <h2 style={styles.emptyTitle}>Fleet Data Integration Pending</h2>
        <p style={styles.emptySub}>
          The Delivery App backend metrics are currently being synced. 
          Real-time rider tracking and payout histories will appear here soon.
        </p>

        <div style={styles.comingSoonGrid}>
          <div style={styles.comingSoonCard}>
            <Map size={24} color="#64748b" />
            <div style={styles.cardText}>Live Map Tracking</div>
          </div>
          <div style={styles.comingSoonCard}>
            <AlertTriangle size={24} color="#64748b" />
            <div style={styles.cardText}>Delay Alerts</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%' },
  header: { marginBottom: '32px' },
  title: { fontSize: '28px', fontWeight: '500', color: '#0f172a', margin: 0 },
  subtitle: { fontSize: '15px', color: '#64748b', marginTop: '8px' },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    padding: '60px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
  },
  iconCircle: { width: '100px', height: '100px', borderRadius: '50px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' },
  emptyTitle: { fontSize: '22px', fontWeight: '500', color: '#0f172a', marginBottom: '12px' },
  emptySub: { fontSize: '16px', color: '#64748b', maxWidth: '500px', lineHeight: '1.6', marginBottom: '40px' },
  comingSoonGrid: { display: 'flex', gap: '20px' },
  comingSoonCard: { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' },
  cardText: { fontSize: '14px', fontWeight: '500', color: '#475569' }
};
