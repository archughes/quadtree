/**
 * Represents a node in a quadtree structure for spatial subdivision on an ellipsoid surface.
 */
export class QuadtreeNode {
    /**
     * Constructs a quadtree node with specified angular bounds and level.
     * @param {number} thetaMin - Minimum elevation angle (radians)
     * @param {number} thetaMax - Maximum elevation angle (radians)
     * @param {number} phiMin - Minimum azimuth angle (radians)
     * @param {number} phiMax - Maximum azimuth angle (radians)
     * @param {number} level - Depth level in the quadtree (0 is root)
     */
    constructor(thetaMin, thetaMax, phiMin, phiMax, level) {
        this.thetaMin = thetaMin;
        this.thetaMax = thetaMax;
        this.phiMin = phiMin;
        this.phiMax = phiMax;
        this.level = level;
        this.children = new Map(); // Keys: 'nw', 'ne', 'sw', 'se'
        this.neighborLevels = new Map();
        this.id = Math.random().toString(36).substr(2, 9);
        this.baseHeight = null;
        this.neighborlySubdivide = false;
        this.vertexIndices = new Set(); // Tracks vertex indices owned by this node
        this.cachedVertices = new Map(); // Maps vertex keys to { position: [x, y, z], color: [r, g, b], height: h }
    }

    // Optional helper to clear cache when node splits or merges
    clearCache() {
        this.vertexIndices.clear();
        this.cachedVertices.clear();
    }

    // Optional: Add vertex to tracking
    addVertexIndex(index) {
        this.vertexIndices.add(index);
    }

    /**
     * Checks if this node is a leaf (has no children).
     * @returns {boolean} - True if the node is a leaf, false otherwise
     */
    isLeaf() {
        return this.children.size === 0;
    }

    /**
     * Determines the child quadrant key for a given theta, phi position.
     * @param {number} theta - Elevation angle (radians)
     * @param {number} phi - Azimuth angle (radians)
     * @returns {string} - Quadrant key ('nw', 'ne', 'sw', 'se')
     */
    getChildKey(theta, phi) {
        const thetaMid = (this.thetaMin + this.thetaMax) / 2;
        const phiMid = (this.phiMin + this.phiMax) / 2;
        const isNorth = theta <= thetaMid;
        const isWest = phi <= phiMid;
        return `${isNorth ? 'n' : 's'}${isWest ? 'w' : 'e'}`;
    }

    /**
     * Subdivides this node into four child nodes if it is a leaf.
     * @param {TerrainGenerator} terrain - Terrain generator for height calculation
     * @param {boolean} [changeLevel=true] - Whether to increment the level for children
     */
    subdivide(terrain, changeLevel = true) {
        if (!this.isLeaf()) return;
        const thetaMid = (this.thetaMin + this.thetaMax) / 2;
        const phiMid = (this.phiMin + this.phiMax) / 2;

        if (this.baseHeight === null) {
            this.baseHeight = terrain.getHeight(thetaMid, phiMid, 0);
        }

        let levelMod = changeLevel ? 1 : 0;

        this.children.set('nw', new QuadtreeNode(this.thetaMin, thetaMid, this.phiMin, phiMid, this.level + levelMod));
        this.children.set('ne', new QuadtreeNode(this.thetaMin, thetaMid, phiMid, this.phiMax, this.level + levelMod));
        this.children.set('sw', new QuadtreeNode(thetaMid, this.thetaMax, this.phiMin, phiMid, this.level + levelMod));
        this.children.set('se', new QuadtreeNode(thetaMid, this.thetaMax, phiMid, this.phiMax, this.level + levelMod));

        for (const child of this.children.values()) {
            child.baseHeight = this.baseHeight;
            child.neighborlySubdivide = this.neighborlySubdivide;
        }

        // Clear vertex tracking since this node is no longer a leaf
        this.vertexIndices.clear();
    }

    /**
     * Checks if this node is adjacent to another node.
     * @param {QuadtreeNode} other - The other node to check adjacency with
     * @returns {boolean} - True if nodes are adjacent, false otherwise
     */
    isAdjacent(other) {
        const shareTheta =
            (Math.abs(this.thetaMin - other.thetaMax) < 1e-6 ||
             Math.abs(this.thetaMax - other.thetaMin) < 1e-6) &&
            !(this.phiMax < other.phiMin || this.phiMin > other.phiMax);
        const sharePhi =
            (Math.abs(this.phiMin - other.phiMax) < 1e-6 ||
             Math.abs(this.phiMax - other.phiMin) < 1e-6) &&
            !(this.thetaMax < other.thetaMin || this.thetaMin > other.thetaMax);
        return shareTheta || sharePhi;
    }

    /**
     * Recursively finds all leaf nodes starting from the given node.
     * @param {QuadtreeNode} node - Starting node for the search
     * @param {QuadtreeNode[]} [leaves=[]] - Array to store found leaves
     * @returns {QuadtreeNode[]} - Array of all leaf nodes
     */
    static findAllLeaves(node, leaves = []) {
        if (node.isLeaf()) {
            leaves.push(node);
        } else {
            for (const child of node.children.values()) {
                QuadtreeNode.findAllLeaves(child, leaves);
            }
        }
        return leaves;
    }

    /**
     * Finds all adjacent leaf nodes from a given list of leaves.
     * @param {QuadtreeNode[]} leaves - List of leaf nodes to check against
     * @returns {QuadtreeNode[]} - Array of adjacent leaf nodes
     */
    getAdjacentNodes(leaves) {
        const adjacent = [];
        for (const leaf of leaves) {
            if (this !== leaf && this.isAdjacent(leaf)) {
                adjacent.push(leaf);
            }
        }
        return adjacent;
    }
    
    /**
     * Balances the quadtree to ensure no node’s level exceeds its neighbors’ by more than 1.
     * @param {QuadtreeNode} root - Root node of the quadtree
     */
    static balanceTree(root) {
        const queue = [];
        const leaves = QuadtreeNode.findAllLeaves(root);
        for (const leaf of leaves) {
            leaf.neighborLevels.clear();
            const neighbors = leaf.getAdjacentNodes(leaves);
            for (const n of neighbors) leaf.neighborLevels.set(n.id, n.level);
            if ([...leaf.neighborLevels.values()].some(l => leaf.level > l + 1)) {
                queue.push(leaf);
            }
        }
        while (queue.length > 0) {
            const node = queue.shift();
            const neighbors = node.getAdjacentNodes(QuadtreeNode.findAllLeaves(root));
            for (const neighbor of neighbors) {
                if (node.level > neighbor.level + 1) {
                    neighbor.subdivide(node.terrain);
                    queue.push(...neighbor.getAdjacentNodes(QuadtreeNode.findAllLeaves(root)));
                }
            }
        }
    }

    /**
     * Calculates the center point of this node in spherical coordinates.
     * @returns {Object} - Object with theta and phi properties representing the center
     */
    getCenter() {
        return {
            theta: (this.thetaMin + this.thetaMax) / 2,
            phi: (this.phiMin + this.phiMax) / 2
        };
    }
}