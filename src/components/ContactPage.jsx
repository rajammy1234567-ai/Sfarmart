import React, { useState } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  MessageSquare,
  Globe,
  User,
  Building2,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import './ContactPage.css';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('General Inquiry');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    state: '',
    district: '',
    message: ''
  });

  const subjectsList = [
    'General Inquiry',
    'Village Hub Partner',
    'Farmer Group / FPO',
    'FOCO Franchise',
    'Bulk B2B Procurement',
    'Media / Press'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          inquiryType: selectedSubject,
          message: `State: ${formData.state}, District: ${formData.district}. Message: ${formData.message}`
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
    <div className="contact-page-wrapper">
      {/* 1. Hero Banner */}
      <section className="cp-hero-section">
        <div className="container">
          <div className="cp-hero-card">
            <div className="cp-badge">
              <MessageSquare size={16} />
              <span>Reach Out & Collaborate</span>
            </div>
            <h1 className="cp-hero-title">Get in Touch with Farmart</h1>
            <p className="cp-hero-desc">
              Have questions, partnership inquiries, or feedback for Farmart? We are here to help you connect with our expansion team.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Main Two-Column Section */}
      <section className="cp-main-section section-padding">
        <div className="container">
          <div className="cp-two-column-grid">
            {/* Left Column: Form */}
            <div className="cp-form-card">
              <div className="form-card-header">
                <h3>Send Us a Message</h3>
                <p className="form-sub-text">Fill out your information and our regional manager will respond within 24 hours.</p>
              </div>

              {/* Subject Selector Chips */}
              <div className="cp-chip-group">
                <label className="cp-chip-label">Inquiry Category:</label>
                <div className="cp-chips-row">
                  {subjectsList.map((subj) => (
                    <button
                      key={subj}
                      type="button"
                      className={`cp-chip-btn ${selectedSubject === subj ? 'active-cp-chip' : ''}`}
                      onClick={() => setSelectedSubject(subj)}
                    >
                      {subj}
                    </button>
                  ))}
                </div>
              </div>

              {submitted ? (
                <div className="cp-success-state fade-in-scale">
                  <div className="cp-success-icon-ring">
                    <CheckCircle2 size={54} />
                  </div>
                  <h4>Message Delivered Successfully!</h4>
                  <p>Thank you for contacting Farmart. Our team will review your query and reply within 24 hours.</p>
                  <div className="cp-ref-badge">Ref ID: FMT-{Math.floor(100000 + Math.random() * 900000)}</div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({ name: '', email: '', phone: '', state: '', district: '', message: '' });
                    }}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="cp-contact-form">
                  <div className="cp-form-grid">
                    <div className="cp-form-group">
                      <label><User size={14} /> Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Anish Sharma"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>

                    <div className="cp-form-group">
                      <label><Phone size={14} /> Phone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 9876543210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>

                    <div className="cp-form-group">
                      <label><Mail size={14} /> Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. anish@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    <div className="cp-form-group">
                      <label><MapPin size={14} /> State *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Maharashtra / Bihar"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      />
                    </div>

                    <div className="cp-form-group full-width-cp">
                      <label><MapPin size={14} /> District / City *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Nashik / Patna"
                        value={formData.district}
                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      />
                    </div>

                    <div className="cp-form-group full-width-cp">
                      <label><MessageSquare size={14} /> Message / Inquiry Details *</label>
                      <textarea
                        rows={4}
                        required
                        placeholder="How can we collaborate? Mention your location or requirements..."
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-earth cp-submit-btn">
                    <Send size={18} />
                    <span>Submit Message</span>
                  </button>
                </form>
              )}
            </div>

            {/* Right Column: Contact Details Card */}
            <div className="cp-info-side">
              <div className="cp-office-card">
                <Building2 size={32} className="cp-building-icon" />
                <h3>Corporate Headquarters</h3>
                <p className="cp-office-addr">
                  Farmart Tower, Sector 4, Outer Ring Road, Bengaluru, Karnataka 560103
                </p>

                <div className="cp-contact-links">
                  <div className="cp-link-item">
                    <Phone size={18} className="cp-icon-green" />
                    <div>
                      <strong>Kisan Toll-Free Helpline</strong>
                      <p>1800-123-FARMART (1800-123-3276)</p>
                      <span className="cp-sub-timing"><Clock size={12} /> Mon - Sat: 7:00 AM - 9:00 PM</span>
                    </div>
                  </div>

                  <div className="cp-link-item">
                    <Mail size={18} className="cp-icon-amber" />
                    <div>
                      <strong>Email Support</strong>
                      <p>officialfarmmart@gmail.com</p>
                    </div>
                  </div>
                </div>

                <div className="cp-regional-presence">
                  <h4>Regional State Hubs</h4>
                  <div className="cp-hubs-grid">
                    <span>MH Hub: Nashik</span>
                    <span>KA Hub: Hassan</span>
                    <span>BR Hub: Patna</span>
                    <span>PB Hub: Khanna</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
