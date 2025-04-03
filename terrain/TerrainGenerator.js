import { TerrainTemperatureManager } from './TerrainTemperatureManager.js';
import biomeManager from './BiomeManager.js'; // Singleton import
import { CraterGenerator } from './FeatureGenerators/CraterGenerator.js';
import { VolcanoGenerator } from './FeatureGenerators/VolcanoGenerator.js';
import { TectonicPlateGenerator } from './FeatureGenerators/TectonicPlateGenerator.js';
import { VastPlainsGenerator } from './FeatureGenerators/VastPlainsGenerator.js';
import { MagneticAnomalyGenerator } from './FeatureGenerators/MagneticAnomalyGenerator.js';
import { LavaFlowGenerator } from './FeatureGenerators/LavaFlowGenerator.js';
import { DesertPavementGenerator } from './FeatureGenerators/DesertPavementGenerator.js';
import { SandDuneGenerator } from './FeatureGenerators/SandDuneGenerator.js';
import { GlacialFeatureGenerator } from './FeatureGenerators/GlacialFeatureGenerator.js';
import { KarstTopographyGenerator } from './FeatureGenerators/KarstTopographyGenerator.js';
import { WetlandGenerator } from './FeatureGenerators/WetlandGenerator.js';
import { PermafrostGenerator } from './FeatureGenerators/PermafrostGenerator.js';
import { OasisGenerator } from './FeatureGenerators/OasisGenerator.js';
import { FoothillGenerator } from './FeatureGenerators/FoothillGenerator.js';
import { ValleyAndRiverGenerator } from './FeatureGenerators/ValleyAndRiverGenerator.js';
import { CoralReefGenerator } from './FeatureGenerators/CoralReefGenerator.js';
import { FumaroleGenerator } from './FeatureGenerators/FumaroleGenerator.js';

/**
 * Manages procedural terrain generation for an ellipsoid mesh with LOD and temperature integration.
 */
export class TerrainGenerator {
    /**
     * Constructs a terrain generator with seeded noise and configurable parameters.
     * @param {Function} noise - Seeded 2D noise function (e.g., Perlin or Simplex)
     * @param {string} seed - Seed for consistent randomization
     * @param {Object} [config={}] - Configuration object for terrain parameters
     * @param {number} a - First axis of ellipsoid
     * @param {number} b - Second axis of ellipsoid
     * @param {number} c - Third axis of ellipsoid
     */
    constructor(noise, seed, config = {}, a, b, c, rng) {
        this.noise = noise;
        this.globalSeed = seed;
        this.rng = rng;
        this.a = a;
        this.b = b;
        this.c = c;
        this.radius = (this.a + this.b + this.c) / 3;
        this.planetaryScale = this.radius / 1000;
        this.config = {
            planetaryScale: this.planetaryScale,
            baseFrequency: (config.baseFrequency || 1) * this.planetaryScale,
            baseAmplitude: (config.baseAmplitude || 0.02) / Math.sqrt(this.planetaryScale),
            detailFrequency: (config.detailFrequency || 2) * this.planetaryScale,
            detailAmplitude: (config.detailAmplitude || 0.01) / Math.sqrt(this.planetaryScale),
            octaves: config.octaves || 3,
            waterLevel: config.waterLevel || 0,
            waterBlend: config.waterBlend || 0.5,
            rotationAxis: config.rotationAxis || [0, 0, 1],
            incidentVector: config.incidentVector || [1, 0, 0],
            erosionFactor: config.erosionFactor || 0.3,
            oceanFrequency: (config.oceanFrequency || 0.1) * this.planetaryScale,
            oceanAmplitude: (config.oceanAmplitude || 0.2) / Math.sqrt(this.planetaryScale),
            oceanOctaves: config.oceanOctaves || 2,
            featureAges: config.featureAges || {
                default: 0.5, crater: 0.8, volcano: 0.6, tectonic_plate: 0.7, magnetic_anomaly: 0.4,
                valley: 0.5, river: 0.3, tributary: 0.3, mouth: 0.3, foothill: 0.5,
                sand_dune: 0.4, glacial: 0.7, coral_reef: 0.3, karst: 0.6, lava_flow: 0.5,
                wetland: 0.2, permafrost: 0.8, desert_pavement: 0.6, oasis: 0.3, fumarole: 0.4
            }
        };
        this.coarseHeightMap = new Map();
        this.featureMap = new Map();
        this.temperatureManager = new TerrainTemperatureManager(config);

        this.featureGenerators = [
            { generator: new CraterGenerator(this.config, this.noise), maxDistance: 600, lod: null, enabled: false },
            { generator: new VolcanoGenerator(this.config, this.noise), maxDistance: 600, lod: null, enabled: false },
            { generator: new TectonicPlateGenerator(this.config, this.noise), maxDistance: 600, lod: null, enabled: false },
            { generator: new VastPlainsGenerator(this.config, this.noise), maxDistance: 600, lod: null, enabled: false },
            { generator: new MagneticAnomalyGenerator(this.config, this.noise), maxDistance: 600, lod: null, enabled: false },
            { generator: new LavaFlowGenerator(this.config, this.noise), maxDistance: 600, lod: null, enabled: false },
            { generator: new DesertPavementGenerator(this.config, this.noise), maxDistance: 600, lod: null, enabled: false },
            { generator: new SandDuneGenerator(this.config, this.noise), maxDistance: 200, lod: null, enabled: false },
            { generator: new GlacialFeatureGenerator(this.config, this.noise), maxDistance: 200, lod: null, enabled: false },
            { generator: new KarstTopographyGenerator(this.config, this.noise), maxDistance: 200, lod: null, enabled: false },
            { generator: new WetlandGenerator(this.config, this.noise), maxDistance: 200, lod: null, enabled: false },
            { generator: new PermafrostGenerator(this.config, this.noise), maxDistance: 200, lod: null, enabled: false },
            { generator: new OasisGenerator(this.config, this.noise), maxDistance: 200, lod: null, enabled: false },
            { generator: new FoothillGenerator(this.config, this.noise), maxDistance: 100, lod: null, enabled: false },
            { generator: new ValleyAndRiverGenerator(this.config, this.noise), maxDistance: 100, lod: null, enabled: false },
            { generator: new CoralReefGenerator(this.config, this.noise), maxDistance: 100, lod: null, enabled: false },
            { generator: new FumaroleGenerator(this.config, this.noise), maxDistance: 100, lod: null, enabled: false }
        ];

        // Dynamically determine LOD levels from unique maxDistance values
        const uniqueDistances = [...new Set(this.featureGenerators.map(fg => fg.maxDistance))].sort((a, b) => b - a);
        this.LOD = [1200, ...uniqueDistances]; // Planetary scale + feature distances

        // Assign LOD indices to feature generators
        this.featureGenerators.forEach(fg => {
            fg.lod = this.LOD.indexOf(fg.maxDistance);
        });
    }

