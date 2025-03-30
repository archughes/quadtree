/**
 * Manages temperature assignments for terrain features with logical variation.
 */
export class TerrainTemperatureManager {
    /**
     * Constructs a temperature manager with configurable parameters.
     * @param {Object} [config={}] - Configuration object for temperature parameters
     */
    constructor(config = {}) {
        this.config = {
            baseTemp: config.baseTemp || 15,
            altitudeFactor: config.altitudeFactor || -6.5,
            latitudeFactor: config.latitudeFactor || 0.5,
            solarFactor: config.solarFactor || 10,
            waterLevelDrop: config.waterLevelDrop || -20,
            rotationAxis: config.rotationAxis || [0, 0, 1],
            incidentVector: config.incidentVector || [1, 0, 0],
            featureTemps: config.featureTemps || {
                polar: -20, equatorial: 25, temperate: 15, highland: -5, rift: 5,
                crater: 0, volcano: 50, tectonic_plate: 10, magnetic_anomaly: 5,
                valley: 0, river: -5, tributary: -5, mouth: -5, foothill: 0,
                sand_dune: 35, glacial: -30, coral_reef: 20, karst: 10,
                lava_flow: 40, wetland: 20, permafrost: -25, desert_pavement: 30,
                oasis: 25, fumarole: 60, underwater: 0
            }
        };
    }

    /**
     * Computes temperature based on feature, altitude, latitude, and solar incidence.
     * @param {Object} terrainData - { height, features } from TerrainGenerator
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - Temperature in °C
     */
    getTemperature(terrainData, theta, phi) {
        const { height, features } = terrainData;
        let baseTemp = this.config.baseTemp;

        if (features.length > 0) {
            const primaryFeature = features[0];
            baseTemp += this.config.featureTemps[primaryFeature] || 0;
        }

        const altitudeKm = height / 1000;
        const altitudeTemp = this.config.altitudeFactor * altitudeKm;

        const latitude = this.computeLatitude(theta, phi);
        const latitudeTemp = -this.config.latitudeFactor * Math.abs(latitude);

        const solarTemp = this.computeSolarIncidence(theta, phi) * this.config.solarFactor;

        let temp = baseTemp + altitudeTemp + latitudeTemp + solarTemp;

        if (features.includes('underwater')) {
            temp += this.config.waterLevelDrop;
        }

        return temp;
    }

    /**
     * Computes latitude for temperature variation.
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
     * Computes solar incidence angle effect.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - Solar factor (-1 to 1)
     */
    computeSolarIncidence(theta, phi) {
        const normal = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        const incident = this.config.incidentVector;
        const dot = normal[0] * incident[0] + normal[1] * incident[1] + normal[2] * incident[2];
        return dot / (this.vectorLength(normal) * this.vectorLength(incident));
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
     * Updates configuration.
     * @param {Object} config - Configuration object
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
}