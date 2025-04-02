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

    updateTree(camera) {
        console.time('QuadTreeManager.updateTree');
        const changedNodes = [];
        const prevLeaves = this.collectLeafNodes().length;
        this._updateTreeRecursive(this.root, camera, changedNodes);
        QuadtreeNode.balanceTree(this.root);
        const newLeaves = this.collectLeafNodes().length;
        console.log(`Updated quadtree: ${changedNodes.length} nodes changed (${changedNodes.map(n => `${n.action} at level ${n.node.level}`).join(', ')}), leaves: ${prevLeaves} -> ${newLeaves}`);
        console.timeEnd('QuadTreeManager.updateTree');
        return changedNodes;
    }
    
    _updateTreeRecursive(node, camera, changedNodes) {
        const { theta, phi } = node.getCenter();
        const distance = this._calculateDistanceToCamera(theta, phi, camera.position, node.baseHeight);
        const desiredLevel = this.getDesiredLevel(distance);
        const hysteresis = 0.2 * (this.lodDistances[node.level] || this.lodDistances[this.lodDistances.length - 1]); // 20% buffer
        const currentDistThreshold = this.lodDistances[this.maxLevel - node.level - 1] || Infinity;
        const mergeThreshold = this.lodDistances[this.maxLevel - node.level] || 0;
    
        if (node.isLeaf()) {
            if (desiredLevel > node.level && node.level < this.maxLevel && distance < currentDistThreshold - hysteresis) {
                console.log(`Subdividing node at level ${node.level}, distance ${distance}, threshold ${currentDistThreshold}`);
                node.subdivide(this.terrain);
                changedNodes.push({ node, action: 'subdivide' });
                for (const child of node.children.values()) {
                    this._updateTreeRecursive(child, camera, changedNodes);
                }
            }
        } else {
            const allChildrenLeaves = Array.from(node.children.values()).every(child => child.isLeaf());
            if (allChildrenLeaves && desiredLevel <= node.level && distance > mergeThreshold + hysteresis) {
                console.log(`Merging node at level ${node.level}, distance ${distance}, threshold ${mergeThreshold}`);
                node.children.clear();
                changedNodes.push({ node, action: 'merge' });
            } else {
                for (const child of node.children.values()) {
                    this._updateTreeRecursive(child, camera, changedNodes);
                }
            }
        }
    }
}