import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates fumaroles with biome influence.
 */
export class FumaroleGenerator extends FeatureGenerator {
    /**
     * Applies the fumarole feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'fumarole');
        const fumaroleNoise = this.noise(theta * 9, phi * 9 + 18000);
        const threshold = 0.9 / modifier;
        if (currentHeight > this.config.baseAmplitude && fumaroleNoise > threshold && initialTemperature > 40) {
            return {
                heightAdjustment: this.config.baseAmplitude * 0.4 * (fumaroleNoise - threshold),
                featureLabel: 'fumarole'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['volcano', 'tectonic_plate', 'lava_flow'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['glacial', 'permafrost', 'wetland', 'coral_reef'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}