import * as THREE from './three.module.js';
import { EllipsoidMesh } from './terrain/EllipsoidMesh.js';
import { CameraController } from './CameraController.js';
import { scene, camera, renderer } from './scene.js';
import { setupInput } from './controls/input.js';

// Scene setup (handled in scene.js)

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Ellipsoid mesh
const a = 10000, b = 10000, c = 10000;
const quadSplits = 8;
const ellipsoidRadius = new THREE.Vector3(a, b, c).length();
const lodDistances = linspace(50, 2 * ellipsoidRadius, quadSplits);
console.log('quadSplits of ' + quadSplits + ' [' + lodDistances + '] of expected max resolution: ' + ellipsoidRadius / Math.pow(2, quadSplits));
const ellipsoidMesh = new EllipsoidMesh(
    a, b, c,
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

// UI elements
const controlsDiv = document.getElementById('controls');
const featureDropdown = document.getElementById('feature-toggle');
const featureSwitch = document.getElementById('feature-switch');
const regenerateButton = document.getElementById('regenerate');
const surfaceModeSwitch = document.getElementById('surface-mode-switch');
const azimuthValue = document.getElementById('azimuth-value');
const elevationValue = document.getElementById('elevation-value');
const altitudeValue = document.getElementById('altitude-value');

// Populate feature dropdown
const featureNames = [
    'CraterGenerator', 'VolcanoGenerator', 'TectonicPlateGenerator', 'VastPlainsGenerator',
    'MagneticAnomalyGenerator', 'LavaFlowGenerator', 'DesertPavementGenerator', 'SandDuneGenerator',
    'GlacialFeatureGenerator', 'KarstTopographyGenerator', 'WetlandGenerator', 'PermafrostGenerator',
    'OasisGenerator', 'FoothillGenerator', 'ValleyAndRiverGenerator', 'CoralReefGenerator', 'FumaroleGenerator'
];
featureNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name.replace('Generator', '');
    featureDropdown.appendChild(option);
});

// Update feature switch state on dropdown change
featureDropdown.addEventListener('change', () => {
    const selectedFeature = featureDropdown.value;
    featureSwitch.checked = ellipsoidMesh.getFeatureState(selectedFeature);
});

// Surface mode state
let isSurfaceMode = false;

// Update slider readouts
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

    camera.position.copy(currentDirection.multiplyScalar(Math.max(surfaceHeight + 1.5, surfaceDistance)));
    camera.up.copy(camera.position.clone().normalize());

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
        console.log('Min distance:', minDistance);
        cameraController.updateFromSliders(minDistance);
    }

    mesh.geometry.dispose();
    mesh.geometry = newGeometry;
    updateSliderReadouts();
}

// Toggle feature generator
featureSwitch.addEventListener('change', () => {
    const selectedFeature = featureDropdown.value;
    ellipsoidMesh.toggleFeatureGenerator(selectedFeature, featureSwitch.checked);
    updateMesh();
});

// Toggle surface mode
surfaceModeSwitch.addEventListener('change', () => {
    isSurfaceMode = surfaceModeSwitch.checked;
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
});

// Regenerate terrain
regenerateButton.addEventListener('click', () => {
    ellipsoidMesh.regenerateTerrain();
    updateMesh();
});


// Slider events
sliders.azimuth.addEventListener('input', updateMesh);
sliders.elevation.addEventListener('input', updateMesh);
sliders.altitude.addEventListener('input', updateMesh);

// Mouse wheel zoom
document.addEventListener('wheel', (event) => {
    if (!isSurfaceMode) {
        const sensitivity = maxAltitude / 1000; // Scale with range (e.g., 0.02 for maxAltitude=20000)
        const delta = event.deltaY * sensitivity;
        let newAltitude = parseFloat(sliders.altitude.value) + delta;
        newAltitude = Math.max(0, Math.min(maxAltitude, newAltitude));
        sliders.altitude.value = newAltitude;
        updateMesh();
    }
});

// Add this after your other event listeners
document.addEventListener('click', onDocumentMouseClick);

