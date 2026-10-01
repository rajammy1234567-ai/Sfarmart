import React from 'react';
import {
  TrendingUp,
  Home,
  Users,
  Sparkles,
  Smartphone,
  Utensils,
  Store,
  Award,
  ArrowRight,
  Network,
  CheckCircle2
} from 'lucide-react';
import './EcosystemPage.css';

// Sub-label map matching user prompt requirements
const subtitleMap = {
  'growth-partner': 'City-level business leadership',
  'village-hub': 'Local community connection point',
  'farmer-network': 'Direct farmer partnerships',
  'women-entrepreneur': 'Business opportunities for women',
  'digital-business-partner': 'Digital business ownership',
  'home-restro': 'Home chef food marketplace',
  'foco-franchise': 'Franchise owned, company operated retail',
  'dream-rewards': 'Performance-based rewards program'
};

export default function EcosystemPage({ categories, onSelectCategory, onOpenContact }) {
  return (
    <div className="ecosystem-page-wrapper">
      {/* Top Banner Header */}
      <section className="eco-hero-section">
        <div className="container">
          <div className="eco-hero-card">
            <div className="eco-badge">
              <Network size={16} />
              <span>Unified Business Grid</span>
            </div>
            
            <h1 className="eco-title">Our Ecosystem</h1>
            
            <p className="eco-intro-text">
              Farmart connects multiple specialized roles into one integrated platform — empowering farmers, local community leaders, home chefs, and retail investors through unified technology, transparent trade, and shared economic growth.
            </p>

            <div className="eco-hero-tags">
              <span className="eco-tag"><CheckCircle2 size={16} /> 8 Interconnected Verticals</span>
              <span className="eco-tag"><CheckCircle2 size={16} /> Pan-India Regional Presence</span>
              <span className="eco-tag"><CheckCircle2 size={16} /> Direct Income Generation</span>
            </div>
          </div>
        </div>
      </section>

      {/* 8 Clickable Cards Grid with Topic Images (2 col mobile, 4 col desktop) */}
      <section className="eco-cards-section section-padding">
        <div className="container">
          <div className="eco-cards-grid">
            {categories.map((cat, idx) => {
              const subLabel = subtitleMap[cat.id] || cat.badge;
              
              return (
                <div
                  key={cat.id}
                  className="eco-hub-card"
                  onClick={() => onSelectCategory(cat)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelectCategory(cat);
                  }}
                >
                  {/* Photo Image Banner */}
                  <div className="eco-card-img-wrapper">
                    <img
                      src={cat.image || '/hero.png'}
                      alt={cat.title}
                      className="eco-card-img"
                      onError={(e) => { e.target.src = '/hero.png'; }}
                    />
                    <span className="eco-pill-badge">{cat.badge}</span>
                  </div>

                  <div className="eco-card-content">
                    <h3 className="eco-card-title">{cat.title}</h3>
                    <p className="eco-card-subtitle">{subLabel}</p>
                    <p className="eco-card-desc">{cat.shortDesc}</p>

                    <div className="eco-card-action">
                      <button
                        className="btn btn-secondary eco-learn-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCategory(cat);
                        }}
                      >
                        <span>Learn More</span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="eco-bottom-cta section-padding">
        <div className="container">
          <div className="eco-cta-wrapper">
            <h2>Ready to Join the Farmart Movement?</h2>
            <p>Select your role or contact our expansion officers to begin your journey.</p>
            <button className="btn btn-earth" onClick={onOpenContact}>
              <span>Get Started Today</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
