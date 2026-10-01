import React from 'react';
import {
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Award,
  Heart,
  Store,
  Home,
  Utensils,
  Sprout,
  UserCheck,
  Briefcase,
  DollarSign,
  Smartphone
} from 'lucide-react';
import './PartnerSuccessStoriesSection.css';

export default function PartnerSuccessStoriesSection({ onSelectCategory, onOpenContact }) {
  const stories = [
    {
      id: 'farmer-network',
      title: 'Farmer & Harvest Aggregators',
      person: 'Ramesh Patel & 50,000+ Farmers',
      location: 'Nashik, Maharashtra',
      earning: '25% - 40% Higher Crop Revenue',
      image: '/hero.png',
      badge: 'FARM GATE DIRECT PROCUREMENT',
      impactText: 'Got guaranteed 12-hour direct harvest procurement at farm gate with 0% Mandi commission and instant 24-hr bank payout.',
      howToJoin: 'Register your farm on Kisan App or bring harvest to your local Gram Panchayat Village Hub.'
    },
    {
      id: 'women-entrepreneur',
      title: 'Women Home Chefs & Artisanal Bakers',
      person: 'Sunita Sharma & Nari Shakti SHG',
      location: 'Patna, Bihar',
      earning: '₹35,000 - ₹60,000 / month',
      image: '/women_chef.png',
      badge: 'NARI SHAKTI HOME KITCHENS',
      impactText: 'Turned home cooking & sweets making passion into a thriving business preparing authentic thalis, mithai & bakery items.',
      howToJoin: 'Apply under Nari Shakti program & receive free kitchen branding, packaging, and FSSAI certification.'
    },
    {
      id: 'village-hub',
      title: 'Gram Panchayat Village Hub Leaders',
      person: 'Vikram Singh & 1,200+ Coordinators',
      location: 'Lucknow, Uttar Pradesh',
      earning: '₹25,000 - ₹45,000 / month',
      image: '/village_hub.png',
      badge: 'VILLAGE HUB ANCHOR',
      impactText: 'Converted a 150 sq.ft village room into a high-tech aggregation hub serving 400+ local farming families daily.',
      howToJoin: 'Apply with 100-200 sq.ft ground room space in your Panchayat to get exclusive territory coordinator rights.'
    },
    {
      id: 'foco-franchise',
      title: 'FOCO Supermart Store Owners',
      person: 'Amit Verma & Retail Investors',
      location: 'Indore, Madhya Pradesh',
      earning: 'High Monthly ROI (FOCO Model)',
      image: '/farmart_store_hero.jpg',
      badge: 'FOCO RETAIL SUPERMART',
      impactText: 'Owns a high-revenue Agri Mart supermart while Farmart corporate operations team manages 100% daily inventory & staffing.',
      howToJoin: 'Apply for FOCO Franchise in your city & invest with 100% company-managed peace of mind.'
    },
    {
      id: 'digital-partner',
      title: 'Digital Business Partners',
      person: 'Rahul Deshmukh & Youth Entrepreneurs',
      location: 'Pune / Nagpur',
      earning: '₹20,000 - ₹40,000 / month',
      image: '/dmart_hero.png',
      badge: 'SMARTPHONE DIGITAL PARTNER',
      impactText: 'Runs a smartphone-based digital business connecting local shops, bulk buyers, and fresh produce orders across city clusters.',
      howToJoin: 'Register as a Digital Business Partner with your smartphone and start booking orders with zero inventory risk.'
    },
    {
      id: 'careers',
      title: 'Ground Operations Managers',
      person: 'Anish Sharma & Ground Team',
      location: 'Lucknow / Bhopal / Patna',
      earning: '₹6.5 - ₹9.5 LPA + Incentives',
      image: '/produce.png',
      badge: 'GROUND OPERATIONS TEAM',
      impactText: 'Oversees 50+ Gram Panchayat aggregation centers, crop testing labs, and 12-hour morning logistics dispatch engines.',
      howToJoin: 'Apply for Cluster Operations Manager under Careers & join our high-growth ground operations team.'
    }
  ];

  const joinSteps = [
    {
      num: '01',
      title: 'Select Your Work Role',
      desc: 'Choose whether you want to join as a Farmer, Village Hub Coordinator, Women Home Chef, Digital Partner, or Store Owner.',
      icon: Users
    },
    {
      num: '02',
      title: 'Submit 1-Minute Online Form',
      desc: 'Fill out your basic contact number and location details on our website or Kisan Mobile App.',
      icon: Sparkles
    },
    {
      num: '03',
      title: 'Verification & Starter Kit',
      desc: 'Our Regional Officer visits your location to provide official Farmart digital tools, weighing scale, and training.',
      icon: UserCheck
    },
    {
      num: '04',
      title: 'Start Working & Earning Daily',
      desc: 'Begin operating with guaranteed payouts, 24-hr bank settlements, and full company supply chain support.',
      icon: TrendingUp
    }
  ];

  return (
    <section className="success-stories-section section-padding">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="badge-tag stories-tag">
            <Users size={16} />
            <span>REAL EMPLOYMENT & COMMUNITY WORK</span>
          </div>
          <h2>
            How People Earn & Build Careers with <span className="gradient-text">Farmart</span>
          </h2>
          <p>
            Real stories of farmers, women entrepreneurs, village leaders, and operations managers who got dignified work & income — see how YOU can join them today!
          </p>
        </div>

        {/* 6 Impact Cards Grid */}
        <div className="stories-grid-6col">
          {stories.map((item) => (
            <div key={item.id} className="story-card-modern">
              <div className="story-img-frame">
                <img src={item.image} alt={item.title} className="story-img" />
                <span className="story-badge-pill">{item.badge}</span>
                <span className="earning-tag-pill">💰 {item.earning}</span>
              </div>

              <div className="story-card-body">
                <div className="story-person-row">
                  <span className="person-name">{item.person}</span>
                  <span className="person-loc">📍 {item.location}</span>
                </div>

                <h3 className="story-title">{item.title}</h3>
                
                <div className="impact-box">
                  <p className="impact-text">"{item.impactText}"</p>
                </div>

                <div className="how-to-join-box">
                  <strong><UserCheck size={14} className="green-icon" /> How They Work & Join:</strong>
                  <p>{item.howToJoin}</p>
                </div>

                <button
                  className="btn btn-earth story-join-btn"
                  onClick={() => onSelectCategory(item.id)}
                >
                  <span>Apply & Work Here</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 4-Step "How You Can Join" Timeline Banner */}
        <div className="how-you-can-join-wrapper">
          <div className="join-header">
            <h3>4 Easy Steps to Join Farmart & Start Working</h3>
            <p>Simple 1-minute registration process for all roles across India.</p>
          </div>

          <div className="join-steps-row">
            {joinSteps.map((step) => {
              const StepIcon = step.icon;
              return (
                <div key={step.num} className="join-step-card">
                  <div className="join-step-circle">
                    <span className="step-num">{step.num}</span>
                    <StepIcon size={20} className="step-icon" />
                  </div>
                  <h4>{step.title}</h4>
                  <p>{step.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="join-cta-footer">
            <button className="btn btn-earth pulse-glow-button" onClick={onOpenContact}>
              <Sparkles size={18} />
              <span>Apply & Start Working Today</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
