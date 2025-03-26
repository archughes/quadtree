export class QuadtreeNode {
    /**
     * Constructs a quadtree node for ellipsoid subdivision.
     * @param {number} thetaMin - Minimum elevation angle
     * @param {number} thetaMax - Maximum elevation angle
     * @param {number} phiMin - Minimum azimuth angle
     * @param {number} phiMax - Maximum azimuth angle
     * @param {number} level - Subdivision level
     */
    constructor(thetaMin, thetaMax, phiMin, phiMax, level) {
        this.thetaMin = thetaMin;
        this.thetaMax = thetaMax;
        this.phiMin = phiMin;
        this.phiMax = phiMax;
        this.level = level;
        this.children = [];
        this.id = Math.random().toString(36).substr(2, 9);
        this.baseHeight = null;
    }

    /** @returns {boolean} - True if this is a leaf node */
    isLeaf() {
        return this.children.length === 0;
    }

    /**
     * Subdivides this node into four children, propagating terrain data.
     * @param {TerrainGenerator} terrain - Terrain generator instance
     */
    subdivide(terrain) {
        if (!this.isLeaf()) return;
        const thetaMid = (this.thetaMin + this.thetaMax) / 2;
        const phiMid = (this.phiMin + this.phiMax) / 2;

        // Set base height at this node if not already set
        if (this.baseHeight === null) {
            this.baseHeight = terrain.getHeight(thetaMid, phiMid, 0);
        }

        this.children = [
            new QuadtreeNode(this.thetaMin, thetaMid, this.phiMin, phiMid, this.level + 1),
            new QuadtreeNode(this.thetaMin, thetaMid, phiMid, this.phiMax, this.level + 1),
            new QuadtreeNode(thetaMid, this.thetaMax, this.phiMin, phiMid, this.level + 1),
            new QuadtreeNode(thetaMid, this.thetaMax, phiMid, this.phiMax, this.level + 1),
        ];

        // Propagate base height to children
        for (const child of this.children) {
            child.baseHeight = this.baseHeight;
        }
    }

    /**
     * Checks if this node is adjacent to another.
     * @param {QuadtreeNode} other - Node to check adjacency with
     * @returns {boolean} - True if nodes share an edge
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
     * Collects all leaf nodes in the subtree.
     * @param {QuadtreeNode} node - Starting node
     * @param {Array<QuadtreeNode>} [leaves=[]] - Array to store leaves
     * @returns {Array<QuadtreeNode>} - All leaf nodes
     */
    static findAllLeaves(node, leaves = []) {
        if (node.isLeaf()) {
            leaves.push(node);
        } else {
            for (const child of node.children) {
                QuadtreeNode.findAllLeaves(child, leaves);
            }
        }
        return leaves;
    }

    /**
     * Balances the quadtree to ensure neighbors differ by at most one level.
     * @param {QuadtreeNode} root - Root node of the tree
     */
    static balanceTree(root) {
        let changes = true;
        while (changes) {
            changes = false;
            const leaves = QuadtreeNode.findAllLeaves(root);
            for (let i = 0; i < leaves.length; i++) {
                const leaf = leaves[i];
                for (let j = 0; j < leaves.length; j++) {
                    if (i === j) continue;
                    const neighbor = leaves[j];
                    if (leaf.isAdjacent(neighbor) && leaf.level > neighbor.level + 1) {
                        neighbor.subdivide();
                        changes = true;
                        break;
                    }
                }
                if (changes) break;
            }
        }
    }
}