import React from 'react';
import {
    IonPage,
    IonContent,
    IonButton,
    IonIcon,
} from '@ionic/react';
import {
    football,
    cloudOffline,
    checkmarkCircle,
    closeCircle,
    sync,
    flash,
    statsChart,
    wifi,
} from 'ionicons/icons';
import ThemeToggle from '../components/ThemeToggle';
import { TIERS, FEATURE_COMPARISON } from '../constants/tiers';
import './LandingPage.css';

interface LandingPageProps {
    onNavigate?: (page: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
    const navigate = (page: string) => {
        onNavigate?.(page);
    };

    return (
        <IonPage className="landing-page">
            <IonContent scrollEvents>
                {/* Header */}
                <header className="landing-header">
                    <div className="landing-logo">
                        <IonIcon icon={football} className="landing-logo-icon" />
                        <span>MatchMaster</span>
                    </div>
                    <div className="landing-header-actions">
                        <ThemeToggle />
                        <IonButton
                            fill="clear"
                            className="landing-signin-btn"
                            onClick={() => navigate('login')}
                        >
                            Sign In
                        </IonButton>
                    </div>
                </header>

                {/* Hero Section */}
                <section className="landing-hero">
                    <div className="hero-content">
                        <div className="hero-badge">
                            <IonIcon icon={cloudOffline} className="hero-badge-icon" />
                            Works 100% Offline
                        </div>

                        <h1 className="hero-title">
                            Track Every Match.
                            <br />
                            <span className="hero-title-highlight">No WiFi Required.</span>
                        </h1>

                        <p className="hero-subtitle">
                            The only grassroots football tracker that works completely offline.
                            Record goals, subs, and formations pitch-side — even with zero signal.
                        </p>

                        <div className="hero-cta-group">
                            <IonButton
                                className="hero-cta-primary"
                                onClick={() => navigate('dashboard')}
                            >
                                Try as Guest — Free
                            </IonButton>
                            <IonButton
                                className="hero-cta-secondary"
                                onClick={() => navigate('register')}
                            >
                                Sign Up Free
                            </IonButton>
                        </div>

                        <div className="hero-stats-row">
                            <div className="hero-stat">
                                <div className="hero-stat-value">100%</div>
                                <div className="hero-stat-label">Offline Capable</div>
                            </div>
                            <div className="hero-stat">
                                <div className="hero-stat-value">Free</div>
                                <div className="hero-stat-label">To Get Started</div>
                            </div>
                            <div className="hero-stat">
                                <div className="hero-stat-value">&lt;1min</div>
                                <div className="hero-stat-label">Setup Time</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="landing-features">
                    <h2 className="landing-section-title">
                        Built for Coaches & Parents
                    </h2>
                    <p className="landing-section-subtitle">
                        Track your grassroots matches properly. No more scribbling on paper.
                    </p>

                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-card-icon live">
                                <IonIcon icon={flash} />
                            </div>
                            <h3 className="feature-card-title">Live Match Tracking</h3>
                            <p className="feature-card-description">
                                Record goals, substitutions, formations, and key events in real-time.
                                Tap-to-log interface designed for pitch-side use.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-card-icon offline">
                                <IonIcon icon={cloudOffline} />
                            </div>
                            <h3 className="feature-card-title">Works Completely Offline</h3>
                            <p className="feature-card-description">
                                No internet at the pitch? No problem. Everything saves locally and syncs
                                automatically when you're back online.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-card-icon sync">
                                <IonIcon icon={sync} />
                            </div>
                            <h3 className="feature-card-title">Sync Across Devices</h3>
                            <p className="feature-card-description">
                                Start on your phone at the match, review on your tablet at home.
                                Your data stays in sync across all your devices.
                            </p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-card-icon stats">
                                <IonIcon icon={statsChart} />
                            </div>
                            <h3 className="feature-card-title">Player Statistics</h3>
                            <p className="feature-card-description">
                                Track individual player performance across the season.
                                See who's improving and celebrate achievements.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Offline Highlight Section */}
                <section className="landing-offline-highlight">
                    <IonIcon icon={wifi} className="offline-highlight-icon" style={{ opacity: 0.3 }} />
                    <h2 className="offline-highlight-title">
                        Built for Real Football Fields
                    </h2>
                    <p className="offline-highlight-description">
                        Most grassroots pitches have terrible signal. We built MatchMaster to work
                        where other apps fail — no internet, no problem.
                    </p>
                    <div className="offline-features-list">
                        <div className="offline-feature-item">
                            <IonIcon icon={checkmarkCircle} className="offline-feature-icon" />
                            Record entire matches offline
                        </div>
                        <div className="offline-feature-item">
                            <IonIcon icon={checkmarkCircle} className="offline-feature-icon" />
                            Auto-sync when connected
                        </div>
                        <div className="offline-feature-item">
                            <IonIcon icon={checkmarkCircle} className="offline-feature-icon" />
                            No data loss, ever
                        </div>
                    </div>
                </section>

                {/* Pricing Section */}
                <section className="landing-pricing">
                    <h2 className="landing-section-title">
                        Simple, Fair Pricing
                    </h2>
                    <p className="landing-section-subtitle">
                        Start free, upgrade when you need more.
                    </p>

                    <div className="pricing-cards">
                        {/* Guest Tier */}
                        <div className="pricing-card">
                            <h3 className="pricing-tier-name">{TIERS.guest.name}</h3>
                            <p className="pricing-tier-tagline">{TIERS.guest.tagline}</p>
                            <div className="pricing-price">
                                <span className="pricing-amount">{TIERS.guest.price}</span>
                            </div>
                            <p className="pricing-yearly" style={{ color: 'var(--grassroots-text-tertiary)' }}>
                                {TIERS.guest.priceNote}
                            </p>
                            <ul className="pricing-features-list">
                                {TIERS.guest.highlights.map((feature, idx) => (
                                    <li key={idx} className="pricing-feature-item">
                                        <IonIcon icon={checkmarkCircle} className="pricing-feature-icon included" />
                                        {feature}
                                    </li>
                                ))}
                                {TIERS.guest.limitations.map((limitation, idx) => (
                                    <li key={`lim-${idx}`} className="pricing-feature-item" style={{ opacity: 0.6 }}>
                                        <IonIcon icon={closeCircle} className="pricing-feature-icon not-included" />
                                        {limitation}
                                    </li>
                                ))}
                            </ul>
                            <IonButton
                                expand="block"
                                fill="outline"
                                className="pricing-cta"
                                onClick={() => navigate('dashboard')}
                            >
                                Try Now
                            </IonButton>
                        </div>

                        {/* Free Tier */}
                        <div className="pricing-card">
                            <h3 className="pricing-tier-name">{TIERS.free.name}</h3>
                            <p className="pricing-tier-tagline">{TIERS.free.tagline}</p>
                            <div className="pricing-price">
                                <span className="pricing-amount">{TIERS.free.price}</span>
                            </div>
                            <p className="pricing-yearly" style={{ color: 'var(--grassroots-text-tertiary)' }}>
                                {TIERS.free.priceNote}
                            </p>
                            <ul className="pricing-features-list">
                                {TIERS.free.highlights.map((feature, idx) => (
                                    <li key={idx} className="pricing-feature-item">
                                        <IonIcon icon={checkmarkCircle} className="pricing-feature-icon included" />
                                        {feature}
                                    </li>
                                ))}
                                {TIERS.free.limitations.map((limitation, idx) => (
                                    <li key={`lim-${idx}`} className="pricing-feature-item" style={{ opacity: 0.6 }}>
                                        <IonIcon icon={closeCircle} className="pricing-feature-icon not-included" />
                                        {limitation}
                                    </li>
                                ))}
                            </ul>
                            <IonButton
                                expand="block"
                                fill="outline"
                                className="pricing-cta"
                                onClick={() => navigate('register')}
                            >
                                Sign Up Free
                            </IonButton>
                        </div>

                        {/* Premium Tier */}
                        <div className="pricing-card featured">
                            <span className="pricing-badge">Most Popular</span>
                            <h3 className="pricing-tier-name">{TIERS.premium.name}</h3>
                            <p className="pricing-tier-tagline">{TIERS.premium.tagline}</p>
                            <div className="pricing-price">
                                <span className="pricing-amount">{TIERS.premium.price}</span>
                                <span className="pricing-period">{TIERS.premium.priceNote}</span>
                            </div>
                            <p className="pricing-yearly">
                                or {TIERS.premium.yearlyPrice} {TIERS.premium.yearlyNote}
                            </p>
                            <ul className="pricing-features-list">
                                {TIERS.premium.highlights.map((feature, idx) => (
                                    <li key={idx} className="pricing-feature-item">
                                        <IonIcon icon={checkmarkCircle} className="pricing-feature-icon included" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <IonButton
                                expand="block"
                                color="primary"
                                className="pricing-cta"
                                onClick={() => navigate('register')}
                            >
                                Get Premium
                            </IonButton>
                        </div>
                    </div>
                </section>

                {/* Feature Comparison Table (optional, simplified) */}
                <section className="landing-features" style={{ paddingTop: 0 }}>
                    <h3 className="landing-section-title" style={{ fontSize: '1.5rem' }}>
                        Compare Plans
                    </h3>
                    <div style={{
                        maxWidth: '800px',
                        margin: '0 auto',
                        overflowX: 'auto',
                    }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.95rem',
                        }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--grassroots-surface-variant)' }}>
                                    <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--grassroots-text-primary)' }}>Feature</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-secondary)' }}>Guest</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-secondary)' }}>Free</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-accent)', fontWeight: 600 }}>Premium</th>
                                </tr>
                            </thead>
                            <tbody>
                                {FEATURE_COMPARISON.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--grassroots-surface-variant)' }}>
                                        <td style={{ padding: '12px 8px', color: 'var(--grassroots-text-primary)' }}>{row.label}</td>
                                        <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-secondary)' }}>
                                            {typeof row.guest === 'boolean' ? (
                                                <IonIcon
                                                    icon={row.guest ? checkmarkCircle : closeCircle}
                                                    style={{ color: row.guest ? 'var(--grassroots-success)' : 'var(--grassroots-text-tertiary)', fontSize: '1.2rem' }}
                                                />
                                            ) : row.guest}
                                        </td>
                                        <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-secondary)' }}>
                                            {typeof row.free === 'boolean' ? (
                                                <IonIcon
                                                    icon={row.free ? checkmarkCircle : closeCircle}
                                                    style={{ color: row.free ? 'var(--grassroots-success)' : 'var(--grassroots-text-tertiary)', fontSize: '1.2rem' }}
                                                />
                                            ) : row.free}
                                        </td>
                                        <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-primary)', fontWeight: 500 }}>
                                            {typeof row.premium === 'boolean' ? (
                                                <IonIcon
                                                    icon={row.premium ? checkmarkCircle : closeCircle}
                                                    style={{ color: row.premium ? 'var(--grassroots-success)' : 'var(--grassroots-text-tertiary)', fontSize: '1.2rem' }}
                                                />
                                            ) : row.premium}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="landing-cta">
                    <h2 className="landing-cta-title">
                        Ready to track your matches?
                    </h2>
                    <p className="landing-cta-subtitle">
                        No signup needed. No credit card. Just start tracking.
                    </p>
                    <IonButton
                        className="hero-cta-primary"
                        onClick={() => navigate('dashboard')}
                    >
                        Try it Free — No Signup
                    </IonButton>
                </section>

                {/* Footer */}
                <footer className="landing-footer">
                    <p>© {new Date().getFullYear()} MatchMaster. Built for grassroots football.</p>
                </footer>
            </IonContent>
        </IonPage>
    );
};

export default LandingPage;
