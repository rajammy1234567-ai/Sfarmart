import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutGrid,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  ArrowUpDown,
  Tag,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { adminFetch } from '../api';

export default function HomeLayoutPage() {
  const [activeTab, setActiveTab] = useState('sections'); // 'sections' | 'banners'
  const [sections, setSections] = useState([]);
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Section Form State
  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionSubtitle, setSectionSubtitle] = useState('');
  const [sectionType, setSectionType] = useState('CATEGORY_PRODUCTS');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sectionSortOrder, setSectionSortOrder] = useState('10');
  const [sectionMaxProducts, setSectionMaxProducts] = useState('10');
  const [sectionIsActive, setSectionIsActive] = useState(true);

  // Banner Form State
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerImageUrl, setBannerImageUrl] = useState('');
  const [bannerLinkType, setBannerLinkType] = useState('NONE');
  const [bannerLinkTarget, setBannerLinkTarget] = useState('');
  const [bannerSortOrder, setBannerSortOrder] = useState('10');
  const [bannerIsActive, setBannerIsActive] = useState(true);

  const showNotification = (msg, isErr = false) => {
    if (isErr) {
      setError(msg);
      setTimeout(() => setError(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [secRes, banRes, catRes] = await Promise.all([
        adminFetch('/admin/home-sections'),
        adminFetch('/admin/banners'),
        adminFetch('/categories?partner=true')
      ]);

      const [secData, banData, catData] = await Promise.all([
        secRes.json(),
        banRes.json(),
        catRes.json()
      ]);

      if (secData.success) setSections(secData.sections || []);
      if (banData.success) setBanners(banData.banners || []);
      if (catData.success) {
        setCategories(catData.categories || []);
        if (catData.categories?.length > 0 && !selectedCategory) {
          setSelectedCategory(catData.categories[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load home layout data:', err);
      showNotification('Failed to load data: ' + err.message, true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Section Handlers
  const handleCreateSection = async (e) => {
    e.preventDefault();
    if (!sectionTitle.trim()) {
      showNotification('Section title is required', true);
      return;
    }
    if (sectionType === 'CATEGORY_PRODUCTS' && !selectedCategory) {
      showNotification('Please select a target category', true);
      return;
    }

    setActionLoading(true);
    try {
      const res = await adminFetch('/admin/home-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sectionTitle.trim(),
          subtitle: sectionSubtitle.trim(),
          sectionType,
          category: sectionType === 'CATEGORY_PRODUCTS' ? selectedCategory : undefined,
          sortOrder: parseInt(sectionSortOrder, 10) || 10,
          maxProducts: parseInt(sectionMaxProducts, 10) || 10,
          isActive: sectionIsActive
        })
      });

      const data = await res.json();
      if (data.success) {
        showNotification('Home section created successfully');
        setShowSectionModal(false);
        setSectionTitle('');
        setSectionSubtitle('');
        setSectionSortOrder('10');
        loadData();
      } else {
        showNotification(data.message || 'Failed to create section', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSectionActive = async (sec) => {
    try {
      const nextVal = !sec.isActive;
      const res = await adminFetch(`/admin/home-sections/${sec._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextVal })
      });
      const data = await res.json();
      if (data.success) {
        setSections((prev) =>
          prev.map((s) => (s._id === sec._id ? { ...s, isActive: nextVal } : s))
        );
        showNotification(`Section "${sec.title}" is now ${nextVal ? 'active' : 'hidden'}`);
      }
    } catch (err) {
      showNotification('Failed to toggle section: ' + err.message, true);
    }
  };

  const handleSectionSortOrderBlur = async (secId, newOrder) => {
    const parsed = parseInt(newOrder, 10);
    if (isNaN(parsed)) return;
    try {
      await adminFetch(`/admin/home-sections/${secId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: parsed })
      });
      loadData();
    } catch (err) {
      console.error('Failed to update sort order', err);
    }
  };

  const handleDeleteSection = async (secId, title) => {
    if (!window.confirm(`Are you sure you want to delete section "${title}"?`)) return;
    try {
      const res = await adminFetch(`/admin/home-sections/${secId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Section "${title}" deleted`);
        setSections((prev) => prev.filter((s) => s._id !== secId));
      } else {
        showNotification(data.message || 'Failed to delete section', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  // Banner Handlers
  const handleCreateBanner = async (e) => {
    e.preventDefault();
    if (!bannerImageUrl.trim()) {
      showNotification('Banner Image URL is required', true);
      return;
    }

    setActionLoading(true);
    try {
      const res = await adminFetch('/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bannerTitle.trim(),
          subtitle: bannerSubtitle.trim(),
          imageUrl: bannerImageUrl.trim(),
          linkType: bannerLinkType,
          linkTarget: bannerLinkType !== 'NONE' ? bannerLinkTarget.trim() : '',
          sortOrder: parseInt(bannerSortOrder, 10) || 10,
          isActive: bannerIsActive
        })
      });

      const data = await res.json();
      if (data.success) {
        showNotification('Banner created successfully');
        setShowBannerModal(false);
        setBannerTitle('');
        setBannerSubtitle('');
        setBannerImageUrl('');
        setBannerLinkTarget('');
        setBannerSortOrder('10');
        loadData();
      } else {
        showNotification(data.message || 'Failed to create banner', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBannerActive = async (banner) => {
    try {
      const nextVal = !banner.isActive;
      const res = await adminFetch(`/admin/banners/${banner._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextVal })
      });
      const data = await res.json();
      if (data.success) {
        setBanners((prev) =>
          prev.map((b) => (b._id === banner._id ? { ...b, isActive: nextVal } : b))
        );
        showNotification(`Banner is now ${nextVal ? 'active' : 'hidden'}`);
      }
    } catch (err) {
      showNotification('Failed to toggle banner: ' + err.message, true);
    }
  };

  const handleBannerSortOrderBlur = async (bannerId, newOrder) => {
    const parsed = parseInt(newOrder, 10);
    if (isNaN(parsed)) return;
    try {
      await adminFetch(`/admin/banners/${bannerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: parsed })
      });
      loadData();
    } catch (err) {
      console.error('Failed to update sort order', err);
    }
  };

  const handleDeleteBanner = async (bannerId, title) => {
    if (!window.confirm(`Delete this banner?`)) return;
    try {
      const res = await adminFetch(`/admin/banners/${bannerId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Banner deleted');
        setBanners((prev) => prev.filter((b) => b._id !== bannerId));
      } else {
        showNotification(data.message || 'Failed to delete banner', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  return (
    <div style={styles.container}>
      {/* Notifications */}
      {error && (
        <div style={styles.alertError}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div style={styles.alertSuccess}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Home Feed Layout & Merchandising</h1>
          <p style={styles.subtitle}>
            Control customer app banners, promotional product rails, categories, and ordering.
            Sections with no active products are automatically hidden.
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            onClick={handleRefresh}
            style={styles.refreshBtn}
            disabled={refreshing}
            title="Reload layout"
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {activeTab === 'sections' ? (
            <button
              onClick={() => setShowSectionModal(true)}
              style={styles.primaryBtn}
            >
              <Plus size={16} />
              <span>Add Product Section</span>
            </button>
          ) : (
            <button
              onClick={() => setShowBannerModal(true)}
              style={styles.primaryBtn}
            >
              <Plus size={16} />
              <span>Add Banner</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={styles.tabsContainer}>
        <button
          onClick={() => setActiveTab('sections')}
          style={{
            ...styles.tabBtn,
            ...(activeTab === 'sections' ? styles.tabBtnActive : {})
          }}
        >
          <Layers size={18} />
          <span>Product Sections ({sections.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('banners')}
          style={{
            ...styles.tabBtn,
            ...(activeTab === 'banners' ? styles.tabBtnActive : {})
          }}
        >
          <ImageIcon size={18} />
          <span>Promotional Banners ({banners.length})</span>
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={styles.loadingBox}>
          <RefreshCw size={24} className="spin" color="#10b981" />
          <p style={{ marginTop: 12, color: '#64748b' }}>Loading Home feed configuration...</p>
        </div>
      ) : activeTab === 'sections' ? (
        /* ================== PRODUCT SECTIONS TAB ================== */
        <div style={styles.tableCard} className="table-responsive-wrapper">
          {sections.length === 0 ? (
            <div style={styles.emptyState}>
              <Layers size={40} color="#cbd5e1" />
              <h3 style={{ margin: '12px 0 4px', color: '#1e293b' }}>No Custom Product Sections Configured</h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '440px' }}>
                When no custom sections are configured, the customer Home feed automatically displays live products organized by active categories.
              </p>
              <button
                onClick={() => setShowSectionModal(true)}
                style={{ ...styles.primaryBtn, marginTop: 16 }}
              >
                <Plus size={16} />
                <span>Create First Section</span>
              </button>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Section Title & Subtitle</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Target Category</th>
                  <th style={styles.th}>Sort Order</th>
                  <th style={styles.th}>Max Items</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <tr key={sec._id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '600', color: '#0f172a' }}>{sec.title}</div>
                      {sec.subtitle && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                          {sec.subtitle}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          backgroundColor: '#f0fdf4',
                          color: '#15803d'
                        }}
                      >
                        {sec.sectionType}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {sec.category ? (
                        <span style={{ fontWeight: '500', color: '#334155' }}>
                          {sec.category.icon || '🏷️'} {sec.category.name}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        defaultValue={sec.sortOrder ?? 10}
                        onBlur={(e) => handleSectionSortOrderBlur(sec._id, e.target.value)}
                        style={styles.orderInput}
                        title="Lower numbers appear higher on Home"
                      />
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: '600', color: '#0f172a' }}>
                        {sec.maxProducts || 10}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleToggleSectionActive(sec)}
                        style={{
                          ...styles.toggleBtn,
                          backgroundColor: sec.isActive ? '#ecfdf5' : '#fef2f2',
                          color: sec.isActive ? '#059669' : '#dc2626',
                          borderColor: sec.isActive ? '#a7f3d0' : '#fecaca'
                        }}
                      >
                        {sec.isActive ? 'Active (Live)' : 'Hidden'}
                      </button>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleDeleteSection(sec._id, sec.title)}
                        style={styles.deleteBtn}
                        title="Delete section"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* ================== PROMOTIONAL BANNERS TAB ================== */
        <div style={styles.tableCard} className="table-responsive-wrapper">
          {banners.length === 0 ? (
            <div style={styles.emptyState}>
              <ImageIcon size={40} color="#cbd5e1" />
              <h3 style={{ margin: '12px 0 4px', color: '#1e293b' }}>No Promotional Banners</h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '440px' }}>
                When no banners are active, the customer app banner carousel is hidden completely to keep the layout compact and clean.
              </p>
              <button
                onClick={() => setShowBannerModal(true)}
                style={{ ...styles.primaryBtn, marginTop: 16 }}
              >
                <Plus size={16} />
                <span>Add First Banner</span>
              </button>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Banner Preview</th>
                  <th style={styles.th}>Title & Subtitle</th>
                  <th style={styles.th}>Link Destination</th>
                  <th style={styles.th}>Sort Order</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((ban) => (
                  <tr key={ban._id} style={styles.tr}>
                    <td style={styles.td}>
                      {ban.imageUrl ? (
                        <img
                          src={ban.imageUrl}
                          alt={ban.title || 'Banner'}
                          style={styles.bannerThumb}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={styles.noThumb}>No Img</div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '600', color: '#0f172a' }}>
                        {ban.title || '(No title)'}
                      </div>
                      {ban.subtitle && (
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{ban.subtitle}</div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontSize: '12px', color: '#475569' }}>
                        {ban.linkType !== 'NONE' ? `${ban.linkType}: ${ban.linkTarget}` : 'None'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        defaultValue={ban.sortOrder ?? 10}
                        onBlur={(e) => handleBannerSortOrderBlur(ban._id, e.target.value)}
                        style={styles.orderInput}
                      />
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleToggleBannerActive(ban)}
                        style={{
                          ...styles.toggleBtn,
                          backgroundColor: ban.isActive ? '#ecfdf5' : '#fef2f2',
                          color: ban.isActive ? '#059669' : '#dc2626',
                          borderColor: ban.isActive ? '#a7f3d0' : '#fecaca'
                        }}
                      >
                        {ban.isActive ? 'Active (Live)' : 'Hidden'}
                      </button>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleDeleteBanner(ban._id, ban.title)}
                        style={styles.deleteBtn}
                        title="Delete banner"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CREATE SECTION MODAL */}
      {showSectionModal && (
        <div style={styles.modalOverlay} onClick={() => setShowSectionModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Add Curated Product Section</h2>
            <p style={styles.modalSub}>
              Configure a dedicated product section (rail or grid) on the customer home screen.
            </p>

            <form onSubmit={handleCreateSection} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Section Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Daily Grocery Essentials"
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Subtitle (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Farm fresh vegetables, grains & pulses"
                  value={sectionSubtitle}
                  onChange={(e) => setSectionSubtitle(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Section Type</label>
                <select
                  value={sectionType}
                  onChange={(e) => setSectionType(e.target.value)}
                  style={styles.select}
                >
                  <option value="CATEGORY_PRODUCTS">Category-Based Products</option>
                  <option value="FEATURED_PRODUCTS">Curated / Featured Products</option>
                </select>
              </div>

              {sectionType === 'CATEGORY_PRODUCTS' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Select Category *</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={styles.select}
                    required
                  >
                    <option value="">-- Choose Category --</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.icon || '🏷️'} {c.name} ({c.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Display Sort Order</label>
                  <input
                    type="number"
                    value={sectionSortOrder}
                    onChange={(e) => setSectionSortOrder(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Max Products</label>
                  <input
                    type="number"
                    value={sectionMaxProducts}
                    onChange={(e) => setSectionMaxProducts(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={{ ...styles.formGroup, display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input
                  type="checkbox"
                  id="secActiveCheck"
                  checked={sectionIsActive}
                  onChange={(e) => setSectionIsActive(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#10b981' }}
                />
                <label htmlFor="secActiveCheck" style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                  Active immediately on customer Home feed
                </label>
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowSectionModal(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={styles.primaryBtn}
                >
                  {actionLoading ? 'Saving...' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE BANNER MODAL */}
      {showBannerModal && (
        <div style={styles.modalOverlay} onClick={() => setShowBannerModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Add Promotional Banner</h2>
            <p style={styles.modalSub}>
              Promotional banner appears in the top carousel on the customer home screen.
            </p>

            <form onSubmit={handleCreateBanner} style={{ marginTop: 16 }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Banner Image URL *</label>
                <input
                  type="url"
                  placeholder="https://.../banner.png"
                  value={bannerImageUrl}
                  onChange={(e) => setBannerImageUrl(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Banner Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fresh Farm Produce Everyday"
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Subtitle (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Directly from local growers"
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Link Action</label>
                  <select
                    value={bannerLinkType}
                    onChange={(e) => setBannerLinkType(e.target.value)}
                    style={styles.select}
                  >
                    <option value="NONE">No Action (Informational)</option>
                    <option value="CATEGORY">Open Category</option>
                    <option value="PRODUCT">Open Product</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Sort Order</label>
                  <input
                    type="number"
                    value={bannerSortOrder}
                    onChange={(e) => setBannerSortOrder(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              {bannerLinkType === 'CATEGORY' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Target Category</label>
                  <select
                    value={bannerLinkTarget}
                    onChange={(e) => setBannerLinkTarget(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- Choose Category --</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c.slug || c._id}>
                        {c.icon || '🏷️'} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ ...styles.formGroup, display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input
                  type="checkbox"
                  id="banActiveCheck"
                  checked={bannerIsActive}
                  onChange={(e) => setBannerIsActive(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#10b981' }}
                />
                <label htmlFor="banActiveCheck" style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                  Active immediately on customer Home carousel
                </label>
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowBannerModal(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={styles.primaryBtn}
                >
                  {actionLoading ? 'Saving...' : 'Create Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '24px 32px',
    maxWidth: '1400px',
    margin: '0 auto',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
  },
  alertError: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  alertSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#f0fdf4',
    color: '#166534',
    border: '1px solid #bbf7d0',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 6px 0'
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
    maxWidth: '680px',
    lineHeight: 1.5
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    color: '#334155',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 16px',
    backgroundColor: '#10b981',
    border: 'none',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(16, 185, 129, 0.2)'
  },
  cancelBtn: {
    padding: '9px 16px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    color: '#334155',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  tabsContainer: {
    display: 'flex',
    gap: '12px',
    borderBottom: '1px solid #e2e8f0',
    marginBottom: '24px'
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  tabBtnActive: {
    color: '#10b981',
    borderBottom: '2px solid #10b981'
  },
  tableCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
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
    padding: '12px 18px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  tr: {
    borderBottom: '1px solid #f1f5f9'
  },
  td: {
    padding: '14px 18px',
    fontSize: '13px',
    color: '#334155',
    verticalAlign: 'middle'
  },
  orderInput: {
    width: '56px',
    padding: '4px 6px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    textAlign: 'center'
  },
  toggleBtn: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid',
    cursor: 'pointer'
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px'
  },
  bannerThumb: {
    width: '90px',
    height: '45px',
    objectFit: 'cover',
    borderRadius: '6px',
    backgroundColor: '#f1f5f9'
  },
  noThumb: {
    width: '90px',
    height: '45px',
    borderRadius: '6px',
    backgroundColor: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    color: '#94a3b8'
  },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  loadingBox: {
    padding: '60px 24px',
    textAlign: 'center'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '520px',
    padding: '28px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 6px 0'
  },
  modalSub: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
    lineHeight: 1.4
  },
  formGroup: {
    marginBottom: '14px'
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    color: '#0f172a',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    color: '#0f172a',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px'
  }
};
