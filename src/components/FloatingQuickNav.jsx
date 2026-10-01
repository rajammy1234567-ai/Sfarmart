import React from 'react';
import { Home, Store, Utensils, PhoneCall, Sparkles, Sprout } from 'lucide-react';
import './FloatingQuickNav.css';

export default function FloatingQuickNav({ currentView, onNavClick, onOpenShowcase }) {
  return (
    <div className="floating-quick-bar">
      <div className="floating-bar-pill">
        <button
          className={`quick-nav-btn ${currentView === 'home' ? 'active-quick-btn' : ''}`}
          onClick={() => onNavClick('home', 'hero')}
          title="Home"
        >
          <Home size={18} />
          <span>Home</span>
        </button>

        <button
          className={`quick-nav-btn ${currentView === 'village-hub' ? 'active-quick-btn' : ''}`}
          onClick={() => onNavClick('village-hub')}
          title="Village Hubs"
        >
          <Sprout size={18} />
          <span>Hubs</span>
        </button>

        <button
          className={`quick-nav-btn ${currentView === 'home-restro' ? 'active-quick-btn' : ''}`}
          onClick={() => onNavClick('home-restro')}
          title="Home Restro"
        >
          <Utensils size={18} />
          <span>Restro</span>
        </button>

        <button
          className={`quick-nav-btn ${currentView === 'foco-franchise' ? 'active-quick-btn' : ''}`}
          onClick={() => onNavClick('foco-franchise')}
          title="FOCO Supermarts"
        >
          <Store size={18} />
          <span>FOCO</span>
        </button>

        <button
          className="quick-nav-btn showcase-quick-trigger"
          onClick={onOpenShowcase}
          title="Showcase Portal"
        >
          <Sparkles size={18} className="spin-magic-icon" />
          <span>Explore</span>
        </button>

        <button
          className={`quick-nav-btn ${currentView === 'contact' ? 'active-quick-btn' : ''}`}
          onClick={() => onNavClick('contact')}
          title="Contact"
        >
          <PhoneCall size={18} />
          <span>Contact</span>
        </button>
      </div>
    </div>
  );
}
