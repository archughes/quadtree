import * as THREE from './three.module.js';
import { camera } from './scene.js';

let isRightClicking = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isJumping = false;
let jumpVelocity = 0;
let cameraSpeed = 30;
const gravity = 9.8;
const jumpHeight = 6;
const minHeightAboveSurface = 1.5;

function setupInput(cameraController, ellipsoidMesh) {
    const gameCanvas = document.querySelector("canvas");

    // Keyboard controls
    document.addEventListener("keydown", event => {
        switch (event.code) {
            case "KeyW": moveForward = true; break;
            case "KeyS": moveBackward = true; break;
            case "KeyA": moveLeft = true; break;
            case "KeyD": moveRight = true; break;
            case "ShiftLeft": cameraSpeed = 10; break;
            case "Space":
                if (!isJumping) {
                    jumpVelocity = jumpHeight;
                    isJumping = true;
                }
                break;
        }
    });

    document.addEventListener("keyup", event => {
        switch (event.code) {
            case "KeyW": moveForward = false; break;
            case "KeyS": moveBackward = false; break;
            case "KeyA": moveLeft = false; break;
            case "KeyD": moveRight = false; break;
            case "ShiftLeft": cameraSpeed = 5; break;
        }
    });

    // Mouse controls
    document.addEventListener("mousedown", event => {
        if (event.button === 2) {
            isRightClicking = true;
            gameCanvas.requestPointerLock();
        }
    });

    document.addEventListener("mouseup", event => {
        if (event.button === 2) {
            isRightClicking = false;
            document.exitPointerLock();
        }
    });

    document.addEventListener("mousemove", event => {
        if (isRightClicking && document.pointerLockElement === gameCanvas) {
            const sensitivity = 0.004;
            camera.rotation.x -= event.movementX * sensitivity; // Yaw
            camera.rotation.y += event.movementY * sensitivity; // Pitch
            camera.rotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.y));
        }
    });

    // Update camera position on surface
    function updateCamera(delta, isSurfaceMode) {
        if (!isSurfaceMode) return;

        // Current position and spherical coordinates
        let currentPos = camera.position.clone();
        let radius = currentPos.length();
        let theta = Math.acos(currentPos.z / radius);
        let phi = Math.atan2(currentPos.y, currentPos.x);
        let surfaceHeight = ellipsoidMesh.getSurfaceHeightAt(theta, phi);
        let heightAboveSurface = radius - surfaceHeight;
        // console.log('surfaceHeight Update:', surfaceHeight);

        // Ensure minimum height above surface
        if (heightAboveSurface < minHeightAboveSurface && !isJumping) {
            heightAboveSurface = minHeightAboveSurface;
            // Use currentPos normalized instead of undefined surfacePos
            camera.position.copy(currentPos.normalize().multiplyScalar(surfaceHeight + heightAboveSurface));
            currentPos = camera.position.clone();
            radius = currentPos.length();
        }

        // Set camera's up direction to the surface normal
        const normal = currentPos.clone().normalize();
        camera.up.copy(normal);

        // Movement direction (tangent to surface)
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const dotProductForward = forward.dot(normal);
        forward.sub(normal.multiplyScalar(dotProductForward)).normalize(); // Project onto tangent plane

        const right = new THREE.Vector3().crossVectors(normal, forward).normalize();

        let velocity = new THREE.Vector3();
        if (moveForward) velocity.add(forward);
        if (moveBackward) velocity.sub(forward);
        if (moveLeft) velocity.sub(right);
        if (moveRight) velocity.add(right);

        // Apply horizontal movement
        if (velocity.lengthSq() > 0) {
            velocity.normalize().multiplyScalar(cameraSpeed * delta);
            const newPosition = currentPos.clone().add(velocity);

            // Project onto ellipsoid surface
            const newRadius = newPosition.length();
            const newTheta = Math.acos(newPosition.z / newRadius);
            const newPhi = Math.atan2(newPosition.y, newPosition.x);
            const newSurfaceHeight = ellipsoidMesh.getSurfaceHeightAt(newTheta, newPhi);

            // Update camera position - maintain height above surface
            camera.position.copy(newPosition.normalize().multiplyScalar(newSurfaceHeight + heightAboveSurface));

            // Update normal and up direction after movement
            const updatedNormal = camera.position.clone().normalize();
            camera.up.copy(updatedNormal);
        }

        // Handle jumping
        if (isJumping || heightAboveSurface > minHeightAboveSurface) {
            jumpVelocity -= gravity * delta;
            heightAboveSurface += jumpVelocity * delta;

            if (heightAboveSurface <= minHeightAboveSurface && jumpVelocity < 0) {
                heightAboveSurface = minHeightAboveSurface;
                isJumping = false;
                jumpVelocity = 0;
            }

            // Update position with new height
            const updatedRadius = camera.position.length();
            const updatedTheta = Math.acos(camera.position.z / updatedRadius);
            const updatedPhi = Math.atan2(camera.position.y, camera.position.x);
            const updatedSurfaceHeight = ellipsoidMesh.getSurfaceHeightAt(updatedTheta, updatedPhi);

            camera.position.copy(camera.position.normalize().multiplyScalar(updatedSurfaceHeight + heightAboveSurface));

            // Update normal and up direction after jump
            const updatedNormal = camera.position.clone().normalize();
            camera.up.copy(updatedNormal);
        }
    }

    return { updateCamera };
}

export { setupInput };