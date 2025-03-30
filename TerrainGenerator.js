import { TerrainTemperatureManager } from './TerrainTemperatureManager.js';

/**
 * Manages procedural terrain generation for an ellipsoid mesh with LOD and temperature integration.
 */
export class TerrainGenerator {
    /**
     * Constructs a terrain generator with seeded noise and configurable parameters.
     * @param {Function} noise - Seeded 2D noise function (e.g., Perlin or Simplex)
     * @param {string} seed - Seed for consistent randomization
     * @param {Object} [config={}] - Configuration object for terrain parameters
     */
    constructor(noise, seed, config = {}) {
        this.noise = noise;
        this.seed = seed;
        this.config = {
            baseFrequency: config.baseFrequency || 1,
            baseAmplitude: config.baseAmplitude || 0.1,
            detailFrequency: config.detailFrequency || 2,
            detailAmplitude: config.detailAmplitude || 0.05,
            octaves: config.octaves || 1,
            waterLevel: config.waterLevel || 0,
            waterBlend: config.waterBlend || 0.5,
            rotationAxis: config.rotationAxis || [0, 0, 1],
            incidentVector: config.incidentVector || [1, 0, 0],
            erosionFactor: config.erosionFactor || 0.3,
            featureAges: config.featureAges || {
                default: 0.5, crater: 0.8, volcano: 0.6, tectonic_plate: 0.7, magnetic_anomaly: 0.4,
                valley: 0.5, river: 0.3, tributary: 0.3, mouth: 0.3, foothill: 0.5,
                sand_dune: 0.4, glacial: 0.7, coral_reef: 0.3, karst: 0.6, lava_flow: 0.5,
                wetland: 0.2, permafrost: 0.8, desert_pavement: 0.6, oasis: 0.3, fumarole: 0.4
            }
        };
        this.coarseHeightMap = new Map();
        this.featureMap = new Map();
        this.biomeDefinitions = this.defineBiomes();
        this.temperatureManager = new TerrainTemperatureManager(config);
    }

    /**
     * Defines biome types with generation parameters.
     * @returns {Object} - Map of biome names to their parameter objects
     */
    defineBiomes() {
        return {
            polar: { amplitudeScale: 0.5, octaves: 2, frequencyScale: 0.8 },
            equatorial: { amplitudeScale: 1.5, octaves: 4, frequencyScale: 1.2 },
            temperate: { amplitudeScale: 1.0, octaves: 3, frequencyScale: 1.0 },
            highland: { amplitudeScale: 2.0, octaves: 5, frequencyScale: 1.5 },
            rift: { amplitudeScale: 0.7, octaves: 3, frequencyScale: 1.1 }
        };
    }

    /**
     * Computes hierarchical procedural height, features, and temperature for a given position and distance.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} distance - Distance from camera to point
     * @returns {Object} - { height, features, temperature }
     */
    getHeight(theta, phi, distance) {
        const coarseKey = this.getCoarseKey(theta, phi);
        let result;

        if (!this.featureMap.has(coarseKey)) {
            let baseHeight = this.computeBaseHeight(theta, phi);
            let features = [];
            const tempData = { height: baseHeight, features };
            const temperature = this.temperatureManager.getTemperature(tempData, theta, phi);

            if (distance < 600) {
                baseHeight += this.computeMeteorCraters(theta, phi, features);
                baseHeight += this.computeVolcanoes(theta, phi, features, temperature);
                baseHeight += this.computeTectonicPlates(theta, phi, features);
                baseHeight += this.computeVastPlains(theta, phi, baseHeight, features);
                baseHeight += this.computeMagneticAnomalies(theta, phi, features);
                baseHeight += this.computeLavaFlows(theta, phi, baseHeight, features, temperature);
                baseHeight += this.computeDesertPavement(theta, phi, baseHeight, features, temperature);
            }

            if (distance < 200) {
                baseHeight += this.computeSandDunes(theta, phi, baseHeight, features, temperature);
                baseHeight += this.computeGlacialFeatures(theta, phi, baseHeight, features, temperature);
                baseHeight += this.computeKarstTopography(theta, phi, baseHeight, features);
                baseHeight += this.computeWetlands(theta, phi, baseHeight, features, temperature);
                baseHeight += this.computePermafrost(theta, phi, baseHeight, features, temperature);
                baseHeight += this.computeOases(theta, phi, baseHeight, features, temperature);
            }

            if (distance < 100) {
                baseHeight += this.computeFoothills(theta, phi, baseHeight, features);
                baseHeight += this.computeValleysAndRivers(theta, phi, baseHeight, features);
                baseHeight += this.computeFumaroles(theta, phi, baseHeight, features, temperature);
                if (baseHeight < this.config.waterLevel) {
                    baseHeight += this.computeCoralReefs(theta, phi, baseHeight, features, temperature);
                }
            }

            tempData.height = baseHeight;
            tempData.features = features;
            const finalTemperature = this.temperatureManager.getTemperature(tempData, theta, phi);

            const age = this.computeFeatureAge(theta, phi, features);
            baseHeight *= (1 - this.config.erosionFactor * age);

            let height = baseHeight;
            if (distance < 1200) {
                height += this.computeDetail(theta, phi, distance);
            }

            if (this.config.waterLevel > 0 && height < this.config.waterLevel) {
                const blend = this.config.waterBlend;
                height = (1 - blend) * height + blend * this.config.waterLevel;
                features.push('underwater');
            }

            result = { height, features, temperature: finalTemperature };
            this.featureMap.set(coarseKey, result);
        } else {
            result = this.featureMap.get(coarseKey);
            if (distance < 1200 && result.features.length > 0) {  // Adjust detail based on distance
                result.height = result.height - this.computeDetail(theta, phi, 1200) + this.computeDetail(theta, phi, distance);
            }
        }

        return result;
    }

