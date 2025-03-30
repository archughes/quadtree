import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates sand dunes with biome influence.
 */
export class SandDuneGenerator extends FeatureGenerator {
    /**
     * Applies the sand dune feature, adjusted by biome probability and structure.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'sand_dune');
        const duneNoise = this.noise(theta * 4, phi * 4 + 9000);
        const threshold = 0.6 / modifier;
        if (currentHeight > -this.config.baseAmplitude * 0.2 && currentHeight < this.config.baseAmplitude * 0.2 && duneNoise > threshold && initialTemperature > 20) {
            const heightAdjustment = this.config.baseAmplitude * 0.4 * Math.sin(duneNoise * Math.PI) * (biome === 'equatorial' ? 1.2 : 1.0); // Taller in equatorial
            return { heightAdjustment, featureLabel: 'sand_dune' };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['desert_pavement', 'oasis', 'plain'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['wetland', 'river', 'coral_reef', 'volcano', 'foothill'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}