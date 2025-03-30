import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates wetlands with biome influence.
 */
export class WetlandGenerator extends FeatureGenerator {
    /**
     * Applies the wetland feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'wetland');
        const wetlandNoise = this.noise(theta * 3, phi * 3 + 14000);
        const threshold = 0.7 / modifier; // Equatorial: 1.4 -> lower, Polar: 0.3 -> higher
        if (currentHeight > -this.config.baseAmplitude * 0.1 && currentHeight < this.config.baseAmplitude * 0.1 && wetlandNoise > threshold && initialTemperature > 10) {
            return {
                heightAdjustment: -this.config.baseAmplitude * 0.05,
                featureLabel: 'wetland'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['river', 'plain', 'valley'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['desert_pavement', 'sand_dune', 'oasis', 'glacial', 'permafrost'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}