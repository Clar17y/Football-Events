import React from 'react';
import {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
} from '@ionic/react';
import {
    checkmarkCircle,
    closeCircle,
} from 'ionicons/icons';
import ThemeToggle from '../components/ThemeToggle';
import { TIERS, FEATURE_COMPARISON } from '../constants/tiers';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css'; // Reuse landing page pricing styles

interface PricingPageProps {
    onNavigate?: (page: string) => void;
}

const PricingPage: React.FC<PricingPageProps> = ({ onNavigate }) => {
    const { user } = useAuth();

    const navigate = (page: string) => {
        onNavigate?.(page);
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/dashboard" text="Back" />
                    </IonButtons>
                    <IonTitle>Pricing Plans</IonTitle>
                    <IonButtons slot="end">
                        <ThemeToggle />
                    </IonButtons>
                </IonToolbar>
            </IonHeader>

            <IonContent>
                {/* Pricing Section */}
                <section className="landing-pricing" style={{ paddingTop: 'var(--grassroots-space-xl)' }}>
                    <h2 className="landing-section-title">
                        Simple, Fair Pricing
                    </h2>
                    <p className="landing-section-subtitle">
                        {user ? 'Upgrade your plan to unlock more features.' : 'Start free, upgrade when you need more.'}
                    </p>

                    <div className="pricing-cards">
                        {/* Guest Tier - only show if not logged in */}
                        {!user && (
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
                        )}

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
                            {user ? (
                                <IonButton expand="block" fill="outline" className="pricing-cta" disabled>
                                    Current Plan
                                </IonButton>
                            ) : (
                                <IonButton
                                    expand="block"
                                    fill="outline"
                                    className="pricing-cta"
                                    onClick={() => navigate('register')}
                                >
                                    Sign Up Free
                                </IonButton>
                            )}
                        </div>

                        {/* Premium Tier */}
                        <div className="pricing-card featured">
                            <span className="pricing-badge">Best Value</span>
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
                                onClick={() => {
                                    // TODO: Implement Stripe checkout or upgrade flow
                                    alert('Premium upgrade coming soon! We\'ll notify you when it\'s available.');
                                }}
                            >
                                Upgrade to Premium
                            </IonButton>
                        </div>
                    </div>
                </section>

                {/* Feature Comparison Table */}
                <section className="landing-features" style={{ paddingTop: 'var(--grassroots-space-lg)' }}>
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
                                    {!user && <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-secondary)' }}>Guest</th>}
                                    <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-secondary)' }}>Free</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-accent)', fontWeight: 600 }}>Premium</th>
                                </tr>
                            </thead>
                            <tbody>
                                {FEATURE_COMPARISON.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--grassroots-surface-variant)' }}>
                                        <td style={{ padding: '12px 8px', color: 'var(--grassroots-text-primary)' }}>{row.label}</td>
                                        {!user && (
                                            <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--grassroots-text-secondary)' }}>
                                                {typeof row.guest === 'boolean' ? (
                                                    <IonIcon
                                                        icon={row.guest ? checkmarkCircle : closeCircle}
                                                        style={{ color: row.guest ? 'var(--grassroots-success)' : 'var(--grassroots-text-tertiary)', fontSize: '1.2rem' }}
                                                    />
                                                ) : row.guest}
                                            </td>
                                        )}
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
            </IonContent>
        </IonPage>
    );
};

export default PricingPage;
