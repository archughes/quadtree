import { QuadtreeNode } from './QuadtreeNode.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TerrainColorManager } from './TerrainColorManager.js';
import { createNoise2D } from 'https://cdn.skypack.dev/simplex-noise';
import createSeededRNG from 'https://cdn.jsdelivr.net/npm/random-seed@0.3.0/+esm';

export class EllipsoidMesh {
    /**
     * Constructs an ellipsoid mesh with quadtree-based LOD.
     * @param {number} a - X-axis radius
     * @param {number} b - Y-axis radius
     * @param {number} c - Z-axis radius
     * @param {number} maxLevel - Maximum quadtree subdivision level
     * @param {number} minLevel - Minimum quadtree subdivision level
     * @param {number} r1 - Inner LOD distance threshold
     * @param {number} r2 - Middle LOD distance threshold
     * @param {number} r3 - Outer LOD distance threshold
     * @param {string} [seed='default'] - Seed for randomization
     */
    constructor(a, b, c, maxLevel, minLevel, lodDistances, seed = 'default', terrainConfig = {}) {
        if (a <= 0 || b <= 0 || c <= 0) throw new Error('Radii must be positive');
        this.a = a;
        this.b = b;
        this.c = c;
        this.maxLevel = maxLevel;
        this.minLevel = minLevel;
        this.lodDistances = lodDistances.sort((a, b) => a - b);
        this.root = new QuadtreeNode(0, Math.PI, 0, 2 * Math.PI, 0);
        this.vertexMap = new Map();
        this.rng = createSeededRNG(seed);
        this.noise = createNoise2D(() => this.rng.random());
        this.terrain = new TerrainGenerator(this.noise, seed, terrainConfig); // Delegate terrain generation
        this.terrainColorManager = new TerrainColorManager();
        this.terrainColorManager.setConfig(terrainConfig, this.noise);
    }

    /**
     * Maps spherical coordinates to ellipsoid surface with terrain offset.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} level - LOD level for height detail
     * @returns {THREE.Vector3} - Position on ellipsoid with terrain
     */
    mapToEllipsoid(theta, phi, level) {
        const x = this.a * Math.sin(theta) * Math.cos(phi);
        const y = this.b * Math.sin(theta) * Math.sin(phi);
        const z = this.c * Math.cos(theta);
        const base = new THREE.Vector3(x, y, z);
        const terrainData = this.terrain.getHeight(theta, phi, level);
        const height = terrainData.height;
        const scaled = base.multiplyScalar(1 + height);
        if (isNaN(scaled.x) || isNaN(scaled.y) || isNaN(scaled.z)) {
            console.warn(`NaN detected at theta=${theta}, phi=${phi}, level=${level}, height=${height}`);
            return new THREE.Vector3(this.a, 0, 0); // Default to a safe position
        }
        return [scaled, terrainData];
    }

    /**
     * Determines desired LOD based on distance from camera.
     * @param {number} distance - Distance from camera to node center
     * @returns {number} - Desired subdivision level
     */
    getDesiredLevel(distance) {
        for (let i = 0; i < this.lodDistances.length; i++) {
            if (distance < this.lodDistances[i]) {
                return Math.max(this.minLevel, this.maxLevel - i);
            }
        }
        return this.minLevel; // Farthest distance gets lowest detail
    }

    /**
     * Recursively builds the quadtree based on camera position.
     * @param {QuadtreeNode} node - Current node to process
     * @param {THREE.Vector3} cameraPos - Camera position
     */
    buildTree(node, cameraPos) {
        const thetaCenter = (node.thetaMin + node.thetaMax) / 2;
        const phiCenter = (node.phiMin + node.phiMax) / 2;
        const [centerPos, terrainData] = this.mapToEllipsoid(thetaCenter, phiCenter, node.level);
        const distance = centerPos.distanceTo(cameraPos);
        const desiredLevel = this.getDesiredLevel(distance);
        if (node.level < desiredLevel && node.level < this.maxLevel) {
            node.subdivide(this.terrain);
            for (const child of node.children.values()) {
                this.buildTree(child, cameraPos);
            }
        }
    }

    /**
     * Collects all leaf nodes in the quadtree.
     * @param {QuadtreeNode} node - Starting node
     * @param {Array<QuadtreeNode>} leaves - Array to store leaves
     */
    collectLeafNodes(node, leaves) {
        if (node.isLeaf()) {
            leaves.push(node);
        } else {
            for (const child of node.children.values()) {
                this.collectLeafNodes(child, leaves);
            }
        }
    }

    /**
     * Generates a unique key for a vertex based on coordinates and coarse LOD ID.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {string} - Unique vertex key
     */
    getVertexKey(theta, phi) {
        const epsilon = 1e-6;
        // Handle poles: set phi to 0 when theta is near 0 or π
        if (Math.abs(theta) < epsilon || Math.abs(theta - Math.PI) < epsilon) {
            phi = 0; // All phi values at poles map to the same point
        }
        // Handle phi wrap-around: normalize phi near 2π to 0
        else if (Math.abs(phi - 2 * Math.PI) < epsilon) {
            phi = 0; // phi = 2π is equivalent to phi = 0
        }
        const precision = 1e8;
        const thetaKey = Math.round(theta * precision) / precision;
        const phiKey = Math.round(phi * precision) / precision;
        const coarseTheta = Math.round(theta * 10) / 10;
        const coarsePhi = Math.round(phi * 10) / 10;
        return `${coarseTheta},${coarsePhi}:${thetaKey},${phiKey}`;
    }

    /**
     * Adds a vertex to the positions array, reusing if already present.
     * @param {number[]} positions - Array of vertex coordinates
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} level - LOD level for terrain detail
     * @returns {number} - Index of the vertex
     */
    addVertex(positions, colors, theta, phi, level) {
        const key = this.getVertexKey(theta, phi);
        if (this.vertexMap.has(key)) return this.vertexMap.get(key);

        const [vertex, terrainData] = this.mapToEllipsoid(theta, phi, level);
        const color = this.terrainColorManager.getColor(terrainData, theta, phi);

        const index = positions.length / 3;
        positions.push(vertex.x, vertex.y, vertex.z);
        colors.push(color[0] / 255, color[1] / 255, color[2] / 255);
        this.vertexMap.set(key, index);
        return index;
    }

    /**
     * Generates the mesh geometry based on camera position.
     * @param {THREE.Vector3} cameraPos - Camera position
     * @returns {THREE.BufferGeometry} - Generated geometry
     */
    generateGeometry(cameraPos) {
        this.root.children.clear(); // Changed from = []
        this.vertexMap.clear();
        this.buildTree(this.root, cameraPos);
        QuadtreeNode.balanceTree(this.root);

        const leaves = [];
        this.collectLeafNodes(this.root, leaves);

        const positions = [];
        const colors = [];
        const indices = [];

        for (const leaf of leaves) {
            const bottomLeftIndex = this.addVertex(positions, colors, leaf.thetaMin, leaf.phiMin, leaf.level);
            const bottomRightIndex = this.addVertex(positions, colors, leaf.thetaMin, leaf.phiMax, leaf.level);
            const topLeftIndex = this.addVertex(positions, colors, leaf.thetaMax, leaf.phiMin, leaf.level);
            const topRightIndex = this.addVertex(positions, colors, leaf.thetaMax, leaf.phiMax, leaf.level);

            indices.push(bottomLeftIndex, bottomRightIndex, topRightIndex); // Triangle 1
            indices.push(bottomLeftIndex, topRightIndex, topLeftIndex);     // Triangle 2
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }
}