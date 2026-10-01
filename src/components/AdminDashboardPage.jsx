import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Download,
  Clock,
  XCircle,
  Eye,
  UserCheck,
  Building2,
  Home,
  Store,
  Briefcase,
  Users,
  MapPin,
  Phone,
  Mail,
  Calendar,
  ArrowUpRight,
  RefreshCw,
  MessageSquare
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import './AdminDashboardPage.css';

export default function AdminDashboardPage({ onNavigateHome }) {
  const [activeMainTab, setActiveMainTab] = useState('partners'); // 'partners', 'jobs', 'users', 'inquiries'
  const [activeFilterTab, setActiveFilterTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);

  const [dashboardData, setDashboardData] = useState({
    applications: [],
    jobApplications: [],
    users: [],
    contactInquiries: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/data`);
      const data = await response.json();
      if (data.success) {
        // Reverse arrays to show newest first
        setDashboardData({
          applications: data.data.applications.reverse(),
          jobApplications: data.data.jobApplications.reverse(),
          users: data.data.users.reverse(),
          contactInquiries: data.data.contactInquiries.reverse()
        });
      }
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateStatus = async (id, type, newStatus) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type, status: newStatus })
      });
      const data = await response.json();
      if (data.success) {
        fetchData(); // Refresh data
        if (selectedItem && selectedItem.id === id) {
          setSelectedItem({ ...selectedItem, status: newStatus });
        }
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error(error);
      alert('Error connecting to backend');
    }
  };

  const renderPartnersTable = () => {
    const filtered = dashboardData.applications.filter((app) => {
      const matchesStatus = activeFilterTab === 'all' || app.status === activeFilterTab;
      const matchesSearch =
        app.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.phone.includes(searchQuery) ||
        app.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });

    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Category</th>
            <th>Location</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="empty-table-msg">No partner applications found.</td></tr>
          )}
          {filtered.map(app => (
            <tr key={app.id} className="table-row-item">
              <td><span className="table-ref-code">{app.id}</span></td>
              <td><strong className="table-applicant-name">{app.fullName}</strong></td>
              <td><span className="table-category-pill">{app.categoryId}</span></td>
              <td><span className="table-location"><MapPin size={13} /> {app.district}, {app.state}</span></td>
              <td><span className="table-phone"><Phone size={13} /> {app.phone}</span></td>
              <td><span className={`status-badge status-${app.status.toLowerCase().replace(' ', '-')}`}>{app.status}</span></td>
              <td>
                <button className="btn-table-action" onClick={() => setSelectedItem({ ...app, _type: 'partner' })}>
                  <Eye size={15} /> <span>View</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderJobsTable = () => {
    const filtered = dashboardData.jobApplications.filter((job) => {
      const matchesStatus = activeFilterTab === 'all' || job.status === activeFilterTab;
      const matchesSearch =
        job.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.phone.includes(searchQuery) ||
        job.jobTitle.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });

    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Job Ref</th>
            <th>Candidate</th>
            <th>Applied Role</th>
            <th>Experience</th>
            <th>Location</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="empty-table-msg">No job applications found.</td></tr>
          )}
          {filtered.map(job => (
            <tr key={job.id} className="table-row-item">
              <td><span className="table-ref-code">{job.id}</span></td>
              <td><strong className="table-applicant-name">{job.fullName}</strong></td>
              <td><span className="table-category-pill">{job.jobTitle}</span></td>
              <td><span className="table-location">{job.experience}</span></td>
              <td><span className="table-location"><MapPin size={13} /> {job.location}</span></td>
              <td><span className={`status-badge status-${job.status.toLowerCase().replace(' ', '-')}`}>{job.status}</span></td>
              <td>
                <button className="btn-table-action" onClick={() => setSelectedItem({ ...job, _type: 'job' })}>
                  <Eye size={15} /> <span>View</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderUsersTable = () => {
    const filtered = dashboardData.users.filter((u) => {
      return u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.phone.includes(searchQuery);
    });

    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>User ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>City</th>
            <th>Referral Code</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="empty-table-msg">No app users found.</td></tr>
          )}
          {filtered.map(u => (
            <tr key={u.id} className="table-row-item">
              <td><span className="table-ref-code">{u.id}</span></td>
              <td><strong className="table-applicant-name">{u.name}</strong></td>
              <td><span className="table-phone"><Phone size={13} /> {u.phone}</span></td>
              <td><span className="table-location"><MapPin size={13} /> {u.city}</span></td>
              <td><strong>{u.referralCode}</strong></td>
              <td>
                <button className="btn-table-action" onClick={() => setSelectedItem({ ...u, _type: 'user' })}>
                  <Eye size={15} /> <span>Details</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderInquiriesTable = () => {
    const filtered = dashboardData.contactInquiries.filter((inq) => {
      return inq.name.toLowerCase().includes(searchQuery.toLowerCase()) || inq.phone.includes(searchQuery);
    });

    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Inquiry ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Type</th>
            <th>Message</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="empty-table-msg">No contact inquiries found.</td></tr>
          )}
          {filtered.map(inq => (
            <tr key={inq.id} className="table-row-item">
              <td><span className="table-ref-code">{inq.id}</span></td>
              <td><strong className="table-applicant-name">{inq.name}</strong></td>
              <td><span className="table-phone"><Phone size={13} /> {inq.phone}</span></td>
              <td><span className="table-category-pill">{inq.inquiryType}</span></td>
              <td><span className="table-location">{inq.message.substring(0, 30)}...</span></td>
              <td>
                <button className="btn-table-action" onClick={() => setSelectedItem({ ...inq, _type: 'inquiry' })}>
                  <Eye size={15} /> <span>Read</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="admin-dashboard-wrapper">
      <header className="admin-header">
        <div className="container admin-header-container">
          <div className="admin-brand">
            <ShieldCheck size={28} className="admin-shield-icon" />
            <div>
              <h2 className="admin-brand-title">Farmart Central Admin Portal</h2>
              <span className="admin-brand-sub">Real-Time Management Dashboard</span>
            </div>
          </div>

          <div className="admin-top-actions">
            <button className="btn btn-secondary btn-sm" onClick={fetchData}>
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
              <span>Refresh Data</span>
            </button>

            <button className="btn btn-earth btn-sm" onClick={onNavigateHome}>
              <span>Exit Admin Portal</span>
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main section-padding">
        <div className="container">
          {/* Metrics Grid */}
          <div className="admin-metrics-grid">
            <div className={`admin-stat-card ${activeMainTab === 'partners' ? 'active-stat' : ''}`} onClick={() => setActiveMainTab('partners')} style={{ cursor: 'pointer' }}>
              <div className="stat-icon-circle green"><Building2 size={22} /></div>
              <div className="stat-info">
                <span className="stat-val">{dashboardData.applications.length}</span>
                <span className="stat-lbl">Partner Applications</span>
              </div>
            </div>

            <div className={`admin-stat-card ${activeMainTab === 'jobs' ? 'active-stat' : ''}`} onClick={() => setActiveMainTab('jobs')} style={{ cursor: 'pointer' }}>
              <div className="stat-icon-circle amber"><Briefcase size={22} /></div>
              <div className="stat-info">
                <span className="stat-val">{dashboardData.jobApplications.length}</span>
                <span className="stat-lbl">Job Candidates</span>
              </div>
            </div>

            <div className={`admin-stat-card ${activeMainTab === 'users' ? 'active-stat' : ''}`} onClick={() => setActiveMainTab('users')} style={{ cursor: 'pointer' }}>
              <div className="stat-icon-circle blue"><Users size={22} /></div>
              <div className="stat-info">
                <span className="stat-val">{dashboardData.users.length}</span>
                <span className="stat-lbl">App Users</span>
              </div>
            </div>

            <div className={`admin-stat-card ${activeMainTab === 'inquiries' ? 'active-stat' : ''}`} onClick={() => setActiveMainTab('inquiries')} style={{ cursor: 'pointer' }}>
              <div className="stat-icon-circle red"><MessageSquare size={22} /></div>
              <div className="stat-info">
                <span className="stat-val">{dashboardData.contactInquiries.length}</span>
                <span className="stat-lbl">Contact Inquiries</span>
              </div>
            </div>
          </div>

          <div className="admin-control-bar">
            {['partners', 'jobs'].includes(activeMainTab) ? (
              <div className="status-filter-tabs">
                {['all', 'RECEIVED', 'Under Review', 'Approved', 'Rejected'].map(status => (
                  <button
                    key={status}
                    className={`status-tab-btn ${activeFilterTab === status ? 'active' : ''}`}
                    onClick={() => setActiveFilterTab(status)}
                  >
                    {status === 'all' ? 'All' : status}
                  </button>
                ))}
              </div>
            ) : <div />}

            <div className="bar-search-group">
              <div className="admin-search-box">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by name, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="admin-table-wrapper">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>Loading Data...</div>
            ) : (
              <>
                {activeMainTab === 'partners' && renderPartnersTable()}
                {activeMainTab === 'jobs' && renderJobsTable()}
                {activeMainTab === 'users' && renderUsersTable()}
                {activeMainTab === 'inquiries' && renderInquiriesTable()}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="admin-modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="admin-modal-container scale-up-animated" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="modal-ref-tag">{selectedItem.id}</span>
                <h3>{selectedItem.fullName || selectedItem.name}</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setSelectedItem(null)}>
                <XCircle size={24} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="modal-info-grid">
                <div className="info-box-item">
                  <span className="lbl"><UserCheck size={14} /> Name</span>
                  <strong className="val">{selectedItem.fullName || selectedItem.name}</strong>
                </div>
                <div className="info-box-item">
                  <span className="lbl"><Phone size={14} /> Phone</span>
                  <strong className="val">{selectedItem.phone}</strong>
                </div>
                {selectedItem.email && (
                  <div className="info-box-item">
                    <span className="lbl"><Mail size={14} /> Email</span>
                    <strong className="val">{selectedItem.email}</strong>
                  </div>
                )}
                {selectedItem.location && (
                  <div className="info-box-item">
                    <span className="lbl"><MapPin size={14} /> Location</span>
                    <strong className="val">{selectedItem.location}</strong>
                  </div>
                )}
              </div>

              <div className="modal-details-card">
                <h4>More Details:</h4>
                {selectedItem._type === 'partner' && <p>{selectedItem.notes || 'No extra notes provided.'}</p>}
                {selectedItem._type === 'job' && (
                  <>
                    <p><strong>Applied Role:</strong> {selectedItem.jobTitle}</p>
                    <p><strong>Experience:</strong> {selectedItem.experience}</p>
                    <p><strong>Qualification:</strong> {selectedItem.qualification || 'N/A'}</p>
                    <p><strong>Resume Name:</strong> {selectedItem.resumeName}</p>
                  </>
                )}
                {selectedItem._type === 'inquiry' && <p><strong>Message:</strong> {selectedItem.message}</p>}
                {selectedItem._type === 'user' && <p><strong>Referral Code:</strong> {selectedItem.referralCode}</p>}
              </div>

              {/* Status Update Bar only for Partners and Jobs */}
              {['partner', 'job'].includes(selectedItem._type) && (
                <div className="modal-status-update-bar">
                  <span className="update-lbl">Update Status:</span>
                  <div className="status-btn-group">
                    <button className={`status-action-btn ${selectedItem.status === 'RECEIVED' ? 'active-status' : ''}`} onClick={() => handleUpdateStatus(selectedItem.id, selectedItem._type, 'RECEIVED')}>🔴 Received</button>
                    <button className={`status-action-btn ${selectedItem.status === 'Under Review' ? 'active-status' : ''}`} onClick={() => handleUpdateStatus(selectedItem.id, selectedItem._type, 'Under Review')}>⏳ Reviewing</button>
                    <button className={`status-action-btn ${selectedItem.status === 'Approved' ? 'active-status' : ''}`} onClick={() => handleUpdateStatus(selectedItem.id, selectedItem._type, 'Approved')}>🟢 Approve</button>
                    <button className={`status-action-btn ${selectedItem.status === 'Rejected' ? 'active-status' : ''}`} onClick={() => handleUpdateStatus(selectedItem.id, selectedItem._type, 'Rejected')}>⚫ Reject</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
