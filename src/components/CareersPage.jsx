import React, { useState } from 'react';
import {
  Briefcase,
  TrendingUp,
  CheckCircle2,
  MapPin,
  Clock,
  ArrowRight,
  Send,
  Upload,
  User,
  Mail,
  Phone,
  GraduationCap,
  Award
} from 'lucide-react';
import './CareersPage.css';

export default function CareersPage({ onOpenContact }) {
  const [promoterFormData, setPromoterFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    location: '',
    experience: '',
    qualification: ''
  });
  const [resumeName, setResumeName] = useState('');
  const [promoterSubmitted, setPromoterSubmitted] = useState(false);

  const handlePromoterSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'promoter-01',
          jobTitle: 'Farmart Growth Development Promoter',
          fullName: promoterFormData.fullName,
          phone: promoterFormData.phone,
          email: promoterFormData.email,
          location: promoterFormData.location,
          experience: promoterFormData.experience,
          qualification: promoterFormData.qualification,
          resumeName: resumeName || 'Not uploaded'
        })
      });
      const data = await response.json();
      if (data.success) {
        setPromoterSubmitted(true);
      } else {
        alert(data.message || 'Something went wrong.');
      }
    } catch (error) {
      console.error(error);
      alert('Could not connect to server.');
    }
  };

  const whyJoinChecklist = [
    'Mission-Driven Work: Direct impact on 50,000+ smallholder farmers across Bharat.',
    'Fast-Track Career Growth: Rapid advancement opportunities in a high-growth agri-tech platform.',
    'Competitive Compensation: Industry-leading salaries, health insurance, and performance bonuses.',
    'Inclusive & Empowering Culture: Equal opportunity workplace celebrating diversity and community trust.'
  ];

  return (
    <div className="careers-page-wrapper">
      {/* 1. Hero Banner */}
      <section className="careers-hero-section">
        <div className="container">
          <div className="careers-hero-card">
            <div className="careers-badge">
              <Briefcase size={16} />
              <span>Career Opportunities at Farmart</span>
            </div>
            <h1 className="careers-hero-title">Join Our Team. Build Your Future.</h1>
            <p className="careers-hero-desc">
              Be a catalyst for agricultural transformation. Join a passionate team empowering 50,000+ farmers and building Bharat's premier community commerce grid.
            </p>
          </div>
        </div>
      </section>

      {/* Embedded Promoter Form Section (Expanded) */}
      <section className="promoter-embedded-section section-padding" style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div className="container">
          <div className="promoter-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '50px', alignItems: 'flex-start' }}>
            
            {/* Left Info Panel */}
            <div className="promoter-info" style={{ position: 'sticky', top: '100px' }}>
              <div className="badge-tag" style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#4f46e5', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '500' }}>
                <TrendingUp size={18} />
                <span>Premium Opportunity</span>
              </div>
              <h2 style={{ fontSize: '38px', color: '#0f172a', marginBottom: '20px', lineHeight: '1.2' }}>Farmart Growth Development Promoter</h2>
              <p style={{ fontSize: '18px', color: '#475569', marginBottom: '30px', lineHeight: '1.6' }}>
                Join our elite owner-led hiring program. We are actively hiring Management Teams to oversee multiple fast-growing sectors across our ecosystem. 
                <br/><br/>
                Enjoy fixed salaries coupled with lucrative performance-based incentives and direct reporting to core leadership.
              </p>
              
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
                <h4 style={{ fontSize: '18px', marginBottom: '16px', color: '#0f172a' }}>Why Apply for this Role?</h4>
                <ul style={{ listStyle: 'none', padding: 0, gap: '16px', display: 'flex', flexDirection: 'column', color: '#334155', fontSize: '16px' }}>
                  <li style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <CheckCircle2 size={22} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} /> 
                    <span>Manage large-scale operations across ground logistics and supply chain.</span>
                  </li>
                  <li style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <CheckCircle2 size={22} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} /> 
                    <span>Fixed Salary + High Performance Incentives.</span>
                  </li>
                  <li style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <CheckCircle2 size={22} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} /> 
                    <span>Lead teams in B2B Supply Chain, Village Hubs, and Delivery.</span>
                  </li>
                  <li style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <CheckCircle2 size={22} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} /> 
                    <span>Direct involvement in Farmart's massive expansion across Bharat.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Form Panel */}
            <div className="promoter-form-card" style={{ background: '#ffffff', padding: '40px', borderRadius: '20px', boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.08)', border: '1px solid #e2e8f0' }}>
              {promoterSubmitted ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <CheckCircle2 size={72} color="#16a34a" style={{ margin: '0 auto 24px' }} />
                  <h3 style={{ fontSize: '28px', color: '#0f172a', marginBottom: '12px' }}>Application Received Successfully!</h3>
                  <p style={{ color: '#64748b', fontSize: '18px', lineHeight: '1.6' }}>
                    Thank you for applying to the Growth Development Promoter program.<br/>
                    Our talent acquisition team will review your profile and get back to you shortly.
                  </p>
                  <button 
                    onClick={() => setPromoterSubmitted(false)}
                    style={{ background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '12px 24px', borderRadius: '8px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '24px' }}
                  >
                    Submit Another Application
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePromoterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '24px', color: '#0f172a', marginBottom: '8px' }}>Candidate Application</h3>
                    <p style={{ color: '#64748b', fontSize: '15px' }}>Please fill out all the details accurately to apply for the management team.</p>
                  </div>
                  
                  {/* Select Role Removed as per client request */}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Full Name */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={14} /> Full Name *
                      </label>
                      <input type="text" required placeholder="e.g. Ramesh Patel" value={promoterFormData.fullName} onChange={(e) => setPromoterFormData({...promoterFormData, fullName: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                    </div>
                    {/* Phone */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Phone size={14} /> Mobile Number *
                      </label>
                      <input type="tel" required placeholder="e.g. 9876543210" value={promoterFormData.phone} onChange={(e) => setPromoterFormData({...promoterFormData, phone: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Email */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={14} /> Email Address *
                      </label>
                      <input type="email" required placeholder="e.g. ramesh@example.com" value={promoterFormData.email} onChange={(e) => setPromoterFormData({...promoterFormData, email: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                    </div>
                    {/* City */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={14} /> Current City *
                      </label>
                      <input type="text" required placeholder="e.g. Lucknow" value={promoterFormData.location} onChange={(e) => setPromoterFormData({...promoterFormData, location: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Experience */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Briefcase size={14} /> Experience *
                      </label>
                      <input type="text" required placeholder="e.g. 5 Years in Logistics" value={promoterFormData.experience} onChange={(e) => setPromoterFormData({...promoterFormData, experience: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                    </div>
                    {/* Qualification */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <GraduationCap size={14} /> Highest Qualification *
                      </label>
                      <input type="text" required placeholder="e.g. MBA / Graduate" value={promoterFormData.qualification} onChange={(e) => setPromoterFormData({...promoterFormData, qualification: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
                    </div>
                  </div>

                  {/* LinkedIn / Notes Removed as per client request */}

                  {/* Resume Upload Box */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Upload size={14} /> Upload CV / Resume (PDF / DOCX) *
                    </label>
                    <div className="stylish-upload-zone" style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '30px', textAlign: 'center', background: '#f8fafc', position: 'relative', cursor: 'pointer', transition: '0.2s' }}>
                      <Upload size={32} color="#10b981" style={{ marginBottom: '12px' }} />
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc"
                        required
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                        onChange={(e) => {
                          if (e.target.files[0]) {
                            setResumeName(e.target.files[0].name);
                          }
                        }}
                      />
                      <div style={{ fontSize: '16px', color: '#475569', fontWeight: '500' }}>
                        {resumeName ? <span style={{ color: '#0f172a' }}>📄 Selected: {resumeName}</span> : 'Click to select CV or drag & drop file here'}
                      </div>
                    </div>
                  </div>

                  <button type="submit" style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '16px', borderRadius: '10px', fontSize: '18px', fontWeight: '500', cursor: 'pointer', marginTop: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}>
                    <Send size={20} />
                    <span>Submit Candidate Application</span>
                  </button>
                </form>
              )}
            </div>
            
          </div>
        </div>
      </section>

      {/* 3. Why Join Farmart */}
      <section className="why-join-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Award size={16} />
              <span>Culture & Benefits</span>
            </div>
            <h2>Why Join Farmart</h2>
            <p>Creating an empowering workplace where performance and community impact go hand in hand.</p>
          </div>

          <div className="why-join-grid">
            {whyJoinChecklist.map((item, idx) => (
              <div key={idx} className="why-join-card">
                <CheckCircle2 size={22} className="join-check" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
