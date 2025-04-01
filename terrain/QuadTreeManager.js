import { QuadtreeNode } from './QuadtreeNode.js';
import * as THREE from '../three.module.js';

export class QuadTreeManager {
    constructor(root, terrain, lodDistances, maxLevel, ellipsoidMesh) {
        this.root = root;
        this.terrain = terrain;
        this.lodDistances = lodDistances;
        this.maxLevel = maxLevel;
        this.ellipsoidMesh = ellipsoidMesh; // Reference to access mapToBaseEllipsoid
    }

    /**
     * Recursively builds the quadtree based on camera position.
     * @param {THREE.Camera} camera - Camera object
     */
    buildTree(camera) {
        this.root.children.clear();
        this._buildTreeRecursive(this.root, camera);
        QuadtreeNode.balanceTree(this.root);
    }

    _buildTreeRecursive(node, camera) {
        const { theta, phi } = node.getCenter();
        const distance = this._calculateDistanceToCamera(theta, phi, camera.position, node.baseHeight);
        const desiredLevel = this.getDesiredLevel(distance);

        if (node.level <= desiredLevel && node.level < this.maxLevel) {
            node.subdivide(this.terrain);
            for (const child of node.children.values()) {
                this._buildTreeRecursive(child, camera);
            }
        }
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
        return 0; // Farthest distance gets lowest detail
    }

    /**
     * Helper function to calculate distance from camera to a point on the ellipsoid,
     * considering coarse terrain height for accuracy.
     * @param {number} theta
     * @param {number} phi
     * @param {THREE.Vector3} cameraPos
     * @param {object | null} baseHeightData - The baseHeight object from the node
     * @returns {number} Distance
     */
    _calculateDistanceToCamera(theta, phi, cameraPos, baseHeightData) {
        const basePos = this.ellipsoidMesh.mapToBaseEllipsoid(theta, phi);
        const coarseHeight = baseHeightData?.height || 0;
        const scaledPos = basePos.clone().multiplyScalar(1 + coarseHeight);
        return scaledPos.distanceTo(cameraPos);
    }

    /**
     * Collects all leaf nodes in the quadtree.
     * @returns {Array<QuadtreeNode>} - Array of leaf nodes
     */
    collectLeafNodes() {
        const leaves = [];
        QuadtreeNode.findAllLeaves(this.root, leaves);
        return leaves;
    }

    /**
     * Updates the quadtree incrementally based on camera movement and changed regions.
     * @param {THREE.Camera} camera - Camera object
     * @param {Array} changedRegions - Regions that need updating
     */
    updateTree(camera, changedRegions = []) {
        // TODO: Implement efficient tree updating based on camera movement
        // and specific regions that need updating
        this.buildTree(camera); // Placeholder: full rebuild for now
    }
}