/**
 * Merkle Tree Utility for Identity Credentials
 * 
 * Provides Poseidon-based Merkle tree operations for binding ZK proofs
 * to on-chain credential hashes.
 * 
 * Uses circomlibjs for Poseidon hash (compatible with circom circuits).
 */

'use strict';

const { buildPoseidon } = require('circomlibjs');

let poseidonInstance = null;

/**
 * Lazy-load Poseidon hash function
 */
async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
    return poseidonInstance;
}

/**
 * Convert a value to a BigInt suitable for Poseidon hash
 * Handles strings by converting them to a numeric representation
 * @param {string|number|bigint} value - Value to convert
 * @returns {bigint} BigInt representation
 */
function valueToFieldElement(value) {
    // If already a number or bigint, use it directly
    if (typeof value === 'bigint') {
        return value;
    }
    if (typeof value === 'number') {
        return BigInt(value);
    }

    // For strings, try to parse as number first
    if (typeof value === 'string') {
        // If it's a numeric string, convert directly
        if (/^\d+$/.test(value)) {
            return BigInt(value);
        }

        // For non-numeric strings, convert to bytes and then to BigInt
        // This creates a unique numeric representation of the string
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);

        // Convert bytes to a BigInt (taking first 31 bytes to stay in field)
        // Note: Poseidon field size is ~254 bits, so 31 bytes is safe
        let result = 0n;
        const maxBytes = Math.min(bytes.length, 31);
        for (let i = 0; i < maxBytes; i++) {
            result = result * 256n + BigInt(bytes[i]);
        }
        return result;
    }

    throw new Error(`Cannot convert value of type ${typeof value} to field element`);
}

/**
 * Hash a single value using Poseidon
 * @param {string|number|bigint} value - Value to hash
 * @returns {Promise<string>} Hash as decimal string
 */
async function poseidonHash(value) {
    const poseidon = await getPoseidon();
    const fieldElement = valueToFieldElement(value);
    const hash = poseidon([fieldElement]);
    return poseidon.F.toString(hash);
}

/**
 * Hash two values together using Poseidon (for Merkle tree nodes)
 * @param {string|bigint} left - Left child hash
 * @param {string|bigint} right - Right child hash
 * @returns {Promise<string>} Combined hash as decimal string
 */
async function poseidonHash2(left, right) {
    const poseidon = await getPoseidon();
    const leftField = valueToFieldElement(left);
    const rightField = valueToFieldElement(right);
    const hash = poseidon([leftField, rightField]);
    return poseidon.F.toString(hash);
}

/**
 * Compute leaf hash for a credential field
 * @param {string|number} fieldValue - The field value (e.g., dob, address)
 * @param {string|number} [salt=0] - Optional salt for privacy
 * @returns {Promise<string>} Leaf hash as decimal string
 */
async function computeLeafHash(fieldValue, salt = 0) {
    // If salt is provided, hash(fieldValue, salt), otherwise just hash(fieldValue)
    if (salt && BigInt(salt) !== 0n) {
        return poseidonHash2(fieldValue, salt);
    }
    return poseidonHash(fieldValue);
}

/**
 * Build a Merkle tree from leaf hashes
 * @param {Array<string|bigint>} leaves - Array of leaf hashes
 * @returns {Promise<Object>} Tree object with layers and root
 * 
 * Tree structure:
 * {
 *   layers: [[leaves], [level1], [level2], ..., [root]],
 *   root: "root hash value"
 * }
 */
async function buildMerkleTree(leaves) {
    if (!leaves || leaves.length === 0) {
        throw new Error('Cannot build Merkle tree from empty leaves');
    }

    // Convert all leaves to BigInt strings for consistency
    let currentLayer = leaves.map(leaf => BigInt(leaf).toString());
    const layers = [currentLayer];

    // Build tree bottom-up
    while (currentLayer.length > 1) {
        const nextLayer = [];

        for (let i = 0; i < currentLayer.length; i += 2) {
            const left = currentLayer[i];
            const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left; // Duplicate last node if odd

            const parentHash = await poseidonHash2(left, right);
            nextLayer.push(parentHash);
        }

        currentLayer = nextLayer;
        layers.push(currentLayer);
    }

    return {
        layers,
        root: currentLayer[0]
    };
}

