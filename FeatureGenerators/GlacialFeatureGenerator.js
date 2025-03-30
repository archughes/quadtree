import { FeatureGenerator } from '../FeatureGenerator.js';
import biomeManager from '../BiomeManager.js';

/**
 * Generates glacial features with biome influence.
 */
export class GlacialFeatureGenerator extends FeatureGenerator {
    /**
     * Applies the glacial feature, adjusted by biome probability and structure.
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
        const modifier = biomeManager.getFeatureModifier(biome, 'glacial');
        const glacialNoise = this.noise(theta * 6, phi * 6 + 10000);
        const threshold = 0.7 / modifier; // Polar: 1.5 -> lower, Equatorial: 0.1 -> higher
        const latitude = this.computeLatitude(theta, phi);
        if (Math.abs(latitude) > 70 && glacialNoise > threshold && initialTemperature < -10) {
            const heightAdjustment = -this.config.baseAmplitude * 0.6 * (glacialNoise - threshold) * (biome === 'polar' ? 1.2 : 1.0); // Deeper in polar
            return { heightAdjustment, featureLabel: 'glacial' };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        const compatibleFeatures = ['permafrost', 'valley'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        const prohibitedFeatures = ['volcano', 'lava_flow', 'fumarole', 'desert_pavement', 'oasis', 'wetland'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }

    computeLatitude(theta, phi) {
        const point = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        const axis = this.config.rotationAxis;
        const dot = point[0] * axis[0] + point[1] * axis[1] + point[2] * axis[2];
        const latitudeRad = Math.acos(dot / (this.vectorLength(point) * this.vectorLength(axis)));
        return (latitudeRad * (180 / Math.PI) - 90);
    }

    vectorLength(v) {
        return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    }
}