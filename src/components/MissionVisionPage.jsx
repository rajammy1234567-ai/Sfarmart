import React, { useState } from 'react';
import {
  Sprout,
  Users,
  Home,
  ShoppingBag,
  Briefcase,
  Cpu,
  Eye,
  Target,
  Quote,
  ShieldCheck,
  Truck,
  Store,
  Sparkles,
  HeartHandshake,
  ArrowRight
} from 'lucide-react';
import './MissionVisionPage.css';

export default function MissionVisionPage({ onNavigateToHome, onOpenContact }) {
  const [activeTab, setActiveTab] = useState('both'); // 'both', 'mission', 'vision'

  const missionPoints = [
    {
      title: 'Empower Farmers',
      desc: 'Direct farm-gate procurement, instant digital payments, and soil advisory with zero middleman exploitation.',
      icon: Sprout,
      color: 'green'
    },
    {
      title: 'Support Women Entrepreneurs',
      desc: 'Nari Shakti programs enabling rural women & SHGs to lead profitable community sales hubs.',
      icon: Sparkles,
      color: 'amber'
    },
    {
      title: 'Strengthen Village Hubs',
      desc: 'Establishing local aggregation and fulfillment centers at the Gram Panchayat level.',
      icon: Home,
      color: 'green'
    },
    {
      title: 'Deliver Fresh Products',
      desc: '12-hour harvest-to-kitchen supply chain delivering unadulterated produce to households.',
      icon: ShoppingBag,
      color: 'emerald'
    },
    {
      title: 'Create Employment Opportunities',
      desc: 'Generating sustainable livelihoods for youth, delivery fleets, and home chefs.',
      icon: Briefcase,
      color: 'earth'
    },
    {
      title: 'Build Technology-Driven Ecosystem',
      desc: 'Deploying IoT crop testing, automated logistics, and smart inventory tools for rural trade.',
      icon: Cpu,
      color: 'emerald'
    }
  ];

  const commitments = [
    { label: 'Empower Farmers', icon: Sprout, badge: 'Fair Trade' },
    { label: 'Empower Women', icon: Sparkles, badge: 'Nari Shakti' },
    { label: 'Strengthen Local Business', icon: Store, badge: 'Gram Panchayat' },
    { label: 'Fast Delivery', icon: Truck, badge: '<12 Hours' },
    { label: 'Build Trusted Communities', icon: ShieldCheck, badge: '100% Quality' },
    { label: 'Grow Together Build Bharat', icon: HeartHandshake, badge: 'Shared Prosperity' }
  ];

  return (
    <div className="mv-page-wrapper">
      {/* Hero Header */}
      <section className="mv-hero-section">
        <div className="container">
          <div className="mv-hero-content">
            <div className="mv-badge">
              <Target size={16} />
              <span>Purpose & Future Direction</span>
            </div>
            <h1 className="mv-hero-title">Mission & Vision</h1>
            <p className="mv-hero-sub">
              Guiding Bharat’s Agri-Commerce Transformation Through Purpose, Technological Innovation, and Shared Community Prosperity.
            </p>

            {/* View Switcher Tabs */}
            <div className="mv-switcher-tabs">
              <button
                className={`switcher-btn ${activeTab === 'both' ? 'selected' : ''}`}
                onClick={() => setActiveTab('both')}
              >
                All Overview
              </button>
              <button
                className={`switcher-btn ${activeTab === 'mission' ? 'selected' : ''}`}
                onClick={() => setActiveTab('mission')}
              >
                <Target size={16} />
                <span>Our Mission</span>
              </button>
              <button
                className={`switcher-btn ${activeTab === 'vision' ? 'selected' : ''}`}
                onClick={() => setActiveTab('vision')}
              >
                <Eye size={16} />
                <span>Our Vision</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Mission & Vision Grid */}
      <section className="mv-main-section section-padding">
        <div className="container">
          <div className={`mv-columns-grid ${activeTab}`}>
            {/* Mission Block (Left / Tab 1) */}
            {(activeTab === 'both' || activeTab === 'mission') && (
              <div className="mv-block-card mission-card fade-in">
                <div className="block-header">
                  <div className="block-icon-circle green-circle">
                    <Target size={28} />
                  </div>
                  <div>
                    <span className="block-tag">Core Purpose</span>
                    <h2>Our Mission</h2>
                  </div>
                </div>

                {/* Highlighted Quote Style Mission Statement */}
                <div className="quote-box mission-quote">
                  <Quote size={28} className="quote-icon" />
                  <p className="quote-text">
                    "Our mission is to create a transparent, technology-enabled community commerce grid that eliminates agricultural market friction, guarantees fair prices for smallholder farmers, and empowers local micro-entrepreneurs across every Gram Panchayat."
                  </p>
                </div>

                <h3 className="sub-heading">Pillars of Our Mission:</h3>

                {/* 6 Icon Points */}
                <div className="mission-points-grid">
                  {missionPoints.map((pt, idx) => {
                    const PtIcon = pt.icon;
                    return (
                      <div key={idx} className="point-item">
                        <div className={`point-icon-box ${pt.color}`}>
                          <PtIcon size={20} />
                        </div>
                        <div>
                          <h4 className="point-title">{pt.title}</h4>
                          <p className="point-desc">{pt.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vision Block (Right / Tab 2) */}
            {(activeTab === 'both' || activeTab === 'vision') && (
              <div className="mv-block-card vision-card fade-in">
                <div className="block-header">
                  <div className="block-icon-circle amber-circle">
                    <Eye size={28} />
                  </div>
                  <div>
                    <span className="block-tag amber-tag">Future Horizon</span>
                    <h2>Our Vision</h2>
                  </div>
                </div>

                {/* Highlighted Quote Style Vision Statement */}
                <div className="quote-box vision-quote">
                  <Quote size={28} className="quote-icon amber-quote-icon" />
                  <p className="quote-text">
                    "Our vision is to become India’s most trusted farm-to-home commerce ecosystem — fostering a self-reliant, prosperous rural economy where every farmer earns with dignity and every family enjoys fresh, wholesome food."
                  </p>
                </div>

                {/* Short Supporting Paragraph */}
                <div className="vision-support-box">
                  <h3>Building India’s Most Trusted Network</h3>
                  <p>
                    We aspire to connect 25,000+ Gram Panchayats by 2030, constructing a carbon-neutral, climate-resilient agricultural supply network. By combining cutting-edge mobile technology with deep-rooted community trust, Farmart aims to set a national benchmark for equitable social impact, transparent trade, and food security in Bharat.
                  </p>
                  
                  <div className="vision-stats-row">
                    <div className="stat-pill">
                      <strong>25,000+</strong>
                      <span>Gram Panchayats Goal</span>
                    </div>
                    <div className="stat-pill">
                      <strong>100%</strong>
                      <span>Carbon-Neutral Grid</span>
                    </div>
                    <div className="stat-pill">
                      <strong>1 Million</strong>
                      <span>Livelihoods Target</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bottom Banner: Our Commitment */}
      <section className="commitment-banner-section">
        <div className="container">
          <div className="commitment-card">
            <div className="commitment-header">
              <span className="commitment-badge">Pledge of Integrity</span>
              <h2>Our Commitment</h2>
              <p>Values that guide every harvest, delivery, and community partnership.</p>
            </div>

            {/* Horizontal 6 Icon Row */}
            <div className="commitment-icon-row">
              {commitments.map((item, idx) => {
                const ItemIcon = item.icon;
                return (
                  <div key={idx} className="commitment-item">
                    <div className="item-icon-box">
                      <ItemIcon size={24} />
                    </div>
                    <span className="item-badge">{item.badge}</span>
                    <strong className="item-label">{item.label}</strong>
                  </div>
                );
              })}
            </div>

            <div className="commitment-actions">
              <button className="btn btn-primary" onClick={onNavigateToHome}>
                <span>Explore Our Ecosystem</span>
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Partner With Us</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
