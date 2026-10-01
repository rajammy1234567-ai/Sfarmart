import React, { useState } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Send,
  CheckCircle2,
  MessageSquare,
  User,
  Building2,
  Sparkles,
  ShieldCheck,
  Clock
} from 'lucide-react';
import './ContactSection.css';

export default function ContactSection() {
  const [submitted, setSubmitted] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Village Hub');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    state: '',
    district: '',
    message: ''
  });

  const categoriesList = [
    { label: '🌾 Village Hub', value: 'Village Hub' },
    { label: '🏪 FOCO Franchise', value: 'FOCO Franchise' },
    { label: '👩‍🍳 Home Restro', value: 'Home Restro' },
    { label: '🚜 Farmer Group', value: 'Farmer Group' },
    { label: '📲 Digital Partner', value: 'Digital Partner' },
    { label: '💼 Corporate / B2B', value: 'Corporate B2B' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: selectedCategory,
          fullName: formData.name,
          phone: formData.phone,
          email: formData.email,
          state: formData.state,
          district: formData.district,
          experience: 'N/A',
          notes: formData.message || 'No additional message'
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
    <section id="contact" className="contact-section section-padding">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="badge-tag contact-live-tag">
            <Sparkles size={16} className="sparkle-pulse" />
            <span>PARTNER WITH FARMART</span>
          </div>
          <h2>
            Let's Build Bharat's <span className="gradient-text">Agri-Tech Future Together</span>
          </h2>
          <p>
            Whether you are a farmer group, prospective Village Hub coordinator, home chef, or retail franchise investor — submit your details for an immediate callback.
          </p>
        </div>

        <div className="contact-grid">
          {/* Left Info Card */}
          <div className="contact-info-card">
            <div className="info-card-header">
              <Building2 size={28} className="info-building-icon" />
              <div>
                <h3>Farmart National Headquarters</h3>
                <span>Serving 50,000+ Farmers Across India</span>
              </div>
            </div>

            <div className="info-details-list">
              <div className="info-detail-item">
                <div className="icon-circle green-circle">
                  <MapPin size={20} />
                </div>
                <div>
                  <strong>Head Office & Technology Lab</strong>
                  <p>Farmart Tower, Sector 4, Outer Ring Road, Bengaluru, KA 560103</p>
                </div>
              </div>

              <div className="info-detail-item">
                <div className="icon-circle amber-circle">
                  <Phone size={20} />
                </div>
                <div>
                  <strong>Kisan Toll-Free Helpline</strong>
                  <p className="phone-highlight">1800-123-FARMART (1800-123-3276)</p>
                  <span className="timing-sub"><Clock size={12} /> Mon - Sat: 7:00 AM - 9:00 PM</span>
                </div>
              </div>

              <div className="info-detail-item">
                <div className="icon-circle green-circle">
                  <Mail size={20} />
                </div>
                <div>
                  <strong>Email Inquiries</strong>
                  <p>officialfarmmart@gmail.com</p>
                </div>
              </div>
            </div>

            {/* Trust Footer */}
            <div className="info-trust-banner">
              <ShieldCheck size={20} className="shield-icon-green" />
              <span>Registered under National Agri-Tech & Rural Enterprise Mission</span>
            </div>
          </div>

          {/* Right Ultra-Attractive Form */}
          <div className="contact-form-card">
            {submitted ? (
              <div className="form-success-view fade-in-scale">
                <div className="success-icon-wrapper">
                  <CheckCircle2 size={64} />
                </div>
                <h3>Application Submitted Successfully!</h3>
                <p>
                  Thank you for reaching out to <strong>Farmart</strong>. Your regional manager will call you within 24 hours.
                </p>
                <div className="ticket-ref-box">
                  <span>Reference ID: FMT-{Math.floor(100000 + Math.random() * 900000)}</span>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({ name: '', phone: '', email: '', state: '', district: '', message: '' });
                  }}
                >
                  Submit Another Inquiry
                </button>
              </div>
            ) : (
              <form className="attractive-form" onSubmit={handleSubmit}>
                <div className="form-header-title">
                  <h3>Get Started / Send Inquiry</h3>
                  <p>Select your vertical interest & fill out the quick form below.</p>
                </div>

                {/* Vertical Selector Pill Chips */}
                <div className="vertical-chips-container">
                  <label className="chips-label">I want to apply for:</label>
                  <div className="chips-row">
                    {categoriesList.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        className={`chip-btn ${selectedCategory === cat.value ? 'active-chip' : ''}`}
                        onClick={() => setSelectedCategory(cat.value)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form Fields Grid */}
                <div className="form-fields-grid">
                  <div className="field-group">
                    <label><User size={14} /> Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Anish Kumar"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                    <label><Mail size={14} /> Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. anish@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                    <label><MapPin size={14} /> District / City *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nashik / Patna"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field-group full-width-field">
                  <label><MessageSquare size={14} /> Message / Business Objectives</label>
                  <textarea
                    rows={3}
                    placeholder="Tell us briefly about your location or business goals..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  />
                </div>

                <button type="submit" className="btn btn-earth form-main-submit-btn">
                  <Send size={18} />
                  <span>Submit Partner Inquiry</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
