import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates vast plains with biome influence.
 */
export class VastPlainsGenerator extends FeatureGenerator {
    /**
     * Applies the vast plains feature, adjusted by biome probability and structure.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'plain');
        const plainLocationNoise = this.noise(theta * 0.5, phi * 0.5 + 7000);
        const minThreshold = 0.2 / modifier; // Highland: 0.4 -> higher threshold, less likely
        const maxThreshold = 0.6 / modifier;
        if (plainLocationNoise > minThreshold && plainLocationNoise < maxThreshold) {
            const plainSize = 50 + Math.floor(plainLocationNoise * 300);
            const rumblyness = Math.pow(this.noise(theta * 0.3, phi * 0.3 + 8000), 2) * 0.08;
            const plainNoise = this.noise(theta * rumblyness * 50, phi * rumblyness * 50 + 9000);
            const plainBaseHeight = -0.02 + plainLocationNoise * 0.08;
            const plainHeight = plainBaseHeight + plainNoise * rumblyness;
            const distanceToPlainCenter = Math.abs(plainLocationNoise - 0.4) / 0.2;
            const blendFactor = Math.max(0, 1 - distanceToPlainCenter);
            return {
                heightAdjustment: (plainHeight - currentHeight) * blendFactor,
                featureLabel: 'plain'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['crater', 'sand_dune', 'wetland', 'oasis'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['volcano', 'tectonic_plate', 'foothill', 'valley'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}