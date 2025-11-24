pragma circom 2.1.5;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

/*
 * Age Verification Circuit with Merkle Tree Proof
 *
 * This circuit proves:
 * 1. The user's DOB indicates they are >= 18 years old
 * 2. The DOB is part of a credential whose Merkle root matches the public rootHash
 *
 * Private Inputs:
 *   - dob: Date of birth as YYYYMMDD (e.g., 19900101)
 *   - merklePathElements[2]: Sibling hashes in Merkle proof
 *   - merklePathIndices[2]: Left/right indicators (0 or 1)
 *
 * Public Outputs:
 *   - isAdult: 1 if age >= 18, 0 otherwise
 *   - rootHash: Merkle root of the credential
 */

template AgeWithMerkle() {
    // Private inputs
    signal input dob;                      // Date of birth (YYYYMMDD)
    signal input merklePathElements[2];    // Merkle proof siblings
    signal input merklePathIndices[2];     // Merkle proof directions

    // Public outputs
    signal output isAdult;                 // 1 if age >= 18, 0 otherwise
    signal output rootHash;                // Merkle root of credential

    // Constants
    var CURRENT_DATE = 20241124;  // YYYYMMDD format
    var MIN_ADULT_DOB = 20061124; // 18 years before current date

    // Step 1: Verify age (DOB <= MIN_ADULT_DOB means age >= 18)
    component isAdultCheck = LessEqThan(32);
    isAdultCheck.in[0] <== dob;
    isAdultCheck.in[1] <== MIN_ADULT_DOB;
    isAdult <== isAdultCheck.out;

    // Step 2: Compute leaf hash for DOB field
    component dobHasher = Poseidon(1);
    dobHasher.inputs[0] <== dob;
    signal dobLeafHash <== dobHasher.out;

    // Step 3: Verify Merkle proof
    // We'll compute the root by combining the leaf with siblings

    // Level 0: Combine DOB leaf with its sibling
    component level0Hasher = Poseidon(2);
    // If pathIndices[0] == 0, we are left child (leaf, sibling)
    // If pathIndices[0] == 1, we are right child (sibling, leaf)
    level0Hasher.inputs[0] <== dobLeafHash * (1 - merklePathIndices[0]) + merklePathElements[0] * merklePathIndices[0];
    level0Hasher.inputs[1] <== merklePathElements[0] * (1 - merklePathIndices[0]) + dobLeafHash * merklePathIndices[0];
    signal level0Hash <== level0Hasher.out;

    // Level 1: Combine level0 hash with its sibling to get root
    component level1Hasher = Poseidon(2);
    level1Hasher.inputs[0] <== level0Hash * (1 - merklePathIndices[1]) + merklePathElements[1] * merklePathIndices[1];
    level1Hasher.inputs[1] <== merklePathElements[1] * (1 - merklePathIndices[1]) + level0Hash * merklePathIndices[1];

    // Output the computed root
    rootHash <== level1Hasher.out;

    // The circuit automatically constrains that:
    // - isAdult is 0 or 1 (from LessEqThan output)
    // - rootHash is computed deterministically from the Merkle proof
    // - The proof can only be valid if the inputs match the verification key
}

component main { public [isAdult, rootHash] } = AgeWithMerkle();
