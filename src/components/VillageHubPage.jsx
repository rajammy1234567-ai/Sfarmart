import React, { useState } from 'react';
import {
  Home,
  CheckCircle2,
  TrendingUp,
  Award,
  ArrowRight,
  ArrowLeft,
  X,
  Send,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
  Building2,
  DollarSign,
  User,
  Phone,
  MapPin,
  Store,
  Briefcase
} from 'lucide-react';
import './VillageHubPage.css';

export default function VillageHubPage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    village: '',
    district: '',
    state: '',
    spaceAvailable: '100-200 sq.ft',
    profession: ''
  });

  const roles = [
    {
      title: 'Local Aggregation Point',
      desc: 'Collect fresh produce directly from surrounding smallholder farmers with digital weighment.',
      icon: ShoppingBag
    },
    {
      title: 'Community Distribution',
      desc: 'Deliver grocery items, organic thalis, and daily household needs to village doorstep.',
      icon: Truck
    },
    {
      title: 'Digital Order Facilitation',
      desc: 'Help village residents book products, farm inputs, and services through Kisan App.',
      icon: Users
    },
    {
      title: 'Gram Panchayat Anchor',
      desc: 'Act as the primary representative for Farmart programs, payouts, and training workshops.',
      icon: Building2
    }
  ];

  const eligibilityList = [
    'Resident of the local Gram Panchayat or village cluster',
    'Minimum 100 - 200 sq.ft accessible ground-floor space or shop room',
    'Basic smartphone literacy to manage order bookings & digital weighment',
    'Strong community reputation and trust among local farmers and families',
    'Willingness to dedicate 4-6 hours daily to local commerce operations'
  ];

  const benefits = [
    { title: 'Guaranteed Monthly Income', desc: 'Earn steady margins on all local orders, crop aggregation, and value-added deliveries.' },
    { title: 'Zero Franchise Fee', desc: 'No heavy upfront capital required. Farmart provides technology kits, weighment, and branding.' },
    { title: 'Exclusive Territory Rights', desc: 'Exclusive Village Hub coordinator rights for your designated Gram Panchayat area.' },
    { title: '24-Hour Payout Settlement', desc: 'Instant digital wallet settlements for all trade transactions and farmer payouts.' },
    { title: 'Branding & Marketing Support', desc: 'Receive official Farmart glow-sign boards, promotional banners, and uniform kits.' },
    { title: 'Continuous Field Training', desc: 'Dedicated field officer support and ongoing business development workshops.' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'village-hub',
          fullName: formData.fullName,
          phone: formData.phone,
          email: 'N/A',
          state: formData.state,
          district: formData.district,
          experience: formData.profession,
          notes: `Village: ${formData.village}, Space Available: ${formData.spaceAvailable}`
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
    <div className="village-hub-page-wrapper">
      {/* Top Floating Back Bar */}
      <div className="vh-top-back-bar">
        <div className="container">
          <button className="vh-back-btn" onClick={onBackToEcosystem}>
            <ArrowLeft size={18} />
            <span>Back to All Verticals</span>
          </button>
        </div>
      </div>

      {/* 1. Hero Banner */}
      <section className="vh-hero-section">
        <div className="container">
          <div className="vh-hero-card">
            <div className="vh-badge">
              <Home size={16} />
              <span>Village Hub Model</span>
            </div>
            
            <h1 className="vh-hero-title">Farmart Village Hub</h1>
            <p className="vh-hero-subtitle">Empowering Gram Panchayat Communities • Connecting Farmers & Households</p>

            <p className="vh-intro-paragraph">
              The Farmart Village Hub is the vital local connection point bridging customers, smallholder farmers, rural entrepreneurs, and the broader Farmart agri-tech ecosystem. Operating directly at the Gram Panchayat level, it transforms local trade, ensures fair farm prices, and brings fresh produce and essential services right to every village doorstep.
            </p>

            <div className="vh-hero-actions">
              <button className="btn btn-earth pulse-glow-button" onClick={() => setShowApplyModal(true)}>
                <Sparkles size={18} />
                <span>Apply for Village Hub</span>
              </button>

              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Speak to Regional Officer</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Role of a Village Hub */}
      <section className="vh-roles-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Sparkles size={16} />
              <span>Core Responsibilities</span>
            </div>
            <h2>Role of a Village Hub</h2>
            <p>
              How Village Hub partners drive daily community commerce and agricultural progress.
            </p>
          </div>

          <div className="vh-roles-grid">
            {roles.map((role, idx) => {
              const RoleIcon = role.icon;
              return (
                <div key={idx} className="vh-role-card">
                  <div className="vh-role-icon-box">
                    <RoleIcon size={24} />
                  </div>
                  <h3 className="vh-role-title">{role.title}</h3>
                  <p className="vh-role-desc">{role.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Who Can Become a Village Hub */}
      <section className="vh-eligibility-section section-padding">
        <div className="container">
          <div className="vh-eligibility-wrapper">
            <div className="vh-eligibility-content">
              <div className="badge-tag">
                <CheckCircle2 size={16} />
                <span>Eligibility Criteria</span>
              </div>
              <h2>Who Can Become a Village Hub?</h2>
              <p className="eligibility-sub">
                We welcome passionate individuals and local business owners committed to growing their village economy.
              </p>

              <ul className="vh-eligibility-list">
                {eligibilityList.map((item, idx) => (
                  <li key={idx}>
                    <CheckCircle2 size={20} className="check-icon" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <button className="btn btn-earth vh-check-btn" onClick={() => setShowApplyModal(true)}>
                <span>Check Your Village Location Availability</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Benefits Section (6 Cards with Checkmarks) */}
      <section className="vh-benefits-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Award size={16} />
              <span>Partner Advantages</span>
            </div>
            <h2>Benefits of Partnering with Farmart</h2>
            <p>
              Comprehensive support, digital tools, and financial rewards designed for long-term development.
            </p>
          </div>

          <div className="vh-benefits-grid">
            {benefits.map((b, idx) => (
              <div key={idx} className="vh-benefit-card">
                <div className="benefit-check-circle">
                  <CheckCircle2 size={22} />
                </div>
                <div className="benefit-text-box">
                  <h3>{b.title}</h3>
                  <p>{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Closing Banner */}
      <section className="vh-closing-section section-padding">
        <div className="container">
          <div className="vh-closing-banner">
            <h2>Empower Your Village. Lead Community Trade. Grow with Farmart.</h2>
            <p>Join thousands of Village Hub partners building sustainable rural prosperity.</p>
            <button className="btn btn-earth" onClick={() => setShowApplyModal(true)}>
              <span>Apply for Village Hub Now</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Redesigned Ultra-Attractive Village Hub Apply Modal */}
      {showApplyModal && (
        <div className="vh-modal-overlay" onClick={() => setShowApplyModal(false)}>
          <div className="vh-modal-container spring-pop-animated" onClick={(e) => e.stopPropagation()}>
            
            {/* Cover Photo Header */}
            <div className="vh-modal-cover">
              <img src="/village_hub.png" alt="Farmart Village Hub" className="vh-cover-img" />
              <div className="vh-cover-overlay"></div>

              <div className="vh-cover-content">
                <span className="vh-modal-badge">
                  <Home size={14} />
                  <span>Gram Panchayat Village Hub</span>
                </span>
                <h2>Apply for Farmart Village Hub</h2>
                <p>Register your interest to become an authorized Village Hub coordinator in your Panchayat area.</p>
              </div>

              <button className="vh-modal-close" onClick={() => setShowApplyModal(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>

            <div className="vh-modal-body">
              {submitted ? (
                <div className="vh-modal-success">
                  <div className="success-icon-ring">
                    <CheckCircle2 size={56} />
                  </div>
                  <h3>Village Hub Application Received!</h3>
                  <p>
                    Thank you for applying to become a <strong>Farmart Village Hub Partner</strong>. Our Regional Operations Director will verify your Panchayat location and contact you within 24 hours.
                  </p>
                  <div className="vh-ref-badge">Hub Ref ID: FMT-HUB-{Math.floor(100000 + Math.random() * 900000)}</div>
                  <button className="btn btn-secondary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close Window
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="vh-modal-form">
                  <div className="form-grid-2col">
                    <div className="field-group">
                      <label><User size={14} /> Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Suresh Patel"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      />
                    </div>

                    <div className="field-group">
                      <label><Phone size={14} /> Mobile Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 9876543210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>

                    <div className="field-group">
                      <label><MapPin size={14} /> Village / Gram Panchayat *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rampur Gram Panchayat"
                        value={formData.village}
                        onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                      />
                    </div>

                    <div className="field-group">
                      <label><MapPin size={14} /> District *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Nashik / Patna"
                        value={formData.district}
                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      />
                    </div>

                    <div className="field-group">
                      <label><MapPin size={14} /> State *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Maharashtra / Bihar"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      />
                    </div>

                    <div className="field-group">
                      <label><Store size={14} /> Space Available for Hub</label>
                      <select
                        value={formData.spaceAvailable}
                        onChange={(e) => setFormData({ ...formData, spaceAvailable: e.target.value })}
                      >
                        <option value="100-200 sq.ft">100 - 200 sq.ft Room / Shop</option>
                        <option value="200-500 sq.ft">200 - 500 sq.ft Large Space</option>
                        <option value="500+ sq.ft">500+ sq.ft (Mini Store Space)</option>
                      </select>
                    </div>

                    <div className="field-group full-width-field">
                      <label><Briefcase size={14} /> Current Profession / Background</label>
                      <input
                        type="text"
                        placeholder="e.g. Local Shopkeeper / Farmer / SHG Leader"
                        value={formData.profession}
                        onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-earth vh-submit-btn">
                    <Send size={18} />
                    <span>Submit Hub Application</span>
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