    /**
     * Toggles a feature generator on or off by its class name.
     * @param {string} generatorName - Name of the generator class (e.g., 'CraterGenerator')
     * @param {boolean} enabled - True to enable, false to disable
     */
    toggleFeatureGenerator(generatorName, enabled) {
        const generator = this.featureGenerators.find(fg => fg.generator.constructor.name === generatorName);
        if (generator) {
            generator.enabled = enabled;
        } else {
            console.warn(`Feature generator '${generatorName}' not found.`);
        }
    }

    /**
     * Returns the enabled state of a feature generator.
     * @param {string} generatorName - Name of the generator class (e.g., 'CraterGenerator')
     * @returns {boolean} - True if enabled, false if disabled or not found
     */
    getFeatureState(generatorName) {
        const generator = this.featureGenerators.find(fg => fg.generator.constructor.name === generatorName);
        return generator ? generator.enabled : false;
    }

    /**
     * Regenerates the terrain by clearing the feature map and coarse height map.
     */
    regenerateTerrain() {
        this.featureMap.clear();
        this.coarseHeightMap.clear();
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
        let nodeData = this.featureMap.get(coarseKey) || {
            heights: Array(this.LOD.length).fill(0), // Height contributions per LOD
            features: Array(this.LOD.length).fill([]), // Features per LOD
            temperature: 0,
            biome: '',
            lod: -1 // Highest LOD computed
        };

        const requiredLod = this.getRequiredLod(distance);

        if (requiredLod > nodeData.lod) {
            // Set noise seed based on position
            const positionSeed = this.hashPosition(theta, phi);
            this.rng.seed(this.globalSeed + positionSeed);

            for (let lod = nodeData.lod + 1; lod <= requiredLod; lod++) {
                let currentHeight = nodeData.heights.slice(0, lod).reduce((sum, h) => sum + h, 0);

                // Base height only at LOD 0 (planetary)
                if (lod === 0) {
                    nodeData.heights[0] = this.computeBaseHeight(theta, phi);
                    currentHeight = nodeData.heights[0];
                    nodeData.biome = biomeManager.getBiome(theta, phi, currentHeight, this.config.rotationAxis);
                }

                // Apply features for this LOD
                const initialTempData = { height: currentHeight, features: nodeData.features.flat(), biome: nodeData.biome };
                const temperature = this.temperatureManager.getTemperature(initialTempData, theta, phi);
                const newFeatures = this.applyFeaturesForLod(theta, phi, lod, currentHeight, temperature, nodeData.features[lod]);
                nodeData.features[lod] = newFeatures;

                // Update height with feature adjustments
                currentHeight = nodeData.heights.slice(0, lod).reduce((sum, h) => sum + h, 0);
                const finalTempData = { height: currentHeight, features: nodeData.features.flat(), biome: nodeData.biome };
                nodeData.temperature = this.temperatureManager.getTemperature(finalTempData, theta, phi);

                // Apply erosion
                const age = this.computeFeatureAge(theta, phi, nodeData.features.flat());
                nodeData.heights[lod] *= (1 - this.config.erosionFactor * age);

                // Add detail at finer LODs
                if (lod > 0) {
                    nodeData.heights[lod] += this.computeDetail(theta, phi, this.LOD[lod]);
                }
            }
            nodeData.lod = requiredLod;
        }

        let height = nodeData.heights.reduce((sum, h) => sum + h, 0);
        if (height < this.config.waterLevel) {
            const blend = this.config.waterBlend;
            height = (1 - blend) * height + blend * this.config.waterLevel;
            if (!nodeData.features.flat().includes('underwater')) {
                nodeData.features[nodeData.lod].push('underwater');
            }
        }

        nodeData.height = height;
        this.featureMap.set(coarseKey, nodeData);
        return { height, features: nodeData.features.flat(), temperature: nodeData.temperature, biome: nodeData.biome, distance };
    }

