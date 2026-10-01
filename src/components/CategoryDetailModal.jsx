import React, { useState } from 'react';
import {
  X,
  ArrowLeft,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Briefcase,
  Layers,
  Send,
  Sparkles,
  ShieldCheck,
  Award,
  Zap,
  Phone,
  User,
  Mail,
  MapPin
} from 'lucide-react';
import './CategoryDetailModal.css';

export default function CategoryDetailModal({ category, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    state: '',
    district: '',
    experience: '',
    notes: ''
  });

  if (!category) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: category.id,
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          state: formData.state,
          district: formData.district,
          experience: formData.experience,
          notes: formData.notes
        })
      });
      const data = await response.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        alert(data.message || 'Something went wrong.');
      }
    } catch (error) {
      console.error(error);
      alert('Could not connect to server.');
    }
  };

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div className="detail-modal-container spring-pop-animated" onClick={(e) => e.stopPropagation()}>
        {/* Top Floating Close Bar */}
        <div className="modal-top-floating-bar">
          <button className="back-link-btn" onClick={onClose}>
            <ArrowLeft size={18} />
            <span>Back to Ecosystem</span>
          </button>
          <button className="modal-circle-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Hero Visual Cover Image Header */}
        <div className="detail-hero-cover">
          <img
            src={category.image || '/hero.png'}
            alt={category.title}
            className="cover-bg-image"
            onError={(e) => { e.target.src = '/hero.png'; }}
          />
          <div className="cover-overlay-gradient"></div>

          <div className="cover-content-box">
            <div className="cover-badge-pill">
              <Sparkles size={14} />
              <span>{category.badge}</span>
            </div>

            <h2 className="cover-title">{category.title}</h2>
            <p className="cover-subtitle">{category.fullDesc || category.shortDesc}</p>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="detail-tab-strip">
          <button
            className={`strip-tab-btn ${activeTab === 'overview' ? 'active-strip-tab' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Layers size={16} />
            <span>Key Benefits</span>
          </button>

          <button
            className={`strip-tab-btn ${activeTab === 'growth' ? 'active-strip-tab' : ''}`}
            onClick={() => setActiveTab('growth')}
          >
            <TrendingUp size={16} />
            <span>Growth Path</span>
          </button>

          <button
            className={`strip-tab-btn apply-tab-highlight ${activeTab === 'apply' ? 'active-strip-tab' : ''}`}
            onClick={() => setActiveTab('apply')}
          >
            <Zap size={16} />
            <span>Apply Now</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="detail-modal-body">
          {activeTab === 'overview' && (
            <div className="tab-pane-content fade-in-smooth">
              <div className="pane-section-header">
                <h3>Program Benefits & Key Offerings</h3>
                <p>Explore what makes partnering with Farmart {category.title} highly rewarding:</p>
              </div>

              <div className="attractive-cards-grid">
                {(category.highlights || category.benefits || []).map((item, idx) => (
                  <div key={idx} className="attractive-benefit-card">
                    <div className="benefit-icon-ring">
                      <CheckCircle2 size={20} />
                    </div>
                    <div className="benefit-card-text">
                      <h4>{item}</h4>
                      <p>Complete operational setup, technology platform access, and continuous guidance.</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-banner-cta">
                <div className="cta-banner-text">
                  <ShieldCheck size={28} className="shield-icon" />
                  <div>
                    <h4>Ready to Launch Your Farmart {category.shortLabel} Journey?</h4>
                    <p>Submit your interest today and receive a callback from our expansion director.</p>
                  </div>
                </div>
                <button className="btn btn-earth modal-cta-btn" onClick={() => setActiveTab('apply')}>
                  <span>Apply Now</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'growth' && (
            <div className="tab-pane-content fade-in-smooth">
              <div className="pane-section-header">
                <h3>Growth Roadmap & Milestones</h3>
                <p>Structured development path from initial onboarding to regional leadership:</p>
              </div>

              <div className="roadmap-timeline-stack">
                {(category.growthSteps || []).map((step, idx) => (
                  <div key={idx} className="timeline-step-card">
                    <div className="timeline-num-badge">0{idx + 1}</div>
                    <div className="timeline-step-info">
                      <h4>{step.title}</h4>
                      <p>{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'apply' && (
            <div className="tab-pane-content fade-in-smooth">
              {submitted ? (
                <div className="attractive-success-box">
                  <div className="success-icon-ring">
                    <CheckCircle2 size={54} />
                  </div>
                  <h3>Partner Inquiry Received!</h3>
                  <p>
                    Thank you for your interest in <strong>Farmart {category.title}</strong>. Our Regional Expansion Manager will contact you on your registered phone within 24 hours.
                  </p>
                  <div className="ref-badge-tag">Ref Code: FMT-{Math.floor(100000 + Math.random() * 900000)}</div>
                  <button className="btn btn-secondary" onClick={() => setSubmitted(false)}>
                    Submit Another Inquiry
                  </button>
                </div>
              ) : (
                <form className="attractive-apply-form" onSubmit={handleSubmit}>
                  <div className="form-title-block">
                    <h3>Apply for {category.title}</h3>
                    <p>Please enter your contact & location details below.</p>
                  </div>

                  <div className="form-input-grid">
                    <div className="input-field-group">
                      <label><User size={14} /> Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Anish Sharma"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      />
                    </div>

                    <div className="input-field-group">
                      <label><Phone size={14} /> Mobile Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 9876543210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>

                    <div className="input-field-group">
                      <label><Mail size={14} /> Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. anish@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    <div className="input-field-group">
                      <label><MapPin size={14} /> State *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Maharashtra / Bihar"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      />
                    </div>

                    <div className="input-field-group">
                      <label><MapPin size={14} /> District / City *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Nashik / Patna"
                        value={formData.district}
                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      />
                    </div>

                    <div className="input-field-group">
                      <label><Briefcase size={14} /> Current Profession</label>
                      <input
                        type="text"
                        placeholder="e.g. Business / Farmer / Homemaker"
                        value={formData.experience}
                        onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                      />
                    </div>

                    <div className="input-field-group full-row">
                      <label>Additional Information / Objectives</label>
                      <textarea
                        rows={3}
                        placeholder="Tell us briefly about your location or business plans..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary form-submit-btn">
                    <Send size={16} />
                    <span>Submit Partner Application</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
