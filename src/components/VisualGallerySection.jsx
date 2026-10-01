import React from 'react';
import { ArrowUpRight, Sparkles, Image as ImageIcon } from 'lucide-react';
import './VisualGallerySection.css';
import { categoriesData } from '../data/categories';

export default function VisualGallerySection({ onSelectCategory }) {
  return (
    <section className="visual-gallery-section section-padding">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="badge-tag">
            <ImageIcon size={16} />
            <span>VISUAL EXPLORER & VERTICALS</span>
          </div>
          <h2>Explore Farmart Ecosystem Through Imagery</h2>
          <p>
            Take a visual tour of our farm-to-home supply chain, community hubs, women creators, and retail supermarts across India.
          </p>
        </div>

        {/* Visual Topic Cards Grid */}
        <div className="visual-cards-grid">
          {categoriesData.map((item) => (
            <div
              key={item.id}
              className="visual-topic-card"
              onClick={() => onSelectCategory(item.id)}
            >
              {/* Image Frame */}
              <div className="topic-img-wrapper">
                <img
                  src={item.image}
                  alt={item.title}
                  className="topic-card-img"
                  onError={(e) => {
                    e.target.src = '/hero.png';
                  }}
                />
                <div className="topic-img-overlay"></div>

                <div className="topic-card-badge">
                  <span>{item.badge}</span>
                </div>
              </div>

              {/* Content Body */}
              <div className="topic-card-content">
                <h3 className="topic-card-title">{item.title}</h3>
                <p className="topic-card-desc">{item.shortDesc}</p>

                <div className="topic-card-footer">
                  <span className="explore-link-text">Explore Topic</span>
                  <div className="explore-icon-circle">
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