/**
 * Get the root hash from a Merkle tree
 * @param {Object} tree - Merkle tree object from buildMerkleTree
 * @returns {string} Root hash
 */
function getRootHash(tree) {
    if (!tree || !tree.root) {
        throw new Error('Invalid tree object');
    }
    return tree.root;
}

/**
 * Generate a Merkle proof for a specific leaf
 * @param {Object} tree - Merkle tree object from buildMerkleTree
 * @param {number} leafIndex - Index of the leaf (0-based)
 * @returns {Object} Proof object with pathElements and pathIndices
 * 
 * Returns:
 * {
 *   pathElements: [sibling hashes from bottom to top],
 *   pathIndices: [0 or 1 indicating left/right position at each level]
 * }
 */
function generateMerkleProof(tree, leafIndex) {
    if (!tree || !tree.layers || tree.layers.length === 0) {
        throw new Error('Invalid tree object');
    }

    const leaves = tree.layers[0];
    if (leafIndex < 0 || leafIndex >= leaves.length) {
        throw new Error(`Leaf index ${leafIndex} out of bounds (0-${leaves.length - 1})`);
    }

    const pathElements = [];
    const pathIndices = [];
    let currentIndex = leafIndex;

    // Traverse from bottom (leaves) to top (root), excluding the root layer
    for (let level = 0; level < tree.layers.length - 1; level++) {
        const currentLayer = tree.layers[level];
        const isLeftChild = currentIndex % 2 === 0;
        const siblingIndex = isLeftChild ? currentIndex + 1 : currentIndex - 1;

        // Get sibling (or duplicate if it doesn't exist)
        const sibling = siblingIndex < currentLayer.length
            ? currentLayer[siblingIndex]
            : currentLayer[currentIndex];

        pathElements.push(sibling);
        pathIndices.push(isLeftChild ? 0 : 1); // 0 = we are left child, 1 = we are right child

        // Move to parent index
        currentIndex = Math.floor(currentIndex / 2);
    }

    return {
        pathElements,
        pathIndices
    };
}

/**
 * Verify a Merkle proof
 * @param {string|bigint} leaf - The leaf hash to verify
 * @param {Object} proof - Proof object with pathElements and pathIndices
 * @param {string|bigint} root - Expected root hash
 * @returns {Promise<boolean>} True if proof is valid
 */
async function verifyMerkleProof(leaf, proof, root) {
    const { pathElements, pathIndices } = proof;

    if (!pathElements || !pathIndices || pathElements.length !== pathIndices.length) {
        throw new Error('Invalid proof structure');
    }

    let currentHash = BigInt(leaf).toString();

    for (let i = 0; i < pathElements.length; i++) {
        const sibling = BigInt(pathElements[i]).toString();
        const isLeftChild = pathIndices[i] === 0;

        // Hash with sibling based on position
        if (isLeftChild) {
            currentHash = await poseidonHash2(currentHash, sibling);
        } else {
            currentHash = await poseidonHash2(sibling, currentHash);
        }
    }

    return currentHash === BigInt(root).toString();
}

/**
 * Helper: Compute Merkle root from credential fields
 * @param {Object} fields - Credential fields object (e.g., {dob: "19900101", address: "123"})
 * @param {Array<string>} fieldOrder - Order of fields to hash (e.g., ["dob", "address"])
 * @returns {Promise<Object>} { rootHash, tree, leaves }
 */
async function computeCredentialRoot(fields, fieldOrder) {
    if (!fields || !fieldOrder || fieldOrder.length === 0) {
        throw new Error('fields and fieldOrder are required');
    }

    // Compute leaf hashes for each field in order
    const leaves = [];
    for (const fieldName of fieldOrder) {
        if (!(fieldName in fields)) {
            throw new Error(`Field "${fieldName}" not found in credential fields`);
        }
        const leafHash = await computeLeafHash(fields[fieldName]);
        leaves.push(leafHash);
    }

    // Build Merkle tree
    const tree = await buildMerkleTree(leaves);

    return {
        rootHash: tree.root,
        tree,
        leaves
    };
}

module.exports = {
    computeLeafHash,
    buildMerkleTree,
    getRootHash,
    generateMerkleProof,
    verifyMerkleProof,
    computeCredentialRoot,
    poseidonHash,
    poseidonHash2
};
