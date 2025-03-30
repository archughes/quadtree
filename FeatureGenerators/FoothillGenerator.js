import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates foothills with biome influence.
 */
export class FoothillGenerator extends FeatureGenerator {
    /**
     * Applies the foothill feature, adjusted by biome probability and structure.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'foothill');
        if (currentHeight > this.config.baseAmplitude * 1.2 && currentHeight < this.config.baseAmplitude * 1.5) {
            const foothillNoise = this.noise(theta * 7, phi * 7 + 8000);
            const threshold = 0.7 / modifier; // Highland: 1.5 -> lower, Temperate: 1.1 -> slightly lower
            if (foothillNoise > threshold) {
                const heightAdjustment = this.config.baseAmplitude * 0.3 * foothillNoise * (biome === 'highland' ? 1.3 : 1.0); // Taller in highlands
                return { heightAdjustment, featureLabel: 'foothill' };
            }
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['tectonic_plate', 'volcano', 'valley'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['plain', 'wetland', 'sand_dune', 'desert_pavement'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}