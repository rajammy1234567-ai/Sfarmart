import React, { useState } from 'react';
import {
  TrendingUp,
  Award,
  Users,
  ShieldCheck,
  CheckCircle2,
  Building2,
  BookOpen,
  Smartphone,
  Megaphone,
  Briefcase,
  ArrowRight,
  Send,
  X,
  Target,
  Globe
} from 'lucide-react';
import './GrowthPartnerPage.css';

export default function GrowthPartnerPage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    city: '',
    state: '',
    experienceYears: '3-5 years'
  });

  const responsibilities = [
    {
      icon: TrendingUp,
      title: 'City-Level Business Leadership',
      desc: 'Lead strategic market expansion, revenue growth, and commercial operations across your assigned urban & semi-urban territory.'
    },
    {
      icon: Users,
      title: 'Village Hub Network Onboarding',
      desc: 'Mentor, train, and expand Gram Panchayat Village Hub operators and rural micro-entrepreneurs in your cluster.'
    },
    {
      icon: Building2,
      title: 'Bulk B2B & Supply Chain Scaling',
      desc: 'Connect corporate buyers, retail chains, and food processors directly with Farmart farm-gate procurement hubs.'
    },
    {
      icon: Megaphone,
      title: 'Brand Awareness & Local Marketing',
      desc: 'Drive regional brand campaigns, trade meets, and Kisan awareness concls to establish market dominance.'
    },
    {
      icon: Target,
      title: 'Operational Excellence & Quality',
      desc: 'Ensure 100% adherence to quality grading, batch cold-chain logistics, and customer SLA fulfillment.'
    }
  ];

  const applicantCriteria = [
    'Leadership skills and proven track record of team or business management.',
    'Excellent communication and interpersonal relationship-building ability.',
    'Strong business mindset, financial acumen, and entrepreneurial drive.',
    'Deep commitment to community empowerment and rural agricultural development.',
    'Willingness to learn, innovate, and leverage tech-enabled supply chain tools.'
  ];

  const benefits = [
    {
      title: 'Official Business Partnership',
      desc: 'Exclusive city-level franchise rights with direct backing from Farmart corporate.'
    },
    {
      title: 'Area Growth Responsibility',
      desc: 'Ownership of high-growth urban corridors and Gram Panchayat cluster revenues.'
    },
    {
      title: 'Leadership Training',
      desc: 'Executive business coaching, operational workshops, and agri-tech masterclasses.'
    },
    {
      title: 'Digital Platform Access',
      desc: 'Full enterprise dashboard, B2B procurement portal, and real-time analytics.'
    },
    {
      title: 'Marketing Support',
      desc: 'Dedicated regional ad budgets, promotional events, collateral, and PR support.'
    },
    {
      title: 'Business Operating System',
      desc: 'Turnkey SOPs, supply chain playbooks, and automated logistics management.'
    },
    {
      title: 'Continuous Development',
      desc: 'Regular skill enhancement programs, corporate retreats, and industry exposure.'
    },
    {
      title: 'Performance Recognition',
      desc: 'High-yield profit share, annual equity performance bonuses, and study tours.'
    }
  ];

  const growthPathSteps = [
    {
      stepNum: '01',
      title: 'Growth Partner',
      badge: 'City Leadership',
      desc: 'Manage city-level commercial distribution, B2B procurement, and 15-20 local Village Hubs.',
      icon: TrendingUp
    },
    {
      stepNum: '02',
      title: 'Senior Growth Partner',
      badge: 'Multi-City Cluster',
      desc: 'Expand leadership across 3-5 adjacent cities, scaling supply chain volume and revenue share.',
      icon: Target
    },
    {
      stepNum: '03',
      title: 'District Leadership',
      badge: 'District Executive',
      desc: 'Oversee entire district operations, FPO partnerships, regional hubs, and enterprise accounts.',
      icon: Building2
    },
    {
      stepNum: '04',
      title: 'State Leadership',
      badge: 'State Director',
      desc: 'Join Farmart executive state board managing state-wide strategy, government linkages & expansion.',
      icon: Globe
    }
  ];

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'growth-partner',
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          state: formData.state,
          district: formData.city,
          experience: formData.experienceYears,
          notes: 'Growth partner application'
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
    <div className="growth-partner-page">
      {/* 1. Hero Banner */}
      <section className="gp-hero-section">
        <div className="container">
          <div className="gp-hero-card">
            <button className="gp-back-btn" onClick={onBackToEcosystem}>
              ← Back to All Ecosystem Verticals
            </button>

            <div className="gp-badge">
              <TrendingUp size={16} />
              <span>Enterprise & City Leadership</span>
            </div>

            <h1 className="gp-hero-title">Farmart Growth Partner</h1>
            <p className="gp-tagline">"Lead. Grow. Build Your City with Farmart."</p>

            {/* 2. Intro Paragraph */}
            <p className="gp-intro-paragraph">
              As a Farmart Growth Partner, you hold the key city-level leadership role driving regional agri-business expansion, Village Hub network scaling, and urban-rural trade operations. You serve as the strategic business anchor connecting corporate buyers, local entrepreneurs, and grass-root producers to build a thriving, high-impact commerce ecosystem.
            </p>

            <div className="gp-hero-actions">
              <button className="btn btn-primary" onClick={() => setShowApplyModal(true)}>
                <span>Apply for Growth Partnership</span>
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Request Executive Briefing</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Your Responsibilities */}
      <section className="gp-resp-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Target size={16} />
              <span>Leadership Scope</span>
            </div>
            <h2>Your Responsibilities</h2>
            <p>
              Key operational and strategic functions managed by Growth Partners to dominate regional markets.
            </p>
          </div>

          <div className="gp-resp-grid">
            {responsibilities.map((r, idx) => {
              const RIcon = r.icon;
              return (
                <div key={idx} className="gp-resp-card">
                  <div className="gp-resp-icon-box">
                    <RIcon size={24} />
                  </div>
                  <h3 className="gp-resp-title">{r.title}</h3>
                  <p className="gp-resp-desc">{r.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Who Can Apply */}
      <section className="gp-criteria-section section-padding">
        <div className="container">
          <div className="gp-criteria-wrapper">
            <div className="badge-tag">
              <CheckCircle2 size={16} />
              <span>Candidate Profile</span>
            </div>
            <h2>Who Can Apply?</h2>
            <p className="criteria-sub">
              We look for visionary leaders and experienced professionals eager to lead city-wide commerce networks.
            </p>

            <ul className="gp-criteria-list">
              {applicantCriteria.map((item, idx) => (
                <li key={idx}>
                  <CheckCircle2 size={20} className="gp-check-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button className="btn btn-earth gp-check-btn" onClick={() => setShowApplyModal(true)}>
              <span>Submit Your City Application</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* 5. What You Receive (8 Benefit Cards with Checkmarks) */}
      <section className="gp-benefits-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Award size={16} />
              <span>Partnership Deliverables</span>
            </div>
            <h2>What You Receive</h2>
            <p>
              Comprehensive corporate backing, high profit margins, enterprise technology, and growth playbooks.
            </p>
          </div>

          <div className="gp-benefits-grid">
            {benefits.map((b, idx) => (
              <div key={idx} className="gp-benefit-card">
                <div className="gp-benefit-check">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="gp-benefit-title">{b.title}</h3>
                  <p className="gp-benefit-desc">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Growth Path (4 Steps Horizontal Diagram) */}
      <section className="gp-path-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <TrendingUp size={16} />
              <span>Leadership Journey</span>
            </div>
            <h2>Growth Path</h2>
            <p>
              A structured progression pathway from city leadership to state-level executive management.
            </p>
          </div>

          <div className="gp-path-diagram">
            {growthPathSteps.map((st, idx) => {
              const StepIcon = st.icon;
              return (
                <React.Fragment key={idx}>
                  <div className="gp-path-card">
                    <div className="path-num">{st.stepNum}</div>
                    <div className="path-icon-circle">
                      <StepIcon size={26} />
                    </div>
                    <span className="path-badge">{st.badge}</span>
                    <h3 className="path-title">{st.title}</h3>
                    <p className="path-desc">{st.desc}</p>
                  </div>

                  {idx < growthPathSteps.length - 1 && (
                    <div className="path-connector">
                      <ArrowRight size={22} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. Closing CTA Banner */}
      <section className="gp-cta-section">
        <div className="container">
          <div className="gp-cta-card">
            <div className="gp-cta-icon">
              <TrendingUp size={32} />
            </div>

            <h2 className="gp-cta-tagline">
              Lead Your City. Empower Your Community. Grow with Farmart.
            </h2>

            <p className="gp-cta-sub">
              Take ownership of your city's agri-commerce transformation. Partner with India's fastest growing tech ecosystem.
            </p>

            <button className="btn btn-primary gp-main-btn" onClick={() => setShowApplyModal(true)}>
              <span>Apply Now</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Application Modal */}
      {showApplyModal && (
        <div className="gp-modal-overlay">
          <div className="gp-modal-container fade-in">
            <div className="gp-modal-header">
              <h3>Apply for Growth Partner Leadership</h3>
              <button className="modal-close-btn" onClick={() => setShowApplyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="gp-modal-body">
              {submitted ? (
                <div className="gp-submit-success">
                  <CheckCircle2 size={50} className="success-icon" />
                  <h4>Application Submitted!</h4>
                  <p>
                    Thank you for applying for a <strong>Farmart Growth Partnership</strong>. Our Executive Recruitment Director will contact you within 24 hours.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="gp-apply-form">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Vikram Sharma"
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
                      placeholder="vikram@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Target City & State *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pune, Maharashtra"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Business / Management Experience</label>
                    <select
                      value={formData.experienceYears}
                      onChange={(e) => setFormData({ ...formData, experienceYears: e.target.value })}
                    >
                      <option value="1-3 years">1 - 3 years</option>
                      <option value="3-5 years">3 - 5 years</option>
                      <option value="5-10 years">5 - 10 years</option>
                      <option value="10+ years">10+ years (Executive Level)</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-primary full-btn">
                    <Send size={16} />
                    <span>Submit Leadership Application</span>
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
