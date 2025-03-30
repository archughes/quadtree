import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates valleys and rivers with biome influence.
 */
export class ValleyAndRiverGenerator extends FeatureGenerator {
    /**
     * Applies the valley and river features, adjusted by biome probability.
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
        const valleyModifier = biomeManager.getFeatureModifier(biome, 'valley');
        const riverModifier = biomeManager.getFeatureModifier(biome, 'river');
        const valleyNoise = this.noise(theta * 3, phi * 3 + 5000);
        let heightAdjustment = 0;
        let featureLabel = null;

        const valleyThreshold = 0.2 / valleyModifier; // Highland: 1.3, Temperate: 1.2 -> lower
        if (currentHeight > this.config.baseAmplitude * 1.5 && Math.abs(valleyNoise) < valleyThreshold) {
            heightAdjustment = -this.config.baseAmplitude * 0.5;
            featureLabel = 'valley';
            const riverThreshold = 0.1 / riverModifier; // Temperate: 1.2 -> lower
            if (valleyNoise > 0 && valleyNoise < riverThreshold) {
                if (!existingFeatures.includes('river')) {
                    existingFeatures.push('river');
                }
                if (this.noise(theta * 10, phi * 10 + 6000) > 0.8) {
                    if (!existingFeatures.includes('tributary')) {
                        existingFeatures.push('tributary');
                    }
                }
            }
        } else if (currentHeight < -this.config.baseAmplitude * 0.5 && Math.abs(valleyNoise) < valleyThreshold * 0.75) {
            heightAdjustment = -this.config.baseAmplitude * 0.3;
            featureLabel = 'valley';
            const riverThreshold = 0.1 / riverModifier;
            if (valleyNoise < 0 && valleyNoise > -riverThreshold) {
                if (!existingFeatures.includes('river')) {
                    existingFeatures.push('river');
                }
                if (this.noise(theta * 10, phi * 10 + 6000) > 0.8) {
                    if (!existingFeatures.includes('mouth')) {
                        existingFeatures.push('mouth');
                    }
                }
            }
        }

        return { heightAdjustment, featureLabel };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['river', 'tributary', 'mouth', 'tectonic_plate', 'glacial', 'karst'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['plain', 'sand_dune', 'desert_pavement'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}