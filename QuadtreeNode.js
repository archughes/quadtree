export class QuadtreeNode {
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
    }

    isLeaf() {
        return this.children.size === 0;
    }

    getChildKey(theta, phi) {
        const thetaMid = (this.thetaMin + this.thetaMax) / 2;
        const phiMid = (this.phiMin + this.phiMax) / 2;
        const isNorth = theta <= thetaMid;
        const isWest = phi <= phiMid;
        return `${isNorth ? 'n' : 's'}${isWest ? 'w' : 'e'}`;
    }

    subdivide(terrain, changeLevel=true) {
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
    }

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

    getAdjacentNodes(leaves) {
        const adjacent = [];
        for (const leaf of leaves) {
            if (this !== leaf && this.isAdjacent(leaf)) {
                adjacent.push(leaf);
            }
        }
        return adjacent;
    }

    static balanceTree(root, maxIterations = 1000) {
        const leaves = [];
        QuadtreeNode.findAllLeaves(root, leaves);
        let iteration = 0;
        let changes = true;

        while (changes && iteration < maxIterations) {
            changes = false;
            iteration++;

            // Create a copy of current leaves to avoid modifying while iterating
            const currentLeaves = [...leaves];
            leaves.length = 0; // Clear for re-collection

            for (const leaf of currentLeaves) {
                const neighbors = leaf.getAdjacentNodes(currentLeaves);
                for (const neighbor of neighbors) {
                    if (leaf.level > neighbor.level + 1) {
                        // console.log('Avoid neighbor LOD jump:', neighbor.id);
                        neighbor.subdivide(); // Terrain arg omitted for now; pass if needed
                        changes = true;
                        break; // Break to re-collect leaves
                    }
                    if (leaf.level === neighbor.level + 1 && !neighbor.neighborlySubdivide) {
                        // console.log('Subdividing neighbor:', neighbor.id);
                        neighbor.neighborlySubdivide = true;
                        neighbor.subdivide(null, false); // Terrain arg omitted for now; pass if needed
                        changes = true;
                        break; // Break to re-collect leaves
                    }
                }
                if (changes) break; // Restart loop with updated leaves
            }

            if (changes) {
                QuadtreeNode.findAllLeaves(root, leaves); // Re-collect leaves after subdivision
            } else {
                leaves.push(...currentLeaves); // Restore if no changes
            }
        }

        if (iteration >= maxIterations) {
            console.warn("balanceTree reached max iterations; possible infinite loop prevented.");
        }
    }
}