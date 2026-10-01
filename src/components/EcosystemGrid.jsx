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
  CheckCircle2
} from 'lucide-react';
import './EcosystemGrid.css';

// Icon Map helper
const iconComponents = {
  TrendingUp,
  Home,
  Users,
  Sparkles,
  Smartphone,
  Utensils,
  Store,
  Award
};

export default function EcosystemGrid({ categories, onSelectCategory }) {
  return (
    <section id="ecosystem" className="ecosystem-section section-padding">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="badge-tag">
            <Sparkles size={16} />
            <span>Farmart Ecosystem Pillars</span>
          </div>
          <h2>
            Tailored Partnerships for <span className="gradient-text">Every Stakeholder</span>
          </h2>
          <p>
            Explore our 8 specialized verticals designed to transform rural livelihoods, digitize supply chains, and empower local entrepreneurs. Click any card for full details.
          </p>
        </div>

        {/* Categories Grid */}
        <div className="categories-grid">
          {categories.map((cat, index) => {
            const Icon = iconComponents[cat.iconName] || TrendingUp;
            return (
              <div
                key={cat.id}
                className="category-card"
                onClick={() => onSelectCategory(cat)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectCategory(cat);
                }}
              >
                <div className="card-top-row">
                  <div className={`card-icon-box icon-variant-${(index % 4) + 1}`}>
                    <Icon size={24} />
                  </div>
                  <span className="card-badge">{cat.badge}</span>
                </div>

                <h3 className="card-title">{cat.title}</h3>
                <p className="card-short-desc">{cat.shortDesc}</p>

                <div className="card-footer-action">
                  <span className="action-text">View Detail Page</span>
                  <div className="action-arrow-box">
                    <ArrowRight size={16} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
