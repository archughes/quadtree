/**
 * Manages color assignments for terrain features with smooth transitions and temperature influence.
 */
export class TerrainColorManager {
    /**
     * Constructs a color manager with feature-based color definitions.
     */
    constructor() {
        this.colorDefinitions = this.defineColors();
    }

    /**
     * Defines colors for each feature type in RGB format (0-255).
     * @returns {Object} - Map of feature names to color arrays
     */
    defineColors() {
        return {
            polar: [200, 220, 255],        // Light icy blue
            equatorial: [100, 150, 50],    // Dark green
            temperate: [150, 180, 100],    // Olive green
            highland: [120, 100, 80],      // Brownish grey
            rift: [80, 60, 40],            // Dark brown
            crater: [50, 50, 50],          // Dark grey
            volcano: [90, 70, 60],         // Reddish brown
            tectonic_plate: [110, 90, 70], // Tan
            plain: [180, 160, 120],        // Muted brown
            magnetic_anomaly: [180, 140, 200], // Purplish
            valley: [90, 110, 70],         // Muted green
            river: [70, 90, 120],          // Grey-blue
            tributary: [80, 100, 130],     // Lighter grey-blue
            mouth: [60, 80, 110],          // Darker grey-blue
            foothill: [130, 120, 90],      // Light brown
            sand_dune: [210, 180, 100],    // Sandy yellow
            glacial: [220, 230, 255],      // Pale blue-white
            coral_reef: [200, 120, 150],   // Pinkish coral
            karst: [140, 130, 110],        // Grey-green
            lava_flow: [60, 50, 50],       // Dark grey-black
            wetland: [90, 120, 90],        // Green-brown
            permafrost: [160, 140, 110],   // Tundra brown
            desert_pavement: [100, 90, 80],// Dark stony grey
            oasis: [50, 150, 100],         // Green (vegetation)
            fumarole: [220, 180, 100],     // Yellow-orange
            underwater: [0, 0, 0]          // Placeholder
        };
    }

    /**
     * Assigns a color with blending/dithering based on features, height, temperature, and latitude.
     * @param {Object} terrainData - { height, features, temperature } from TerrainGenerator
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number[]} - RGB color array (0-255)
     */
    getColor(terrainData, theta, phi) {
        const { height, features, temperature } = terrainData;
        let baseColor = [150, 150, 150];

        if (features.length > 0) {
            const primaryFeature = features[0];
            baseColor = this.colorDefinitions[primaryFeature] || baseColor;

            if (features.length > 1) {
                const secondaryFeature = features[1];
                const secondaryColor = this.colorDefinitions[secondaryFeature] || baseColor;
                const blendFactor = this.computeBlendFactor(theta, phi, primaryFeature, secondaryFeature);
                baseColor = this.blendColors(baseColor, secondaryColor, blendFactor);
            }
        }

        const heightFactor = Math.min(1, Math.max(0, (height + this.config?.baseAmplitude) / (2 * this.config?.baseAmplitude)));
        let color = baseColor.map(c => Math.round(c * (0.8 + 0.2 * heightFactor)));

        const tempFactor = (temperature + 50) / 100;
        if (temperature < 0) {
            color = this.blendColors(color, [200, 220, 255], Math.abs(tempFactor));
        } else if (temperature > 30) {
            color = this.blendColors(color, [255, 150, 100], tempFactor);
        }

        const latitude = this.computeLatitude(theta, phi);
        if (height > this.config?.baseAmplitude * 1.8 && Math.abs(latitude) > 50) {
            color = this.blendColors(color, [255, 255, 255], 0.5);
        }

        if (features.includes('underwater')) {
            color = color.map(c => Math.max(0, c - 50));
        }

        if (this.shouldDither(theta, phi)) {
            color = this.applyDithering(color, theta, phi);
        }

        return color;
    }

    /**
     * Computes a blend factor between two features based on noise.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {string} primary - Primary feature type
     * @param {string} secondary - Secondary feature type
     * @returns {number} - Blend factor (0 to 1)
     */
    computeBlendFactor(theta, phi, primary, secondary) {
        const noiseValue = this.noise(theta * 5, phi * 5 + 19000);
        const normalized = (noiseValue + 1) / 2;
        if (primary === 'valley' && secondary === 'river') return Math.min(0.8, normalized);
        if (primary === 'sand_dune' && secondary === 'oasis') return Math.min(0.6, normalized);
        return normalized * 0.4;
    }

    /**
     * Blends two colors based on a factor.
     * @param {number[]} color1 - First RGB color
     * @param {number[]} color2 - Second RGB color
     * @param {number} factor - Blend factor (0 = full color1, 1 = full color2)
     * @returns {number[]} - Blended RGB color
     */
    blendColors(color1, color2, factor) {
        return color1.map((c, i) => Math.round(c * (1 - factor) + color2[i] * factor));
    }

    /**
     * Determines if dithering should be applied based on noise threshold.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {boolean} - True if dithering should occur
     */
    shouldDither(theta, phi) {
        return this.noise(theta * 10, phi * 10 + 20000) > 0.5;
    }

    /**
     * Applies subtle dithering to a color for natural variation.
     * @param {number[]} color - Base RGB color
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number[]} - Dithered RGB color
     */
    applyDithering(color, theta, phi) {
        const ditherNoise = this.noise(theta * 20, phi * 20 + 21000) * 20;
        return color.map(c => Math.max(0, Math.min(255, c + ditherNoise)));
    }

    /**
     * Computes latitude for snow coloring.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - Latitude in degrees (-90 to 90)
     */
    computeLatitude(theta, phi) {
        const point = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        const axis = this.config?.rotationAxis || [0, 0, 1];
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
     * Sets configuration and noise function for blending/dithering.
     * @param {Object} config - Configuration object from TerrainGenerator
     * @param {Function} noise - Noise function for dithering
     */
    setConfig(config, noise) {
        this.config = config;
        this.noise = noise;
    }
}