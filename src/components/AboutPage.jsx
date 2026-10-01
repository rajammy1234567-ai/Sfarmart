import React, { useState } from 'react';
import {
  ShoppingBag,
  Sprout,
  UtensilsCrossed,
  Store,
  Users,
  TrendingUp,
  Home,
  Smartphone,
  Sparkles,
  Truck,
  Building2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Network
} from 'lucide-react';
import './AboutPage.css';

export default function AboutPage({ onNavigateToHome, onOpenContact }) {
  const [activeNode, setActiveNode] = useState('farmer');

  // What We Do Cards Data
  const whatWeDoCards = [
    {
      id: 'grocery',
      title: 'Grocery & Fresh Produce',
      icon: ShoppingBag,
      badge: 'Farm to Kitchen',
      colorClass: 'icon-emerald',
      description: 'Daily farm-harvested organic vegetables, fruits, pulses, cold-pressed oils, and farm-fresh dairy delivered directly to households within 12 hours of harvest.'
    },
    {
      id: 'farmer-mkt',
      title: 'Farmer Marketplace',
      icon: Sprout,
      badge: 'Direct Sourcing',
      colorClass: 'icon-green',
      description: 'Direct farm-gate procurement platform connecting 50,000+ smallholder farmers and FPOs with transparent pricing, soil advisory, and zero mandi middlemen.'
    },
    {
      id: 'home-food',
      title: 'Home Food Marketplace',
      icon: UtensilsCrossed,
      badge: 'Artisanal & Home-Cooked',
      colorClass: 'icon-amber',
      description: 'Enabling local home chefs, women self-help groups (SHGs), and cloud kitchens to prepare and deliver traditional, hygienic, home-cooked regional delicacies.'
    },
    {
      id: 'franchise',
      title: 'Franchise & Business Opportunities',
      icon: Store,
      badge: 'High Yield ROI',
      colorClass: 'icon-earth',
      description: 'Turnkey FOCO retail outlets, Gram Panchayat Village Hubs, and Nari Shakti micro-franchises providing sustainable, lucrative entrepreneurship for local youth.'
    }
  ];

  // Ecosystem 9 Nodes Data
  const ecosystemNodes = [
    {
      id: 'customer',
      title: 'Customer',
      icon: Users,
      roleBadge: 'Demand Node',
      summary: 'Urban & rural households accessing fresh, chemical-free produce and home-cooked delicacies at honest prices.',
      connectsWith: ['Home Restro Partner', 'Delivery Partner', 'FOCO Franchise', 'Village Hub']
    },
    {
      id: 'farmer',
      title: 'Farmer',
      icon: Sprout,
      roleBadge: 'Primary Producer',
      summary: 'Cultivates crops, receives climate-smart advisory, and sells harvest at guaranteed fair prices with instant payments.',
      connectsWith: ['Village Hub', 'Growth Partner', 'Farmer Network']
    },
    {
      id: 'growth-partner',
      title: 'Growth Partner',
      icon: TrendingUp,
      roleBadge: 'B2B & Enterprise',
      summary: 'Corporate processors and retail chains procuring bulk farm-gate inventory with full supply chain traceability.',
      connectsWith: ['Farmer', 'Village Hub']
    },
    {
      id: 'village-hub',
      title: 'Village Hub',
      icon: Home,
      roleBadge: 'Gram Panchayat Node',
      summary: 'Local aggregation & fulfillment center managing crop collection, seed distribution, and digital services.',
      connectsWith: ['Farmer', 'Women Entrepreneur', 'Delivery Partner', 'Customer']
    },
    {
      id: 'digital-partner',
      title: 'Digital Business Partner',
      icon: Smartphone,
      roleBadge: 'Affiliate & Tech',
      summary: 'Tech-enabled affiliates onboarding local Kirana stores, home chefs, and households into the Farmart digital network.',
      connectsWith: ['Customer', 'Home Restro Partner', 'FOCO Franchise']
    },
    {
      id: 'women-entrepreneur',
      title: 'Women Entrepreneur',
      icon: Sparkles,
      roleBadge: 'Nari Shakti Leader',
      summary: 'Women SHG leaders driving community sales, organic produce distribution, and neighborhood food circles.',
      connectsWith: ['Village Hub', 'Customer', 'Home Restro Partner']
    },
    {
      id: 'home-restro',
      title: 'Home Restro Partner',
      icon: UtensilsCrossed,
      roleBadge: 'Culinary Creator',
      summary: 'Home chefs & kitchens sourcing farm-fresh ingredients to cook authentic regional meals for consumers.',
      connectsWith: ['Customer', 'Farmer', 'Delivery Partner']
    },
    {
      id: 'delivery-partner',
      title: 'Delivery Partner',
      icon: Truck,
      roleBadge: 'Green Logistics',
      summary: 'Hyperlocal last-mile delivery fleet transporting fresh produce from Village Hubs to homes & stores within hours.',
      connectsWith: ['Village Hub', 'Home Restro Partner', 'Customer', 'FOCO Franchise']
    },
    {
      id: 'foco-franchise',
      title: 'FOCO Franchise',
      icon: Building2,
      roleBadge: 'Retail Outlet',
      summary: 'Franchise-Owned, Company-Operated modern fresh produce stores generating hands-free passive investment returns.',
      connectsWith: ['Customer', 'Delivery Partner', 'Growth Partner']
    }
  ];

  const selectedNodeData = ecosystemNodes.find(n => n.id === activeNode) || ecosystemNodes[1];

  return (
    <div className="about-page-wrapper">
      {/* 1. Intro Banner */}
      <section className="about-hero-section">
        <div className="container">
          <div className="about-hero-card">
            <div className="about-badge">
              <Sparkles size={16} />
              <span>Multi-Vendor, Multi-Role Ecosystem</span>
            </div>
            
            <h1 className="about-hero-title">About Farmart</h1>
            
            <p className="about-hero-desc">
              Farmart is India’s premier multi-vendor, multi-role community commerce and agri-tech platform. We seamlessly bridge the gap between smallholder farmers, local food creators, village micro-entrepreneurs, and end-consumers — powered by unified digital logistics, fair-trade pricing, and grass-root community leadership.
            </p>

            <div className="about-hero-highlights">
              <div className="hero-hl-chip">
                <ShieldCheck size={18} className="hl-icon" />
                <span>100% Direct Farm Sourcing</span>
              </div>
              <div className="hero-hl-chip">
                <ShieldCheck size={18} className="hl-icon" />
                <span>Zero Mandi Exploitation</span>
              </div>
              <div className="hero-hl-chip">
                <ShieldCheck size={18} className="hl-icon" />
                <span>Community-Led Growth</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. What We Do */}
      <section className="what-we-do-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <CheckCircle2 size={16} />
              <span>Core Capabilities</span>
            </div>
            <h2>What We Do</h2>
            <p>
              Four interconnected pillars powering transparent commerce and sustainable livelihoods across urban and rural Bharat.
            </p>
          </div>

          <div className="what-we-do-grid">
            {whatWeDoCards.map((card) => {
              const IconComp = card.icon;
              return (
                <div key={card.id} className="wwd-card">
                  <div className={`wwd-icon-box ${card.colorClass}`}>
                    <IconComp size={28} />
                  </div>
                  <span className="wwd-badge">{card.badge}</span>
                  <h3 className="wwd-title">{card.title}</h3>
                  <p className="wwd-desc">{card.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Our Ecosystem at a Glance (Infographic & Diagram) */}
      <section className="ecosystem-glance-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Network size={16} />
              <span>Visual Flow & Connections</span>
            </div>
            <h2>Our Ecosystem at a Glance</h2>
            <p>
              Discover how 9 distinct roles connect synergistically to create a resilient, self-sustaining community commerce grid. Click any node to explore its connections!
            </p>
          </div>

          <div className="infographic-container">
            {/* Main Visual Image Banner */}
            <div className="infographic-banner-box">
              <img
                src="/ecosystem.png"
                alt="Farmart Ecosystem Diagram"
                className="ecosystem-banner-img"
              />
            </div>

            {/* Interactive 9 Nodes Radial Grid */}
            <div className="nodes-selector-grid">
              {ecosystemNodes.map((node) => {
                const NodeIcon = node.icon;
                const isActive = activeNode === node.id;
                return (
                  <button
                    key={node.id}
                    className={`node-pill-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveNode(node.id)}
                  >
                    <NodeIcon size={18} />
                    <span>{node.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Node Detail Interactive Card */}
            <div className="active-node-detail-card fade-in">
              <div className="node-detail-header">
                <div className="node-title-group">
                  <div className="node-big-icon">
                    {React.createElement(selectedNodeData.icon, { size: 30 })}
                  </div>
                  <div>
                    <h3>{selectedNodeData.title}</h3>
                    <span className="node-role-badge">{selectedNodeData.roleBadge}</span>
                  </div>
                </div>
              </div>

              <p className="node-summary">{selectedNodeData.summary}</p>

              <div className="node-connections-box">
                <span className="connect-label">Directly Connects & Synergizes With:</span>
                <div className="connect-chips">
                  {selectedNodeData.connectsWith.map((target, idx) => (
                    <span key={idx} className="connect-chip">
                      <ArrowRight size={14} />
                      <span>{target}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Closing Tagline Banner */}
      <section className="closing-banner-section">
        <div className="container">
          <div className="closing-banner-card">
            <div className="closing-leaf-icon">
              <Sprout size={32} />
            </div>

            <h2 className="closing-tagline">
              Farmart – Empowering People. Strengthening Communities. Building Bharat.
            </h2>

            <p className="closing-sub">
              Join India's fastest growing agri-tech and community commerce platform today. Together, we pave the way for agricultural prosperity and fresh food access.
            </p>

            <div className="closing-actions">
              <button className="btn btn-primary" onClick={onNavigateToHome}>
                <span>Explore Ecosystem Verticals</span>
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
