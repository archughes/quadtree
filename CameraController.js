// CameraController.js
export class CameraController {
    /**
     * Manages camera positioning and slider interactions.
     * @param {THREE.PerspectiveCamera} camera - The camera to control
     * @param {Object} sliders - DOM elements for azimuth, elevation, altitude
     */
    constructor(camera, sliders) {
        this.camera = camera;
        this.sliders = {
            azimuth: sliders.azimuth,
            elevation: sliders.elevation,
            altitude: sliders.altitude,
        };
        this.values = {
            azimuthAngle: (this.sliders.azimuth.value / 180) * Math.PI,
            elevationAngle: (this.sliders.elevation.value / 180) * Math.PI,
            altitude: parseFloat(this.sliders.altitude.value),
        };
        this.minDistance = 2; // Default minimum distance
        this.initializeSliders();
        this.updatePosition();
    }

    initializeSliders() {
        this.sliders.azimuth.value = 0;
        this.sliders.elevation.value = 0;
        this.sliders.altitude.value = this.values.altitude;
    }

    /**
     * Updates camera position based on current values.
     */
    updatePosition() {
        this.values.altitude = Math.max(this.values.altitude, this.minDistance);
        const { azimuthAngle, elevationAngle, altitude } = this.values;
        const x = altitude * Math.cos(azimuthAngle) * Math.cos(elevationAngle);
        const y = altitude * Math.sin(azimuthAngle) * Math.cos(elevationAngle);
        const z = altitude * Math.sin(elevationAngle);
        this.camera.position.set(x, y, z);
        this.camera.lookAt(0, 0, 0);
    }

    /**
     * Updates values from sliders and enforces constraints.
     * @param {number} minDistance - Minimum distance to mesh
     */
    updateFromSliders(minDistance) {
        this.minDistance = minDistance;
        this.values.azimuthAngle = (this.sliders.azimuth.value / 180) * Math.PI;
        this.values.elevationAngle = (this.sliders.elevation.value / 180) * Math.PI;
        this.values.altitude = Math.max(parseFloat(this.sliders.altitude.value), minDistance);
        this.sliders.altitude.min = minDistance;
        this.sliders.altitude.value = this.values.altitude;
        this.updatePosition();
    }

    /** @returns {THREE.Vector3} - Current camera position */
    getPosition() {
        return this.camera.position.clone();
    }
}