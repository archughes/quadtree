import * as THREE from '../three.module.js';

export class KeyboardControls {
    constructor() {
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.cameraSpeed = 30;
        this.gravity = 9.8;
        this.jumpHeight = 6;
        this.minHeightAboveSurface = 1.5;

        this.setupListeners();
    }

    setupListeners() {
        document.addEventListener("keydown", event => this.handleKeyDown(event));
        document.addEventListener("keyup", event => this.handleKeyUp(event));
    }

    handleKeyDown(event) {
        switch (event.code) {
            case "KeyW": this.moveForward = true; break;
            case "KeyS": this.moveBackward = true; break;
            case "KeyA": this.moveLeft = true; break;
            case "KeyD": this.moveRight = true; break;
            case "ShiftLeft": this.cameraSpeed = 10; break;
            case "Space":
                if (!this.isJumping) {
                    this.jumpVelocity = this.jumpHeight;
                    this.isJumping = true;
                }
                break;
        }
    }

    handleKeyUp(event) {
        switch (event.code) {
            case "KeyW": this.moveForward = false; break;
            case "KeyS": this.moveBackward = false; break;
            case "KeyA": this.moveLeft = false; break;
            case "KeyD": this.moveRight = false; break;
            case "ShiftLeft": this.cameraSpeed = 5; break;
        }
    }
}