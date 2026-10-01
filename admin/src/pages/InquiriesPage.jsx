import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { MessageSquare, Phone, Mail, Clock, RefreshCw, X, User, Calendar, Tag, ExternalLink } from 'lucide-react';
import { adminFetch } from '../api';

export default function InquiriesPage() {
  const { admin } = useAuth();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedInquiry, setSelectedInquiry] = useState(null);

  const fetchData = () => {
    setLoading(true);
    adminFetch('/admin/data')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setInquiries(data.data.contactInquiries || []);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const categories = [
    { id: 'ALL', label: 'All Inquiries' },
    { id: 'General Inquiry', label: 'General' },
    { id: 'Village Hub Partner', label: 'Village Hub' },
    { id: 'Farmer Group / FPO', label: 'Farmer FPO' },
    { id: 'FOCO Franchise', label: 'FOCO Franchise' },
    { id: 'Bulk B2B Procurement', label: 'Bulk B2B' },
    { id: 'Media / Press', label: 'Media / Press' }
  ];

  const filtered = inquiries.filter(inq => {
    const matchesSearch = 
      (inq.name && inq.name.toLowerCase().includes(search.toLowerCase())) ||
      (inq.phone && inq.phone.includes(search)) ||
      (inq.inquiryType && inq.inquiryType.toLowerCase().includes(search.toLowerCase())) ||
      (inq.message && inq.message.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = selectedCategory === 'ALL' || (inq.inquiryType && inq.inquiryType.toLowerCase() === selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  return (
    <div style={styles.page} className="responsive-page-padding">
      <header style={styles.header} className="responsive-flex-header">
        <div>
          <h1 style={styles.title}>Live Website Inquiries & Leads</h1>
          <p style={styles.subtitle}>Click any inquiry card to view full details, location, and message logs.</p>
        </div>
        <button style={styles.refreshBtn} onClick={fetchData}>
          <RefreshCw size={16} />
          <span>Refresh Leads ({inquiries.length})</span>
        </button>
      </header>

      {/* Filter Tabs */}
      <div style={styles.filterRow}>
        <div style={styles.categoryTabs}>
          {categories.map(cat => (
            <button 
              key={cat.id} 
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                ...styles.catTab,
                backgroundColor: selectedCategory === cat.id ? '#0f172a' : '#ffffff',
                color: selectedCategory === cat.id ? '#ffffff' : '#64748b',
                borderColor: selectedCategory === cat.id ? '#0f172a' : '#cbd5e1'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.searchBarBox}>
        <input 
          type="text" 
          placeholder="Search by candidate name, phone number, location, or message..." 
          style={styles.searchInput}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={styles.loading}>Fetching live lead submissions from database...</div>
      ) : filtered.length === 0 ? (
        <div style={styles.emptyCard}>
          <MessageSquare size={48} color="#cbd5e1" style={{ marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No inquiries found</h3>
          <p style={{ margin: 0, color: '#64748b' }}>Try adjusting your search query or category filter above.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map(inq => (
            <div key={inq.id} style={styles.card} onClick={() => setSelectedInquiry(inq)}>
              <div style={styles.cardHeader}>
                <div style={styles.typeBadge}>{inq.inquiryType || 'General Inquiry'}</div>
                <div style={styles.refId}>{inq.id}</div>
              </div>

              <h3 style={styles.userName}>{inq.name}</h3>

              <div style={styles.contactDetails}>
                <div style={styles.detailRowLink}>
                  <Phone size={15} color="#16a34a" />
                  <span style={styles.detailTextPhone}>{inq.phone}</span>
                </div>
                {inq.email && inq.email !== 'N/A' && (
                  <div style={styles.detailRowLink}>
                    <Mail size={15} color="#0284c7" />
                    <span style={styles.detailTextEmail}>{inq.email}</span>
                  </div>
                )}
              </div>

              <div style={styles.messageBox}>
                <MessageSquare size={16} color="#64748b" style={{ marginTop: '2px', flexShrink: 0 }} />
                <p style={styles.messageTextPreview}>
                  {inq.message && inq.message.length > 100 
                    ? `${inq.message.substring(0, 100)}...` 
                    : inq.message}
                </p>
              </div>

              <div style={styles.cardFooter}>
                <div style={styles.timeWrapper}>
                  <Clock size={13} color="#94a3b8" />
                  <span style={styles.timeText}>
                    {inq.createdAt ? new Date(inq.createdAt).toLocaleString() : 'Recent'}
                  </span>
                </div>
                <button style={styles.viewBtn} onClick={(e) => { e.stopPropagation(); setSelectedInquiry(inq); }}>
                  <span>View Full Details</span>
                  <ExternalLink size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Detail Modal Popup */}
      {selectedInquiry && (
        <div style={styles.modalBackdrop} onClick={() => setSelectedInquiry(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalBadgeRow}>
                  <span style={styles.typeBadge}>{selectedInquiry.inquiryType || 'General Inquiry'}</span>
                  <span style={styles.refIdModal}>{selectedInquiry.id}</span>
                </div>
                <h2 style={styles.modalTitle}>{selectedInquiry.name}</h2>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedInquiry(null)}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.modalGridRow}>
                <div style={styles.modalField}>
                  <label style={styles.modalLabel}><User size={14} /> Full Name</label>
                  <div style={styles.modalValue}>{selectedInquiry.name}</div>
                </div>

                <div style={styles.modalField}>
                  <label style={styles.modalLabel}><Phone size={14} /> Phone Number</label>
                  <a href={`tel:${selectedInquiry.phone}`} style={styles.modalValueLinkPhone}>
                    {selectedInquiry.phone}
                  </a>
                </div>
              </div>

              <div style={styles.modalGridRow}>
                <div style={styles.modalField}>
                  <label style={styles.modalLabel}><Mail size={14} /> Email Address</label>
                  <a href={`mailto:${selectedInquiry.email}`} style={styles.modalValueLinkEmail}>
                    {selectedInquiry.email || 'N/A'}
                  </a>
                </div>

                <div style={styles.modalField}>
                  <label style={styles.modalLabel}><Calendar size={14} /> Received Timestamp</label>
                  <div style={styles.modalValue}>
                    {selectedInquiry.createdAt ? new Date(selectedInquiry.createdAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>

              <div style={styles.modalFieldFull}>
                <label style={styles.modalLabel}><MessageSquare size={14} /> Full Message & Inquiry Details</label>
                <div style={styles.modalMessageText}>
                  {selectedInquiry.message}
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <a href={`tel:${selectedInquiry.phone}`} style={styles.modalCallBtn}>
                <Phone size={16} />
                <span>Call Candidate Now</span>
              </a>
              {selectedInquiry.email && selectedInquiry.email.includes('@') && (
                <a href={`mailto:${selectedInquiry.email}`} style={styles.modalEmailBtn}>
                  <Mail size={16} />
                  <span>Send Email</span>
                </a>
              )}
              <button style={styles.modalCloseFooterBtn} onClick={() => setSelectedInquiry(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: '40px', maxWidth: '1280px', margin: '0 auto', width: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '28px', fontWeight: '500', color: '#0f172a', margin: 0 },
  subtitle: { fontSize: '15px', color: '#64748b', marginTop: '6px' },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px', fontWeight: '500', color: '#0f172a', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' },
  filterRow: { marginBottom: '20px' },
  categoryTabs: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  catTab: { padding: '8px 16px', borderRadius: '20px', border: '1px solid', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.15s ease' },
  searchBarBox: { marginBottom: '24px' },
  searchInput: { width: '100%', padding: '14px 20px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', backgroundColor: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' },
  loading: { padding: '40px', fontSize: '16px', color: '#64748b', textAlign: 'center', fontWeight: '500' },
  emptyCard: { backgroundColor: '#ffffff', padding: '60px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' },
  card: { backgroundColor: '#ffffff', borderRadius: '18px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '14px', cursor: 'pointer', transition: 'all 0.2s ease' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { backgroundColor: '#dcfce7', color: '#15803d', fontSize: '12px', fontWeight: '500', padding: '4px 12px', borderRadius: '20px' },
  refId: { fontSize: '12px', fontWeight: '500', color: '#94a3b8', fontFamily: 'monospace' },
  userName: { fontSize: '20px', fontWeight: '500', color: '#0f172a', margin: 0 },
  contactDetails: { display: 'flex', flexDirection: 'column', gap: '8px' },
  detailRowLink: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
  detailTextPhone: { fontSize: '15px', fontWeight: '500', color: '#16a34a' },
  detailTextEmail: { fontSize: '14px', fontWeight: '500', color: '#0284c7' },
  messageBox: { display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #f1f5f9' },
  messageTextPreview: { fontSize: '14px', color: '#334155', margin: 0, lineHeight: '20px', fontWeight: '500' },
  cardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '14px', marginTop: 'auto' },
  timeWrapper: { display: 'flex', alignItems: 'center', gap: '6px' },
  timeText: { fontSize: '12px', color: '#94a3b8', fontWeight: '500' },
  viewBtn: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f1f5f9', color: '#0f172a', padding: '8px 14px', borderRadius: '20px', border: 'none', fontSize: '12px', fontWeight: '500', cursor: 'pointer' },
  
  /* Modal Overlay Styles */
  modalBackdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' },
  modalContent: { backgroundColor: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalBadgeRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  refIdModal: { fontSize: '12px', fontWeight: '500', color: '#94a3b8', fontFamily: 'monospace' },
  modalTitle: { fontSize: '24px', fontWeight: '500', color: '#0f172a', margin: 0 },
  closeBtn: { backgroundColor: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  modalBody: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' },
  modalGridRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  modalField: { display: 'flex', flexDirection: 'column', gap: '6px' },
  modalFieldFull: { display: 'flex', flexDirection: 'column', gap: '8px' },
  modalLabel: { fontSize: '12px', fontWeight: '500', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  modalValue: { fontSize: '16px', fontWeight: '500', color: '#0f172a' },
  modalValueLinkPhone: { fontSize: '16px', fontWeight: '500', color: '#16a34a', textDecoration: 'none' },
  modalValueLinkEmail: { fontSize: '16px', fontWeight: '500', color: '#0284c7', textDecoration: 'none' },
  modalMessageText: { backgroundColor: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid #e2e8f0', fontSize: '15px', color: '#0f172a', lineHeight: '24px', whiteSpace: 'pre-wrap', fontWeight: '500' },
  modalFooter: { padding: '20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' },
  modalCallBtn: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#ffffff', padding: '12px 20px', borderRadius: '10px', textDecoration: 'none', fontSize: '14px', fontWeight: '500' },
  modalEmailBtn: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0284c7', color: '#ffffff', padding: '12px 20px', borderRadius: '10px', textDecoration: 'none', fontSize: '14px', fontWeight: '500' },
  modalCloseFooterBtn: { backgroundColor: '#f1f5f9', color: '#475569', padding: '12px 20px', borderRadius: '10px', border: 'none', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }
};
