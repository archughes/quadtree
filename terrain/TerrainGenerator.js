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
     */
    constructor(noise, seed, config = {}) {
        this.noise = noise;
        this.seed = seed;
        this.config = {
            baseFrequency: config.baseFrequency || 1,
            baseAmplitude: config.baseAmplitude || 0.1,
            detailFrequency: config.detailFrequency || 2,
            detailAmplitude: config.detailAmplitude || 0.05,
            octaves: config.octaves || 3,
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
        this.temperatureManager = new TerrainTemperatureManager(config);

        this.featureGenerators = [
            { generator: new CraterGenerator(this.config, this.noise), maxDistance: 600 },
            { generator: new VolcanoGenerator(this.config, this.noise), maxDistance: 600 },
            { generator: new TectonicPlateGenerator(this.config, this.noise), maxDistance: 600 },
            { generator: new VastPlainsGenerator(this.config, this.noise), maxDistance: 600 },
            { generator: new MagneticAnomalyGenerator(this.config, this.noise), maxDistance: 600 },
            { generator: new LavaFlowGenerator(this.config, this.noise), maxDistance: 600 },
            { generator: new DesertPavementGenerator(this.config, this.noise), maxDistance: 600 },
            { generator: new SandDuneGenerator(this.config, this.noise), maxDistance: 200 },
            { generator: new GlacialFeatureGenerator(this.config, this.noise), maxDistance: 200 },
            { generator: new KarstTopographyGenerator(this.config, this.noise), maxDistance: 200 },
            { generator: new WetlandGenerator(this.config, this.noise), maxDistance: 200 },
            { generator: new PermafrostGenerator(this.config, this.noise), maxDistance: 200 },
            { generator: new OasisGenerator(this.config, this.noise), maxDistance: 200 },
            { generator: new FoothillGenerator(this.config, this.noise), maxDistance: 100 },
            { generator: new ValleyAndRiverGenerator(this.config, this.noise), maxDistance: 100 },
            { generator: new CoralReefGenerator(this.config, this.noise), maxDistance: 100 },
            { generator: new FumaroleGenerator(this.config, this.noise), maxDistance: 100 }
        ];
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
        if (this.featureMap.has(coarseKey)) {
            const result = { ...this.featureMap.get(coarseKey) };
            if (distance < 1200 && result.features.length > 0) {
                result.height = result.height - this.computeDetail(theta, phi, 1200) + this.computeDetail(theta, phi, distance);
            }
            return result;
        }

        let currentHeight = this.computeBaseHeight(theta, phi);
        const biome = biomeManager.getBiome(theta, phi, currentHeight, this.config.rotationAxis);
        const initialTempData = { height: currentHeight, features: [], biome };
        const initialTemperature = this.temperatureManager.getTemperature(initialTempData, theta, phi);
        const features = [];

        for (const { generator, maxDistance } of this.featureGenerators) {
            if (distance <= maxDistance) {
                const { heightAdjustment, featureLabel } = generator.applyFeature(
                    theta, phi, currentHeight, initialTemperature, features, biome
                );
                currentHeight += heightAdjustment;
                if (featureLabel && !features.includes(featureLabel)) {
                    features.push(featureLabel);
                }
            }
        }

        const finalTempData = { height: currentHeight, features, biome };
        const finalTemperature = this.temperatureManager.getTemperature(finalTempData, theta, phi);

        const age = this.computeFeatureAge(theta, phi, features);
        currentHeight *= (1 - this.config.erosionFactor * age);

        let height = currentHeight;
        if (distance < 1200) {
            height += this.computeDetail(theta, phi, distance);
        }

        if (this.config.waterLevel > 0 && height < this.config.waterLevel) {
            const blend = this.config.waterBlend;
            height = (1 - blend) * height + blend * this.config.waterLevel;
            if (!features.includes('underwater')) features.push('underwater');
        }

        const result = { height, features: [...features], temperature: finalTemperature };
        this.featureMap.set(coarseKey, { ...result });
        return result;
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
}