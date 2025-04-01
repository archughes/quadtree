import * as THREE from '../three.module.js';
import { QuadtreeNode } from './QuadtreeNode.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TerrainColorManager } from './TerrainColorManager.js';
import { createNoise2D } from 'https://cdn.skypack.dev/simplex-noise';
import createSeededRNG from 'https://cdn.jsdelivr.net/npm/random-seed@0.3.0/+esm';
import { trackAnalytics, logAnalytics } from './ellipseUtils.js';

export class EllipsoidMesh {
    /**
     * Constructs an ellipsoid mesh with quadtree-based LOD.
     * @param {number} a - X-axis radius
     * @param {number} b - Y-axis radius
     * @param {number} c - Z-axis radius
     * @param {number} r1 - Inner LOD distance threshold
     * @param {number} r2 - Middle LOD distance threshold
     * @param {number} r3 - Outer LOD distance threshold
     * @param {string} [seed='default'] - Seed for randomization
     */
    constructor(a, b, c, lodDistances, seed = 'default', terrainConfig = {}) {
        if (a <= 0 || b <= 0 || c <= 0) throw new Error('Radii must be positive');
        this.a = a;
        this.b = b;
        this.c = c;
        this.minLevel = 0;              // Fixed
        this.maxLevel = lodDistances.length; // Inferred
        this.lodDistances = lodDistances.sort((a, b) => a - b);
        this.root = new QuadtreeNode(0, Math.PI, 0, 2 * Math.PI, 0);
        this.vertexMap = new Map();
        this.positions = [];
        this.colors = [];
        this.indices = [];
        this.rng = createSeededRNG(seed);
        this.noise = createNoise2D(() => this.rng.random());
        this.terrain = new TerrainGenerator(this.noise, seed, terrainConfig); // Delegate terrain generation
        this.terrainColorManager = new TerrainColorManager();
        this.terrainColorManager.setConfig(this.terrain.config, this.noise);
        
        // Store analytics data during generation
        this.analyticsData = {
            colorCounts: {},
            featureCounts: {},
            temperatureValues: [],
            heightValues: [],
            featureMap: new Map() // For tracking contiguous features
        };
    }

    /**
     * Maps spherical coordinates to base ellipsoid surface (no terrain offset)
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {THREE.Vector3} - Position on base ellipsoid
     */
    mapToBaseEllipsoid(theta, phi) {
        const x = this.a * Math.sin(theta) * Math.cos(phi);
        const y = this.b * Math.sin(theta) * Math.sin(phi);
        const z = this.c * Math.cos(theta);
        return new THREE.Vector3(x, y, z);
    }

