import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates lava flows with biome influence.
 */
export class LavaFlowGenerator extends FeatureGenerator {
    /**
     * Applies the lava flow feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'lava_flow');
        const lavaNoise = this.noise(theta * 7, phi * 7 + 13000);
        const threshold = 0.85 / modifier;
        if (currentHeight > 0 && lavaNoise > threshold && initialTemperature > 25) {
            return {
                heightAdjustment: this.config.baseAmplitude * 0.3 * (lavaNoise - threshold),
                featureLabel: 'lava_flow'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['volcano', 'tectonic_plate', 'fumarole'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['glacial', 'permafrost', 'wetland', 'coral_reef'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}