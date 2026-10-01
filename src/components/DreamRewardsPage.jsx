import React, { useState } from 'react';
import {
  Award,
  Bike,
  Car,
  Home,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Send,
  X,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import './DreamRewardsPage.css';

export default function DreamRewardsPage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    partnerRole: 'Village Hub Operator',
    milestoneGoal: 'Dream Bike Plan'
  });

  const rewardTiers = [
    {
      id: 'bike',
      icon: Bike,
      title: 'Dream Bike Plan',
      badge: 'Tier 1 Milestone',
      emoji: '🏍️',
      colorClass: 'amber-tier',
      focus: 'Top-performing Village Hub operators & Digital Partners achieving 6-month continuous aggregation & order targets.',
      highlights: [
        'Brand new premium sports bike or electric scooter',
        'Complete 1-year vehicle insurance coverage',
        'Co-branded Farmart Kisan Ambassador kit'
      ]
    },
    {
      id: 'car',
      icon: Car,
      title: 'Dream Car Plan',
      badge: 'Tier 2 Milestone',
      emoji: '🚗',
      colorClass: 'emerald-tier',
      focus: 'High-achieving Senior Growth Partners & Cluster Managers leading multi-village fulfillment networks.',
      highlights: [
        'Brand new SUV / Sedan of your choice',
        'Zero-downpayment company subsidy grant',
        'National recognition at Annual Farmart Samman'
      ]
    },
    {
      id: 'home',
      icon: Home,
      title: 'Dream Home Plan',
      badge: 'Tier 3 Milestone',
      emoji: '🏡',
      colorClass: 'gold-tier',
      focus: 'Exemplary long-term District & State Leadership partners driving multi-year regional agricultural transformation.',
      highlights: [
        'Home construction & property development grant',
        'Lifetime family health & child education endowment',
        'International Agri-Innovation Study Tour ticket'
      ]
    }
  ];

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'dream-rewards',
          fullName: formData.fullName,
          phone: formData.phone,
          email: 'N/A',
          state: 'N/A',
          district: 'N/A',
          experience: formData.partnerRole,
          notes: `Milestone Goal: ${formData.milestoneGoal}`
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
    <div className="dream-rewards-page">
      {/* 1. Hero Banner */}
      <section className="dr-hero-section">
        <div className="container">
          <div className="dr-hero-card">
            <button className="dr-back-btn" onClick={onBackToEcosystem}>
              ← Back to All Ecosystem Verticals
            </button>

            <div className="dr-badge">
              <Award size={16} />
              <span>Partner Appreciation & Excellence</span>
            </div>

            <h1 className="dr-hero-title">Dream Rewards Program</h1>
            <p className="dr-tagline">"Dream Big. Perform Better. Achieve More."</p>

            <p className="dr-intro-paragraph">
              The Farmart Dream Rewards Program is our premier appreciation framework celebrating the champions who power India’s agri-tech revolution. From exemplary Village Hub operators to top Growth Partners and Nari Shakti leaders, we reward your dedication with tangible vehicle grants, home subsidies, and family security benefits.
            </p>

            <div className="dr-hero-actions">
              <button className="btn btn-earth dr-gold-btn" onClick={() => setShowApplyModal(true)}>
                <span>Track Reward Milestones</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Three Reward Tier Cards Side by Side */}
      <section className="dr-tiers-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Sparkles size={16} />
              <span>Reward Ladder</span>
            </div>
            <h2>Three Reward Tiers</h2>
            <p>Structured milestones designed to reward consistent performance and leadership growth.</p>
          </div>

          <div className="dr-tiers-grid">
            {rewardTiers.map((tier) => {
              const TIcon = tier.icon;
              return (
                <div key={tier.id} className={`dr-tier-card ${tier.colorClass}`}>
                  <div className="tier-badge">{tier.badge}</div>
                  <div className="tier-icon-circle">
                    <TIcon size={36} />
                  </div>
                  <h3 className="tier-title">{tier.title}</h3>
                  <p className="tier-focus">{tier.focus}</p>

                  <ul className="tier-highlights">
                    {tier.highlights.map((h, idx) => (
                      <li key={idx}>
                        <CheckCircle2 size={16} className="h-check" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Performance-Based Recognition Disclaimer Note */}
      <section className="dr-disclaimer-section">
        <div className="container">
          <div className="dr-disclaimer-card">
            <AlertCircle size={28} className="disc-icon" />
            <div>
              <strong className="disc-heading">Performance-Based Recognition Policy:</strong>
              <p className="disc-text">
                "Dream Reward eligibility, vehicle grants, and home subsidies are awarded strictly based on transparent, company-defined performance milestones, minimum active tenure, and verified audit criteria updated quarterly on the Farmart Partner App."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Closing Tagline Banner */}
      <section className="dr-cta-section">
        <div className="container">
          <div className="dr-cta-card">
            <div className="dr-cta-icon">
              <Award size={32} />
            </div>

            <h2 className="dr-cta-tagline">
              "Your Growth. Your Leadership. Your Success."
            </h2>

            <p className="dr-cta-sub">
              Start performing today and unlock your Dream Rewards. Every harvest and order brings you closer to your goal.
            </p>

            <button className="btn btn-earth dr-gold-btn dr-main-btn" onClick={() => setShowApplyModal(true)}>
              <span>Check Eligibility</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Inquiry Modal */}
      {showApplyModal && (
        <div className="dr-modal-overlay">
          <div className="dr-modal-container fade-in">
            <div className="dr-modal-header">
              <h3>Dream Rewards Milestone Tracker Inquiry</h3>
              <button className="modal-close-btn" onClick={() => setShowApplyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="dr-modal-body">
              {submitted ? (
                <div className="dr-submit-success">
                  <CheckCircle2 size={50} className="success-icon" />
                  <h4>Inquiry Submitted!</h4>
                  <p>
                    Thank you. Your Partner Milestone Scorecard will be sent to your mobile via SMS within 2 hours.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="dr-apply-form">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Patel"
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
                    <label>Current Partner Role</label>
                    <select
                      value={formData.partnerRole}
                      onChange={(e) => setFormData({ ...formData, partnerRole: e.target.value })}
                    >
                      <option value="Village Hub Operator">Village Hub Operator</option>
                      <option value="Growth Partner">Growth Partner</option>
                      <option value="Women Entrepreneur">Women Entrepreneur (Nari Shakti)</option>
                      <option value="Digital Business Partner">Digital Business Partner</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Target Dream Reward Milestone</label>
                    <select
                      value={formData.milestoneGoal}
                      onChange={(e) => setFormData({ ...formData, milestoneGoal: e.target.value })}
                    >
                      <option value="Dream Bike Plan">🏍️ Dream Bike Plan</option>
                      <option value="Dream Car Plan">🚗 Dream Car Plan</option>
                      <option value="Dream Home Plan">🏡 Dream Home Plan</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-earth dr-gold-btn full-btn">
                    <Send size={16} />
                    <span>Check My Milestone Points</span>
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