    /**
     * Determines the biome based on position and height.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Base height at this position
     * @returns {string} - Biome type
     */
    getBiome(theta, phi, baseHeight) {
        const latitude = this.computeLatitude(theta, phi);
        if (baseHeight > this.config.baseAmplitude * 1.5) return 'highland';
        if (baseHeight < -this.config.baseAmplitude * 0.5) return 'rift';
        if (Math.abs(latitude) > 60) return 'polar';
        if (Math.abs(latitude) < 30) return 'equatorial';
        return 'temperate';
    }

    /**
     * Computes latitude relative to a custom rotation axis.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - Latitude in degrees (-90 to 90)
     */
    computeLatitude(theta, phi) {
        const point = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        const axis = this.config.rotationAxis;
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
     * Computes base height using noise, adjusted by biome.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - Base height
     */
    computeBaseHeight(theta, phi) {
        let height = 0;
        const biome = this.getBiome(theta, phi, 0);
        const params = this.biomeDefinitions[biome];
        let frequency = this.config.baseFrequency * params.frequencyScale;
        let amplitude = this.config.baseAmplitude * params.amplitudeScale;

        for (let i = 0; i < params.octaves; i++) {
            height += this.noise(theta * frequency, phi * frequency) * amplitude;
            frequency *= 2;
            amplitude /= 2;
        }
        return height;
    }

    /**
     * Computes height detail using noise.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} distance - Distance from camera
     * @returns {number} - Height detail
     */
    computeDetail(theta, phi, distance) {
        const scale = 1 / Math.pow(2, distance);
        let detail = 0;
        const biome = this.getBiome(theta, phi, this.computeBaseHeight(theta, phi));
        const params = this.biomeDefinitions[biome];
        let frequency = this.config.detailFrequency * params.frequencyScale;
        let amplitude = this.config.detailAmplitude * params.amplitudeScale;

        for (let i = 0; i < params.octaves; i++) {
            detail += this.noise(theta * frequency * scale, phi * frequency * scale) * amplitude;
            frequency *= 2;
            amplitude /= 2;
        }
        return detail;
    }

    /**
     * Adds meteor strike craters.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {string[]} features - Array to store feature labels
     * @returns {number} - Height adjustment
     */
    computeMeteorCraters(theta, phi, features) {
        const craterNoise = this.noise(theta * 15, phi * 15 + 3000);
        if (craterNoise > 0.95) {
            features.push('crater');
            return -this.config.baseAmplitude * 2 * (craterNoise - 0.95) * 20;
        }
        return 0;
    }

    /**
     * Adds volcanic features.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeVolcanoes(theta, phi, features, temperature) {
        const volcanoNoise = this.noise(theta * 10, phi * 10 + 1000);
        if (volcanoNoise > 0.9 && temperature > 30) {
            features.push('volcano');
            return this.config.baseAmplitude * (volcanoNoise - 0.9) * 10;
        }
        return 0;
    }

    /**
     * Adds tectonic plate boundaries.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {string[]} features - Array to store feature labels
     * @returns {number} - Height adjustment
     */
    computeTectonicPlates(theta, phi, features) {
        const plateNoise = this.noise(theta * 5, phi * 5 + 2000);
        if (Math.abs(plateNoise) < 0.1) {
            features.push('tectonic_plate');
            return this.config.baseAmplitude * plateNoise * 2;
        }
        return 0;
    }

    /**
     * Adds magnetic anomalies.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {string[]} features - Array to store feature labels
     * @returns {number} - Height adjustment
     */
    computeMagneticAnomalies(theta, phi, features) {
        const anomalyNoise = this.noise(theta * 8, phi * 8 + 4000);
        if (anomalyNoise > 0.9) {
            features.push('magnetic_anomaly');
            return this.config.baseAmplitude * (anomalyNoise - 0.9) * 5;
        }
        return 0;
    }

    /**
     * Adds foothills around highlands.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @returns {number} - Height adjustment
     */
    computeFoothills(theta, phi, baseHeight, features) {
        if (baseHeight > this.config.baseAmplitude * 1.2 && baseHeight < this.config.baseAmplitude * 1.5) {
            const foothillNoise = this.noise(theta * 7, phi * 7 + 8000);
            if (foothillNoise > 0.7) {
                features.push('foothill');
                return this.config.baseAmplitude * 0.3 * foothillNoise;
            }
        }
        return 0;
    }

    /**
     * Generates vast plains with varying roughness
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @returns {number} - Height adjustment
     */
    computeVastPlains(theta, phi, baseHeight, features) {
        // Use a lower frequency noise to determine plain locations
        const plainLocationNoise = this.noise(theta * 0.5, phi * 0.5 + 7000);
        
        // If the noise value falls in a specific range, we've found a plain
        if (plainLocationNoise > 0.2 && plainLocationNoise < 0.6) {
            // Determine plain size (50-200 units)
            const plainSize = 50 + Math.floor(plainLocationNoise * 300);
            
            // Determine plain "rumblyness" - from flat to somewhat rumbled
            const rumblyness = Math.pow(this.noise(theta * 0.3, phi * 0.3 + 8000), 2) * 0.08;
            
            // Add plain feature
            features.push('plain');
            
            // Generate the plain's surface
            const plainNoise = this.noise(theta * rumblyness * 50, phi * rumblyness * 50 + 9000);
            
            // Plain height should be close to a flat reference height with slight variations
            const plainBaseHeight = -0.02 + plainLocationNoise * 0.08;
            const plainHeight = plainBaseHeight + plainNoise * rumblyness;
            
            // Blend current height toward plain height using a distance-based factor
            const distanceToPlainCenter = Math.abs(plainLocationNoise - 0.4) / 0.2;
            const blendFactor = Math.max(0, 1 - distanceToPlainCenter);
            
            // Return adjustment that moves toward plain height
            return (plainHeight - baseHeight) * blendFactor;
        }
        
        return 0;
    }

    /**
     * Computes valleys and rivers from mountains or rifts.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @returns {number} - Height adjustment
     */
    computeValleysAndRivers(theta, phi, baseHeight, features) {
        const valleyNoise = this.noise(theta * 3, phi * 3 + 5000);
        let heightAdjustment = 0;

        if (baseHeight > this.config.baseAmplitude * 1.5 && Math.abs(valleyNoise) < 0.2) {
            heightAdjustment = -this.config.baseAmplitude * 0.5;
            features.push('valley');
            if (valleyNoise > 0 && valleyNoise < 0.1) {
                features.push('river');
                if (this.noise(theta * 10, phi * 10 + 6000) > 0.8) {
                    features.push('tributary');
                }
            }
        } else if (baseHeight < -this.config.baseAmplitude * 0.5 && Math.abs(valleyNoise) < 0.15) {
            heightAdjustment = -this.config.baseAmplitude * 0.3;
            features.push('valley');
            if (valleyNoise < 0 && valleyNoise > -0.1) {
                features.push('river');
                if (this.noise(theta * 10, phi * 10 + 6000) > 0.8) {
                    features.push('mouth');
                }
            }
        }
        return heightAdjustment;
    }

    /**
     * Adds sand dunes.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeSandDunes(theta, phi, baseHeight, features, temperature) {
        const duneNoise = this.noise(theta * 4, phi * 4 + 9000);
        if (baseHeight > -this.config.baseAmplitude * 0.2 && baseHeight < this.config.baseAmplitude * 0.2 && duneNoise > 0.6 && temperature > 20) {
            features.push('sand_dune');
            return this.config.baseAmplitude * 0.4 * Math.sin(duneNoise * Math.PI);
        }
        return 0;
    }

    /**
     * Adds glacial features.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeGlacialFeatures(theta, phi, baseHeight, features, temperature) {
        const glacialNoise = this.noise(theta * 6, phi * 6 + 10000);
        if (Math.abs(this.computeLatitude(theta, phi)) > 70 && glacialNoise > 0.7 && temperature < -10) {
            features.push('glacial');
            return -this.config.baseAmplitude * 0.6 * (glacialNoise - 0.7);
        }
        return 0;
    }

    /**
     * Adds coral reefs.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeCoralReefs(theta, phi, baseHeight, features, temperature) {
        const coralNoise = this.noise(theta * 8, phi * 8 + 11000);
        if (baseHeight < this.config.waterLevel && baseHeight > -this.config.baseAmplitude && coralNoise > 0.8 && temperature > 15) {
            features.push('coral_reef');
            return this.config.baseAmplitude * 0.2 * (coralNoise - 0.8);
        }
        return 0;
    }

    /**
     * Adds karst topography.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @returns {number} - Height adjustment
     */
    computeKarstTopography(theta, phi, baseHeight, features) {
        const karstNoise = this.noise(theta * 5, phi * 5 + 12000);
        if (baseHeight > this.config.baseAmplitude * 0.5 && karstNoise > 0.9) {
            features.push('karst');
            return -this.config.baseAmplitude * (karstNoise - 0.9) * 5;
        }
        return 0;
    }

    /**
     * Adds lava flows.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeLavaFlows(theta, phi, baseHeight, features, temperature) {
        const lavaNoise = this.noise(theta * 7, phi * 7 + 13000);
        if (baseHeight > 0 && lavaNoise > 0.85 && temperature > 25) {
            features.push('lava_flow');
            return this.config.baseAmplitude * 0.3 * (lavaNoise - 0.85);
        }
        return 0;
    }

    /**
     * Adds wetlands.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeWetlands(theta, phi, baseHeight, features, temperature) {
        const wetlandNoise = this.noise(theta * 3, phi * 3 + 14000);
        if (baseHeight > -this.config.baseAmplitude * 0.1 && baseHeight < this.config.baseAmplitude * 0.1 && wetlandNoise > 0.7 && temperature > 10) {
            features.push('wetland');
            return -this.config.baseAmplitude * 0.05;
        }
        return 0;
    }

    /**
     * Adds permafrost.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computePermafrost(theta, phi, baseHeight, features, temperature) {
        const permafrostNoise = this.noise(theta * 6, phi * 6 + 15000);
        if (Math.abs(this.computeLatitude(theta, phi)) > 60 && permafrostNoise > 0.8 && temperature < -5) {
            features.push('permafrost');
            return this.config.baseAmplitude * 0.2 * (permafrostNoise - 0.8);
        }
        return 0;
    }

    /**
     * Adds desert pavement.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeDesertPavement(theta, phi, baseHeight, features, temperature) {
        const pavementNoise = this.noise(theta * 4, phi * 4 + 16000);
        if (baseHeight > -this.config.baseAmplitude * 0.3 && baseHeight < this.config.baseAmplitude * 0.3 && pavementNoise > 0.9 && temperature > 25) {
            features.push('desert_pavement');
            return this.config.baseAmplitude * 0.05;
        }
        return 0;
    }

    /**
     * Adds oases.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeOases(theta, phi, baseHeight, features, temperature) {
        const oasisNoise = this.noise(theta * 5, phi * 5 + 17000);
        if (baseHeight > -this.config.baseAmplitude * 0.2 && baseHeight < this.config.baseAmplitude * 0.2 && oasisNoise > 0.95 && temperature > 20) {
            features.push('oasis');
            return -this.config.baseAmplitude * 0.3 * (oasisNoise - 0.95);
        }
        return 0;
    }

    /**
     * Adds fumaroles and geysers.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} baseHeight - Current base height
     * @param {string[]} features - Array to store feature labels
     * @param {number} temperature - Local temperature in °C
     * @returns {number} - Height adjustment
     */
    computeFumaroles(theta, phi, baseHeight, features, temperature) {
        const fumaroleNoise = this.noise(theta * 9, phi * 9 + 18000);
        if (baseHeight > this.config.baseAmplitude && fumaroleNoise > 0.9 && temperature > 40) {
            features.push('fumarole');
            return this.config.baseAmplitude * 0.4 * (fumaroleNoise - 0.9);
        }
        return 0;
    }

    /**
     * Computes feature age for erosion.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {string[]} features - Array of feature labels
     * @returns {number} - Age factor (0 to 1)
     */
    computeFeatureAge(theta, phi, features) {
        const baseAge = Math.abs(this.noise(theta * 4, phi * 4 + 7000));
        const featureAgeScale = features.length > 0 ? 
            (this.config.featureAges[features[0]] || this.config.featureAges.default) : 
            this.config.featureAges.default;
        return baseAge * featureAgeScale;
    }

    /**
     * Generates a coarse LOD key for consistent assignment.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {string} - Coarse LOD key
     */
    getCoarseKey(theta, phi) {
        const coarseTheta = Math.round(theta * 10) / 10;
        const coarsePhi = Math.round(phi * 10) / 10;
        return `${coarseTheta},${coarsePhi}`;
    }
}