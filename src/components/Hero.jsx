import React from 'react';
import { ArrowDown, Sprout, ShieldCheck, TrendingUp, Sparkles, ShoppingBag, Store, Zap } from 'lucide-react';
import './Hero.css';

export default function Hero({ onExploreClick, onOpenShowcase }) {
  return (
    <section id="hero" className="hero-section">
      {/* Subtle Decorative Backdrop Elements */}
      <div className="hero-bg-glow hero-bg-glow-1"></div>
      <div className="hero-bg-glow hero-bg-glow-2"></div>

      <div className="container hero-container">
        <div className="hero-grid">
          {/* Left Hero Content */}
          <div className="hero-content">
            <div className="hero-badge">
              <Store size={16} className="badge-icon" />
              <span>Your One Stop Agri Mart & Commerce Platform</span>
            </div>

            <h1 className="hero-title">
              Empowering Farmers.<br />
              <span className="gradient-text">Fresh. Quality. Everyday.</span><br />
              <span className="hero-highlight-earth">Growing Bharat.</span>
            </h1>

            <p className="hero-subtext">
              Farmart is India's premier one-stop Agri Mart and community commerce grid connecting smallholder farmers, Agri Mart stores, rural entrepreneurs, and urban families.
            </p>

            <div className="hero-actions">
              {/* Primary Animated Magic Trigger Button */}
              <button className="btn btn-earth hero-showcase-btn pulse-glow-button" onClick={onOpenShowcase}>
                <Sparkles size={20} className="sparkle-anim" />
                <span>✨ Discover Everything We Provide</span>
              </button>

              <button className="btn btn-secondary hero-main-cta" onClick={onExploreClick}>
                <span>Explore Agri Mart Verticals</span>
                <ArrowDown size={18} className="cta-arrow" />
              </button>
            </div>

            {/* Micro Stats / Highlights */}
            <div className="hero-trust-bar">
              <div className="trust-item">
                <div className="trust-number">50,000+</div>
                <div className="trust-label">Farmers Empowered</div>
              </div>
              <div className="trust-divider"></div>
              <div className="trust-item">
                <div className="trust-number">1,200+</div>
                <div className="trust-label">Village Hubs</div>
              </div>
              <div className="trust-divider"></div>
              <div className="trust-item">
                <div className="trust-number">150+</div>
                <div className="trust-label">Agri Mart Outlets</div>
              </div>
            </div>
          </div>

          {/* Right Hero Visual Card - Official FARMART Store Building Photo */}
          <div className="hero-visual-wrapper" onClick={onOpenShowcase} style={{ cursor: 'pointer' }}>
            <div className="hero-card-frame">
              <img
                src="/farmart_store_hero.jpg"
                alt="FARMART — Your One Stop Agri Mart Store"
                className="hero-main-img"
              />
              
              {/* Floating Badge 1 - Agri Mart */}
              <div className="floating-badge floating-badge-1">
                <Store size={20} className="floating-icon-green" />
                <div>
                  <div className="floating-title">One Stop Agri Mart</div>
                  <div className="floating-sub">Fresh. Quality. Everyday.</div>
                </div>
              </div>

              {/* Floating Badge 2 - Quality Trust */}
              <div className="floating-badge floating-badge-2">
                <ShieldCheck size={20} className="floating-icon-amber" />
                <div>
                  <div className="floating-title">Grow Better. Live Better.</div>
                  <div className="floating-sub">Seeds • Fertilizers • Tools</div>
                </div>
              </div>

              {/* Floating Interactive Play Banner */}
              <div className="floating-interactive-hint">
                <Zap size={16} />
                <span>Click store image to view All Services & Opportunities</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
