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
        this.rng = createSeededRNG(seed);
        this.noise = createNoise2D(() => this.rng.random());
        this.terrain = new TerrainGenerator(this.noise, seed, terrainConfig); // Delegate terrain generation
        this.terrainColorManager = new TerrainColorManager();
        this.terrainColorManager.setConfig(terrainConfig, this.noise);
        
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
     * Maps spherical coordinates to ellipsoid surface with terrain offset.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @param {number} distance - Distance from camera for LOD calculation
     * @returns {Array} - [Position on ellipsoid with terrain, terrainData]
     */
    mapToEllipsoid(theta, phi, distance) {
        const x = this.a * Math.sin(theta) * Math.cos(phi);
        const y = this.b * Math.sin(theta) * Math.sin(phi);
        const z = this.c * Math.cos(theta);
        const base = new THREE.Vector3(x, y, z);
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
                return this.maxLevel - i + 1;
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
        // Calculate base position on the ellipsoid
        const x = this.a * Math.sin(theta) * Math.cos(phi);
        const y = this.b * Math.sin(theta) * Math.sin(phi);
        const z = this.c * Math.cos(theta);
        const basePos = new THREE.Vector3(x, y, z);

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
     * Generates the mesh geometry based on camera position.
     * @param {THREE.Vector3} cameraPos - Camera position
     * @returns {THREE.BufferGeometry} - Generated geometry
     */
    generateGeometry(cameraPos) {
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

        const positions = [];
        const colors = [];
        const indices = [];

        let minLeafDist = Infinity;
        for (const leaf of leaves) {
            const bottomLeftIndex = this.addVertex(positions, colors, leaf.thetaMin, leaf.phiMin, cameraPos, leaf.baseHeight);
            const bottomRightIndex = this.addVertex(positions, colors, leaf.thetaMin, leaf.phiMax, cameraPos, leaf.baseHeight);
            const topLeftIndex = this.addVertex(positions, colors, leaf.thetaMax, leaf.phiMin, cameraPos, leaf.baseHeight);
            const topRightIndex = this.addVertex(positions, colors, leaf.thetaMax, leaf.phiMax, cameraPos, leaf.baseHeight);

            indices.push(bottomLeftIndex, bottomRightIndex, topRightIndex); // Triangle 1
            indices.push(bottomLeftIndex, topRightIndex, topLeftIndex);     // Triangle 2

            // Extract actual position vectors
            const bottomLeftPos = new THREE.Vector3(positions[bottomLeftIndex * 3], positions[bottomLeftIndex * 3 + 1], positions[bottomLeftIndex * 3 + 2]);
            const bottomRightPos = new THREE.Vector3(positions[bottomRightIndex * 3], positions[bottomRightIndex * 3 + 1], positions[bottomRightIndex * 3 + 2]);

            // Compute the Euclidean distance
            const thisLeafDist = bottomLeftPos.distanceTo(bottomRightPos);
            if (thisLeafDist < minLeafDist && thisLeafDist !== 0) {
                minLeafDist = thisLeafDist;
            }
        }
        console.log(`Minimum leaf node distance: ${minLeafDist}`);


        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // // Log analytics data using the utility function
        // console.log("===== MESH GENERATION ANALYTICS =====");
        // logAnalytics(this.analyticsData);
        // console.log("===== END ANALYTICS =====");
        
        return geometry;
    }
}