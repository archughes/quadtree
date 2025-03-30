/**
 * Singleton class managing biome definitions and logic for terrain generation.
 */
class BiomeManager {
    constructor() {
        if (BiomeManager.instance) {
            return BiomeManager.instance;
        }
        this.biomeDefinitions = this.defineBiomes();
        BiomeManager.instance = this;
    }

    /**
     * Defines biome parameters for height and feature generation.
     * @returns {Object} - Biome definitions
     */
    defineBiomes() {
        return {
            polar: { 
                amplitudeScale: 0.5, 
                octaves: 2, 
                frequencyScale: 0.8,
                featureModifiers: {
                    glacial: 1.5, // Increase probability
                    permafrost: 1.3,
                    volcano: 0.2, // Decrease probability
                    wetland: 0.3
                }
            },
            equatorial: { 
                amplitudeScale: 1.5, 
                octaves: 4, 
                frequencyScale: 1.2,
                featureModifiers: {
                    wetland: 1.4,
                    coral_reef: 1.5,
                    sand_dune: 1.2,
                    glacial: 0.1
                }
            },
            temperate: { 
                amplitudeScale: 1.0, 
                octaves: 3, 
                frequencyScale: 1.0,
                featureModifiers: {
                    valley: 1.2,
                    river: 1.2,
                    foothill: 1.1,
                    desert_pavement: 0.5
                }
            },
            highland: { 
                amplitudeScale: 2.0, 
                octaves: 5, 
                frequencyScale: 1.5,
                featureModifiers: {
                    foothill: 1.5,
                    valley: 1.3,
                    volcano: 1.2,
                    plain: 0.4
                }
            },
            rift: { 
                amplitudeScale: 0.7, 
                octaves: 3, 
                frequencyScale: 1.1,
                featureModifiers: {
                    tectonic_plate: 1.5,
                    valley: 1.3,
                    magnetic_anomaly: 1.2,
                    sand_dune: 0.3
                }
            }
        };
    }

    /**
     * Determines the biome based on position and height.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Base height at this position
     * @param {number[]} rotationAxis - Axis of rotation for latitude calculation
     * @returns {string} - Biome type
     */
    getBiome(theta, phi, baseHeight, rotationAxis) {
        const latitude = this.computeLatitude(theta, phi, rotationAxis);
        if (baseHeight > 0.15) return 'highland'; // Adjusted for default baseAmplitude of 0.1
        if (baseHeight < -0.05) return 'rift';
        if (Math.abs(latitude) > 60) return 'polar';
        if (Math.abs(latitude) < 30) return 'equatorial';
        return 'temperate';
    }

    /**
     * Computes latitude relative to a custom rotation axis.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number[]} rotationAxis - Axis of rotation
     * @returns {number} - Latitude in degrees (-90 to 90)
     */
    computeLatitude(theta, phi, rotationAxis) {
        const point = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        const axis = rotationAxis;
        const dot = point[0] * axis[0] + point[1] * axis[1] + point[2] * axis[2];
        const latitudeRad = Math.acos(dot / (this.vectorLength(point) * this.vectorLength(axis)));
        return (latitudeRad * (180 / Math.PI) - 90);
    }

    /**
     * Computes the length of a vector.
     * @param {number[]} v - Vector
     * @returns {number} - Vector magnitude
     */
    vectorLength(v) {
        return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    }

    /**
     * Gets biome parameters for a given biome.
     * @param {string} biome - Biome type
     * @returns {Object} - Biome parameters
     */
    getBiomeParams(biome) {
        return this.biomeDefinitions[biome];
    }

    /**
     * Gets the feature probability modifier for a biome.
     * @param {string} biome - Biome type
     * @param {string} feature - Feature label
     * @returns {number} - Probability modifier (default 1.0)
     */
    getFeatureModifier(biome, feature) {
        const params = this.biomeDefinitions[biome];
        return params.featureModifiers && params.featureModifiers[feature] !== undefined ? params.featureModifiers[feature] : 1.0;
    }
}

// Singleton instance
const biomeManager = new BiomeManager();
export default biomeManager;