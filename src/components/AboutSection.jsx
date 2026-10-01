import React, { useState } from 'react';
import { Target, Eye, ShieldCheck, HeartHandshake, Zap, Globe, Award } from 'lucide-react';
import './AboutSection.css';

export default function AboutSection() {
  const [activeTab, setActiveTab] = useState('mission');

  return (
    <section id="about" className="about-section section-padding">
      <div className="container">
        {/* About Header */}
        <div className="section-header">
          <div className="badge-tag">
            <Globe size={16} />
            <span>Rooted in Purpose</span>
          </div>
          <h2>
            Building the Next-Gen <span className="gradient-text">Agri-Tech Infrastructure</span>
          </h2>
          <p>
            Farmart is bridging the gap between traditional Indian agriculture and modern community commerce — creating transparent income streams for farmers while delivering farm-fresh quality to households.
          </p>
        </div>

        {/* Mission & Vision Interactive Toggle Box */}
        <div id="mission" className="mission-vision-wrapper">
          <div className="mv-tab-selector">
            <button
              className={`mv-tab ${activeTab === 'mission' ? 'active' : ''}`}
              onClick={() => setActiveTab('mission')}
            >
              <Target size={20} />
              <span>Our Mission</span>
            </button>

            <button
              className={`mv-tab ${activeTab === 'vision' ? 'active' : ''}`}
              onClick={() => setActiveTab('vision')}
            >
              <Eye size={20} />
              <span>Our Vision</span>
            </button>

            <button
              className={`mv-tab ${activeTab === 'values' ? 'active' : ''}`}
              onClick={() => setActiveTab('values')}
            >
              <HeartHandshake size={20} />
              <span>Core Values</span>
            </button>
          </div>

          <div className="mv-display-box">
            {activeTab === 'mission' && (
              <div className="mv-card fade-in">
                <div className="mv-img-side">
                  <img src="/village_hub.png" alt="Farmart Mission" className="mv-side-img" />
                </div>
                <div className="mv-text-content">
                  <div className="mv-badge-pill green-pill">MISSION 2028</div>
                  <h3>Empowering 1 Million Rural Households by 2028</h3>
                  <p>
                    Our mission is to eliminate market inefficiencies in Indian agriculture by deploying technology-enabled aggregation hubs at the Gram Panchayat level. We ensure guaranteed fair pricing for farmers, eliminate post-harvest waste, and nurture grassroots micro-entrepreneurs.
                  </p>
                  <ul className="mv-checklist">
                    <li><ShieldCheck size={18} /> Direct farm-gate procurement within 12 hours of harvest</li>
                    <li><ShieldCheck size={18} /> Zero-commission transparency via Kisan Mobile App</li>
                    <li><ShieldCheck size={18} /> Financial inclusion and credit access for FPOs</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'vision' && (
              <div className="mv-card fade-in">
                <div className="mv-img-side">
                  <img src="/produce.png" alt="Farmart Vision" className="mv-side-img" />
                </div>
                <div className="mv-text-content">
                  <div className="mv-badge-pill amber-pill">VISION 2030</div>
                  <h3>A Self-Reliant, Tech-Enabled Rural Bharat</h3>
                  <p>
                    We envision a sustainable future where rural communities hold digital ownership of their local commerce. Farmart aims to create an interconnected grid of 25,000+ Village Hubs, empowering women, young entrepreneurs, and smallholder farmers with steady, dignity-filled livelihoods.
                  </p>
                  <ul className="mv-checklist">
                    <li><ShieldCheck size={18} /> Climate-resilient agro-forestry and soil rejuvenation</li>
                    <li><ShieldCheck size={18} /> Hyperlocal food processing and value-addition at source</li>
                    <li><ShieldCheck size={18} /> Carbon-neutral cold-chain distribution network</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'values' && (
              <div className="mv-card fade-in">
                <div className="mv-img-side">
                  <img src="/women_chef.png" alt="Farmart Values" className="mv-side-img" />
                </div>
                <div className="mv-text-content">
                  <div className="mv-badge-pill green-pill">COMMUNITY TRUST</div>
                  <h3>Built on Trust, Integrity, and Social Impact</h3>
                  <p>
                    Farmart combines the compassion of a community initiative with the speed and innovation of a modern high-growth tech platform. Every decision we make prioritizes the well-being of the primary producer.
                  </p>
                  <ul className="mv-checklist">
                    <li><ShieldCheck size={18} /> 100% transparent pricing published daily</li>
                    <li><ShieldCheck size={18} /> Equal opportunity for rural women micro-entrepreneurs</li>
                    <li><ShieldCheck size={18} /> Quality assurance backed by field lab testing</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
