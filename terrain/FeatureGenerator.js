/**
 * Base class for terrain feature generators.
 */
export class FeatureGenerator {
    constructor(config, noise) {
        this.config = config;
        this.noise = noise;
    }

    /**
     * Applies the feature at the given position if conditions are met, adjusted by biome.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} currentHeight - Current height at position
     * @param {number} initialTemperature - Initial temperature in °C
     * @param {string[]} existingFeatures - Current list of feature labels
     * @param {string} biome - Current biome type
     * @returns {Object} - { heightAdjustment, featureLabel }
     */
    applyFeature(theta, phi, currentHeight, initialTemperature, existingFeatures, biome) {
        if (!this.canApplyWith(existingFeatures) || !this.canApplyWithout(existingFeatures)) {
            return { heightAdjustment: 0, featureLabel: null };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    /**
     * Checks if this feature can coexist with existing features.
     * @param {string[]} existingFeatures - Current feature labels
     * @returns {boolean} - True if feature can be added with these features
     */
    canApplyWith(existingFeatures) {
        return existingFeatures.length === 0; // Default: exclusive unless overridden
    }

    /**
     * Checks if this feature can apply in the absence of prohibited features.
     * @param {string[]} existingFeatures - Current feature labels
     * @returns {boolean} - True if no prohibited features are present
     */
    canApplyWithout(existingFeatures) {
        return true; // Default: no prohibitions unless overridden
    }
}