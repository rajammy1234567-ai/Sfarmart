import React, { useState } from 'react';
import {
  Play,
  Pause,
  Film,
  Sparkles,
  Volume2,
  Maximize2,
  CheckCircle2,
  ArrowRight,
  X,
  Radio,
  Zap,
  Globe
} from 'lucide-react';
import './VideoVisualHeroSection.css';

export default function VideoVisualHeroSection({ onOpenContact }) {
  const [isPlayingModal, setIsPlayingModal] = useState(false);
  const [activeChapter, setActiveChapter] = useState('harvest');

  const videoChapters = [
    {
      id: 'harvest',
      title: '01. Farm Gate Procurement',
      time: '0:15',
      badge: 'LIVE FIELD HARVEST',
      desc: 'Watch Indian farmers aggregate organic vegetables with digital precision weighment at Farmart Village Hubs.',
      image: '/hero.png'
    },
    {
      id: 'hubs',
      title: '02. Gram Panchayat Hubs',
      time: '0:45',
      badge: 'VILLAGE HUB MATRIX',
      desc: 'See how 1,200+ local village coordinators book digital orders and disburse 24-hour payouts to farmers.',
      image: '/village_hub.png'
    },
    {
      id: 'women',
      title: '03. Nari Shakti Culinary',
      time: '1:20',
      badge: 'HOME CHEF KITCHENS',
      desc: 'Witness women entrepreneurs preparing authentic thalis, artisanal bakery, and pure desi ghee mithai.',
      image: '/women_chef.png'
    },
    {
      id: 'retail',
      title: '04. FOCO Supermarts',
      time: '2:00',
      badge: 'HIGH-TECH RETAIL',
      desc: 'Experience our IoT-enabled fresh produce supermarts delivering 12-hour harvest freshness to city families.',
      image: '/foco_store.png'
    }
  ];

  const currentChapter = videoChapters.find((c) => c.id === activeChapter) || videoChapters[0];

  return (
    <section className="video-visual-section section-padding">
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <div className="badge-tag video-live-badge">
            <Radio size={16} className="live-dot-pulse" />
            <span>LIVE VIDEO STORY & VISUAL SHOWCASE</span>
          </div>
          <h2>Experience Farmart in Motion</h2>
          <p>
            An interactive visual journey through India’s agricultural revolution — from morning farm harvest to city doorstep.
          </p>
        </div>

        {/* Video Player Frame Card */}
        <div className="video-player-frame" onClick={() => setIsPlayingModal(true)}>
          {/* Animated Background Canvas */}
          <div className="video-poster-wrapper">
            <img
              src={currentChapter.image}
              alt="Farmart Video Visual"
              className="video-poster-img"
            />
            <div className="video-overlay-gradient"></div>
            <div className="video-shimmer-scan"></div>
          </div>

          {/* Floating Top Status Badges */}
          <div className="video-top-badges">
            <div className="video-badge-pill live-pill">
              <span className="red-pulse-dot"></span>
              <span>LIVE REVOLUTION</span>
            </div>
            <div className="video-badge-pill hd-pill">
              <Film size={14} />
              <span>4K CINEMATIC VISUAL</span>
            </div>
          </div>

          {/* Center Play Button Overlay */}
          <div className="video-play-center">
            <div className="play-button-ring">
              <div className="play-button-circle">
                <Play size={36} className="play-icon-triangle" />
              </div>
            </div>
            <span className="play-hint-text">Click to Play Interactive Video Story</span>
          </div>

          {/* Bottom Floating Video Control Bar */}
          <div className="video-control-bar">
            <div className="control-left">
              <button className="mini-play-btn" onClick={(e) => { e.stopPropagation(); setIsPlayingModal(true); }}>
                <Play size={18} />
              </button>

              <div className="equalizer-bars-row">
                <span className="eq-bar bar-1"></span>
                <span className="eq-bar bar-2"></span>
                <span className="eq-bar bar-3"></span>
                <span className="eq-bar bar-4"></span>
              </div>

              <div className="video-time-tag">
                <span>01:45 / 03:00</span>
              </div>
            </div>

            <div className="control-chapter-label">
              <Sparkles size={16} className="chapter-sparkle" />
              <span>Current Chapter: <strong>{currentChapter.badge}</strong></span>
            </div>

            <div className="control-right">
              <Volume2 size={18} />
              <Maximize2 size={18} />
            </div>
          </div>
        </div>

        {/* Video Chapter Selector Tabs below Video */}
        <div className="video-chapters-grid">
          {videoChapters.map((chap) => (
            <div
              key={chap.id}
              className={`chapter-card ${activeChapter === chap.id ? 'active-chapter' : ''}`}
              onClick={() => setActiveChapter(chap.id)}
            >
              <div className="chap-img-thumb">
                <img src={chap.image} alt={chap.title} />
                <div className="chap-play-overlay">
                  <Play size={14} />
                </div>
              </div>

              <div className="chap-info">
                <span className="chap-badge">{chap.badge}</span>
                <h4 className="chap-title">{chap.title}</h4>
                <span className="chap-time">{chap.time} HD</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Full-Screen Video Player Modal */}
      {isPlayingModal && (
        <div className="video-modal-overlay">
          <div className="video-modal-container fade-in-scale">
            <div className="video-modal-header">
              <div className="v-header-title">
                <Radio size={18} className="live-dot-pulse" />
                <span>Farmart Ecosystem Video Showcase — {currentChapter.badge}</span>
              </div>
              <button className="v-close-btn" onClick={() => setIsPlayingModal(false)}>
                <X size={22} />
              </button>
            </div>

            <div className="video-screen-viewport">
              <img src={currentChapter.image} alt="Video Playback" className="v-screen-img" />
              <div className="v-screen-gradient"></div>

              <div className="v-screen-center-play">
                <div className="v-pulse-ring">
                  <Play size={48} />
                </div>
                <h3>Playing Chapter: {currentChapter.title}</h3>
                <p>{currentChapter.desc}</p>
              </div>

              <div className="v-progress-bar-line">
                <div className="v-progress-fill"></div>
              </div>
            </div>

            <div className="video-modal-footer">
              <div className="v-footer-info">
                <strong>Empowering Farmers • Strengthening Communities • Building Bharat</strong>
                <span>Join over 50,000+ farmers and 1,200+ Village Hubs across India.</span>
              </div>
              <button className="btn btn-primary" onClick={() => { setIsPlayingModal(false); onOpenContact(); }}>
                <span>Partner With Farmart</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
