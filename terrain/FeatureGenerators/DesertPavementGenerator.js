import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates desert pavement with biome influence.
 */
export class DesertPavementGenerator extends FeatureGenerator {
    /**
     * Applies the desert pavement feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'desert_pavement');
        const pavementNoise = this.noise(theta * 4, phi * 4 + 16000);
        const threshold = 0.9 / modifier; // Temperate: 0.5 -> higher threshold, less likely
        if (currentHeight > -this.config.baseAmplitude * 0.3 && currentHeight < this.config.baseAmplitude * 0.3 && pavementNoise > threshold && initialTemperature > 25) {
            return {
                heightAdjustment: this.config.baseAmplitude * 0.05,
                featureLabel: 'desert_pavement'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['sand_dune', 'oasis'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['wetland', 'river', 'coral_reef', 'volcano', 'lava_flow'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}