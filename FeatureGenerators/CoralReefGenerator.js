import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates coral reefs with biome influence.
 */
export class CoralReefGenerator extends FeatureGenerator {
    /**
     * Applies the coral reef feature, adjusted by biome probability and structure.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'coral_reef');
        const coralNoise = this.noise(theta * 8, phi * 8 + 11000);
        const threshold = 0.8 / modifier; // Equatorial: 1.5 -> lower threshold
        if (currentHeight < this.config.waterLevel && currentHeight > -this.config.baseAmplitude && coralNoise > threshold && initialTemperature > 15) {
            const heightAdjustment = this.config.baseAmplitude * 0.2 * (coralNoise - threshold) * (biome === 'equatorial' ? 1.2 : 1.0); // Taller in equatorial
            return { heightAdjustment, featureLabel: 'coral_reef' };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['underwater'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['glacial', 'permafrost', 'volcano', 'lava_flow', 'fumarole'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}