function onDocumentMouseClick(event) {
    // Only proceed with left-click (button 0)
    if (event.button !== 0) return;

    // Prevent interaction if the click is on the controls div
    const controlsDiv = document.getElementById('controls');
    if (controlsDiv.contains(event.target)) {
        return; // Click was on the controls, let it propagate to UI elements
    }

    event.preventDefault();

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the raycaster with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with the mesh
    const intersects = raycaster.intersectObject(mesh);
    if (intersects.length > 0) {
        const intersect = intersects[0]; // Take the closest intersection
        const point = intersect.point;   // World coordinates of the click

        // Convert Cartesian to spherical coordinates
        const [theta, phi] = cartesianToSpherical(point);

        // Convert to azimuth and elevation for sliders (in degrees)
        const azimuth = THREE.MathUtils.radToDeg(phi);
        const elevation = THREE.MathUtils.radToDeg(Math.PI / 2 - theta); // Elevation from equator

        if (isSurfaceMode) {
            // In surface mode, update camera position directly
            const surfaceHeight = ellipsoidMesh.getSurfaceHeightAt(theta, phi);
            const minDistance = ellipsoidMesh.getMinDistance(camera.position);
            const currentAltitude = camera.position.length();
            let newAltitude = Math.max(surfaceHeight + 1.5, currentAltitude, minDistance + 0.5);

            const newDirection = new THREE.Vector3(
                Math.sin(theta) * Math.cos(phi),
                Math.sin(theta) * Math.sin(phi),
                Math.cos(theta)
            ).normalize();
            camera.position.copy(newDirection.multiplyScalar(newAltitude));
            camera.up.copy(camera.position.clone().normalize());

            const tangentVec = new THREE.Vector3(
                -ellipsoidMesh.a * Math.sin(theta) * Math.sin(phi),
                ellipsoidMesh.b * Math.sin(theta) * Math.cos(phi),
                0
            ).normalize();
            const lookAtPoint = camera.position.clone().add(tangentVec.multiplyScalar(10));
            camera.lookAt(lookAtPoint);
        } else {
            // In regular mode, update sliders
            let altitude = parseFloat(sliders.altitude.value);
            const minDistance = ellipsoidMesh.getMinDistance(camera.position);

            // Check if current altitude violates minDistance at the new position
            const newDirection = new THREE.Vector3(
                Math.sin(theta) * Math.cos(phi),
                Math.sin(theta) * Math.sin(phi),
                Math.cos(theta)
            ).normalize();
            const newPosition = newDirection.multiplyScalar(altitude);
            const surfaceHeight = ellipsoidMesh.getSurfaceHeightAt(theta, phi);
            if (altitude < surfaceHeight + minDistance) {
                altitude = surfaceHeight + minDistance + 0.5; // Add a small buffer
                sliders.altitude.value = altitude;
            }

            // Update sliders
            sliders.azimuth.value = azimuth;
            sliders.elevation.value = elevation;

            // Update camera position
            cameraController.updateFromSliders(minDistance);
        }

        updateMesh();
    }
}

// Helper function to convert Cartesian to spherical coordinates
function cartesianToSpherical(point) {
    const r = point.length();
    const theta = Math.acos(point.z / r);           // Polar angle from +z axis
    const phi = Math.atan2(point.y, point.x);       // Azimuthal angle from +x axis
    return [theta, phi >= 0 ? phi : phi + 2 * Math.PI]; // Ensure phi is [0, 2π]
}

// Animation loop
let lastTime = 0;
let lastCameraPosition = camera.position.clone();
let lastCameraQuaternion = camera.quaternion.clone();
let lastUpdateTime = 0;
const updateInterval = 1000; // ~1 FPS
const rotationThreshold = 20; // Degrees
const distanceThreshold = 10; // Units

function animate(time) {
    requestAnimationFrame(animate);
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    if (isSurfaceMode) {
        inputControls.updateCamera(delta, isSurfaceMode);

        const now = performance.now();
        const qCurrent = camera.quaternion.clone();
        const qDiff = qCurrent.clone().multiply(lastCameraQuaternion.conjugate());
        const epsilon = 0.0001;
        let angleDiff;
        if (Math.abs(1 - Math.abs(qDiff.w)) < epsilon) {
            angleDiff = 0;
        } else {
            angleDiff = 2 * Math.acos(Math.abs(qDiff.w)) * (180 / Math.PI);
        }
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
            (moveCondition)// || rotateCondition)
        ) {
            console.log("Updating mesh...");
            updateMesh();
            lastCameraPosition.copy(camera.position);
            lastCameraQuaternion.copy(camera.quaternion);
            lastUpdateTime = now;
        }
        // else {
        //     // Log why update didn't happen
        //     if (!timeCondition) console.log("Blocked by time condition");
        //     if (!moveCondition && !rotateCondition) console.log("Blocked by movement/rotation thresholds");
        // }
    }

    renderer.render(scene, camera);
}
animate(0);