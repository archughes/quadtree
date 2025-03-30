import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates meteor craters with biome influence.
 */
export class CraterGenerator extends FeatureGenerator {
    /**
     * Applies the crater feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'crater');
        const craterNoise = this.noise(theta * 15, phi * 15 + 3000);
        const threshold = 0.95 / modifier; // Lower threshold increases probability
        if (craterNoise > threshold) {
            return {
                heightAdjustment: -this.config.baseAmplitude * 2 * (craterNoise - threshold) * 20,
                featureLabel: 'crater'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['plain', 'valley', 'sand_dune'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['volcano', 'lava_flow', 'wetland', 'coral_reef', 'river'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}