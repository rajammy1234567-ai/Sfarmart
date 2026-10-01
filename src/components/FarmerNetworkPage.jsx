import React, { useState } from 'react';
import {
  Sprout,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  Users,
  Award,
  ArrowRight,
  Send,
  X,
  Apple,
  Milk,
  Carrot,
  Wheat,
  Clock,
  DollarSign
} from 'lucide-react';
import './FarmerNetworkPage.css';

export default function FarmerNetworkPage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    village: '',
    district: '',
    cropType: 'Vegetables',
    acreage: '1-5 Acres'
  });

  const whatWeSource = [
    {
      title: 'Fresh Vegetables',
      desc: 'Leafy greens, tomatoes, potatoes, gourds, peppers, and exotic farm-grown vegetables.',
      icon: Carrot,
      color: 'green'
    },
    {
      title: 'Fresh Fruits',
      desc: 'Sun-ripened mangoes, bananas, apples, citrus fruits, and seasonal berries.',
      icon: Apple,
      color: 'amber'
    },
    {
      title: 'Fresh Dairy Products',
      desc: 'Pure A2 cow & buffalo milk, farm-fresh paneer, curd, and cold-pressed ghee.',
      icon: Milk,
      color: 'emerald'
    },
    {
      title: 'Seasonal Farm Produce',
      desc: 'Organic pulses, whole grains, cold-pressed oils, turmeric, and regional spices.',
      icon: Wheat,
      color: 'earth'
    }
  ];

  const whyFarmersChoose = [
    {
      title: 'Transparent Partnership',
      desc: 'Daily price declarations via Kisan App with zero mandi commission or hidden deductions.'
    },
    {
      title: 'Long-Term Growth',
      desc: 'Access to subsidized certified seeds, free soil health testing, and organic farming advice.'
    },
    {
      title: 'Better Market Access',
      desc: 'Direct connection to premium urban consumers, supermarket chains, and cloud kitchens.'
    },
    {
      title: 'Digital Support',
      desc: 'Easy order tracking on mobile app with guaranteed direct bank transfers within 24 hours.'
    },
    {
      title: 'Quality-Focused Procurement',
      desc: 'On-farm AI harvest grading and transparent moisture measurement at Village Hubs.'
    },
    {
      title: 'Strong Community Network',
      desc: 'Peer knowledge exchange, FPO consolidation, and access to modern farming equipment.'
    }
  ];

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'farmer-network',
          fullName: formData.fullName,
          phone: formData.phone,
          email: 'N/A',
          state: 'N/A',
          district: formData.district,
          experience: formData.cropType,
          notes: `Village: ${formData.village}, Acreage: ${formData.acreage}`
        })
      });
      const data = await response.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        alert(data.message || 'Something went wrong.');
      }
    } catch (error) {
      console.error(error);
      alert('Could not connect to server.');
    }
  };

  return (
    <div className="farmer-network-page">
      {/* 1. Hero Banner */}
      <section className="fn-hero-section">
        <div className="container">
          <div className="fn-hero-card">
            <button className="fn-back-btn" onClick={onBackToEcosystem}>
              ← Back to All Ecosystem Verticals
            </button>

            <div className="fn-badge">
              <Sprout size={16} />
              <span>Core Producer Network</span>
            </div>

            <h1 className="fn-hero-title">Farmart Farmer Network</h1>
            <p className="fn-tagline">"Empowering Farmers. Delivering Freshness."</p>

            {/* 2. Intro Paragraph */}
            <p className="fn-intro-paragraph">
              The Farmart Farmer Network connects smallholder farmers and agricultural cooperatives directly with a trusted, transparent marketplace. By eliminating middleman exploitation, offering fair market prices, and providing harvest-to-payment digital support, we ensure our farmers earn with dignity and security.
            </p>

            <div className="fn-hero-actions">
              <button className="btn btn-primary" onClick={() => setShowApplyModal(true)}>
                <span>Join Farmer Network</span>
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Locate Nearest Procurement Hub</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. What We Source (Icon Grid) */}
      <section className="fn-source-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Wheat size={16} />
              <span>Direct Procurement Range</span>
            </div>
            <h2>What We Source</h2>
            <p>
              We procure fresh, high-quality agricultural products directly from farm-gates across India.
            </p>
          </div>

          <div className="fn-source-grid">
            {whatWeSource.map((s, idx) => {
              const SIcon = s.icon;
              return (
                <div key={idx} className="fn-source-card">
                  <div className={`fn-source-icon-box ${s.color}`}>
                    <SIcon size={28} />
                  </div>
                  <h3 className="fn-source-title">{s.title}</h3>
                  <p className="fn-source-desc">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Why Farmers Choose Farmart (Checklist Section) */}
      <section className="fn-why-section section-padding">
        <div className="container">
          <div className="fn-why-wrapper">
            <div className="section-header text-left">
              <div className="badge-tag">
                <ShieldCheck size={16} />
                <span>The Farmart Promise</span>
              </div>
              <h2>Why Farmers Choose Farmart</h2>
              <p>
                Built on transparency, fair valuation, and digital empowerment for rural producers.
              </p>
            </div>

            <div className="fn-checklist-grid">
              {whyFarmersChoose.map((item, idx) => (
                <div key={idx} className="fn-check-item">
                  <div className="fn-check-circle">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 className="fn-check-title">{item.title}</h3>
                    <p className="fn-check-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Produce Category Showcase (Dairy, Vegetables, Fruits Sub-Sections) */}
      <section className="fn-showcase-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Award size={16} />
              <span>Specialized Supply Streams</span>
            </div>
            <h2>Our Core Harvest Categories</h2>
            <p>Dedicated quality standards and rapid cold-chain handling for every crop type.</p>
          </div>

          {/* Dairy Sub-Section */}
          <div className="showcase-block dairy-block">
            <div className="showcase-header-row">
              <div className="showcase-icon-box dairy-icon">
                <Milk size={32} />
              </div>
              <div>
                <span className="showcase-category-tag">Dairy Division</span>
                <h3 className="showcase-promise">"Purity from Udder to Home — Pure, Unadulterated Dairy"</h3>
              </div>
            </div>

            <div className="showcase-products-grid">
              <div className="prod-chip">
                <Milk size={18} />
                <span>Fresh A2 Cow Milk</span>
              </div>
              <div className="prod-chip">
                <Milk size={18} />
                <span>Pure Buffalo Milk</span>
              </div>
              <div className="prod-chip">
                <Award size={18} />
                <span>Cold-Pressed Ghee</span>
              </div>
              <div className="prod-chip">
                <ShieldCheck size={18} />
                <span>Farm-Fresh Paneer & Curd</span>
              </div>
            </div>
          </div>

          {/* Vegetables Sub-Section */}
          <div className="showcase-block veg-block">
            <div className="showcase-header-row">
              <div className="showcase-icon-box veg-icon">
                <Carrot size={32} />
              </div>
              <div>
                <span className="showcase-category-tag green-tag">Vegetables Division</span>
                <h3 className="showcase-promise">"Crisp, Harvested Today — Zero Chemical Residuals"</h3>
              </div>
            </div>

            <div className="showcase-products-grid">
              <div className="prod-chip">
                <Carrot size={18} />
                <span>Organic Leafy Greens</span>
              </div>
              <div className="prod-chip">
                <Carrot size={18} />
                <span>Farm Tomatoes & Onions</span>
              </div>
              <div className="prod-chip">
                <Sprout size={18} />
                <span>Root Vegetables & Potatoes</span>
              </div>
              <div className="prod-chip">
                <Award size={18} />
                <span>Exotic Herbs & Peppers</span>
              </div>
            </div>
          </div>

          {/* Fruits Sub-Section */}
          <div className="showcase-block fruit-block">
            <div className="showcase-header-row">
              <div className="showcase-icon-box fruit-icon">
                <Apple size={32} />
              </div>
              <div>
                <span className="showcase-category-tag amber-tag">Orchard Fruits Division</span>
                <h3 className="showcase-promise">"Sun-Ripened Excellence — Naturally Sweet & Nutritious"</h3>
              </div>
            </div>

            <div className="showcase-products-grid">
              <div className="prod-chip">
                <Apple size={18} />
                <span>Alphonso & Totapuri Mangoes</span>
              </div>
              <div className="prod-chip">
                <Apple size={18} />
                <span>Mountain Apples & Pears</span>
              </div>
              <div className="prod-chip">
                <Award size={18} />
                <span>Citrus & Nagpur Oranges</span>
              </div>
              <div className="prod-chip">
                <Sprout size={18} />
                <span>Banana & Papaya Crops</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Closing Tagline Banner */}
      <section className="fn-cta-section">
        <div className="container">
          <div className="fn-cta-card">
            <div className="fn-cta-leaf">
              <Sprout size={32} />
            </div>

            <h2 className="fn-cta-tagline">
              "From Our Farmers to Your Family – Freshness You Can Trust."
            </h2>

            <p className="fn-cta-sub">
              Join 50,000+ farmers earning higher, transparent incomes with Farmart farm-gate procurement.
            </p>

            <button className="btn btn-primary fn-main-btn" onClick={() => setShowApplyModal(true)}>
              <span>Register Your Farm</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Farmer Registration Modal */}
      {showApplyModal && (
        <div className="fn-modal-overlay">
          <div className="fn-modal-container fade-in">
            <div className="fn-modal-header">
              <h3>Register as a Farmart Kisan Partner</h3>
              <button className="modal-close-btn" onClick={() => setShowApplyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="fn-modal-body">
              {submitted ? (
                <div className="fn-submit-success">
                  <CheckCircle2 size={50} className="success-icon" />
                  <h4>Registration Received!</h4>
                  <p>
                    Thank you for registering. Our local Field Agronomist will visit your farm within 24 hours.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="fn-apply-form">
                  <div className="form-group">
                    <label>Farmer / FPO Leader Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Baldev Singh"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Mobile Number (Kisan App) *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Village & District *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Karnal, Haryana"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Primary Harvest Category</label>
                    <select
                      value={formData.cropType}
                      onChange={(e) => setFormData({ ...formData, cropType: e.target.value })}
                    >
                      <option value="Vegetables">Fresh Vegetables</option>
                      <option value="Fruits">Orchard Fruits</option>
                      <option value="Dairy">Dairy & Milk Products</option>
                      <option value="Grains">Grains & Pulses</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Land Holding / Scale</label>
                    <select
                      value={formData.acreage}
                      onChange={(e) => setFormData({ ...formData, acreage: e.target.value })}
                    >
                      <option value="<1 Acre">Smallholder (&lt; 1 Acre)</option>
                      <option value="1-5 Acres">1 - 5 Acres</option>
                      <option value="5-15 Acres">5 - 15 Acres</option>
                      <option value="FPO Cooperative">FPO / Cooperative (&gt; 50 Acres)</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-primary full-btn">
                    <Send size={16} />
                    <span>Submit Kisan Registration</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
