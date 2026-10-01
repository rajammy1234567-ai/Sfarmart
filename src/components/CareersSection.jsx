import React, { useState } from 'react';
import { Briefcase, MapPin, Clock, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import './CareersSection.css';

export default function CareersSection() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [appliedRole, setAppliedRole] = useState(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    linkedin: ''
  });

  const jobOpenings = [
    {
      id: 'agri-tech-lead',
      title: 'Senior Agri-Tech Systems Lead',
      department: 'Technology & Product',
      location: 'Bengaluru, KA (Hybrid)',
      type: 'Full-Time',
      experience: '5+ Years',
      description: 'Lead the architecture of our Kisan IoT soil testing & farm-gate procurement software platform.',
      requirements: ['React, Node.js, Python, PostgreSQL', 'Experience in IoT sensors or Agri-tech logistics', 'Passion for rural social impact']
    },
    {
      id: 'cluster-ops-mgr',
      title: 'Cluster Operations Manager — Village Hubs',
      department: 'Ground Operations',
      location: 'Nashik / Patna / Pune',
      type: 'Full-Time',
      experience: '3+ Years',
      description: 'Oversee supply chain logistics, crop aggregation, and Village Hub partner performance across 50+ Gram Panchayats.',
      requirements: ['Agri-business management degree or equivalent field experience', 'Fluency in local language & willingness to travel', 'Proven team leadership']
    },
    {
      id: 'nari-shakti-lead',
      title: 'Community Lead — Nari Shakti Program',
      department: 'Rural Development',
      location: 'Lucknow / Chandigarh',
      type: 'Full-Time',
      experience: '2+ Years',
      description: 'Drive onboarding, training, and sales enablement for 500+ Women Entrepreneurs and Self-Help Groups.',
      requirements: ['Experience with SHGs or micro-enterprise development', 'Strong interpersonal and empathy skills', 'B.A / M.S.W or equivalent']
    }
  ];

  return (
    <section id="careers" className="careers-section section-padding">
      <div className="container">
        <div className="section-header">
          <div className="badge-tag">
            <Briefcase size={16} />
            <span>Join Our Mission</span>
          </div>
          <h2>
            Build the Future of <span className="gradient-text">Bharat Agri-Commerce</span>
          </h2>
          <p>
            Work alongside passionate innovators, agronomists, and technologists to empower 50,000+ farmers across India.
          </p>
        </div>

        {/* Job Cards */}
        <div className="jobs-grid">
          {jobOpenings.map((job) => (
            <div key={job.id} className="job-card">
              <div className="job-top-row">
                <span className="job-dept">{job.department}</span>
                <span className="job-type">{job.type}</span>
              </div>

              <h3 className="job-title">{job.title}</h3>
              <p className="job-desc">{job.description}</p>

              <div className="job-meta-row">
                <div className="meta-item">
                  <MapPin size={16} />
                  <span>{job.location}</span>
                </div>
                <div className="meta-item">
                  <Clock size={16} />
                  <span>{job.experience}</span>
                </div>
              </div>

              <div className="job-actions">
                <button
                  className="btn btn-secondary job-apply-btn"
                  onClick={() => {
                    setSelectedRole(job);
                    setAppliedRole(null);
                  }}
                >
                  <span>View Details & Apply</span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal / Drawer for Job Application */}
        {selectedRole && (
          <div className="job-modal-overlay">
            <div className="job-modal-card fade-in">
              <div className="job-modal-header">
                <div>
                  <span className="job-dept">{selectedRole.department}</span>
                  <h3>{selectedRole.title}</h3>
                  <div className="meta-item inline-meta">
                    <MapPin size={16} />
                    <span>{selectedRole.location}</span>
                  </div>
                </div>
                <button className="modal-close-btn" onClick={() => setSelectedRole(null)}>✕</button>
              </div>

              <div className="job-modal-body">
                {appliedRole ? (
                  <div className="applied-success">
                    <CheckCircle2 size={50} className="success-icon" />
                    <h4>Application Received!</h4>
                    <p>Our HR Talent Acquisition team will review your CV and reach out within 3 business days.</p>
                    <button className="btn btn-primary" onClick={() => setSelectedRole(null)}>Close</button>
                  </div>
                ) : (
                  <>
                    <h4 className="req-title">Key Requirements:</h4>
                    <ul className="req-list">
                      {selectedRole.requirements.map((req, idx) => (
                        <li key={idx}>• {req}</li>
                      ))}
                    </ul>

                    <form
                      className="quick-job-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          const response = await fetch('https://farm-mart-api.onrender.com/api/apply-job', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              jobId: selectedRole.id,
                              jobTitle: selectedRole.title,
                              fullName: formData.fullName,
                              email: formData.email,
                              phone: 'N/A',
                              location: selectedRole.location,
                              experience: selectedRole.experience,
                              qualification: 'N/A',
                              notes: `LinkedIn / Portfolio: ${formData.linkedin}`,
                              resumeName: 'LinkedIn Profile Linked'
                            })
                          });
                          const data = await response.json();
                          if (data.success) {
                            setAppliedRole(selectedRole.id);
                            setFormData({ fullName: '', email: '', linkedin: '' });
                          } else {
                            alert(data.message || 'Something went wrong.');
                          }
                        } catch (error) {
                          console.error(error);
                          alert('Could not connect to server.');
                        }
                      }}
                    >
                      <div className="form-group">
                        <label>Your Full Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="Enter full name"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Email Address *</label>
                        <input
                          type="email"
                          required
                          placeholder="Enter email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>LinkedIn / Portfolio Link *</label>
                        <input
                          type="url"
                          required
                          placeholder="https://linkedin.com/in/..."
                          value={formData.linkedin}
                          onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary full-btn">
                        Submit Application
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
