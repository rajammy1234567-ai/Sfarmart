import React, { useState, useEffect } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ currentView, onNavClick, onOpenContact, onOpenAdmin }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { name: 'Home', view: 'home', targetId: 'hero' },
    { name: 'About Farmart', view: 'about', targetId: null },
    { name: 'Mission & Vision', view: 'mission', targetId: null },
    { name: 'Our Ecosystem', view: 'ecosystem', targetId: null },
    { name: 'Careers', view: 'careers', targetId: null },
    { name: 'FAQ', view: 'faq', targetId: null },
    { name: 'Contact', view: 'contact', targetId: null },
  ];

  return (
    <header className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <div className="container navbar-container">
        {/* Logo */}
        <button
          className="navbar-logo logo-btn"
          onClick={() => onNavClick('home', 'hero')}
        >
          <img src="/updated-logo.jpeg" alt="Farmart Logo" className="logo-img" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="logo-text">
            <span className="logo-title">FARMART</span>
            <span className="logo-subtitle">AGRI-TECH & COMMUNITY</span>
          </div>
        </button>

        {/* Desktop Links */}
        <nav className="navbar-desktop-nav">
          {navItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item nav-btn ${currentView === item.view ? 'active-nav-btn' : ''}`}
              onClick={() => onNavClick(item.view, item.targetId)}
            >
              {item.name}
            </button>
          ))}
        </nav>

        {/* Right CTA */}
        <div className="navbar-actions">
          <button className="btn btn-primary nav-cta-btn" onClick={onOpenContact}>
            <span>Join Network</span>
            <ArrowUpRight size={18} />
          </button>

          {/* Mobile Menu Toggle */}
          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-drawer">
          <div className="mobile-drawer-links">
            {navItems.map((item) => (
              <button
                key={item.name}
                className="mobile-nav-item nav-btn"
                onClick={() => {
                  onNavClick(item.view, item.targetId);
                  setMobileMenuOpen(false);
                }}
              >
                {item.name}
              </button>
            ))}

            <button
              className="btn btn-primary mobile-cta-btn"
              onClick={() => {
                onOpenContact();
                setMobileMenuOpen(false);
              }}
            >
              <span>Join Network</span>
              <ArrowUpRight size={18} />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
