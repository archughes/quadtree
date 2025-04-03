import * as THREE from '../three.module.js';
import { QuadtreeNode } from './QuadtreeNode.js';
import { QuadTreeManager } from './QuadTreeManager.js';
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
     * @param {number[]} lodDistances - Array of LOD distance thresholds
     * @param {string} [seed='default'] - Seed for randomization
     * @param {object} [terrainConfig={}] - Configuration for terrain generation
     */
    constructor(a, b, c, lodDistances, seed = 'default', terrainConfig = {}) {
        if (a <= 0 || b <= 0 || c <= 0) throw new Error('Radii must be positive');
        this.a = a;
        this.b = b;
        this.c = c;
        this.minLevel = 0;
        this.maxLevel = lodDistances.length;
        this.lodDistances = lodDistances.sort((a, b) => a - b);
        this.root = new QuadtreeNode(0, Math.PI, 0, 2 * Math.PI, 0);
        this.treeManager = new QuadTreeManager(this.root, null, this.lodDistances, this.maxLevel, this);
        this.vertexMap = new Map();
        this.positions = [];
        this.colors = [];
        this.indices = [];
        this.rng = createSeededRNG(seed);
        this.noise = createNoise2D(() => this.rng.random());
        this.terrain = new TerrainGenerator(this.noise, seed, terrainConfig, a, b, c, this.rng);
        this.treeManager.terrain = this.terrain;
        this.terrainColorManager = new TerrainColorManager();
        this.terrainColorManager.setConfig(this.terrain.config, this.noise);
        this.analyticsData = {
            colorCounts: {},
            featureCounts: {},
            temperatureValues: [],
            heightValues: [],
            featureMap: new Map()
        };

        // Delegation Methods
        this.toggleFeatureGenerator = (name, enabled) => this.terrain.toggleFeatureGenerator(name, enabled);
        this.regenerateTerrain = () => this.terrain.regenerateTerrain();
        this.getFeatureState = (name) => this.terrain.getFeatureState(name);
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
        const terrainData = this.terrain.getHeight(theta, phi, distance);
        const height = terrainData.height;
        const scaled = base.clone().multiplyScalar(1 + height);
        if (isNaN(scaled.x) || isNaN(scaled.y) || isNaN(scaled.z)) {
            console.warn(`NaN detected at theta=${theta}, phi=${phi}, distance=${distance}, height=${height}`);
            return [new THREE.Vector3(this.a, 0, 0), { height: 0, features: [], temperature: 0 }];
        }
        return [scaled, terrainData];
    }

    /**
     * Generates a unique key for a vertex based on coordinates and coarse LOD ID.
     * @param {number} theta - Elevation angle
     * @param {number} phi - Azimuth angle
     * @returns {string} - Unique vertex key
     */
    getVertexKey(theta, phi) {
        const epsilon = 1e-6;
        if (Math.abs(theta) < epsilon || Math.abs(theta - Math.PI) < epsilon) {
            phi = 0;
        } else if (Math.abs(phi - 2 * Math.PI) < epsilon) {
            phi = 0;
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
     * @param {object | null} baseHeightData - Base height data from the node
     * @returns {number} - Index of the vertex
     */
    addVertex(positions, colors, theta, phi, cameraPos, baseHeightData) {
        const key = this.getVertexKey(theta, phi);
        if (this.vertexMap.has(key)) {
            const index = this.vertexMap.get(key);
            const newVertex = this.getSurfaceHeightAt(theta, phi);
            const oldX = positions[index * 3], oldY = positions[index * 3 + 1], oldZ = positions[index * 3 + 2];
            if (Math.abs(newVertex.x - oldX) > 1e-6 || Math.abs(newVertex.y - oldY) > 1e-6 || Math.abs(newVertex.z - oldZ) > 1e-6) {
                console.warn(`Vertex position changed for key=${key}: old=(${oldX},${oldY},${oldZ}), new=(${newVertex.x},${newVertex.y},${newVertex.z})`);
            }
            return index;
        }

        const distance = this.treeManager._calculateDistanceToCamera(theta, phi, cameraPos, baseHeightData);
        const [vertex, terrainData] = this.mapToEllipsoid(theta, phi, distance);
        const color = this.terrainColorManager.getColor(terrainData, theta, phi);

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
        while (phi < 0) phi += 2 * Math.PI;
        while (phi >= 2 * Math.PI) phi -= 2 * Math.PI;

        const leaf = this.findLeafNode(theta, phi);
        if (!leaf) {
            console.warn(`No leaf node found at theta=${theta}, phi=${phi}, computing height as fallback`);
            const [surfacePos] = this.mapToEllipsoid(theta, phi, this.lodDistances[0]);
            return surfacePos.length();
        }

        const bottomLeftKey = this.getVertexKey(leaf.thetaMin, leaf.phiMin);
        const bottomRightKey = this.getVertexKey(leaf.thetaMin, leaf.phiMax);
        const topLeftKey = this.getVertexKey(leaf.thetaMax, leaf.phiMin);
        const topRightKey = this.getVertexKey(leaf.thetaMax, leaf.phiMax);

        const getHeightFromKey = (key) => {
            if (this.vertexMap.has(key)) {
                const index = this.vertexMap.get(key);
                const x = this.positions[index * 3];
                const y = this.positions[index * 3 + 1];
                const z = this.positions[index * 3 + 2];
                const vertexPos = new THREE.Vector3(x, y, z);
                return vertexPos.length();
            }
            // console.warn(`Vertex not found for key=${key}, computing height as fallback`);
            const [thetaPart, phiPart] = key.split(':')[1].split(',').map(Number);
            const [surfacePos] = this.mapToEllipsoid(thetaPart, phiPart, this.lodDistances[0]);
            return surfacePos.length();
        };

        const hBottomLeft = getHeightFromKey(bottomLeftKey);
        const hBottomRight = getHeightFromKey(bottomRightKey);
        const hTopLeft = getHeightFromKey(topLeftKey);
        const hTopRight = getHeightFromKey(topRightKey);

        const thetaRange = leaf.thetaMax - leaf.thetaMin;
        const phiRange = leaf.phiMax - leaf.phiMin;
        const t = (theta - leaf.thetaMin) / thetaRange;
        const p = (phi - leaf.phiMin) / phiRange;

        const hLeft = hBottomLeft + t * (hTopLeft - hBottomLeft);
        const hRight = hBottomRight + t * (hTopRight - hBottomRight);
        return hLeft + p * (hRight - hLeft);
    }

    /**
     * Calculates the minimum distance from camera to the mesh surface.
     * @param {THREE.Vector3} cameraPos - Camera position
     * @returns {number} - Minimum distance plus a buffer
     */
    getMinDistance(cameraPos) {
        const positions = this.positions;
        if (!positions.length) return null;
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
     * Generates the mesh geometry based on camera position.
     * @param {THREE.Camera} camera - Camera object
     * @returns {THREE.BufferGeometry} - Generated geometry
     */
    generateGeometry(camera) {
        this.analyticsData = {
            colorCounts: {},
            featureCounts: {},
            temperatureValues: [],
            heightValues: [],
            featureMap: new Map()
        };
        
        this.vertexMap.clear();
        this.treeManager.buildTree(camera);
        const leaves = this.treeManager.collectLeafNodes();
        console.log(`Generated ${leaves.length} leaves`);
        console.log(`Max LOD all leaves: ${Math.max(...leaves.map(leaf => leaf.level))}`);
        
        this.positions = [];
        this.colors = [];
        this.indices = [];

        let minLeafDist = Infinity;
        for (const leaf of leaves) {
            const bottomLeftIndex = this.addVertex(this.positions, this.colors, leaf.thetaMin, leaf.phiMin, camera.position, leaf.baseHeight);
            const bottomRightIndex = this.addVertex(this.positions, this.colors, leaf.thetaMin, leaf.phiMax, camera.position, leaf.baseHeight);
            const topLeftIndex = this.addVertex(this.positions, this.colors, leaf.thetaMax, leaf.phiMin, camera.position, leaf.baseHeight);
            const topRightIndex = this.addVertex(this.positions, this.colors, leaf.thetaMax, leaf.phiMax, camera.position, leaf.baseHeight);

            this.indices.push(bottomLeftIndex, bottomRightIndex, topRightIndex);
            this.indices.push(bottomLeftIndex, topRightIndex, topLeftIndex);

            const bottomLeftPos = new THREE.Vector3(this.positions[bottomLeftIndex * 3], this.positions[bottomLeftIndex * 3 + 1], this.positions[bottomLeftIndex * 3 + 2]);
            const bottomRightPos = new THREE.Vector3(this.positions[bottomRightIndex * 3], this.positions[bottomRightIndex * 3 + 1], this.positions[bottomRightIndex * 3 + 2]);
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
        
        // Log analytics data using the utility function
        console.log("===== MESH GENERATION ANALYTICS =====");
        logAnalytics(this.analyticsData);
        console.log("===== END ANALYTICS =====");
        
        return geometry;
    }

    /**
     * Updates the geometry incrementally based on camera movement with culling.
     * @param {THREE.Camera} camera - Camera object
     * @returns {THREE.BufferGeometry} - Updated geometry
     */
    updateGeometry(camera) {
        console.time('EllipsoidMesh.updateGeometry');
        const startTime = performance.now();

        this.treeManager.updateTree(camera);
        const leaves = this.treeManager.collectLeafNodes();
        // console.log(`Processing ${leaves.length} leaves for geometry update`);

        const geometry = this.geometry || new THREE.BufferGeometry();
        if (!this.geometry) {
            console.warn('Geometry not initialized, falling back to generateGeometry');
            this.geometry = this.generateGeometry(camera);
            return this.geometry;
        }

        // Reset arrays to ensure consistency
        this.positions = [];
        this.colors = [];
        this.indices = [];
        this.vertexMap.clear();

        const processedLeaves = new Set();
        let culledLeaves = 0;

        // Camera vectors for culling
        const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const cameraToOriginDist = camera.position.length();

        for (const leaf of leaves) {
            if (processedLeaves.has(leaf.id)) continue;
            processedLeaves.add(leaf.id);

            // Calculate leaf center in spherical and Cartesian coordinates
            const thetaCenter = (leaf.thetaMin + leaf.thetaMax) / 2;
            const phiCenter = (leaf.phiMin + leaf.phiMax) / 2;
            const leafPos = this.mapToBaseEllipsoid(thetaCenter, phiCenter);

            // // Frustum culling: skip if outside 100° FOV
            // const cameraToLeaf = leafPos.clone().sub(camera.position).normalize();
            // const angle = Math.acos(cameraForward.dot(cameraToLeaf)) * (180 / Math.PI);
            // if (angle > 100) { // Adjust FOV threshold as needed (e.g., match camera.fov * 1.2)
            //     culledLeaves++;
            //     continue;
            // }

            // Backside culling: skip if leaf is on far side
            const cameraToLeafDist = camera.position.distanceTo(leafPos);
            if (cameraToLeafDist > cameraToOriginDist && leaf.level > 1) {
                culledLeaves++;
                continue;
            }

            // Leaf is visible, add its geometry
            const indices = [
                this.addVertex(this.positions, this.colors, leaf.thetaMin, leaf.phiMin, camera.position, leaf.baseHeight),
                this.addVertex(this.positions, this.colors, leaf.thetaMin, leaf.phiMax, camera.position, leaf.baseHeight),
                this.addVertex(this.positions, this.colors, leaf.thetaMax, leaf.phiMin, camera.position, leaf.baseHeight),
                this.addVertex(this.positions, this.colors, leaf.thetaMax, leaf.phiMax, camera.position, leaf.baseHeight)
            ];

            this.indices.push(indices[0], indices[1], indices[3]); // Bottom-left, bottom-right, top-right
            this.indices.push(indices[0], indices[3], indices[2]); // Bottom-left, top-right, top-left

            leaf.vertexIndices.clear();
            indices.forEach(index => leaf.vertexIndices.add(index));
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
        geometry.setIndex(this.indices);
        geometry.computeVertexNormals();

        const endTime = performance.now();
        // console.log(`Updated geometry with ${this.positions.length / 3} vertices and ${this.indices.length / 3} triangles`);
        // console.log(`Max LOD all leaves: ${Math.max(...leaves.map(leaf => leaf.level))}`);
        // console.log(`Culled ${culledLeaves} of ${leaves.length} leaves (${((culledLeaves / leaves.length) * 100).toFixed(1)}%)`);
        // console.timeEnd('EllipsoidMesh.updateGeometry');
        // console.log(`Update took ${(endTime - startTime).toFixed(2)} ms`);

        this.geometry = geometry;
        return geometry;
    }
}