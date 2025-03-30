import { FeatureGenerator } from '../FeatureGenerator.js';

export class MagneticAnomalyGenerator extends FeatureGenerator {
    applyFeature(theta, phi, currentHeight, initialTemperature, existingFeatures) {
        if (!this.canApplyWith(existingFeatures) || !this.canApplyWithout(existingFeatures)) {
            return { heightAdjustment: 0, featureLabel: null };
        }
        const anomalyNoise = this.noise(theta * 8, phi * 8 + 4000);
        if (anomalyNoise > 0.9) {
            return {
                heightAdjustment: this.config.baseAmplitude * (anomalyNoise - 0.9) * 5,
                featureLabel: 'magnetic_anomaly'
            };
        }
        return { heightAdjustment: 0, featureLabel: null };
    }

    canApplyWith(existingFeatures) {
        // Magnetic anomalies can coexist with tectonic or volcanic features
        const compatibleFeatures = ['tectonic_plate', 'volcano', 'lava_flow'];
        return existingFeatures.every(feature => compatibleFeatures.includes(feature));
    }

    canApplyWithout(existingFeatures) {
        // Magnetic anomalies are unlikely in water or glacial areas
        const prohibitedFeatures = ['wetland', 'coral_reef', 'glacial', 'permafrost'];
        return !existingFeatures.some(feature => prohibitedFeatures.includes(feature));
    }
}