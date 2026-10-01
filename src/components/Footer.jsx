import React from 'react';
import { Leaf, ArrowUpRight, Heart } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-container">
        {/* Top Footer Grid */}
        <div className="footer-top-grid">
          {/* Brand Column */}
          <div className="footer-brand-col">
            <div className="footer-logo">
              <img src="/updated-logo.jpeg" alt="Farmart Logo" className="footer-logo-img" onError={(e) => { e.target.style.display = 'none'; }} />
              <div className="logo-text">
                <span className="logo-title white-text">FARMART</span>
                <span className="logo-subtitle earth-text">AGRI-TECH & COMMUNITY</span>
              </div>
            </div>

            <p className="footer-brand-desc">
              Empowering 50,000+ smallholder farmers and building technology-enabled community commerce networks across India.
            </p>

            <div className="footer-kisan-tag">
              <Leaf size={16} />
              <span>Registered under National Agri Tech Mission</span>
            </div>
          </div>

          {/* Column 2: Ecosystem Verticals */}
          <div className="footer-links-col">
            <h4>Ecosystem Verticals</h4>
            <ul>
              <li><a href="#ecosystem">Growth Partner</a></li>
              <li><a href="#ecosystem">Village Hub</a></li>
              <li><a href="#ecosystem">Farmer Network</a></li>
              <li><a href="#ecosystem">Women Entrepreneur</a></li>
              <li><a href="#ecosystem">FOCO Franchise</a></li>
              <li><a href="#ecosystem">Dream Rewards</a></li>
            </ul>
          </div>

          {/* Column 3: Quick Links */}
          <div className="footer-links-col">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#hero">Home</a></li>
              <li><a href="#about">About Farmart</a></li>
              <li><a href="#mission">Mission & Vision</a></li>
              <li><a href="#calculator">Impact Calculator</a></li>
              <li><a href="#careers">Careers</a></li>
              <li><a href="#contact">Contact Support</a></li>
            </ul>
          </div>

          {/* Column 4: Newsletter & Contact */}
          <div className="footer-newsletter-col">
            <h4>Stay Connected</h4>
            <p>Email: <a href="mailto:officialfarmmart@gmail.com" style={{ color: '#10b981', fontWeight: '500' }}>officialfarmmart@gmail.com</a></p>
            <form className="newsletter-form" onSubmit={(e) => e.preventDefault()}>
              <input type="email" placeholder="Enter your email" required />
              <button type="submit" className="newsletter-btn">
                <span>Join</span>
                <ArrowUpRight size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom-bar">
          <div className="copyright">
            © {new Date().getFullYear()} Farmart Agri Tech Pvt Ltd. All rights reserved.
          </div>
          <div className="footer-legal-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#kisan-guidelines">Kisan Guidelines</a>
          </div>
          <div className="made-with-love">
            Crafted with <Heart size={14} className="heart-icon" /> for Growing Bharat
          </div>
        </div>
      </div>
    </footer>
  );
}
