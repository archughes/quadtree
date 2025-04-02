import * as THREE from '../three.module.js';

export class MouseControls {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        this.isRightClicking = false;
        this.sensitivity = 0.004;
        this.totalYaw = 0;    // Add cumulative yaw
        this.totalPitch = 0;  // Add cumulative pitch

        this.setupListeners();
    }

    setupListeners() {
        document.addEventListener("mousedown", event => this.handleMouseDown(event));
        document.addEventListener("mouseup", event => this.handleMouseUp(event));
        document.addEventListener("mousemove", event => this.handleMouseMove(event));
    }

    handleMouseDown(event) {
        if (event.button === 2) {
            this.isRightClicking = true;
            this.canvas.requestPointerLock();
        }
    }

    handleMouseUp(event) {
        if (event.button === 2) {
            this.isRightClicking = false;
            document.exitPointerLock();
        }
    }

    handleMouseMove(event) {
        if (this.isRightClicking && document.pointerLockElement === this.canvas) {
            const deltaX = event.movementX * this.sensitivity;
            const deltaY = event.movementY * this.sensitivity;

            this.totalYaw -= deltaX;              // Update yaw (negative for left-right consistency)
            this.totalPitch -= deltaY;            // Update pitch
            // Clamp pitch to prevent flipping (e.g., ±89°)
            this.totalPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.totalPitch));
        }
    }
}