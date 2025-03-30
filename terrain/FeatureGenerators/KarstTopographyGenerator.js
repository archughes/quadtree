import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates karst topography with biome influence.
 */
export class KarstTopographyGenerator extends FeatureGenerator {
    /**
     * Applies the karst feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'karst');
        const karstNoise = this.noise(theta * 5, phi * 5 + 12000);
        const threshold = 0.9 / modifier;
        if (currentHeight > this.config.baseAmplitude * 0.5 && karstNoise > threshold) {
            return {
                heightAdjustment: -this.config.baseAmplitude * (karstNoise - threshold) * 5,
                featureLabel: 'karst'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['valley', 'river'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['desert_pavement', 'sand_dune', 'volcano', 'lava_flow'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}