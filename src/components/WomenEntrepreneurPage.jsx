import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Heart,
  Award,
  Utensils,
  Cake,
  Flame,
  Milk,
  ShieldCheck,
  ShoppingBag,
  Sparkle,
  Gift,
  Feather,
  ArrowRight,
  Send,
  X,
  BookOpen,
  Users,
  DollarSign
} from 'lucide-react';
import './WomenEntrepreneurPage.css';

export default function WomenEntrepreneurPage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    district: '',
    category: 'Homemaker',
    interestArea: 'Home Restro & Food'
  });

  const whoCanJoin = [
    'Homemakers looking to start a lucrative business from home.',
    'Home Chefs & Passionate Cooks eager to monetize regional recipes.',
    'Artisanal Bakers & Confectioners crafting fresh baked goods.',
    'Traditional Sweet Makers & Preserve Creators.',
    'Dairy Entrepreneurs producing fresh curd, paneer, and ghee.',
    'Women Farmers & FPO Leaders leading organic crop groups.',
    'Self-Help Group (SHG) Members seeking community distribution networks.',
    'Small Business Owners looking to add Farmart organic produce lines.',
    'Aspiring Female Entrepreneurs ready to build a independent career.'
  ];

  const businessCategories = [
    { title: 'Home Restro', icon: Utensils, desc: 'Freshly prepared home-cooked regional meals.' },
    { title: 'Bakery', icon: Cake, desc: 'Artisanal breads, cookies, and wholesome cakes.' },
    { title: 'Sweets', icon: Flame, desc: 'Traditional pure desi ghee sweets & mithai.' },
    { title: 'Dairy Products', icon: Milk, desc: 'Fresh A2 milk, curd, paneer, and farm butter.' },
    { title: 'Pickles & Achar', icon: ShieldCheck, desc: 'Authentic sun-dried regional pickles & preserves.' },
    { title: 'Spices & Masalas', icon: Sparkles, desc: 'Cold-ground pure organic spices & seasonings.' },
    { title: 'Homemade Snacks', icon: ShoppingBag, desc: 'Namkeen, papad, khakhra, and healthy munchies.' },
    { title: 'Personal Care', icon: Sparkle, desc: 'Herbal soaps, ubtan, and natural skincare.' },
    { title: 'Handcrafted Goods', icon: Feather, desc: 'Jute bags, handcrafted decor, and eco-products.' }
  ];

  const whatFarmartProvides = [
    { title: 'Starter Entrepreneur Toolkit', desc: 'Complete initial branding kit, promotional aprons, and digital scales.' },
    { title: 'Digital App & Dashboard', desc: 'User-friendly mobile app for order tracking, customer management, and payouts.' },
    { title: 'Business & Financial Training', desc: 'Step-by-step workshops on pricing, hygiene standards, and smartphone usage.' },
    { title: 'Marketing & Ad Assistance', desc: 'Local flyer distribution, WhatsApp catalog creation, and social media banners.' },
    { title: 'Work-from-Home Flexibility', desc: 'Choose your own operating hours around your household commitments.' },
    { title: 'Direct Organic Ingredients', desc: 'Wholesale farm-gate supply of pure oils, spices, flour, and fresh produce.' },
    { title: 'Commissions & Weekly Payouts', desc: 'Guaranteed high profit margins with weekly direct bank transfers.' },
    { title: 'Dedicated Woman Mentor', desc: '1-on-1 guidance from experienced Nari Shakti coordinators in your region.' }
  ];

  const whyJoinHighlights = [
    {
      icon: DollarSign,
      title: 'Financial Independence & Security',
      desc: 'Earn ₹15,000 - ₹45,000+ monthly while staying in your community.'
    },
    {
      icon: Heart,
      title: 'Dignity & Social Respect',
      desc: 'Become a recognized micro-business leader and role model in your village.'
    },
    {
      icon: ShieldCheck,
      title: 'Zero Franchise Fee',
      desc: 'No heavy upfront investment — start immediately with complete corporate backing.'
    },
    {
      icon: BookOpen,
      title: 'Skill Certification',
      desc: 'Receive official Farmart & FSSAI food safety and entrepreneurship certificates.'
    },
    {
      icon: Users,
      title: 'Supportive Women Network',
      desc: 'Connect with 500+ active women entrepreneurs for peer support and joint sales.'
    },
    {
      icon: Award,
      title: 'Health Insurance & Rewards',
      desc: 'Qualify for family medical insurance, solar appliance grants, and annual awards.'
    }
  ];

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'women-entrepreneur',
          fullName: formData.fullName,
          phone: formData.phone,
          email: 'N/A',
          state: 'N/A',
          district: formData.district,
          experience: formData.category,
          notes: `Interest Area: ${formData.interestArea}`
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
    <div className="women-ent-page">
      {/* 1. Hero Banner */}
      <section className="we-hero-section">
        <div className="container">
          <div className="we-hero-card">
            <button className="we-back-btn" onClick={onBackToEcosystem}>
              ← Back to All Ecosystem Verticals
            </button>

            <div className="we-badge">
              <Sparkles size={16} />
              <span>Nari Shakti Initiative</span>
            </div>

            <h1 className="we-hero-title">Farmart Women Entrepreneur</h1>
            <p className="we-tagline">"Empowering Women. Creating Opportunities. Building Communities."</p>

            {/* 2. Intro Paragraph */}
            <p className="we-intro-paragraph">
              The Farmart Nari Shakti program is a revolutionary initiative empowering women across rural and semi-urban India to build successful, independent micro-enterprises. Whether preparing authentic home food, distributing farm-fresh produce, or crafting artisanal goods, we provide the training, technology, ingredient supply, and marketing support needed to turn your passion into a thriving business.
            </p>

            <div className="we-hero-actions">
              <button className="btn btn-earth" onClick={() => setShowApplyModal(true)}>
                <span>Join Nari Shakti Program</span>
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Talk to Women Coordinator</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Who Can Join */}
      <section className="we-who-section section-padding">
        <div className="container">
          <div className="we-who-wrapper">
            <div className="section-header text-left">
              <div className="badge-tag">
                <Users size={16} />
                <span>Inclusive Community</span>
              </div>
              <h2>Who Can Join?</h2>
              <p>
                Our program is open to all women eager to earn with dignity and lead local commerce.
              </p>
            </div>

            <div className="we-who-grid">
              {whoCanJoin.map((item, idx) => (
                <div key={idx} className="we-who-item">
                  <CheckCircle2 size={20} className="we-check-icon" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Business Categories (9-Icon Grid) */}
      <section className="we-cat-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <ShoppingBag size={16} />
              <span>Diverse Opportunities</span>
            </div>
            <h2>Business Categories</h2>
            <p>Choose your area of expertise or explore multiple revenue streams.</p>
          </div>

          <div className="we-cat-grid">
            {businessCategories.map((cat, idx) => {
              const CIcon = cat.icon;
              return (
                <div key={idx} className="we-cat-card">
                  <div className="we-cat-icon-box">
                    <CIcon size={26} />
                  </div>
                  <h3 className="we-cat-title">{cat.title}</h3>
                  <p className="we-cat-desc">{cat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. What Farmart Provides (8 Checklist Cards) */}
      <section className="we-provides-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Award size={16} />
              <span>Full Support Package</span>
            </div>
            <h2>What Farmart Provides</h2>
            <p>We equip you with everything necessary to run a smooth, profitable business.</p>
          </div>

          <div className="we-provides-grid">
            {whatFarmartProvides.map((item, idx) => (
              <div key={idx} className="we-provides-card">
                <div className="we-provides-check">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="we-provides-title">{item.title}</h3>
                  <p className="we-provides-desc">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Why Become a Farmart Women Entrepreneur (6 Highlight Points) */}
      <section className="we-why-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Heart size={16} />
              <span>Transformative Impact</span>
            </div>
            <h2>Why Become a Farmart Women Entrepreneur?</h2>
            <p>Transforming lives, building financial security, and creating community respect.</p>
          </div>

          <div className="we-why-grid">
            {whyJoinHighlights.map((h, idx) => {
              const HIcon = h.icon;
              return (
                <div key={idx} className="we-why-card">
                  <div className="we-why-icon-box">
                    <HIcon size={26} />
                  </div>
                  <h3 className="we-why-title">{h.title}</h3>
                  <p className="we-why-desc">{h.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. Closing Tagline Banner */}
      <section className="we-cta-section">
        <div className="container">
          <div className="we-cta-card">
            <div className="we-cta-heart">
              <Heart size={32} />
            </div>

            <h2 className="we-cta-tagline">
              "Your Passion. Your Business. Your Success."
            </h2>

            <p className="we-cta-sub">
              Take the first step towards financial freedom today. Join 500+ women leaders growing with Farmart.
            </p>

            <button className="btn btn-earth we-main-btn" onClick={() => setShowApplyModal(true)}>
              <span>Apply for Nari Shakti Program</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Application Modal */}
      {showApplyModal && (
        <div className="we-modal-overlay">
          <div className="we-modal-container fade-in">
            <div className="we-modal-header">
              <h3>Join Farmart Nari Shakti Program</h3>
              <button className="modal-close-btn" onClick={() => setShowApplyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="we-modal-body">
              {submitted ? (
                <div className="we-submit-success">
                  <CheckCircle2 size={50} className="success-icon" />
                  <h4>Application Submitted!</h4>
                  <p>
                    Thank you for joining. Our Nari Shakti District Representative will call you within 24 hours.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="we-apply-form">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sunita Devi"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Village / City & District *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nashik, Maharashtra"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Current Status</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      <option value="Homemaker">Homemaker</option>
                      <option value="Home Chef">Home Chef / Baker</option>
                      <option value="SHG Member">SHG Member</option>
                      <option value="Shop Owner">Small Shop Owner</option>
                      <option value="Student">Student / Youth</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Primary Business Interest</label>
                    <select
                      value={formData.interestArea}
                      onChange={(e) => setFormData({ ...formData, interestArea: e.target.value })}
                    >
                      <option value="Home Restro & Food">Home Restro & Meal Orders</option>
                      <option value="Pickles & Spices">Pickles, Spices & Preserves</option>
                      <option value="Produce Distribution">Fresh Farm Produce Distribution</option>
                      <option value="Handicrafts & Care">Handicrafts & Herbal Products</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-earth full-btn">
                    <Send size={16} />
                    <span>Submit Nari Shakti Application</span>
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
