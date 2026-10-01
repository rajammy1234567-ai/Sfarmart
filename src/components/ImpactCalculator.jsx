import React, { useState } from 'react';
import { Calculator, TrendingUp, Users, Sprout, ArrowRight } from 'lucide-react';
import './ImpactCalculator.css';

export default function ImpactCalculator({ onOpenCategoryModal }) {
  const [partnerType, setPartnerType] = useState('village-hub');
  const [volume, setVolume] = useState(150); // Farmers or Households served

  // Calculation Logic based on partner type & volume
  const getCalculations = () => {
    if (partnerType === 'village-hub') {
      const estIncome = Math.round(volume * 280);
      const farmersImpacted = Math.round(volume * 1.8);
      const produceAggregated = Math.round(volume * 0.45); // Tons/mo
      return {
        incomeLabel: 'Est. Monthly Partner Income',
        incomeValue: `₹${estIncome.toLocaleString('en-IN')}`,
        stat1Label: 'Farmers Connected',
        stat1Value: `${farmersImpacted}`,
        stat2Label: 'Monthly Produce Handled',
        stat2Value: `${produceAggregated} Tons`,
        unitLabel: 'Farmers / Households Served Daily'
      };
    } else if (partnerType === 'women-entrepreneur') {
      const estIncome = Math.round(volume * 220);
      const familiesServed = volume;
      const shgGrowth = Math.round(volume * 0.12);
      return {
        incomeLabel: 'Est. Monthly Income & Incentives',
        incomeValue: `₹${estIncome.toLocaleString('en-IN')}`,
        stat1Label: 'Families Served Fresh Produce',
        stat1Value: `${familiesServed}`,
        stat2Label: 'SHG Members Support',
        stat2Value: `${shgGrowth} Women`,
        unitLabel: 'Active Neighborhood Customers'
      };
    } else {
      // FOCO Franchise
      const estIncome = Math.round(volume * 1400);
      const annualRoi = Math.min(36, Math.round(18 + volume * 0.05));
      const dailyFootfall = volume * 4;
      return {
        incomeLabel: 'Est. Monthly Store Net Profit',
        incomeValue: `₹${estIncome.toLocaleString('en-IN')}`,
        stat1Label: 'Target Annual ROI',
        stat1Value: `${annualRoi}%`,
        stat2Label: 'Daily Customer Footfall',
        stat2Value: `${dailyFootfall}`,
        unitLabel: 'Daily Store Orders / Scale'
      };
    }
  };

  const calc = getCalculations();

  return (
    <section id="calculator" className="calculator-section section-padding">
      <div className="container">
        <div className="calculator-wrapper">
          {/* Left Column: Interactive Controls */}
          <div className="calc-controls">
            <div className="badge-tag">
              <Calculator size={16} />
              <span>Earnings & Community Calculator</span>
            </div>
            <h2>Estimate Your Growth with <span className="gradient-text">Farmart</span></h2>
            <p className="calc-desc">
              Select your partnership model and slide to see your projected monthly income and positive community impact across rural India.
            </p>

            {/* Selector */}
            <div className="partner-type-selector">
              <button
                className={`type-btn ${partnerType === 'village-hub' ? 'selected' : ''}`}
                onClick={() => { setPartnerType('village-hub'); setVolume(150); }}
              >
                Village Hub
              </button>
              <button
                className={`type-btn ${partnerType === 'women-entrepreneur' ? 'selected' : ''}`}
                onClick={() => { setPartnerType('women-entrepreneur'); setVolume(100); }}
              >
                Women Entrepreneur
              </button>
              <button
                className={`type-btn ${partnerType === 'foco-franchise' ? 'selected' : ''}`}
                onClick={() => { setPartnerType('foco-franchise'); setVolume(120); }}
              >
                FOCO Franchise
              </button>
            </div>

            {/* Slider */}
            <div className="slider-box">
              <div className="slider-header">
                <label className="slider-label">{calc.unitLabel}</label>
                <span className="slider-value-badge">{volume}</span>
              </div>
              <input
                type="range"
                min="30"
                max="500"
                step="10"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="custom-range-slider"
              />
              <div className="slider-range-labels">
                <span>30 Min</span>
                <span>250 Scale</span>
                <span>500 Max</span>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Results Card */}
          <div className="calc-results-card">
            <div className="results-glow"></div>
            
            <div className="results-top-label">{calc.incomeLabel}</div>
            <div className="results-amount">{calc.incomeValue}</div>
            <span className="results-period">*Estimated based on network average parameters</span>

            <div className="results-stats-grid">
              <div className="stat-card">
                <Users size={22} className="stat-icon-green" />
                <div className="stat-info">
                  <div className="stat-number">{calc.stat1Value}</div>
                  <div className="stat-name">{calc.stat1Label}</div>
                </div>
              </div>

              <div className="stat-card">
                <Sprout size={22} className="stat-icon-amber" />
                <div className="stat-info">
                  <div className="stat-number">{calc.stat2Value}</div>
                  <div className="stat-name">{calc.stat2Label}</div>
                </div>
              </div>
            </div>

            <button
              className="btn btn-earth calc-apply-btn"
              onClick={() => onOpenCategoryModal(partnerType)}
            >
              <span>Apply for {partnerType.replace('-', ' ').toUpperCase()}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
