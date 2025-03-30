import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates tectonic plate boundaries with biome influence.
 */
export class TectonicPlateGenerator extends FeatureGenerator {
    /**
     * Applies the tectonic plate feature, adjusted by biome probability.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'tectonic_plate');
        const plateNoise = this.noise(theta * 5, phi * 5 + 2000);
        const threshold = 0.1 / modifier; // Adjust threshold for probability (rift: 1.5 -> lower threshold)
        if (Math.abs(plateNoise) < threshold) {
            const heightAdjustment = this.config.baseAmplitude * plateNoise * 2 * (biome === 'rift' ? 1.3 : 1.0); // Deeper in rifts
            return { heightAdjustment, featureLabel: 'tectonic_plate' };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['volcano', 'valley', 'river', 'rift', 'fumarole', 'foothill'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['crater', 'desert_pavement', 'sand_dune'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}