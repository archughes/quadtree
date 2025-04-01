import * as THREE from './three.module.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 50, 50).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040, 1));

// if (!scene.fog) {
//     scene.fog = new THREE.Fog(0xcccccc, 150, 250); // Default fog from original scene.js
// }

camera.position.set(0, 5, 10); // Initial position, will be overridden in demo
camera.lookAt(0, 0, 0);

export { scene, camera, renderer };