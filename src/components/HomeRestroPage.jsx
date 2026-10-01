import React, { useState } from 'react';
import {
  Utensils,
  CheckCircle2,
  Heart,
  Award,
  ShieldCheck,
  Cake,
  Flame,
  Clock,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Send,
  X,
  Coffee,
  Soup,
  Gift
} from 'lucide-react';
import './HomeRestroPage.css';

export default function HomeRestroPage({ onOpenContact, onBackToEcosystem }) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    city: '',
    kitchenType: 'Home Chef',
    specialty: 'North / South Indian Meals'
  });

  const whatWeOffer = [
    {
      title: 'Freshly Prepared Meals',
      desc: 'Cooked fresh on order in small batches using pure farm-sourced ingredients.',
      icon: Utensils,
      color: 'orange'
    },
    {
      title: 'Homemade Breakfast, Lunch & Dinner',
      desc: 'Balanced thalis, wholesome tiffin subscriptions, and comforting daily meals.',
      icon: Soup,
      color: 'amber'
    },
    {
      title: 'Regional & Traditional Recipes',
      desc: 'Authentic heirloom recipes passed down through generations of home chefs.',
      icon: Heart,
      color: 'red'
    },
    {
      title: 'Hygienic Kitchens',
      desc: 'FSSAI certified and regularly audited home kitchens adhering to strict safety standards.',
      icon: ShieldCheck,
      color: 'green'
    },
    {
      title: 'Convenient Online Ordering',
      desc: 'Seamless mobile app ordering, subscription scheduling, and hot doorstep delivery.',
      icon: Clock,
      color: 'emerald'
    }
  ];

  const whyChooseRestro = [
    {
      title: '100% Farm-Fresh Ingredients',
      desc: 'All produce, oils, and spices are sourced directly from verified Farmart organic farmers.'
    },
    {
      title: 'Zero Preservatives or Artificial Flavors',
      desc: 'Pure, wholesome home cooking free from harmful additives, MSG, or artificial colors.'
    },
    {
      title: 'Empowers Local Women & Home Chefs',
      desc: 'Providing sustainable earnings and business ownership to local culinary entrepreneurs.'
    },
    {
      title: 'Eco-Friendly & Hygienic Packaging',
      desc: 'Food-grade, leak-proof, eco-friendly packaging ensuring meal warmth and safety.'
    },
    {
      title: 'Affordable Everyday Dining',
      desc: 'Restaurant-quality taste at honest home prices for daily office thalis and family meals.'
    }
  ];

  const bakeryItems = [
    { title: 'Artisanal Breads & Pav', icon: Cake, desc: 'Whole wheat, sourdough & multi-grain loaves baked fresh daily.' },
    { title: 'Wholesome Cookies', icon: Coffee, desc: 'Desi ghee oats, millet, and almond jaggery cookies.' },
    { title: 'Muffins & Cakes', icon: Cake, desc: 'Eggless banana walnut cakes & chocolate tea cakes.' },
    { title: 'Gluten-Free Bakes', icon: Award, desc: 'Ragi, amaranth, and buckwheat specialty bakes.' }
  ];

  const sweetsItems = [
    { title: 'Desi Ghee Mithai', icon: Flame, desc: 'Pure A2 ghee gulab jamun, besan ladoo & kaju katli.' },
    { title: 'Festival Special Mithai', icon: Sparkles, desc: 'Handcrafted modak, gujiya, and seasonal festive sweets.' },
    { title: 'Organic Jaggery Sweets', icon: ShieldCheck, desc: 'Refined sugar-free jaggery chikki & til ladoos.' },
    { title: 'Artisanal Gift Hampers', icon: Gift, desc: 'Custom festive & corporate sweet gift boxes.' }
  ];

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://farm-mart-api.onrender.com/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'home-restro',
          fullName: formData.fullName,
          phone: formData.phone,
          email: 'N/A',
          state: 'N/A',
          district: formData.city,
          experience: formData.kitchenType,
          notes: `Specialty: ${formData.specialty}`
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
    <div className="home-restro-page">
      {/* 1. Hero Banner */}
      <section className="hr-hero-section">
        <div className="container">
          <div className="hr-hero-card">
            <button className="hr-back-btn" onClick={onBackToEcosystem}>
              ← Back to All Ecosystem Verticals
            </button>

            <div className="hr-badge">
              <Utensils size={16} />
              <span>Culinary Marketplace</span>
            </div>

            <h1 className="hr-hero-title">Farmart Home Restro</h1>
            <p className="hr-tagline">"Homemade Taste. Trusted Quality."</p>

            {/* 2. Intro Paragraph */}
            <p className="hr-intro-paragraph">
              Farmart Home Restro bridges passionate home chefs, traditional cooks, and cloud kitchens directly with health-conscious customers seeking authentic thalis, regional delicacies, and wholesome home-cooked meals. Using 100% farm-fresh ingredients sourced directly from Farmart farmers, our home chefs deliver warmth and nostalgia to your dining table.
            </p>

            <div className="hr-hero-actions">
              <button className="btn btn-earth hr-orange-btn" onClick={() => setShowApplyModal(true)}>
                <span>Register Your Home Kitchen</span>
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={onOpenContact}>
                <span>Order Fresh Meals</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. What We Offer (Icon List) */}
      <section className="hr-offer-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Soup size={16} />
              <span>Culinary Selection</span>
            </div>
            <h2>What We Offer</h2>
            <p>Authentic, hygienic, and wholesome home-cooked meals for every craving.</p>
          </div>

          <div className="hr-offer-grid">
            {whatWeOffer.map((o, idx) => {
              const OIcon = o.icon;
              return (
                <div key={idx} className="hr-offer-card">
                  <div className={`hr-offer-icon-box ${o.color}`}>
                    <OIcon size={28} />
                  </div>
                  <h3 className="hr-offer-title">{o.title}</h3>
                  <p className="hr-offer-desc">{o.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Why Choose Farmart Home Restro (5 Checklist Cards) */}
      <section className="hr-why-section section-padding">
        <div className="container">
          <div className="hr-why-wrapper">
            <div className="section-header text-left">
              <div className="badge-tag">
                <ShieldCheck size={16} />
                <span>The Home Restro Difference</span>
              </div>
              <h2>Why Choose Farmart Home Restro?</h2>
              <p>Combining the love of home cooking with strict safety & ingredient purity.</p>
            </div>

            <div className="hr-checklist-grid">
              {whyChooseRestro.map((item, idx) => (
                <div key={idx} className="hr-check-card">
                  <div className="hr-check-circle">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 className="hr-check-title">{item.title}</h3>
                    <p className="hr-check-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Sub-sections: Bakery & Sweets */}
      <section className="hr-sub-section section-padding">
        <div className="container">
          <div className="section-header">
            <div className="badge-tag">
              <Cake size={16} />
              <span>Specialty Kitchen Divisions</span>
            </div>
            <h2>Farmart Bakery & Farmart Sweets</h2>
            <p>Handcrafted baked goods and traditional mithai made with pure farm butter & A2 ghee.</p>
          </div>

          {/* Farmart Bakery Sub-Section */}
          <div className="specialty-block bakery-block">
            <div className="spec-header">
              <div className="spec-icon-box bakery-icon">
                <Cake size={32} />
              </div>
              <div>
                <span className="spec-tag">Artisanal Bakery</span>
                <h3 className="spec-promise">"Freshly Baked Daily — Pure, Wholesome Bakes"</h3>
              </div>
            </div>

            <div className="spec-grid">
              {bakeryItems.map((b, idx) => (
                <div key={idx} className="spec-card">
                  <h4 className="spec-card-title">{b.title}</h4>
                  <p className="spec-card-desc">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Farmart Sweets Sub-Section */}
          <div className="specialty-block sweets-block">
            <div className="spec-header">
              <div className="spec-icon-box sweets-icon">
                <Flame size={32} />
              </div>
              <div>
                <span className="spec-tag amber-tag">Traditional Confectionery</span>
                <h3 className="spec-promise">"Pure Desi Ghee Mithai — Celebration of Tradition"</h3>
              </div>
            </div>

            <div className="spec-grid">
              {sweetsItems.map((s, idx) => (
                <div key={idx} className="spec-card">
                  <h4 className="spec-card-title">{s.title}</h4>
                  <p className="spec-card-desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Closing Tagline Banner */}
      <section className="hr-cta-section">
        <div className="container">
          <div className="hr-cta-card">
            <div className="hr-cta-icon">
              <Heart size={32} />
            </div>

            <h2 className="hr-cta-tagline">
              "Made with Care. Served with Trust."
            </h2>

            <p className="hr-cta-sub">
              Share your culinary talents with thousands of neighborhood customers. Complete digital onboarding support provided.
            </p>

            <button className="btn btn-earth hr-orange-btn hr-main-btn" onClick={() => setShowApplyModal(true)}>
              <span>Register Your Kitchen</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Kitchen Registration Modal */}
      {showApplyModal && (
        <div className="hr-modal-overlay">
          <div className="hr-modal-container fade-in">
            <div className="hr-modal-header">
              <h3>Register as a Home Restro Partner</h3>
              <button className="modal-close-btn" onClick={() => setShowApplyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="hr-modal-body">
              {submitted ? (
                <div className="hr-submit-success">
                  <CheckCircle2 size={50} className="success-icon" />
                  <h4>Kitchen Application Received!</h4>
                  <p>
                    Thank you for applying. Our FSSAI & Culinary Onboarding Officer will contact you for a kitchen audit within 24 hours.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setSubmitted(false); setShowApplyModal(false); }}>
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="hr-apply-form">
                  <div className="form-group">
                    <label>Chef / Owner Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ananya Roy"
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
                    <label>City & Locality *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Indiranagar, Bengaluru"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Kitchen Type</label>
                    <select
                      value={formData.kitchenType}
                      onChange={(e) => setFormData({ ...formData, kitchenType: e.target.value })}
                    >
                      <option value="Home Chef">Home Chef (Individual Kitchen)</option>
                      <option value="Bakery & Sweets">Boutique Bakery / Sweets Creator</option>
                      <option value="Cloud Kitchen">Small Cloud Kitchen</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Primary Food Specialty</label>
                    <select
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    >
                      <option value="North / South Indian Meals">North & South Indian Daily Thalis</option>
                      <option value="Regional Delicacies">Regional Delicacies (Bengali, Gujarati, etc.)</option>
                      <option value="Baked Goods & Breads">Artisanal Bakery & Desserts</option>
                      <option value="Traditional Sweets">Desi Ghee Sweets & Mithai</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-earth hr-orange-btn full-btn">
                    <Send size={16} />
                    <span>Submit Kitchen Application</span>
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