    /**
     * Determines the required LOD level based on distance.
     * @param {number} distance - Distance from camera
     * @returns {number} - LOD level
     */
    getRequiredLod(distance) {
        for (let i = 0; i < this.LOD.length; i++) {
            if (distance <= this.LOD[i]) return i;
        }
        return 0; // Default to planetary if distance > 1200
    }

    /**
     * Applies features for a specific LOD level.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} lod - LOD level
     * @param {number} currentHeight - Current height
     * @param {number} temperature - Temperature
     * @param {string[]} existingFeatures - Existing features
     * @returns {string[]} - Updated features
     */
    applyFeaturesForLod(theta, phi, lod, currentHeight, temperature, existingFeatures) {
        const features = [...existingFeatures];
        const maxDistance = this.LOD[lod];
        // Sort generators by name for consistent order, filter by enabled status
        const sortedGenerators = this.featureGenerators
            .filter(fg => fg.enabled && lod === fg.lod && maxDistance <= fg.maxDistance)
            .sort((a, b) => a.generator.constructor.name.localeCompare(b.generator.constructor.name));

        for (const { generator } of sortedGenerators) {
            const { heightAdjustment, featureLabel } = generator.applyFeature(
                theta, phi, currentHeight, temperature, features, this.biome
            );
            if (featureLabel && !features.includes(featureLabel)) {
                features.push(featureLabel);
                this.heights[lod] += heightAdjustment;
            }
        }
        return features;
    }

    /**
     * Computes base height using noise, adjusted by biome from BiomeManager.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - Base height
     */
    computeBaseHeight(theta, phi) {
        let height = 0;
        const biome = biomeManager.getBiome(theta, phi, 0, this.config.rotationAxis);
        const params = biomeManager.getBiomeParams(biome);

        // Hilliness
        let hillFrequency = this.config.baseFrequency * params.frequencyScale;
        let hillAmplitude = this.config.baseAmplitude * params.amplitudeScale;
        for (let i = 0; i < params.octaves; i++) {
            height += this.noise(theta * hillFrequency, phi * hillFrequency) * hillAmplitude;
            hillFrequency *= 2;
            hillAmplitude /= 2;
        }

        // Ocean depressions
        let oceanHeight = 0;
        let oceanFrequency = this.config.oceanFrequency * params.frequencyScale;
        let oceanAmplitude = this.config.oceanAmplitude * params.amplitudeScale;
        for (let i = 0; i < this.config.oceanOctaves; i++) {
            oceanHeight += this.noise(theta * oceanFrequency + 1000, phi * oceanFrequency + 1000) * oceanAmplitude;
            oceanFrequency *= 2;
            oceanAmplitude /= 2;
        }
        height += oceanHeight;

        return height;
    }

    /**
     * Computes height detail using noise, adjusted by biome from BiomeManager.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} distance - Distance from camera
     * @returns {number} - Height detail
     */
    computeDetail(theta, phi, distance) {
        const scale = 1 / Math.pow(2, distance);
        let detail = 0;
        const biome = biomeManager.getBiome(theta, phi, this.computeBaseHeight(theta, phi), this.config.rotationAxis);
        const params = biomeManager.getBiomeParams(biome);
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

    /**
     * Generates a hash for a position.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - Hash value
     */
    hashPosition(theta, phi) {
        const str = `${theta.toFixed(4)},${phi.toFixed(4)}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) % 1000000000;
        }
        return hash;
    }
}