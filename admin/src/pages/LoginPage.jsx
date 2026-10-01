import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { ShieldCheck, Lock, User, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await login(username, password);
    if (!res.success) {
      setError(res.message);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.loginCard}>
        <div style={styles.brandBox}>
          <ShieldCheck size={48} color="#16a34a" />
          <h1 style={styles.brandTitle}>Farmart Central Command</h1>
          <p style={styles.brandSub}>Restricted Admin Access</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.errorBox}>{error}</div>}
          
          <div style={styles.inputGroup}>
            <label style={styles.label}>Admin ID</label>
            <div style={styles.inputWrapper}>
              <User size={18} color="#64748b" style={styles.icon} />
              <input 
                type="text" 
                placeholder="Enter username"
                style={styles.input} 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <Lock size={18} color="#64748b" style={styles.icon} />
              <input 
                type="password" 
                placeholder="Enter password"
                style={styles.input} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" style={styles.submitBtn}>
            <span>Authenticate</span>
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    padding: '20px'
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    padding: '40px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
  },
  brandBox: {
    textAlign: 'center',
    marginBottom: '32px'
  },
  brandTitle: {
    fontSize: '24px',
    fontWeight: '500',
    color: '#0f172a',
    marginTop: '16px'
  },
  brandSub: {
    fontSize: '14px',
    color: '#64748b',
    marginTop: '4px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    color: '#ef4444',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    textAlign: 'center',
    fontWeight: '500'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#334155'
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  icon: {
    position: 'absolute',
    left: '14px'
  },
  input: {
    width: '100%',
    padding: '14px 14px 14px 40px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    fontSize: '15px',
    outline: 'none',
    transition: '0.2s',
    backgroundColor: '#f8fafc'
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    padding: '16px',
    borderRadius: '12px',
    border: 'none',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '8px',
    boxShadow: '0 10px 15px -3px rgba(22, 163, 74, 0.3)'
  }
};
