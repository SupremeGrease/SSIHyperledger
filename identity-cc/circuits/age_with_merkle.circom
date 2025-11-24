pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// Age Verification Circuit with Merkle Tree Proof
// Proves: 1) Age >= 18, and 2) DOB is in credential with given Merkle root

template AgeWithMerkle() {
    // Private inputs
    signal input dob;                      
    signal input merklePathElements[2];    
    signal input merklePathIndices[2];     
    
    // Public outputs
    signal output isAdult;                 
    signal output rootHash;                
    
    // Step 1: Verify age (DOB <= 20061124 means age >= 18)
    component isAdultCheck = LessEqThan(32);
    isAdultCheck.in[0] <== dob;
    isAdultCheck.in[1] <== 20061124;  // 18 years before Nov 24, 2024
    isAdult <== isAdultCheck.out;
    
    // Step 2: Compute leaf hash for DOB field
    component dobHasher = Poseidon(1);
    dobHasher.inputs[0] <== dob;
    
    // Step 3: Compute Merkle root from proof
    // Level 0: Combine DOB leaf with its sibling
    component level0Hasher = Poseidon(2);
    
    // Using Mux to select correct order based on pathIndices[0]
    // If index=0: (leaf, sibling), if index=1: (sibling, leaf)
    signal level0Left;
    signal level0Right;
    level0Left <== (merklePathIndices[0]) * (merklePathElements[0] - dobHasher.out) + dobHasher.out;
    level0Right <== (merklePathIndices[0]) * (dobHasher.out - merklePathElements[0]) + merklePathElements[0];
    
    level0Hasher.inputs[0] <== level0Left;
    level0Hasher.inputs[1] <== level0Right;
    
    // Level 1: Combine with next sibling to get root
    component level1Hasher = Poseidon(2);
    
    signal level1Left;
    signal level1Right;
    level1Left <== (merklePathIndices[1]) * (merklePathElements[1] - level0Hasher.out) + level0Hasher.out;
    level1Right <== (merklePathIndices[1]) * (level0Hasher.out - merklePathElements[1]) + merklePathElements[1];
    
    level1Hasher.inputs[0] <== level1Left;
    level1Hasher.inputs[1] <== level1Right;
    
    rootHash <== level1Hasher.out;
}

component main = AgeWithMerkle();
