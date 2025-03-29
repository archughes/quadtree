import { EllipsoidMesh } from './EllipsoidMesh.js';
import { CameraController } from './CameraController.js';
import { OrbitControls } from './OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 1);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(50, 50, 50).normalize();
scene.add(directionalLight);

// Ellipsoid mesh
const terrainConfig = {
    baseFrequency: 1,
    baseAmplitude: 0.1,
    detailFrequency: 2,
    detailAmplitude: 0.05,
    octaves: 3
};
const ellipsoidMesh = new EllipsoidMesh(
    200, 200, 200,
    6, 2,
    [50, 100, 200, 600, 1200],
    'planetSeed123',
    terrainConfig
);

camera.far = 2 * ellipsoidMesh.lodDistances[ellipsoidMesh.lodDistances.length - 1];
camera.position.set(camera.far / 2, 0, 0);
camera.updateProjectionMatrix();

let geometry = ellipsoidMesh.generateGeometry(camera.position);
const material = new THREE.MeshPhongMaterial({ shininess: 20, side: THREE.DoubleSide, vertexColors: true });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Camera controller and controls
const sliders = {
    azimuth: document.getElementById('azimuth'),
    elevation: document.getElementById('elevation'),
    altitude: document.getElementById('altitude'),
};
const maxAltitude = camera.far;
sliders.altitude.max = maxAltitude;
sliders.altitude.value = maxAltitude / 2;
const cameraController = new CameraController(camera, sliders);

// Add toggle button and orbital controls
const controlsDiv = document.getElementById('controls');
const orbitControls = new OrbitControls(camera, renderer.domElement);
if (!controlsDiv) {
    console.error('Controls div not found!');
} else {
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Toggle Surface Mode';
    controlsDiv.appendChild(toggleButton);

    
    orbitControls.enabled = false;
    orbitControls.enablePan = false;
    orbitControls.minDistance = 1;
    orbitControls.maxDistance = camera.far;

    // Toggle surface mode
    toggleButton.addEventListener('click', () => {
        isSurfaceMode = !isSurfaceMode;
        orbitControls.enabled = isSurfaceMode;
        
        if (isSurfaceMode) {
            sliders.azimuth.disabled = true;
            sliders.elevation.disabled = true;
            sliders.altitude.disabled = true;
            setSurfacePosition();
        } else {
            sliders.azimuth.disabled = false;
            sliders.elevation.disabled = false;
            sliders.altitude.disabled = false;
            cameraController.updateFromSliders(getMinDistance(camera.position, mesh.geometry));
        }
        
        toggleButton.textContent = isSurfaceMode ? 'Exit Surface Mode' : 'Toggle Surface Mode';
    });
}

// Slider readouts
const azimuthValue = document.getElementById('azimuth-value');
const elevationValue = document.getElementById('elevation-value');
const altitudeValue = document.getElementById('altitude-value');

// Surface mode state
let isSurfaceMode = false;

/**
 * Updates slider text readouts.
 */
function updateSliderReadouts() {
    azimuthValue.textContent = sliders.azimuth.value;
    elevationValue.textContent = sliders.elevation.value;
    altitudeValue.textContent = sliders.altitude.value;
}

/**
 * Calculates minimum distance from camera to mesh vertices.
 */
function getMinDistance(cameraPos, geom) {
    const positions = geom.attributes.position.array;
    if (!positions.length) return 2;
    let minDist = Infinity;
    let setDist = Infinity;
    const tempVec = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
        tempVec.set(positions[i], positions[i + 1], positions[i + 2]);
        const dist = cameraPos.distanceTo(tempVec);
        if (dist < minDist) {
            minDist = dist;
            setDist = tempVec.distanceTo(new THREE.Vector3(0, 0, 0));
        }
    }
    return setDist + 0.5;
}

/**
 * Positions camera 1.5 units above surface and orients it tangent to the surface
 */
function setSurfacePosition() {
    // Get current geometry to account for terrain
    const currentGeometry = ellipsoidMesh.generateGeometry(camera.position);
    const surfaceDistance = getMinDistance(camera.position, currentGeometry);

    // Current camera direction (normalized)
    const currentDirection = camera.position.clone().normalize();

    // Surface point in spherical coordinates (theta, phi) based on current direction
    const theta = Math.acos(currentDirection.z / Math.sqrt(currentDirection.x ** 2 + currentDirection.y ** 2 + currentDirection.z ** 2));
    const phi = Math.atan2(currentDirection.y, currentDirection.x);

    // Get surface position including terrain height
    const [surfacePos] = ellipsoidMesh.mapToEllipsoid(theta, phi, ellipsoidMesh.maxLevel);
    const surfaceRadius = surfacePos.length(); // Distance from origin to surface point

    // Calculate tangent vector (e.g., along phi direction)
    // Parametric form: x = a * sin(theta) * cos(phi), y = b * sin(theta) * sin(phi), z = c * cos(theta)
    // Partial derivative w.r.t. phi gives tangent along azimuthal direction
    const tangentX = -ellipsoidMesh.a * Math.sin(theta) * Math.sin(phi);
    const tangentY = ellipsoidMesh.b * Math.sin(theta) * Math.cos(phi);
    const tangentZ = 0; // z doesn't change with phi
    const tangentVec = new THREE.Vector3(tangentX, tangentY, tangentZ).normalize();

    // Adjust surface position to account for terrain
    camera.position.copy(surfacePos.normalize().multiplyScalar(surfaceRadius + 1.5));

    // Set camera to look along tangent direction
    const lookAtPoint = camera.position.clone().add(tangentVec.multiplyScalar(10)); // Look 10 units along tangent
    camera.lookAt(lookAtPoint);

    // Update orbit controls target to the surface point
    orbitControls.target.copy(surfacePos);
    orbitControls.update();
}

/**
 * Updates the mesh geometry based on camera position.
 */
function updateMesh() {
    const newGeometry = ellipsoidMesh.generateGeometry(cameraController.getPosition());
    const minDistance = getMinDistance(cameraController.getPosition(), newGeometry);
    
    if (!isSurfaceMode) {
        cameraController.updateFromSliders(minDistance);
    }

    mesh.geometry.dispose();
    mesh.geometry = newGeometry;
    updateSliderReadouts();
}

// Event listeners
sliders.azimuth.addEventListener('input', updateMesh);
sliders.elevation.addEventListener('input', updateMesh);
sliders.altitude.addEventListener('input', updateMesh);

// Initial setup
updateMesh();

// Animation loop
let lastCameraPosition = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    if (isSurfaceMode) {
        orbitControls.update();

        // Check if the camera has moved
        if (!camera.position.equals(lastCameraPosition)) {
            updateMesh();
            lastCameraPosition.copy(camera.position); // Store new position
        }
    }

    renderer.render(scene, camera);
}
animate();
