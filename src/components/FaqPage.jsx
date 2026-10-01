import React, { useState } from 'react';
import { Search, Plus, Minus, HelpCircle, ArrowRight } from 'lucide-react';
import './FaqPage.css';

export default function FaqPage({ onOpenContact }) {
  const [activeTab, setActiveTab] = useState('General');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState('faq-1');

  const faqCategories = [
    'General',
    'Customer',
    'Farmer',
    'Growth Partner',
    'Village Hub',
    'Delivery Partner',
    'Payments & Wallet'
  ];

  const faqData = [
    // General
    {
      id: 'faq-1',
      category: 'General',
      question: 'What is Farmart and how does the ecosystem operate?',
      answer: 'Farmart is India’s pioneer agri-tech and community commerce ecosystem. We connect smallholder farmers, village hubs, local food creators, and urban households directly to ensure fair farm-gate prices and 12-hour fresh produce delivery.'
    },
    {
      id: 'faq-2',
      category: 'General',
      question: 'Is Farmart a registered agri-tech platform?',
      answer: 'Yes, Farmart Agri Tech Pvt Ltd is a fully registered digital commerce platform operating in compliance with national agricultural guidelines and FSSAI food safety standards.'
    },

    // Customer
    {
      id: 'faq-3',
      category: 'Customer',
      question: 'How do I place an order for fresh produce or home thalis?',
      answer: 'You can order directly via the Farmart Consumer Mobile App or Web Portal. Choose your location, select fresh produce or Home Restro thalis, and enjoy guaranteed same-day delivery.'
    },
    {
      id: 'faq-4',
      category: 'Customer',
      question: 'What is the quality assurance policy for organic vegetables?',
      answer: 'All Farmart produce undergoes AI-assisted quality grading and zero-chemical testing at regional Village Hubs prior to dispatch.'
    },

    // Farmer
    {
      id: 'faq-5',
      category: 'Farmer',
      question: 'How do farmers register to sell produce on Farmart?',
      answer: 'Farmers can register free via the Farmart Kisan Mobile App or visit their nearest Gram Panchayat Village Hub. Our Field Officers conduct soil testing and farm-gate procurement.'
    },
    {
      id: 'faq-6',
      category: 'Farmer',
      question: 'When do farmers receive payment for their crop harvest?',
      answer: 'Farmart guarantees direct UPI or bank account transfers within 24 hours of harvest pickup, eliminating middleman delays.'
    },

    // Growth Partner
    {
      id: 'faq-7',
      category: 'Growth Partner',
      question: 'What are the eligibility criteria for becoming a Growth Partner?',
      answer: 'Applicants should possess city-level business or team management experience, financial capability for territorial scaling, and strong community leadership drive.'
    },

    // Village Hub
    {
      id: 'faq-8',
      category: 'Village Hub',
      question: 'What space requirement is needed for a Village Hub?',
      answer: 'A minimum ground-floor space of 150 - 200 sq.ft in a Gram Panchayat is sufficient to set up a Farmart Village Hub.'
    },

    // Delivery Partner
    {
      id: 'faq-9',
      category: 'Delivery Partner',
      question: 'How can delivery fleet partners earn with Farmart?',
      answer: 'Hyperlocal electric vehicle and two-wheeler delivery partners earn per-order payouts, daily fuel allowances, and weekly incentive bonuses.'
    },

    // Payments & Wallet
    {
      id: 'faq-10',
      category: 'Payments & Wallet',
      question: 'What payment modes are supported on the Farmart platform?',
      answer: 'We support UPI (GPay, PhonePe, Paytm), Credit/Debit Cards, Net Banking, Farmart Kisan Wallet, and Cash on Delivery (COD).'
    }
  ];

  const filteredFaqs = faqData.filter((item) => {
    const matchesTab = activeTab === 'All' || item.category === activeTab;
    const matchesSearch =
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const toggleFaq = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="faq-page-wrapper">
      {/* 1. Hero Header */}
      <section className="faq-hero-section">
        <div className="container">
          <div className="faq-hero-card">
            <div className="faq-badge">
              <HelpCircle size={16} />
              <span>Help Center & Knowledge Base</span>
            </div>

            <h1 className="faq-title">Frequently Asked Questions</h1>
            <p className="faq-sub">
              Have questions about buying, selling, or partnering with Farmart? Find quick answers below or search your topic.
            </p>

            {/* Search Bar */}
            <div className="faq-search-box">
              <Search size={20} className="faq-search-icon" />
              <input
                type="text"
                placeholder="Type your question (e.g. payment, delivery, village hub)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Category Tabs & Accordion UI */}
      <section className="faq-content-section section-padding">
        <div className="container">
          {/* Category Tabs */}
          <div className="faq-tabs-row">
            {faqCategories.map((cat) => (
              <button
                key={cat}
                className={`faq-tab-btn ${activeTab === cat ? 'active' : ''}`}
                onClick={() => setActiveTab(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Accordion List */}
          <div className="faq-accordion-container">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq) => {
                const isOpen = expandedId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className={`faq-accordion-item ${isOpen ? 'open' : ''}`}
                    onClick={() => toggleFaq(faq.id)}
                  >
                    <div className="faq-question-header">
                      <h3 className="faq-question-text">{faq.question}</h3>
                      <button className="faq-toggle-btn" aria-label="Toggle answer">
                        {isOpen ? <Minus size={20} /> : <Plus size={20} />}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="faq-answer-body fade-in">
                        <p>{faq.answer}</p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="no-faq-found">
                <p>No matching questions found. Please try another search term or contact our support team.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Support Banner */}
      <section className="faq-support-banner">
        <div className="container">
          <div className="faq-support-card">
            <h3>Still Have Questions?</h3>
            <p>Our dedicated support team is available 7 days a week to help you.</p>
            <button className="btn btn-primary" onClick={onOpenContact}>
              <span>Contact Support Team</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
