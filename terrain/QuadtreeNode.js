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
}