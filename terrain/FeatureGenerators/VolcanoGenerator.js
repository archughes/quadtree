import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates volcanic features with biome influence.
 */
export class VolcanoGenerator extends FeatureGenerator {
    /**
     * Applies the volcano feature, adjusted by biome probability and structure.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'volcano');
        const volcanoNoise = this.noise(theta * 10, phi * 10 + 1000);
        const threshold = 0.9 / modifier;
        if (volcanoNoise > threshold && initialTemperature > 30) {
            const heightAdjustment = this.config.baseAmplitude * (volcanoNoise - threshold) * 10 * (biome === 'highland' ? 1.5 : 1.0); // Taller in highlands
            return { heightAdjustment, featureLabel: 'volcano' };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['tectonic_plate', 'lava_flow', 'fumarole', 'foothill'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['glacial', 'permafrost', 'wetland', 'coral_reef'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}