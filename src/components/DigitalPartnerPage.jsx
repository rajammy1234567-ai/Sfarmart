import React, { useState } from 'react';
import {
  Smartphone,
  CheckCircle2,
  TrendingUp,
  Award,
  Users,
  QrCode,
  Globe,
  ShieldCheck,
  Zap,
  ArrowRight,
  Send,
  X,
  Share2,
  BookOpen,
  DollarSign,
  Laptop
} from 'lucide-react';
import './DigitalPartnerPage.css';

export default function DigitalPartnerPage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    city: '',
    currentRole: 'Student'
  });

  const whoCanBecome = [
    { title: 'Student', desc: 'Tech-savvy youth seeking part-time digital income while completing studies.' },
    { title: 'Working Professional', desc: 'Individuals looking for high-margin side hustle & digital revenue streams.' },
    { title: 'Homemaker', desc: 'Women aiming to run a smartphone-based community business from home.' },
    { title: 'Shop Owner', desc: 'Kirana store owners & CSC operators expanding their digital service offerings.' },
    { title: 'Business Enthusiast', desc: 'Local influencers and entrepreneurs building a regional digital commerce network.' }
  ];

  const whatYouWillDo = [
    {
      icon: Users,
      title: 'Onboard Local Customers & Retailers',
      desc: 'Introduce households, Kirana stores, and cloud kitchens to the Farmart app ecosystem.'
    },
    {
      icon: QrCode,
      title: 'Drive App Downloads & QR Scans',
      desc: 'Deploy custom QR codes, referral links, and local promotional banners in your region.'
    },
    {
      icon: Share2,
      title: 'Manage Digital Order Campaigns',
      desc: 'Share daily fresh produce catalogs, organic offers, and discount codes on WhatsApp groups.'
    },
    {
      icon: Smartphone,
      title: 'Assist Villagers with Tech Orders',
      desc: 'Help non-smartphone users place digital orders for farm inputs and household groceries.'
    },
    {
      icon: Globe,
      title: 'Build Local Customer Networks',
      desc: 'Cultivate a loyal base of recurring buyers to earn automated monthly commissions.'
    }
  ];

  const whatYouReceive = [
    { title: 'Custom Referral Link & Unique QR Code', desc: 'Instant trackable digital identity to capture all customer onboarding transactions.' },
    { title: 'Partner Analytics Dashboard', desc: 'Real-time mobile & desktop portal to track active users, order volumes, and earnings.' },
    { title: 'Lifetime Recurring Commissions', desc: 'Earn 5% - 8% on every single order placed by your onboarded customers for life.' },
    { title: 'Digital Marketing Collateral Pack', desc: 'Ready-to-use social media banners, WhatsApp story videos, and printable QR posters.' },
    { title: 'Tech & App Masterclass Training', desc: 'Comprehensive video modules and weekly webinars on digital growth strategies.' },
    { title: 'Weekly Automatic Payouts', desc: 'Automated direct UPI/bank transfers every Monday with detailed earning statements.' },
    { title: 'Dedicated Relationship Manager', desc: '1-on-1 support from a Farmart Tech Account Executive for your regional campaigns.' }
  ];

  const whyChooseHighlights = [
    {
      icon: ShieldCheck,
      title: 'Zero Physical Inventory Risk',
      desc: 'No stock holding or warehousing required. Farmart manages all fulfillment & delivery logistics.'
    },
    {
      icon: DollarSign,
      title: 'High-Margin Recurring Revenue',
      desc: 'Build passive income streams ranging from ₹20,000 to ₹80,000+ per month as your user base scales.'
    },
    {
      icon: Laptop,
      title: 'Work-from-Anywhere Model',
      desc: '100% digital operations powered by your smartphone — operate from home, campus, or office.'
    },
    {
      icon: TrendingUp,
      title: 'High Demand Fresh Network',
      desc: 'Leverage India’s rapidly growing demand for chemical-free farm produce and organic staples.'
    },
    {
      icon: Zap,
      title: 'Transparent Automated Payouts',
      desc: 'No waiting or manual claims. Every order commission is credited directly to your bank account.'
    },
    {
      icon: Award,
      title: 'Recognition & Tech Rewards',
      desc: 'Win smartphones, laptops, study tours, and Dream Reward points for top onboarding milestones.'
    }
  ];

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'digital-partner',
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          state: 'N/A',
          district: formData.city,
          experience: formData.currentRole,
          notes: 'Digital partner application'
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
    <div className="digital-partner-page">
      {/* 1. Hero Banner */}
      <section className="dp-hero-section">
        <div className="container">
          <div className="dp-hero-card">
            <button className="dp-back-btn" onClick={onBackToEcosystem}>
              ← Back to All Ecosystem Verticals
            </button>

            <div className="dp-badge">
              <Smartphone size={16} />
              <span>Tech & Affiliate Vertical</span>
            </div>

            <h1 className="dp-hero-title">Farmart Digital Business Partner</h1>
            <p className="dp-tagline">"Start Your Digital Business with Farmart"</p>

            {/* 2. Intro Paragraph */}
            <p className="dp-intro-paragraph">
              Become a Farmart Digital Business Partner and spearhead the digital transformation of local commerce in your region. Using our powerful mobile app tools, referral systems, and partner dashboard, you can onboard local households, Kirana stores, and home chefs — building a high-margin digital business with lifetime recurring commission streams and zero physical inventory risk.
            </p>

            <div className="dp-hero-actions">
              <button className="btn btn-primary dp-teal-btn" onClick={() => setShowApplyModal(true)}>
                <span>Apply for Digital Partnership</span>
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Request Tech Information Kit</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Who Can Become */}
      <section className="dp-who-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Users size={16} />
              <span>Eligible Profiles</span>
            </div>
            <h2>Who Can Become a Digital Business Partner?</h2>
            <p>Designed for anyone with a smartphone, tech enthusiasm, and drive for community impact.</p>
          </div>

          <div className="dp-who-grid">
            {whoCanBecome.map((item, idx) => (
              <div key={idx} className="dp-who-card">
                <div className="dp-who-num">0{idx + 1}</div>
                <h3 className="dp-who-title">{item.title}</h3>
                <p className="dp-who-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. What You'll Do (Bullet List with Icons) */}
      <section className="dp-do-section section-padding">
        <div className="container">
          <div className="dp-do-wrapper">
            <div className="section-header text-left">
              <div className="badge-tag">
                <Zap size={16} />
                <span>Daily Activities</span>
              </div>
              <h2>What You'll Do</h2>
              <p>Core responsibilities driving customer onboarding and digital sales volume.</p>
            </div>

            <div className="dp-do-grid">
              {whatYouWillDo.map((item, idx) => {
                const DIcon = item.icon;
                return (
                  <div key={idx} className="dp-do-card">
                    <div className="dp-do-icon-box">
                      <DIcon size={24} />
                    </div>
                    <div>
                      <h3 className="dp-do-title">{item.title}</h3>
                      <p className="dp-do-desc">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 5. What You Receive (7 Checklist Cards) */}
      <section className="dp-receive-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Award size={16} />
              <span>Partner Toolkit</span>
            </div>
            <h2>What You Receive</h2>
            <p>Complete tech infrastructure, marketing tools, and dedicated mentorship support.</p>
          </div>

          <div className="dp-receive-grid">
            {whatYouReceive.map((item, idx) => (
              <div key={idx} className="dp-receive-card">
                <div className="dp-receive-check">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="dp-receive-title">{item.title}</h3>
                  <p className="dp-receive-desc">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Why Choose Farmart Digital Business Partner (6 Highlight Points) */}
      <section className="dp-why-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <TrendingUp size={16} />
              <span>Key Advantages</span>
            </div>
            <h2>Why Choose Farmart Digital Business Partner?</h2>
            <p>Build a sustainable, high-income digital business with zero capital risk.</p>
          </div>

          <div className="dp-why-grid">
            {whyChooseHighlights.map((h, idx) => {
              const HIcon = h.icon;
              return (
                <div key={idx} className="dp-why-card">
                  <div className="dp-why-icon-box">
                    <HIcon size={26} />
                  </div>
                  <h3 className="dp-why-title">{h.title}</h3>
                  <p className="dp-why-desc">{h.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. Closing Tagline Banner */}
      <section className="dp-cta-section">
        <div className="container">
          <div className="dp-cta-card">
            <div className="dp-cta-icon">
              <Smartphone size={32} />
            </div>

            <h2 className="dp-cta-tagline">
              "Build Your Digital Business. Serve Your Community. Grow with Farmart."
            </h2>

            <p className="dp-cta-sub">
              Start earning lifetime recurring commissions today. Zero registration fee for early partners.
            </p>

            <button className="btn btn-primary dp-teal-btn dp-main-btn" onClick={() => setShowApplyModal(true)}>
              <span>Apply for Digital Partnership</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Registration Modal */}
      {showApplyModal && (
        <div className="dp-modal-overlay">
          <div className="dp-modal-container fade-in">
            <div className="dp-modal-header">
              <h3>Apply for Digital Business Partnership</h3>
              <button className="modal-close-btn" onClick={() => setShowApplyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="dp-modal-body">
              {submitted ? (
                <div className="dp-submit-success">
                  <CheckCircle2 size={50} className="success-icon" />
                  <h4>Application Submitted!</h4>
                  <p>
                    Thank you for applying. Your unique Digital Partner QR & dashboard link will be sent to your mobile via SMS within 2 hours.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="dp-apply-form">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rohan Verma"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Mobile Number (WhatsApp) *</label>
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
                      placeholder="rohan@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>City & District *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Patna, Bihar"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Current Profession</label>
                    <select
                      value={formData.currentRole}
                      onChange={(e) => setFormData({ ...formData, currentRole: e.target.value })}
                    >
                      <option value="Student">Student / College Youth</option>
                      <option value="Working Professional">Working Professional</option>
                      <option value="Homemaker">Homemaker</option>
                      <option value="Shop Owner">Shop Owner / CSC Operator</option>
                      <option value="Freelancer">Freelancer / Digital Marketer</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-primary dp-teal-btn full-btn">
                    <Send size={16} />
                    <span>Submit Partner Application</span>
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
