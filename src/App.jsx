import './App.css';

// ============================================================================
// FARMART - COMING SOON
// ============================================================================
export default function App() {
  return (
    <main className="coming-soon-wrapper" aria-label="Farmart Coming Soon">
      {/* Ambient background glows */}
      <div className="ambient-backdrop" aria-hidden="true">
        <div className="glow-orb orb-primary"></div>
        <div className="glow-orb orb-secondary"></div>
      </div>

      {/* Center Coming Soon Card */}
      <div className="coming-soon-card">
        <div className="brand-badge-container">
          <img
            src="/updated-logo.jpeg"
            alt="Farmart Logo"
            className="brand-logo-img"
          />
          <span className="live-status-pill">
            <span className="pulsing-dot"></span>
            COMING SOON
          </span>
        </div>

        <h1 className="coming-soon-headline">
          <span className="brand-name-accent">Farmart</span>
          <span className="status-text">Coming Soon</span>
        </h1>

        <p className="coming-soon-tagline">
          Empowering Farmers &bull; Building Communities &bull; Growing Bharat
        </p>

        <div className="coming-soon-divider"></div>

        <p className="coming-soon-subtext">
          Our digital platform is currently undergoing scheduled development and upgrades.
          <br />
          We will be launching soon with an enhanced experience!
        </p>

        <div className="coming-soon-footer">
          &copy; {new Date().getFullYear()} Farmart. All rights reserved.
        </div>
      </div>
    </main>
  );
}
