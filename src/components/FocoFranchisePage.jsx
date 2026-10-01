import React, { useState } from 'react';
import {
  Store,
  CheckCircle2,
  TrendingUp,
  Award,
  ShieldCheck,
  Building2,
  DollarSign,
  Briefcase,
  Users,
  ArrowRight,
  Send,
  X,
  AlertCircle,
  Clock,
  Cpu,
  Layers
} from 'lucide-react';
import './FocoFranchisePage.css';

export default function FocoFranchisePage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    proposedCity: '',
    investmentCapacity: '₹25L - ₹50L'
  });

  const ownerResponsibilities = [
    'Store Location Capital & Lease Agreement',
    'Store Fitouts, Signage & Initial Infrastructure Investment',
    'Primary Asset Ownership (Land / Commercial Space)',
    'Participation in Monthly Financial Audits & Reviews'
  ];

  const farmartResponsibilities = [
    'Complete Store Operations & Daily Retail Management',
    'Staffing, Hiring, HR Payroll & Continuous Training',
    'Enterprise POS, Inventory ERP & IoT Cold Display Counters',
    'Regional Marketing, Digital Ad Campaigns & Store Footfall Growth',
    'Standard Operating Procedures (SOPs) & Brand Standards',
    'Inventory Shrinkage, Quality Control & Waste Management',
    'Direct Daily Farm-Gate Harvest Replenishment'
  ];

  const benefits = [
    { title: '100% Hands-Free Passive Income', desc: 'Enjoy monthly profit payouts while Farmart manages 100% of daily store operations.' },
    { title: 'High Target IRR & ROI (24%-32%)', desc: 'Attractive, high-yield investment returns with an estimated 18-month payback cycle.' },
    { title: 'Complete Corporate Management', desc: 'Professional retail store managers, staff hiring, and daily inventory optimization.' },
    { title: 'IoT Cold Chain & Automated POS', desc: 'Smart temperature-monitored display cases and cloud-integrated barcode billing.' },
    { title: 'Direct Farm-Gate Replenishment', desc: 'Fresh morning harvest delivery directly from regional Farmart Village Hubs.' },
    { title: 'Real-Time Investor Dashboard', desc: 'Mobile portal offering 24/7 visibility into sales, footfall, inventory, and margin metrics.' },
    { title: 'Store Insurance & Loss Protection', desc: 'Comprehensive asset insurance and corporate loss mitigation coverage.' },
    { title: 'High Footfall Brand Backing', desc: 'Capitalize on Farmart pan-India brand reputation and omnichannel marketing.' }
  ];

  const whoCanApply = [
    'Real Estate & Property Owners seeking high rental yield or profit-share returns on commercial space.',
    'Angel Investors & Business Owners looking for hands-off passive income in high-demand agri-retail.',
    'Serial Entrepreneurs looking to diversify their investment portfolio into fresh produce retail.',
    'Retail Professionals & Corporate Executives aiming to own a lucrative retail franchise.'
  ];

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'foco-franchise',
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          state: 'N/A',
          district: formData.proposedCity,
          experience: formData.investmentCapacity,
          notes: 'FOCO Franchise application'
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
    <div className="foco-franchise-page">
      {/* 1. Hero Banner */}
      <section className="foco-hero-section">
        <div className="container">
          <div className="foco-hero-card">
            <button className="foco-back-btn" onClick={onBackToEcosystem}>
              ← Back to All Ecosystem Verticals
            </button>

            <div className="foco-badge">
              <Store size={16} />
              <span>Investment Grade Retail Model</span>
            </div>

            <h1 className="foco-hero-title">Farmart FOCO Model</h1>
            <p className="foco-tagline">"Franchise Owned • Company Operated — Own the Business. We Operate It."</p>

            {/* 2. Intro Paragraph */}
            <p className="foco-intro-paragraph">
              The Farmart FOCO (Franchise-Owned, Company-Operated) model offers smart investors and property owners a premium, hands-off entry into India's multi-billion dollar fresh produce retail market. You own the store location and capital assets, while Farmart's corporate retail team manages 100% of daily store operations, staffing, inventory logistics, and technology — delivering attractive, hassle-free monthly profit payouts.
            </p>

            <div className="foco-hero-actions">
              <button className="btn btn-earth foco-gold-btn" onClick={() => setShowApplyModal(true)}>
                <span>Apply for FOCO Franchise</span>
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Download Investor Prospectus</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Two-Column Comparison */}
      <section className="foco-compare-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Layers size={16} />
              <span>Clear Division of Roles</span>
            </div>
            <h2>Operational Responsibility Matrix</h2>
            <p>A transparent breakdown of how responsibilities are shared between the Franchise Owner and Farmart.</p>
          </div>

          <div className="foco-compare-grid">
            {/* Owner Column */}
            <div className="compare-card owner-card">
              <div className="compare-header owner-header">
                <div className="compare-icon-box owner-icon">
                  <Briefcase size={26} />
                </div>
                <div>
                  <span className="compare-tag">Investor Role</span>
                  <h3>Franchise Owner Responsibilities</h3>
                </div>
              </div>

              <ul className="compare-list">
                {ownerResponsibilities.map((item, idx) => (
                  <li key={idx}>
                    <CheckCircle2 size={18} className="check-gold" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Farmart Column */}
            <div className="compare-card farmart-card">
              <div className="compare-header farmart-header">
                <div className="compare-icon-box farmart-icon">
                  <Building2 size={26} />
                </div>
                <div>
                  <span className="compare-tag green-tag">Corporate Role</span>
                  <h3>Farmart Corporate Responsibilities</h3>
                </div>
              </div>

              <ul className="compare-list">
                {farmartResponsibilities.map((item, idx) => (
                  <li key={idx}>
                    <CheckCircle2 size={18} className="check-green" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Why Choose Farmart FOCO Model (8 Checklist Cards) */}
      <section className="foco-benefits-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Award size={16} />
              <span>Investor Advantages</span>
            </div>
            <h2>Why Choose Farmart FOCO Model?</h2>
            <p>Engineered for high capital efficiency, hands-free operation, and risk mitigation.</p>
          </div>

          <div className="foco-benefits-grid">
            {benefits.map((b, idx) => (
              <div key={idx} className="foco-benefit-card">
                <div className="foco-benefit-check">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="foco-benefit-title">{b.title}</h3>
                  <p className="foco-benefit-desc">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Who Can Apply */}
      <section className="foco-apply-section section-padding">
        <div className="container">
          <div className="foco-apply-wrapper">
            <div className="section-header text-left">
              <div className="badge-tag">
                <Users size={16} />
                <span>Investor Eligibility</span>
              </div>
              <h2>Who Can Apply?</h2>
              <p>Suitable for individuals and institutions looking for premium passive retail income.</p>
            </div>

            <div className="foco-apply-list">
              {whoCanApply.map((item, idx) => (
                <div key={idx} className="foco-apply-item">
                  <CheckCircle2 size={20} className="foco-check-icon" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Location Availability Note Banner */}
      <section className="foco-note-section">
        <div className="container">
          <div className="foco-note-banner">
            <AlertCircle size={28} className="note-alert-icon" />
            <div>
              <strong className="note-heading">Location Expansion Policy:</strong>
              <p className="note-text">
                "The Farmart FOCO Model is available in selected locations based on company expansion criteria and operational readiness."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Closing Tagline Banner */}
      <section className="foco-cta-section">
        <div className="container">
          <div className="foco-cta-card">
            <div className="foco-cta-icon">
              <Store size={32} />
            </div>

            <h2 className="foco-cta-tagline">
              "Invest with Confidence. Operate with Excellence. Grow with Farmart."
            </h2>

            <p className="foco-cta-sub">
              Partner with India's leading agri-tech retail chain. Schedule a site feasibility assessment today.
            </p>

            <button className="btn btn-earth foco-gold-btn foco-main-btn" onClick={() => setShowApplyModal(true)}>
              <span>Apply Now</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Application Modal */}
      {showApplyModal && (
        <div className="foco-modal-overlay">
          <div className="foco-modal-container fade-in">
            <div className="foco-modal-header">
              <h3>Apply for FOCO Franchise Investment</h3>
              <button className="modal-close-btn" onClick={() => setShowApplyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="foco-modal-body">
              {submitted ? (
                <div className="foco-submit-success">
                  <CheckCircle2 size={50} className="success-icon" />
                  <h4>Investor Application Received!</h4>
                  <p>
                    Thank you for applying. Our VP of Retail Franchise Expansion will contact you within 24 hours for a private consultation.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="foco-apply-form">
                  <div className="form-group">
                    <label>Full Name / Corporate Entity *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rajesh Singhania"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="rajesh@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Proposed Store City & Location *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nashik Road, Nashik"
                      value={formData.proposedCity}
                      onChange={(e) => setFormData({ ...formData, proposedCity: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Investment Capacity Range</label>
                    <select
                      value={formData.investmentCapacity}
                      onChange={(e) => setFormData({ ...formData, investmentCapacity: e.target.value })}
                    >
                      <option value="₹15L - ₹25L">₹15L - ₹25L</option>
                      <option value="₹25L - ₹50L">₹25L - ₹50L</option>
                      <option value="₹50L - ₹1Cr">₹50L - ₹1Cr</option>
                      <option value="₹1Cr+">₹1Cr+ (Multi-Store Portfolio)</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-earth foco-gold-btn full-btn">
                    <Send size={16} />
                    <span>Submit FOCO Application</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
