import React, { useState, useEffect, useCallback } from 'react';
import {
  Check,
  X,
  RefreshCw,
  Layers,
  CornerDownRight,
  ArrowRightLeft,
  Building2,
  Calendar,
  Sparkles
} from 'lucide-react';
import { adminFetch } from '../api';

export default function CategoriesPage() {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history' | 'curate'
  const [requests, setRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Action Modals State
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalType, setModalType] = useState(null); // 'approve_global' | 'approve_sub' | 'map' | 'reject'
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Form states for modals
  const [approveName, setApproveName] = useState('');
  const [approveSlug, setApproveSlug] = useState('');
  const [approveType, setApproveType] = useState('GROCERY');
  const [approveIcon, setApproveIcon] = useState('🥦');
  const [approveSortOrder, setApproveSortOrder] = useState('50');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [targetMapId, setTargetMapId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // Fetch Category Requests
  const fetchRequests = useCallback(async () => {
    try {
      const res = await adminFetch('/admin/category-requests');
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests || []);
        setPendingCount(data.pendingCount || 0);
      }
    } catch (err) {
      console.error('Error fetching requests:', err);
    }
  }, []);

  // Fetch Live Categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await adminFetch('/admin/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRequests(), fetchCategories()]);
    setLoading(false);
  }, [fetchRequests, fetchCategories]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchRequests(), fetchCategories()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Open Action Modal with pre-filled request data
  const openModal = (req, type) => {
    setSelectedRequest(req);
    setModalType(type);
    setActionError('');
    setAdminNotes('');

    if (type === 'approve_global') {
      setApproveName(req.proposedName || '');
      setApproveSlug(
        (req.proposedName || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
      setApproveType(req.proposedType || 'GROCERY');
      setApproveIcon(req.proposedIcon || (req.proposedType === 'FOOD' ? '🍛' : '🥦'));
      setApproveSortOrder('50');
    } else if (type === 'approve_sub') {
      setApproveName(req.proposedName || '');
      setParentCategoryId(req.suggestedParentCategory?._id || (categories[0]?._id || ''));
    } else if (type === 'map') {
      setTargetMapId(req.suggestedParentCategory?._id || (categories[0]?._id || ''));
    } else if (type === 'reject') {
      setRejectReason('');
    }
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setModalType(null);
    setActionLoading(false);
    setActionError('');
  };

  // Submit Approval as Global Category
  const handleApproveGlobal = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);
    setActionError('');

    try {
      const res = await adminFetch(`/admin/category-requests/${selectedRequest._id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: approveName.trim(),
          slug: approveSlug.trim(),
          type: approveType,
          icon: approveIcon.trim(),
          sortOrder: parseInt(approveSortOrder, 10) || 50,
          adminNotes: adminNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        closeModal();
        handleRefresh();
      } else {
        setActionError(data.message || 'Approval failed');
      }
    } catch (err) {
      setActionError('Network error while approving request');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Approval as Subcategory
  const handleApproveSubcategory = async () => {
    if (!selectedRequest || !parentCategoryId) {
      setActionError('Please select a parent category');
      return;
    }
    setActionLoading(true);
    setActionError('');

    try {
      const res = await adminFetch(`/admin/category-requests/${selectedRequest._id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: approveName.trim(),
          asSubcategoryOf: parentCategoryId,
          adminNotes: adminNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        closeModal();
        handleRefresh();
      } else {
        setActionError(data.message || 'Approval failed');
      }
    } catch (err) {
      setActionError('Network error while approving subcategory');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Map to Existing Category
  const handleMapRequest = async () => {
    if (!selectedRequest || !targetMapId) {
      setActionError('Please select a target category');
      return;
    }
    setActionLoading(true);
    setActionError('');

    try {
      const res = await adminFetch(`/admin/category-requests/${selectedRequest._id}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCategoryId: targetMapId,
          adminNotes: adminNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        closeModal();
        handleRefresh();
      } else {
        setActionError(data.message || 'Mapping failed');
      }
    } catch (err) {
      setActionError('Network error while mapping category');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Rejection
  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!rejectReason.trim()) {
      setActionError('Please provide a reason for rejection');
      return;
    }
    setActionLoading(true);
    setActionError('');

    try {
      const res = await adminFetch(`/admin/category-requests/${selectedRequest._id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: rejectReason.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        closeModal();
        handleRefresh();
      } else {
        setActionError(data.message || 'Rejection failed');
      }
    } catch (err) {
      setActionError('Network error while rejecting request');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Category Active Status
  const toggleCategoryActive = async (category) => {
    try {
      const res = await adminFetch(`/admin/categories/${category._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !category.isActive
        })
      });
      const data = await res.json();
      if (data.success) {
        setCategories((prev) =>
          prev.map((c) => (c._id === category._id ? { ...c, isActive: !c.isActive } : c))
        );
      } else {
        alert(data.message || 'Failed to update category status');
      }
    } catch (err) {
      console.error('Error toggling category status:', err);
    }
  };

  // Update Category Sort Order
  const handleSortOrderBlur = async (categoryId, newOrder) => {
    const parsed = parseInt(newOrder, 10);
    if (isNaN(parsed)) return;

    try {
      await adminFetch(`/admin/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: parsed })
      });
      handleRefresh();
    } catch (err) {
      console.error('Error updating sort order:', err);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  const historyRequests = requests.filter((r) => r.status !== 'PENDING');

  return (
    <div style={styles.page} className="responsive-page-padding">
      {/* Top Header */}
      <header style={styles.header} className="responsive-flex-header">
        <div>
          <h1 style={styles.title}>Category Moderation & Taxonomy</h1>
          <p style={styles.subtitle}>
            Review partner category proposals, govern global catalog taxonomy, and curate customer discovery order.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={handleRefresh} style={styles.refreshBtn} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tabBtn,
            ...(activeTab === 'pending' ? styles.tabBtnActive : {})
          }}
          onClick={() => setActiveTab('pending')}
        >
          <Sparkles size={16} color={activeTab === 'pending' ? '#10b981' : '#64748b'} />
          <span>Pending Approvals</span>
          {pendingCount > 0 && (
            <span style={styles.pendingBadge}>{pendingCount}</span>
          )}
        </button>

        <button
          style={{
            ...styles.tabBtn,
            ...(activeTab === 'curate' ? styles.tabBtnActive : {})
          }}
          onClick={() => setActiveTab('curate')}
        >
          <Layers size={16} color={activeTab === 'curate' ? '#10b981' : '#64748b'} />
          <span>Curated Categories ({categories.length})</span>
        </button>

        <button
          style={{
            ...styles.tabBtn,
            ...(activeTab === 'history' ? styles.tabBtnActive : {})
          }}
          onClick={() => setActiveTab('history')}
        >
          <Calendar size={16} color={activeTab === 'history' ? '#10b981' : '#64748b'} />
          <span>Request History ({historyRequests.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div style={styles.emptyCard}>Loading taxonomy data...</div>
      ) : activeTab === 'pending' ? (
        <div style={styles.contentWrap}>
          {pendingRequests.length === 0 ? (
            <div style={styles.emptyCard}>
              <Check size={36} color="#10b981" style={{ marginBottom: '12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                All Caught Up!
              </h3>
              <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                There are no pending category requests awaiting review.
              </p>
            </div>
          ) : (
            <div style={styles.grid}>
              {pendingRequests.map((req) => (
                <div key={req._id} style={styles.requestCard}>
                  <div style={styles.cardHeader}>
                    <div style={styles.categoryBadge}>
                      <span style={{ fontSize: '20px' }}>{req.proposedIcon || '🏷️'}</span>
                      <div>
                        <div style={styles.proposedName}>{req.proposedName}</div>
                        <div style={styles.proposedType}>{req.proposedType}</div>
                      </div>
                    </div>
                    <span style={styles.pendingPill}>PENDING REVIEW</span>
                  </div>

                  <div style={styles.cardBody}>
                    <div style={styles.metaRow}>
                      <Building2 size={15} color="#64748b" />
                      <span style={styles.metaLabel}>Requester:</span>
                      <span style={styles.metaValue}>
                        {req.vendor?.storeName || 'Merchant'} ({req.vendor?.phone || 'No phone'})
                      </span>
                    </div>

                    {req.suggestedParentCategory && (
                      <div style={styles.metaRow}>
                        <CornerDownRight size={15} color="#64748b" />
                        <span style={styles.metaLabel}>Suggested Parent:</span>
                        <span style={styles.parentPill}>
                          {req.suggestedParentCategory.name}
                        </span>
                      </div>
                    )}

                    {req.reason && (
                      <div style={styles.reasonBox}>
                        <span style={{ fontWeight: '600', color: '#475569' }}>Vendor Note:</span>{' '}
                        {req.reason}
                      </div>
                    )}

                    <div style={styles.timestamp}>
                      Submitted on {new Date(req.createdAt).toLocaleDateString()} at{' '}
                      {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={styles.cardActions}>
                    <button
                      style={styles.approveGlobalBtn}
                      onClick={() => openModal(req, 'approve_global')}
                      title="Approve as top-level canonical category"
                    >
                      <Check size={14} />
                      <span>Approve Global</span>
                    </button>

                    <button
                      style={styles.approveSubBtn}
                      onClick={() => openModal(req, 'approve_sub')}
                      title="Approve as subcategory under an existing parent"
                    >
                      <CornerDownRight size={14} />
                      <span>As Subcategory</span>
                    </button>

                    <button
                      style={styles.mapBtn}
                      onClick={() => openModal(req, 'map')}
                      title="Map this request to an existing approved category"
                    >
                      <ArrowRightLeft size={14} />
                      <span>Map to Existing</span>
                    </button>

                    <button
                      style={styles.rejectBtn}
                      onClick={() => openModal(req, 'reject')}
                      title="Reject request with an explanation"
                    >
                      <X size={14} />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'curate' ? (
        /* Live Platform Categories Curation */
        <div style={styles.tableCard} className="table-responsive-wrapper">
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHead}>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Slug</th>
                <th style={styles.th}>Subcategories</th>
                <th style={styles.th}>Linked Products</th>
                <th style={styles.th}>Home Sort Order</th>
                <th style={styles.th}>Customer Visibility</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c._id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>{c.icon || '🏷️'}</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: c.type === 'FOOD' ? '#fef3c7' : '#ecfdf5',
                        color: c.type === 'FOOD' ? '#b45309' : '#047857'
                      }}
                    >
                      {c.type}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'monospace', color: '#64748b' }}>
                    {c.slug}
                  </td>
                  <td style={styles.td}>
                    {c.subCategories && c.subCategories.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {c.subCategories.map((sub, idx) => (
                          <span key={idx} style={styles.subCatTag}>
                            {sub.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '13px' }}>None</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontWeight: '600', color: '#0f172a' }}>
                      {c.productCount || 0}
                    </span>{' '}
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>items</span>
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      defaultValue={c.sortOrder ?? 50}
                      onBlur={(e) => handleSortOrderBlur(c._id, e.target.value)}
                      style={styles.orderInput}
                      title="Lower numbers appear first on customer Home tab"
                    />
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => toggleCategoryActive(c)}
                      style={{
                        ...styles.toggleBtn,
                        backgroundColor: c.isActive ? '#ecfdf5' : '#fef2f2',
                        color: c.isActive ? '#059669' : '#dc2626',
                        borderColor: c.isActive ? '#a7f3d0' : '#fecaca'
                      }}
                    >
                      {c.isActive ? 'Active (Live)' : 'Inactive (Hidden)'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* History of Past Requests */
        <div style={styles.tableCard} className="table-responsive-wrapper">
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHead}>
                <th style={styles.th}>Proposed Category</th>
                <th style={styles.th}>Requester Store</th>
                <th style={styles.th}>Submitted Date</th>
                <th style={styles.th}>Outcome</th>
                <th style={styles.th}>Admin Decision / Mapping</th>
              </tr>
            </thead>
            <tbody>
              {historyRequests.map((req) => (
                <tr key={req._id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{req.proposedIcon || '🏷️'}</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>
                        {req.proposedName}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        ({req.proposedType})
                      </span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: '#334155' }}>
                      {req.vendor?.storeName || 'Vendor'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, color: '#64748b', fontSize: '13px' }}>
                    {new Date(req.createdAt).toLocaleDateString()}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: req.status === 'APPROVED' ? '#ecfdf5' : '#fef2f2',
                        color: req.status === 'APPROVED' ? '#059669' : '#dc2626'
                      }}
                    >
                      {req.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {req.mappedCategory ? (
                      <span style={styles.parentPill}>
                        Mapped to: {req.mappedCategory.name}
                      </span>
                    ) : req.createdCategory ? (
                      <span style={styles.subCatTag}>
                        New Category Created
                      </span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '13px' }}>
                        {req.adminNotes || '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ACTION MODALS */}
      {/* ========================================================================= */}

      {/* Modal: Approve as Global Category */}
      {modalType === 'approve_global' && selectedRequest && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Approve as Global Category</h3>
              <button onClick={closeModal} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <p style={styles.modalDesc}>
              This will create a new canonical top-level category visible across the customer catalog.
            </p>

            {actionError && <div style={styles.errorAlert}>{actionError}</div>}

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Canonical Name *</label>
              <input
                type="text"
                value={approveName}
                onChange={(e) => setApproveName(e.target.value)}
                style={styles.formInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>URL Slug *</label>
              <input
                type="text"
                value={approveSlug}
                onChange={(e) => setApproveSlug(e.target.value)}
                style={styles.formInput}
              />
            </div>

            <div style={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label style={styles.formLabel}>Catalog Type</label>
                <select
                  value={approveType}
                  onChange={(e) => setApproveType(e.target.value)}
                  style={styles.formSelect}
                >
                  <option value="GROCERY">GROCERY</option>
                  <option value="FOOD">FOOD / MEALS</option>
                </select>
              </div>
              <div style={{ width: '100px' }}>
                <label style={styles.formLabel}>Icon Emoji</label>
                <input
                  type="text"
                  value={approveIcon}
                  onChange={(e) => setApproveIcon(e.target.value)}
                  style={styles.formInput}
                />
              </div>
              <div style={{ width: '120px' }}>
                <label style={styles.formLabel}>Sort Order</label>
                <input
                  type="number"
                  value={approveSortOrder}
                  onChange={(e) => setApproveSortOrder(e.target.value)}
                  style={styles.formInput}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Admin Notes (Optional)</label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Notes for record keeping or partner notification"
                style={styles.formInput}
              />
            </div>

            <div style={styles.modalFooter}>
              <button onClick={closeModal} style={styles.cancelBtn} disabled={actionLoading}>
                Cancel
              </button>
              <button
                onClick={handleApproveGlobal}
                style={styles.confirmApproveBtn}
                disabled={actionLoading}
              >
                {actionLoading ? 'Approving...' : 'Confirm Global Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve as Subcategory */}
      {modalType === 'approve_sub' && selectedRequest && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Approve as Subcategory</h3>
              <button onClick={closeModal} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <p style={styles.modalDesc}>
              This will nest the requested category under an existing top-level parent category.
            </p>

            {actionError && <div style={styles.errorAlert}>{actionError}</div>}

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Subcategory Name *</label>
              <input
                type="text"
                value={approveName}
                onChange={(e) => setApproveName(e.target.value)}
                style={styles.formInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Select Parent Category *</label>
              <select
                value={parentCategoryId}
                onChange={(e) => setParentCategoryId(e.target.value)}
                style={styles.formSelect}
              >
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.icon || '🏷️'} {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Admin Notes (Optional)</label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Reason for subcategory classification"
                style={styles.formInput}
              />
            </div>

            <div style={styles.modalFooter}>
              <button onClick={closeModal} style={styles.cancelBtn} disabled={actionLoading}>
                Cancel
              </button>
              <button
                onClick={handleApproveSubcategory}
                style={styles.confirmSubBtn}
                disabled={actionLoading}
              >
                {actionLoading ? 'Nesting...' : 'Approve as Subcategory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Map to Existing Category */}
      {modalType === 'map' && selectedRequest && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Map Request to Existing Category</h3>
              <button onClick={closeModal} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <p style={styles.modalDesc}>
              Choose an existing active category to satisfy this vendor request without creating duplicates.
            </p>

            {actionError && <div style={styles.errorAlert}>{actionError}</div>}

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Target Approved Category *</label>
              <select
                value={targetMapId}
                onChange={(e) => setTargetMapId(e.target.value)}
                style={styles.formSelect}
              >
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.icon || '🏷️'} {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Notification Note to Partner</label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Please use Fruits & Vegetables for this produce"
                style={styles.formInput}
              />
            </div>

            <div style={styles.modalFooter}>
              <button onClick={closeModal} style={styles.cancelBtn} disabled={actionLoading}>
                Cancel
              </button>
              <button
                onClick={handleMapRequest}
                style={styles.confirmMapBtn}
                disabled={actionLoading}
              >
                {actionLoading ? 'Mapping...' : 'Confirm Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Request */}
      {modalType === 'reject' && selectedRequest && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Reject Category Request</h3>
              <button onClick={closeModal} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <p style={styles.modalDesc}>
              Provide a clear reason why "{selectedRequest.proposedName}" cannot be approved. The partner will be notified.
            </p>

            {actionError && <div style={styles.errorAlert}>{actionError}</div>}

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Duplicate category; does not meet catalog taxonomy requirements..."
                rows={3}
                style={styles.formTextarea}
              />
            </div>

            <div style={styles.modalFooter}>
              <button onClick={closeModal} style={styles.cancelBtn} disabled={actionLoading}>
                Cancel
              </button>
              <button
                onClick={handleReject}
                style={styles.confirmRejectBtn}
                disabled={actionLoading}
              >
                {actionLoading ? 'Rejecting...' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: '32px',
    maxWidth: '1380px',
    margin: '0 auto',
    width: '100%'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#0f172a',
    margin: 0
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    marginTop: '6px'
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    color: '#334155',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: '0.2s'
  },
  tabBar: {
    display: 'flex',
    gap: '12px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '12px',
    marginBottom: '24px'
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: '0.2s'
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
  },
  pendingBadge: {
    backgroundColor: '#ea580c',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '12px'
  },
  contentWrap: {
    width: '100%'
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '60px 24px',
    textAlign: 'center',
    border: '1px dashed #cbd5e1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '20px'
  },
  requestCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '14px'
  },
  categoryBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  proposedName: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#0f172a'
  },
  proposedType: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#ea580c',
    letterSpacing: '0.5px'
  },
  pendingPill: {
    backgroundColor: '#fff7ed',
    color: '#c2410c',
    fontSize: '10px',
    fontWeight: '800',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid #ffedd5'
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px'
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px'
  },
  metaLabel: {
    color: '#64748b',
    fontWeight: '500'
  },
  metaValue: {
    color: '#1e293b',
    fontWeight: '600'
  },
  parentPill: {
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    fontSize: '12px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '6px'
  },
  reasonBox: {
    marginTop: '6px',
    padding: '10px 12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #f1f5f9',
    fontSize: '12px',
    color: '#475569',
    lineHeight: '18px'
  },
  timestamp: {
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '4px'
  },
  cardActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    paddingTop: '14px',
    borderTop: '1px solid #f1f5f9'
  },
  approveGlobalBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  approveSubBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#f8fafc',
    color: '#334155',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  mapBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #3b82f6',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  rejectBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #fee2e2',
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    overflow: 'hidden'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left'
  },
  trHead: {
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0'
  },
  th: {
    padding: '14px 20px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  tr: {
    borderBottom: '1px solid #f1f5f9'
  },
  td: {
    padding: '16px 20px',
    fontSize: '14px',
    verticalAlign: 'middle'
  },
  subCatTag: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '6px',
    display: 'inline-block'
  },
  orderInput: {
    width: '70px',
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    textAlign: 'center',
    fontWeight: '600'
  },
  toggleBtn: {
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid transparent',
    cursor: 'pointer'
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    backdropFilter: 'blur(4px)'
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    width: '100%',
    maxWidth: '520px',
    padding: '24px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#0f172a',
    margin: 0
  },
  modalDesc: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '20px'
  },
  closeBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: '#64748b',
    padding: '4px'
  },
  formGroup: {
    marginBottom: '16px'
  },
  formRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px'
  },
  formLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '6px'
  },
  formInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  formSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box'
  },
  formTextarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '24px'
  },
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  confirmApproveBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  confirmSubBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  confirmMapBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  confirmRejectBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  errorAlert: {
    padding: '10px 14px',
    borderRadius: '8px',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: '13px',
    marginBottom: '16px',
    border: '1px solid #fecaca'
  }
};
