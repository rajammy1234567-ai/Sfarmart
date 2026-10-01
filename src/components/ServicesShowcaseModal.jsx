import React, { useState } from 'react';
import {
  Sparkles,
  ShoppingBag,
  Sprout,
  Utensils,
  Store,
  Truck,
  Award,
  Users,
  CheckCircle2,
  ArrowRight,
  X,
  ShieldCheck,
  Heart,
  ChevronRight,
  Zap,
  Globe
} from 'lucide-react';
import './ServicesShowcaseModal.css';

export default function ServicesShowcaseModal({ isOpen, onClose, onSelectCategory }) {
  const [activeTab, setActiveTab] = useState('produce');

  if (!isOpen) return null;

  const services = [
    {
      id: 'produce',
      tabLabel: 'Fresh Produce & Grocery',
      icon: ShoppingBag,
      color: 'emerald',
      badge: 'Farm to Kitchen',
      title: 'Grocery & Fresh Produce Marketplace',
      tagline: '100% Chemical-Free, 12-Hour Farm Fresh Harvest',
      desc: 'Farmart connects urban households directly with regional agricultural hubs. By eliminating 4-5 layers of traditional middlemen, customers receive fresh vegetables, fruits, and organic staples at honest prices.',
      features: [
        'Direct procurement from verified 50,000+ smallholder farmers',
        'AI-assisted crop quality grading & pesticide testing',
        'Temperature-monitored 12-hour harvest-to-home delivery',
        'Subtle eco-friendly packaging ensuring zero freshness loss'
      ],
      stats: [
        { label: 'Freshness Guarantee', val: '100%' },
        { label: 'Farm Delivery Time', val: '< 12 Hrs' },
        { label: 'Registered Farmers', val: '50,000+' }
      ],
      categoryId: 'farmer-network'
    },
    {
      id: 'farmer',
      tabLabel: 'Farmer Marketplace',
      icon: Sprout,
      color: 'green',
      badge: 'Kisan Empowerment',
      title: 'Direct Farmer Marketplace & Hubs',
      tagline: 'Fair Farm-Gate Prices & Immediate 24-Hour Payouts',
      desc: 'Our tech-driven Village Hubs empower farmers with transparent digital weighing, instant UPI payments, soil health advisories, and direct access to bulk institutional buyers.',
      features: [
        'Guaranteed minimum 15%-25% higher profit margins for farmers',
        'Instant 24-hour direct bank account UPI credit on harvest pickup',
        'Free soil testing and organic fertilizer guidance at Village Hubs',
        'Elimination of commission agents and hidden Mandi deductions'
      ],
      stats: [
        { label: 'Higher Income Margin', val: '+25%' },
        { label: 'Payout Speed', val: '24 Hours' },
        { label: 'Village Hubs Active', val: '1,200+' }
      ],
      categoryId: 'farmer-network'
    },
    {
      id: 'homerestro',
      tabLabel: 'Home Food Marketplace',
      icon: Utensils,
      color: 'orange',
      badge: 'Home Chefs & Culinary',
      title: 'Farmart Home Restro Marketplace',
      tagline: 'Homemade Taste. Authentic Regional Recipes.',
      desc: 'Connecting passionate home chefs, women entrepreneurs, and cloud kitchens with food lovers seeking wholesome thalis, artisanal bakery, and pure desi ghee sweets.',
      features: [
        'Wholesome daily thalis prepared with 100% farm-fresh ingredients',
        'FSSAI audit certified hygienic home kitchen standards',
        'Farmart Bakery: Artisanal whole wheat breads & sugar-free cookies',
        'Farmart Sweets: Pure A2 ghee mithai & festive gift hampers'
      ],
      stats: [
        { label: 'Home Chefs Empowered', val: '3,500+' },
        { label: 'Hygienic Rating', val: '5 Star' },
        { label: 'Daily Thalis Served', val: '25,000+' }
      ],
      categoryId: 'home-restro'
    },
    {
      id: 'business',
      tabLabel: 'Franchise & Business',
      icon: Store,
      color: 'amber',
      badge: 'High-ROI Business',
      title: 'Franchise & Entrepreneurship Verticals',
      tagline: 'Empowering Local Leaders & Smart Capital Investors',
      desc: 'From city-level Growth Partners and Village Hub operators to Nari Shakti Women Entrepreneurs and hands-off FOCO retail franchise investors.',
      features: [
        'Village Hub: Low investment Gram Panchayat community hub',
        'FOCO Model: 100% Franchise Owned, Company Operated retail stores',
        'Women Entrepreneur (Nari Shakti): Micro-business starter kits',
        'Digital Business Partner: Zero inventory smartphone referral business'
      ],
      stats: [
        { label: 'FOCO Target ROI', val: '24%-32%' },
        { label: 'Women Partners', val: '8,000+' },
        { label: 'Cities Covered', val: '150+' }
      ],
      categoryId: 'foco-franchise'
    },
    {
      id: 'rewards',
      tabLabel: 'Dream Rewards',
      icon: Award,
      color: 'gold',
      badge: 'Performance Appreciation',
      title: 'Dream Rewards & Performance Grants',
      tagline: 'Dream Big. Perform Better. Achieve More.',
      desc: 'A structured recognition framework celebrating top-performing partners with tangible vehicle grants, home subsidies, and family security benefits.',
      features: [
        '🏍️ Dream Bike Plan: Sports bike / EV scooter grant for Hub operators',
        '🚗 Dream Car Plan: SUV / Sedan subsidy for Senior Growth Partners',
        '🏡 Dream Home Plan: Home construction grant & health endowment',
        'Quarterly national awards & Kisan Ambassador recognition'
      ],
      stats: [
        { label: 'Bikes Awarded', val: '450+' },
        { label: 'Cars Distributed', val: '85+' },
        { label: 'Total Rewards Value', val: '₹12 Cr+' }
      ],
      categoryId: 'dream-rewards'
    }
  ];

  const currentService = services.find((s) => s.id === activeTab) || services[0];
  const ServiceIcon = currentService.icon;

  return (
    <div className="showcase-modal-overlay">
      <div className="showcase-modal-container scale-up-animated">
        {/* Top Header */}
        <div className="showcase-top-header">
          <div className="header-brand-tag">
            <Sparkles size={18} className="sparkle-pulse" />
            <span>WHAT FARMART PROVIDES — ECOSYSTEM AT A GLANCE</span>
          </div>

          <button className="showcase-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={22} />
          </button>
        </div>

        {/* Modal Hero Intro Banner */}
        <div className="showcase-intro-banner">
          <div className="intro-badge-pill">
            <Globe size={14} />
            <span>Multi-Role Commerce Grid</span>
          </div>
          <h2>Explore Everything Farmart Offers</h2>
          <p>
            Connecting Farmers, Village Hubs, Home Chefs, Retail Investors, and Customers into one seamless, tech-enabled ecosystem.
          </p>
        </div>

        {/* Category Tabs Row */}
        <div className="showcase-tabs-nav">
          {services.map((s) => {
            const TabIcon = s.icon;
            const isActive = activeTab === s.id;
            return (
              <button
                key={s.id}
                className={`showcase-tab-btn ${isActive ? 'active-showcase-tab' : ''}`}
                onClick={() => setActiveTab(s.id)}
              >
                <TabIcon size={18} />
                <span>{s.tabLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Service Details Active Body */}
        <div className="showcase-body-content fade-in-tab">
          <div className="service-detail-grid">
            {/* Left Content Column */}
            <div className="service-info-col">
              <div className={`service-icon-badge ${currentService.color}`}>
                <ServiceIcon size={28} />
                <span>{currentService.badge}</span>
              </div>

              <h3 className="service-title">{currentService.title}</h3>
              <p className="service-tagline">"{currentService.tagline}"</p>
              <p className="service-desc">{currentService.desc}</p>

              <div className="service-features-list">
                <h4 className="features-heading">Key Highlights & Key Offerings:</h4>
                <ul>
                  {currentService.features.map((feat, idx) => (
                    <li key={idx}>
                      <CheckCircle2 size={18} className="feat-check" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <div className="service-action-row">
                <button
                  className="btn btn-primary showcase-action-btn"
                  onClick={() => {
                    onClose();
                    if (onSelectCategory) {
                      onSelectCategory(currentService.categoryId);
                    }
                  }}
                >
                  <span>Explore {currentService.title}</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>

            {/* Right Live Stats & Highlight Cards Column */}
            <div className="service-stats-col">
              <div className="stats-card-box">
                <h4 className="stats-title">Impact at a Glance</h4>
                <div className="stats-items-stack">
                  {currentService.stats.map((st, idx) => (
                    <div key={idx} className="stat-highlight-item">
                      <span className="stat-val">{st.val}</span>
                      <span className="stat-lbl">{st.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Guarantee Box */}
              <div className="trust-promise-box">
                <ShieldCheck size={32} className="trust-icon" />
                <div>
                  <strong>Farmart Trust Seal</strong>
                  <p>100% transparent audit, direct payments & guaranteed quality control across all verticals.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="showcase-footer">
          <span>Farmart — Empowering People. Strengthening Communities. Building Bharat.</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close Showcase
          </button>
        </div>
      </div>
    </div>
  );
}
