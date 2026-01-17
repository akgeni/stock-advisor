/**
 * Sector-specific thresholds and configurations
 * Used across all scoring layers for sector-adjusted analysis
 */

export const SECTOR_CONFIG = {
    // ROCE thresholds by sector
    roceThresholds: {
        'Non Banking Financial Company (NBFC)': 8,
        'Financial Institution': 8,
        'Stockbroking & Allied': 10,
        'Investment Company': 6,
        'Other Financial Services': 10,
        'Power Generation': 10,
        'LPG/CNG/PNG/LNG Supplier': 12,
        'Civil Construction': 12,
        'Residential, Commercial Projects': 12,
        'Construction Vehicles': 15,
        'Heavy Electrical Equipment': 15,
        'Other Electrical Equipment': 18,
        'Computers - Software & Consulting': 20,
        'IT Enabled Services': 18,
        'Software Products': 20,
        'Pharmaceuticals': 15,
        'Auto Components & Equipments': 15,
        'Diversified FMCG': 25,
        'Personal Care': 30,
        'default': 15
    },

    // Debt-to-equity thresholds by sector
    debtThresholds: {
        'Non Banking Financial Company (NBFC)': 6.0,  // Higher leverage normal
        'Financial Institution': 5.0,
        'Stockbroking & Allied': 3.0,
        'Civil Construction': 2.0,
        'Residential, Commercial Projects': 2.0,
        'Power Generation': 3.0,
        'default': 1.5
    },

    // Sector cyclicality classification
    cyclicality: {
        high: [
            'Construction Vehicles', 'Civil Construction', 'Residential, Commercial Projects',
            'Iron & Steel Products', 'Industrial Minerals', 'Ferro & Silica Manganese',
            'Auto Components & Equipments', 'Passenger Cars & Utility Vehicles'
        ],
        medium: [
            'Stockbroking & Allied', 'Other Electrical Equipment', 'Heavy Electrical Equipment',
            'Compressors, Pumps & Diesel Engines', 'Industrial Products'
        ],
        low: [
            'Pharmaceuticals', 'Diversified FMCG', 'Personal Care', 'IT Enabled Services',
            'Computers - Software & Consulting', 'Software Products', 'Hospital',
            'Media & Entertainment', 'LPG/CNG/PNG/LNG Supplier'
        ]
    },

    // Macro sensitivity mapping
    macroSensitivity: {
        interestRateSensitive: [
            'Non Banking Financial Company (NBFC)', 'Residential, Commercial Projects',
            'Auto Components & Equipments', 'Passenger Cars & Utility Vehicles'
        ],
        currencyBeneficiaries: [
            'IT Enabled Services', 'Computers - Software & Consulting', 'Software Products',
            'Pharmaceuticals', 'Business Process Outsourcing (BPO)/ Knowledge Process Outsourcing (KPO)'
        ],
        commodityExposed: [
            'Industrial Minerals', 'Iron & Steel Products', 'Ferro & Silica Manganese',
            'Petrochemicals', 'Specialty Chemicals'
        ]
    },

    // Sector groupings for diversification
    sectorGroups: {
        'Financials': [
            'Non Banking Financial Company (NBFC)', 'Financial Institution',
            'Stockbroking & Allied', 'Investment Company', 'Other Financial Services',
            'Depositories, Clearing Houses and Other Intermediaries', 'Exchange and Data Platform'
        ],
        'Technology': [
            'IT Enabled Services', 'Computers - Software & Consulting', 'Software Products',
            'Computers Hardware & Equipments', 'E-Learning'
        ],
        'Healthcare': [
            'Pharmaceuticals', 'Hospital', 'Healthcare Service Provider'
        ],
        'Industrial': [
            'Heavy Electrical Equipment', 'Other Electrical Equipment', 'Industrial Products',
            'Compressors, Pumps & Diesel Engines', 'Plastic Products - Industrial',
            'Packaging', 'Rubber'
        ],
        'Infrastructure': [
            'Civil Construction', 'Residential, Commercial Projects', 'Construction Vehicles',
            'Telecom - Infrastructure', 'Power Generation'
        ],
        'Consumer': [
            'Diversified FMCG', 'Personal Care', 'Media & Entertainment',
            'Internet & Catalogue Retail', 'Edible Oil'
        ],
        'Auto': [
            'Auto Components & Equipments', 'Passenger Cars & Utility Vehicles'
        ],
        'Materials': [
            'Industrial Minerals', 'Iron & Steel Products', 'Ferro & Silica Manganese',
            'Petrochemicals', 'Specialty Chemicals'
        ]
    }
};

/**
 * Get sector-specific ROCE threshold
 */
export function getROCEThreshold(industry) {
    return SECTOR_CONFIG.roceThresholds[industry] || SECTOR_CONFIG.roceThresholds.default;
}

/**
 * Get sector-specific debt threshold
 */
export function getDebtThreshold(industry) {
    return SECTOR_CONFIG.debtThresholds[industry] || SECTOR_CONFIG.debtThresholds.default;
}

/**
 * Get cyclicality level for industry
 */
export function getCyclicality(industry) {
    if (SECTOR_CONFIG.cyclicality.high.includes(industry)) return 'high';
    if (SECTOR_CONFIG.cyclicality.low.includes(industry)) return 'low';
    return 'medium';
}

/**
 * Get sector group for diversification
 */
export function getSectorGroup(industry) {
    for (const [group, industries] of Object.entries(SECTOR_CONFIG.sectorGroups)) {
        if (industries.includes(industry)) return group;
    }
    return 'Other';
}

/**
 * Check if industry is interest rate sensitive
 */
export function isRateSensitive(industry) {
    return SECTOR_CONFIG.macroSensitivity.interestRateSensitive.includes(industry);
}

/**
 * Check if industry benefits from weak currency
 */
export function isCurrencyBeneficiary(industry) {
    return SECTOR_CONFIG.macroSensitivity.currencyBeneficiaries.includes(industry);
}
