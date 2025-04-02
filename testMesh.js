// testMesh.js
import * as THREE from './three.module.js';
import { EllipsoidMesh } from './terrain/EllipsoidMesh.js';
import { scene, camera, renderer } from './scene.js';

// Scene setup
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Small ellipsoid mesh (size 10)
const a = 5, b = 5, c = 5;
const lodDistances = [15, 30, 45, 60]; // Adjusted LOD distances
const ellipsoidMesh = new EllipsoidMesh(a, b, c, lodDistances, 'testSeed123');

camera.far = lodDistances[lodDistances.length - 1] + 100; 
camera.position.set(10, 0, 0); // Start at middle LOD distance
camera.updateProjectionMatrix();

// Initial geometry and mesh
let geometry = ellipsoidMesh.generateGeometry(camera);
const material = new THREE.MeshPhongMaterial({ shininess: 20, side: THREE.DoubleSide, vertexColors: true });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Slider setup
const slider = document.getElementById('lod-slider');
const lodValue = document.getElementById('lod-value');

// Update mesh based on LOD 
const offset = -2;
function updateMesh() {
    const lodIndex = parseInt(slider.value);
    lodValue.textContent = lodIndex;

    // Adjust camera position
    camera.position.set(lodDistances[lodIndex+1]+offset, 0, 0);
    camera.lookAt(0, 0, 0);

    // Regenerate geometry
    const newGeometry = ellipsoidMesh.updateGeometry(camera);
    mesh.geometry.dispose();
    mesh.geometry = newGeometry;

    // Log geometry bounds for debugging visibility
    newGeometry.computeBoundingSphere();

    camera.position.set(lodDistances[0]+offset, 0, 0);
}

slider.addEventListener('input', updateMesh);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();