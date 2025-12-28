/**
 * Tier definitions for Guest, Free, and Premium plans.
 * Keep in sync with backend/src/services/QuotaService.ts
 */

export const TIERS = {
    guest: {
        id: 'guest',
        name: 'Guest',
        tagline: 'Try it instantly',
        price: 'Free',
        priceNote: 'No signup required',
        features: {
            teams: 1,
            matches: 1,
            playersPerTeam: 15,
            eventsPerMatch: 50,
            seasons: 0,
            shareLinks: 0,
            analytics: false,
            csvExport: false,
            sync: false,
        },
        highlights: [
            'Track 1 full match',
            'Record goals, subs & formations',
            'Works completely offline',
            'No account needed',
        ],
        limitations: [
            'Data stays on this device only',
            'Limited to 1 team, 1 match',
        ],
    },
    free: {
        id: 'free',
        name: 'Free',
        tagline: 'For casual coaches',
        price: 'Free',
        priceNote: 'Forever free',
        features: {
            teams: 1,
            matchesPerSeason: 30,
            playersPerTeam: 20,
            eventsPerMatch: 40,
            seasons: 5,
            shareLinks: 1,
            analytics: false,
            csvExport: false,
            sync: true,
        },
        highlights: [
            'Sync across devices',
            'Up to 30 matches per season',
            '5 seasons of history',
            'Share live match link',
        ],
        limitations: [
            'Core event types only',
            'No analytics dashboard',
        ],
    },
    premium: {
        id: 'premium',
        name: 'Premium',
        tagline: 'For serious coaches & parents',
        price: '£3.99',
        priceNote: '/month',
        yearlyPrice: '£35',
        yearlyNote: '/year (save 2 months)',
        features: {
            teams: 5,
            matchesPerSeason: 'Unlimited',
            playersPerTeam: 40,
            eventsPerMatch: 150,
            seasons: 'Unlimited',
            shareLinks: 'Unlimited',
            analytics: true,
            csvExport: true,
            sync: true,
        },
        highlights: [
            'Manage up to 5 teams',
            'Unlimited matches & seasons',
            'Advanced event tracking (12 types)',
            'Analytics dashboard',
            'Export data to CSV',
            'Unlimited share links',
        ],
        limitations: [],
    },
} as const;

export type TierId = keyof typeof TIERS;
export type Tier = typeof TIERS[TierId];

/**
 * Feature comparison rows for the pricing table
 */
export const FEATURE_COMPARISON = [
    { label: 'Teams', guest: '1', free: '1', premium: '5' },
    { label: 'Matches', guest: '1 total', free: '30/season', premium: 'Unlimited' },
    { label: 'Players per team', guest: '15', free: '20', premium: '40' },
    { label: 'Seasons', guest: '—', free: '5', premium: 'Unlimited' },
    { label: 'Sync across devices', guest: false, free: true, premium: true },
    { label: 'Share live match', guest: false, free: true, premium: true },
    { label: 'Analytics dashboard', guest: false, free: false, premium: true },
    { label: 'Export to CSV', guest: false, free: false, premium: true },
    { label: 'Event types', guest: 'Core (6)', free: 'Core (6)', premium: 'All (12)' },
] as const;
