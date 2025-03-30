import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates oases with biome influence.
 */
export class OasisGenerator extends FeatureGenerator {
    /**
     * Applies the oasis feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'oasis');
        const oasisNoise = this.noise(theta * 5, phi * 5 + 17000);
        const threshold = 0.95 / modifier;
        if (currentHeight > -this.config.baseAmplitude * 0.2 && currentHeight < this.config.baseAmplitude * 0.2 && oasisNoise > threshold && initialTemperature > 20) {
            return {
                heightAdjustment: -this.config.baseAmplitude * 0.3 * (oasisNoise - threshold),
                featureLabel: 'oasis'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['sand_dune', 'desert_pavement'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['glacial', 'permafrost', 'volcano', 'foothill', 'wetland'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}