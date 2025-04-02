import * as THREE from './three.module.js';
import { EllipsoidMesh } from './terrain/EllipsoidMesh.js';
import { CameraController } from './CameraController.js';
import { scene, camera, renderer } from './scene.js'; // Use updated scene.js
import { setupInput } from './controls/input.js';

// Scene setup (already handled in scene.js)

// Ellipsoid mesh
const terrainConfig = {
    baseFrequency: 1,
    baseAmplitude: 0.1,
    detailFrequency: 2,
    detailAmplitude: 0.05,
    octaves: 3
};
const a = 500, b = 500, c = 500;
const quadSplits = 8;
const ellipsoidRadius = new THREE.Vector3(a, b, c).length();
const lodDistances = linspace(50, 2 * ellipsoidRadius, quadSplits);
console.log('quadSplits of ' + quadSplits + ' [' + lodDistances + '] of expected max resolution: ' + ellipsoidRadius / Math.pow(2, quadSplits));
const ellipsoidMesh = new EllipsoidMesh(
    a, b, c, // last is equator with 0 incident light
    lodDistances, 
    'planetSeed123'
);

function linspace(start, end, num) {
    const step = Math.round((end - start) / (num - 1));
    return Array.from({ length: num }, (_, i) => start + i * step);
}

camera.far = ellipsoidMesh.lodDistances[ellipsoidMesh.lodDistances.length - 1] - 1;
camera.position.set(camera.far / 2, 0, 0);
camera.updateProjectionMatrix();

let geometry = ellipsoidMesh.generateGeometry(camera);
const material = new THREE.MeshPhongMaterial({ shininess: 20, side: THREE.DoubleSide, vertexColors: true });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Camera controller and input
const sliders = {
    azimuth: document.getElementById('azimuth'),
    elevation: document.getElementById('elevation'),
    altitude: document.getElementById('altitude'),
};
const maxAltitude = camera.far;
sliders.altitude.max = maxAltitude;
sliders.altitude.value = maxAltitude / 2;
const cameraController = new CameraController(camera, sliders);
const inputControls = setupInput(cameraController, ellipsoidMesh);

// Toggle button
const controlsDiv = document.getElementById('controls');
const toggleButton = document.createElement('button');
toggleButton.textContent = 'Toggle Surface Mode';
controlsDiv.appendChild(toggleButton);

// Slider readouts
const azimuthValue = document.getElementById('azimuth-value');
const elevationValue = document.getElementById('elevation-value');
const altitudeValue = document.getElementById('altitude-value');

// Surface mode state
let isSurfaceMode = false;

function updateSliderReadouts() {
    azimuthValue.textContent = sliders.azimuth.value;
    elevationValue.textContent = sliders.elevation.value;
    altitudeValue.textContent = sliders.altitude.value;
}

function setSurfacePosition() {
    const currentGeometry = ellipsoidMesh.updateGeometry(camera);
    const surfaceDistance = ellipsoidMesh.getMinDistance(camera.position);

    const currentDirection = camera.position.clone().normalize();
    const theta = Math.acos(currentDirection.z / Math.sqrt(currentDirection.x ** 2 + currentDirection.y ** 2 + currentDirection.z ** 2));
    const phi = Math.atan2(currentDirection.y, currentDirection.x);
    const surfaceHeight = ellipsoidMesh.getSurfaceHeightAt(theta, phi);
    console.log('Surface height:', surfaceHeight);

    // Set camera position
    camera.position.copy(currentDirection.multiplyScalar(surfaceHeight + 1.5)); // Match minHeightAboveSurface

    // Set camera up direction to surface normal
    const normal = camera.position.clone().normalize();
    camera.up.copy(normal);

    // Set initial forward direction (tangent to surface)
    const tangentVec = new THREE.Vector3(
        -ellipsoidMesh.a * Math.sin(theta) * Math.sin(phi),
        ellipsoidMesh.b * Math.sin(theta) * Math.cos(phi),
        0
    ).normalize();
    const lookAtPoint = camera.position.clone().add(tangentVec.multiplyScalar(10));
    camera.lookAt(lookAtPoint);

    updateMesh();
}

function updateMesh() {
    const newGeometry = ellipsoidMesh.updateGeometry(camera);
    const minDistance = ellipsoidMesh.getMinDistance(cameraController.getPosition());

    if (!isSurfaceMode) {
        cameraController.updateFromSliders(minDistance);
    }

    mesh.geometry.dispose();
    mesh.geometry = newGeometry;
    updateSliderReadouts();
}

toggleButton.addEventListener('click', () => {
    isSurfaceMode = !isSurfaceMode;
    if (isSurfaceMode) {
        sliders.azimuth.disabled = true;
        sliders.elevation.disabled = true;
        sliders.altitude.disabled = true;
        setSurfacePosition();
    } else {
        sliders.azimuth.disabled = false;
        sliders.elevation.disabled = false;
        sliders.altitude.disabled = false;
        cameraController.updateFromSliders(ellipsoidMesh.getMinDistance(camera.position));
        updateMesh();
    }
    toggleButton.textContent = isSurfaceMode ? 'Exit Surface Mode' : 'Toggle Surface Mode';
});

sliders.azimuth.addEventListener('input', updateMesh);
sliders.elevation.addEventListener('input', updateMesh);
sliders.altitude.addEventListener('input', updateMesh);

// Animation loop
let lastTime = 0;
let lastCameraPosition = camera.position.clone();
let lastCameraQuaternion = camera.quaternion.clone();
let lastUpdateTime = 0;
const updateInterval = 1000; // ~1 FPS (1000ms)
const rotationThreshold = 20; // Degrees
const distanceThreshold = 10; // Units

function animate(time) {
    requestAnimationFrame(animate);
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    if (isSurfaceMode) {
        inputControls.updateCamera(delta, isSurfaceMode);

        const now = performance.now();

        // Calculate rotation difference in degrees
        const qCurrent = camera.quaternion.clone();
        const qDiff = qCurrent.clone().multiply(lastCameraQuaternion.conjugate());
        let angleDiff;
        const epsilon = 0.0001;
        if (Math.abs(1 - Math.abs(qDiff.w)) < epsilon) {
            angleDiff = 0;
        } else {
            angleDiff = 2 * Math.acos(Math.abs(qDiff.w)) * (180 / Math.PI);
        }

        // Calculate distance moved since last update
        const distanceMoved = lastCameraPosition.distanceTo(camera.position);

        // // Log conditions for debugging
        // console.log({
        //     timeSinceLastUpdate: now - lastUpdateTime,
        //     distanceMoved,
        //     angleDiff,
        //     updateInterval,
        //     distanceThreshold,
        //     rotationThreshold
        // });

        // Check conditions for update
        const timeCondition = now - lastUpdateTime > updateInterval;
        const moveCondition = distanceMoved > distanceThreshold;
        const rotateCondition = angleDiff > rotationThreshold;

        if (
            (timeCondition) &&
            (moveCondition || rotateCondition)
        ) {
            console.log("Updating mesh...");
            updateMesh();
            lastCameraPosition.copy(camera.position);
            lastCameraQuaternion.copy(camera.quaternion);
            lastUpdateTime = now;
        } else {
            // Log why update didn't happen
            if (!timeCondition) console.log("Blocked by time condition");
            if (!moveCondition && !rotateCondition) console.log("Blocked by movement/rotation thresholds");
        }
    }

    renderer.render(scene, camera);
}
animate(0);