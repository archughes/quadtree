import { EllipsoidMesh } from './EllipsoidMesh.js';
import { CameraController } from './CameraController.js';

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
directionalLight.position.set(5, 5, 5).normalize();
scene.add(directionalLight);

// Ellipsoid mesh
const terrainConfig = {
    baseFrequency: 1,      // Adjust base terrain roughness
    baseAmplitude: 0.1,    // Adjust base terrain height
    detailFrequency: 2,    // Adjust detail roughness
    detailAmplitude: 0.05, // Adjust detail height
    octaves: 3             // More octaves = more complexity
};
const ellipsoidMesh = new EllipsoidMesh(
    100, 100, 80,              // Ellipsoid dimensions
    6, 2,   // LOD range
    [50, 100, 200, 400, 800],
    'planetSeed123',
    terrainConfig
);

// Update camera far clipping plane to match max LOD distance
camera.far = 2 * ellipsoidMesh.lodDistances[ellipsoidMesh.lodDistances.length - 1];
camera.updateProjectionMatrix();

let geometry = ellipsoidMesh.generateGeometry(camera.position);
const material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, specular: 0xffffff, shininess: 50, side: THREE.DoubleSide });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Camera controller
const sliders = {
    azimuth: document.getElementById('azimuth'),
    elevation: document.getElementById('elevation'),
    altitude: document.getElementById('altitude'),
};
const maxAltitude = 2 * ellipsoidMesh.lodDistances[ellipsoidMesh.lodDistances.length - 1];
sliders.altitude.max = maxAltitude;
sliders.altitude.value = maxAltitude / 2;
const cameraController = new CameraController(camera, sliders);

// Slider readouts
const azimuthValue = document.getElementById('azimuth-value');
const elevationValue = document.getElementById('elevation-value');
const altitudeValue = document.getElementById('altitude-value');

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
 * @param {THREE.Vector3} cameraPos - Camera position
 * @param {THREE.BufferGeometry} geom - Mesh geometry
 * @returns {number} - Minimum distance plus buffer
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
 * Updates the mesh geometry based on camera position.
 */
function updateMesh() {
    const newGeometry = ellipsoidMesh.generateGeometry(cameraController.getPosition());
    const minDistance = getMinDistance(cameraController.getPosition(), newGeometry);
    cameraController.updateFromSliders(minDistance);

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
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();