    /**
     * Maps spherical coordinates to ellipsoid surface with terrain offset.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} distance - Distance from camera for LOD calculation
     * @returns {Array} - [Position on ellipsoid with terrain, terrainData]
     */
    mapToEllipsoid(theta, phi, distance) {
        const base = this.mapToBaseEllipsoid(theta, phi);
        const terrainData = this.terrain.getHeight(theta, phi, distance); // Pass distance instead of level
        const height = terrainData.height;
        const scaled = base.clone().multiplyScalar(1 + height); // Use clone() to avoid modifying original base
        if (isNaN(scaled.x) || isNaN(scaled.y) || isNaN(scaled.z)) {
            console.warn(`NaN detected at theta=${theta}, phi=${phi}, distance=${distance}, height=${height}`);
            return [new THREE.Vector3(this.a, 0, 0), { height: 0, features: [], temperature: 0 }]; // Return default terrainData too
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
                return this.maxLevel - i;
            }
        }
        return this.minLevel; // Farthest distance gets lowest detail
    }

    /**
     * Helper function to calculate distance from camera to a point on the ellipsoid,
     * considering coarse terrain height for accuracy.
     * @param {number} theta
     * @param {number} phi
     * @param {THREE.Vector3} cameraPos
     * @param {object | null} baseHeightData - The baseHeight object from the node ({height, features, temperature}) or null.
     * @returns {number} Distance
     */
    _calculateDistanceToCamera(theta, phi, cameraPos, baseHeightData) {
        const basePos = this.mapToBaseEllipsoid(theta, phi);

        // Use coarse height from node if available, otherwise default to 0
        const coarseHeight = baseHeightData?.height || 0;

        // Scale the base position by the coarse terrain height
        const scaledPos = basePos.clone().multiplyScalar(1 + coarseHeight);

        // Calculate distance from the scaled position
        return scaledPos.distanceTo(cameraPos);
    }

    /**
     * Recursively builds the quadtree based on camera position.
     * @param {QuadtreeNode} node - Current node to process
     * @param {THREE.Vector3} cameraPos - Camera position
     */
    buildTree(node, cameraPos) {
        const thetaCenter = (node.thetaMin + node.thetaMax) / 2;
        const phiCenter = (node.phiMin + node.phiMax) / 2;

        // Use helper to calculate distance
        const distance = this._calculateDistanceToCamera(thetaCenter, phiCenter, cameraPos, node.baseHeight);
        const desiredLevel = this.getDesiredLevel(distance);

        if (node.level <= desiredLevel && node.level < this.maxLevel) {
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
     * @param {number[]} colors - Array of vertex colors
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {THREE.Vector3} cameraPos - Camera position for distance calculation
     * @param {object | null} baseHeightData - Base height data from the node for distance calculation.
     * @returns {number} - Index of the vertex
     */
    addVertex(positions, colors, theta, phi, cameraPos, baseHeightData) {
        const key = this.getVertexKey(theta, phi);
        if (this.vertexMap.has(key)) return this.vertexMap.get(key);

        // Calculate distance using the helper function
        const distance = this._calculateDistanceToCamera(theta, phi, cameraPos, baseHeightData);

        // Get terrain data using the calculated distance
        const [vertex, terrainData] = this.mapToEllipsoid(theta, phi, distance);
        const color = this.terrainColorManager.getColor(terrainData, theta, phi);

        // Track analytics data using the utility function
        trackAnalytics(this.analyticsData, color, terrainData, theta, phi);

        const index = positions.length / 3;
        positions.push(vertex.x, vertex.y, vertex.z);
        colors.push(color[0] / 255, color[1] / 255, color[2] / 255);
        this.vertexMap.set(key, index);
        return index;
    }

    /**
     * Finds the leaf node containing the given theta, phi.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {QuadtreeNode|null} - The leaf node, or null if not found
     */
    findLeafNode(theta, phi) {
        function search(node, t, p) {
            if (node.isLeaf()) {
                if (t >= node.thetaMin && t <= node.thetaMax && p >= node.phiMin && p <= node.phiMax) {
                    return node;
                }
                return null;
            }
            for (const child of node.children.values()) {
                if (t >= child.thetaMin && t <= child.thetaMax && p >= child.phiMin && p <= child.phiMax) {
                    return search(child, t, p);
                }
            }
            return null;
        }
        return search(this.root, theta, phi);
    }

    /**
     * Retrieves the rendered surface height at the given theta, phi by interpolating between the quadtree node's vertices.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {number} - The interpolated surface height at this position
     */
    getSurfaceHeightAt(theta, phi) {
        // Normalize phi to [0, 2π)
        while (phi < 0) phi += 2 * Math.PI;
        while (phi >= 2 * Math.PI) phi -= 2 * Math.PI;

        // Find the leaf node containing this theta, phi
        const leaf = this.findLeafNode(theta, phi);
        if (!leaf) {
            console.warn(`No leaf node found at theta=${theta}, phi=${phi}, computing height as fallback`);
            const [surfacePos] = this.mapToEllipsoid(theta, phi, this.lodDistances[0]);
            return surfacePos.length();
        }

        // Get the indices of the four corner vertices of the leaf node
        const bottomLeftKey = this.getVertexKey(leaf.thetaMin, leaf.phiMin);
        const bottomRightKey = this.getVertexKey(leaf.thetaMin, leaf.phiMax);
        const topLeftKey = this.getVertexKey(leaf.thetaMax, leaf.phiMin);
        const topRightKey = this.getVertexKey(leaf.thetaMax, leaf.phiMax);

        // Retrieve the heights (lengths) of the four corners
        const getHeightFromKey = (key) => {
            if (this.vertexMap.has(key)) {
                const index = this.vertexMap.get(key);
                const x = this.positions[index * 3];
                const y = this.positions[index * 3 + 1];
                const z = this.positions[index * 3 + 2];
                const vertexPos = new THREE.Vector3(x, y, z);
                return vertexPos.length();
            }
            console.warn(`Vertex not found for key=${key}, computing height as fallback`);
            const [thetaPart, phiPart] = key.split(':')[1].split(',').map(Number);
            const [surfacePos] = this.mapToEllipsoid(thetaPart, phiPart, this.lodDistances[0]);
            return surfacePos.length();
        };

        const hBottomLeft = getHeightFromKey(bottomLeftKey);
        const hBottomRight = getHeightFromKey(bottomRightKey);
        const hTopLeft = getHeightFromKey(topLeftKey);
        const hTopRight = getHeightFromKey(topRightKey);

        // Perform bilinear interpolation
        const thetaRange = leaf.thetaMax - leaf.thetaMin;
        const phiRange = leaf.phiMax - leaf.phiMin;
        const t = (theta - leaf.thetaMin) / thetaRange; // Normalized theta position [0, 1]
        const p = (phi - leaf.phiMin) / phiRange;       // Normalized phi position [0, 1]

        // Interpolate along theta (vertical) at phiMin and phiMax
        const hLeft = hBottomLeft + t * (hTopLeft - hBottomLeft);
        const hRight = hBottomRight + t * (hTopRight - hBottomRight);

        // Interpolate along phi (horizontal) between the two interpolated heights
        const interpolatedHeight = hLeft + p * (hRight - hLeft);

        return interpolatedHeight;
    }

    /**
     * Generates the mesh geometry based on camera position.
     * @param {THREE.Camera} camera - Camera object
     * @returns {THREE.BufferGeometry} - Generated geometry
     */
    generateGeometry(camera) {
        const cameraPos = camera.position;
        // Reset analytics data
        this.analyticsData = {
            colorCounts: {},
            featureCounts: {},
            temperatureValues: [],
            heightValues: [],
            featureMap: new Map()
        };
        
        this.root.children.clear(); // Changed from = []
        this.vertexMap.clear();
        this.buildTree(this.root, cameraPos);
        QuadtreeNode.balanceTree(this.root);

        const leaves = [];
        this.collectLeafNodes(this.root, leaves);
        console.log(`Generated ${leaves.length} leaves`);
        console.log(`Max LOD all leaves: ${Math.max(...leaves.map(leaf => leaf.level))}`);

        this.positions = [];
        this.colors = [];
        this.indices = [];

        let minLeafDist = Infinity;
        for (const leaf of leaves) {
            const bottomLeftIndex = this.addVertex(this.positions, this.colors, leaf.thetaMin, leaf.phiMin, cameraPos, leaf.baseHeight);
            const bottomRightIndex = this.addVertex(this.positions, this.colors, leaf.thetaMin, leaf.phiMax, cameraPos, leaf.baseHeight);
            const topLeftIndex = this.addVertex(this.positions, this.colors, leaf.thetaMax, leaf.phiMin, cameraPos, leaf.baseHeight);
            const topRightIndex = this.addVertex(this.positions, this.colors, leaf.thetaMax, leaf.phiMax, cameraPos, leaf.baseHeight);

            this.indices.push(bottomLeftIndex, bottomRightIndex, topRightIndex); // Triangle 1
            this.indices.push(bottomLeftIndex, topRightIndex, topLeftIndex);     // Triangle 2

            // Extract actual position vectors
            const bottomLeftPos = new THREE.Vector3(this.positions[bottomLeftIndex * 3], this.positions[bottomLeftIndex * 3 + 1], this.positions[bottomLeftIndex * 3 + 2]);
            const bottomRightPos = new THREE.Vector3(this.positions[bottomRightIndex * 3], this.positions[bottomRightIndex * 3 + 1], this.positions[bottomRightIndex * 3 + 2]);

            // Compute the Euclidean distance
            const thisLeafDist = bottomLeftPos.distanceTo(bottomRightPos);
            if (thisLeafDist < minLeafDist && thisLeafDist !== 0) {
                minLeafDist = thisLeafDist;
            }
        }
        console.log(`Minimum leaf node distance: ${minLeafDist}`);


        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
        geometry.setIndex(this.indices);
        geometry.computeVertexNormals();
        
        // // Log analytics data using the utility function
        // console.log("===== MESH GENERATION ANALYTICS =====");
        // logAnalytics(this.analyticsData);
        // console.log("===== END ANALYTICS =====");
        
        return geometry;
    }
}