import * as THREE from '../three.module.js';
import { KeyboardControls } from './KeyboardControls.js';
import { MouseControls } from './MouseControls.js';
import { camera } from '../scene.js';

function setupInput(cameraController, ellipsoidMesh) {
    const gameCanvas = document.querySelector("canvas");
    const keyboard = new KeyboardControls();
    const mouse = new MouseControls(camera, gameCanvas);

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
    
        // Ensure minimum height above surface
        if (heightAboveSurface < keyboard.minHeightAboveSurface && !keyboard.isJumping) {
            heightAboveSurface = keyboard.minHeightAboveSurface;
            camera.position.copy(currentPos.normalize().multiplyScalar(surfaceHeight + heightAboveSurface));
            currentPos = camera.position.clone();
            radius = currentPos.length();
        }
    
        // Set camera's up direction to the surface normal (temporary, will be reset later)
        const normal = currentPos.clone().normalize();
        camera.up.copy(normal);
    
        // Movement direction (tangent to surface)
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const dotProductForward = forward.dot(normal);
        forward.sub(normal.multiplyScalar(dotProductForward)).normalize();
    
        const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
    
        let velocity = new THREE.Vector3();
        if (keyboard.moveForward) velocity.add(forward);
        if (keyboard.moveBackward) velocity.sub(forward);
        if (keyboard.moveLeft) velocity.sub(right);
        if (keyboard.moveRight) velocity.add(right);
    
        // Apply horizontal movement
        if (velocity.lengthSq() > 0) {
            velocity.normalize().multiplyScalar(keyboard.cameraSpeed * delta);
            const newPosition = currentPos.clone().add(velocity);
    
            // Project onto ellipsoid surface
            const newRadius = newPosition.length();
            const newTheta = Math.acos(newPosition.z / newRadius);
            const newPhi = Math.atan2(newPosition.y, newPosition.x);
            const newSurfaceHeight = ellipsoidMesh.getSurfaceHeightAt(newTheta, newPhi);
    
            camera.position.copy(newPosition.normalize().multiplyScalar(newSurfaceHeight + heightAboveSurface));
            currentPos = camera.position.clone();
        }
    
        // Handle jumping
        if (keyboard.isJumping || heightAboveSurface > keyboard.minHeightAboveSurface) {
            keyboard.jumpVelocity -= keyboard.gravity * delta;
            heightAboveSurface += keyboard.jumpVelocity * delta;
    
            if (heightAboveSurface <= keyboard.minHeightAboveSurface && keyboard.jumpVelocity < 0) {
                heightAboveSurface = keyboard.minHeightAboveSurface;
                keyboard.isJumping = false;
                keyboard.jumpVelocity = 0;
            }
    
            // Update position with new height
            const updatedRadius = camera.position.length();
            const updatedTheta = Math.acos(camera.position.z / updatedRadius);
            const updatedPhi = Math.atan2(camera.position.y, camera.position.x);
            const updatedSurfaceHeight = ellipsoidMesh.getSurfaceHeightAt(updatedTheta, updatedPhi);
    
            camera.position.copy(camera.position.normalize().multiplyScalar(updatedSurfaceHeight + heightAboveSurface));
            currentPos = camera.position.clone();
        }
    
        // After movement, set the camera orientation using the local frame
        if (isSurfaceMode) {
            const P = camera.position;
            const r = P.length();
            theta = Math.acos(P.z / r);
            phi = Math.atan2(P.y, P.x);
    
            const N = P.clone().normalize(); // Surface normal
            const X_local = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0); // East
            const Y_local = new THREE.Vector3(
                -Math.cos(theta) * Math.cos(phi),
                -Math.cos(theta) * Math.sin(phi),
                Math.sin(theta)
            ); // North
    
            // Set base orientation
            camera.up.copy(N);
            const lookAtPoint = P.clone().sub(Y_local.multiplyScalar(0.1)); // Look south
            camera.lookAt(lookAtPoint);
    
            // Apply user rotations (assuming 'mouse' is accessible from setupInput scope)
            camera.rotateY(mouse.totalYaw);  // Yaw around local Y (up)
            camera.rotateX(mouse.totalPitch); // Pitch around local X (right)
        }
    }

    return { updateCamera, mouse };
}

export { setupInput };