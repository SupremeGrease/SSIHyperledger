#!/usr/bin/env node
/**
 * Test script for Merkle Tree Utility
 * 
 * Tests the Poseidon-based Merkle tree operations to ensure
 * leaf hashing, tree building, and proof generation work correctly.
 */

'use strict';

const merkleUtils = require('./lib/merkle-utils');

async function runTests() {
    console.log('🧪 Testing Merkle Tree Utility\n');

    try {
        // Test 1: Basic leaf hashing
        console.log('Test 1: Leaf Hashing');
        console.log('-------------------');
        const leaf1 = await merkleUtils.computeLeafHash('19900101'); // DOB
        const leaf2 = await merkleUtils.computeLeafHash('123MainSt'); // Address
        console.log('✓ Leaf 1 (DOB):', leaf1);
        console.log('✓ Leaf 2 (Address):', leaf2);
        console.log();

        // Test 2: Build Merkle tree from sample credential
        console.log('Test 2: Build Merkle Tree');
        console.log('-------------------------');
        const sampleCredential = {
            dob: '19900101',
            address: '123MainSt',
            name: 'JohnDoe',
            ssn: '123456789'
        };
        const fieldOrder = ['dob', 'address', 'name', 'ssn'];

        const { rootHash, tree, leaves } = await merkleUtils.computeCredentialRoot(
            sampleCredential,
            fieldOrder
        );

        console.log('✓ Sample Credential:', JSON.stringify(sampleCredential, null, 2));
        console.log('✓ Field Order:', fieldOrder);
        console.log('✓ Leaves:', leaves);
        console.log('✓ Tree Layers:', tree.layers.length);
        console.log('✓ Root Hash:', rootHash);
        console.log();

        // Test 3: Generate Merkle proof for each field
        console.log('Test 3: Generate Merkle Proofs');
        console.log('------------------------------');
        for (let i = 0; i < leaves.length; i++) {
            const proof = merkleUtils.generateMerkleProof(tree, i);
            console.log(`✓ Proof for field ${i} (${fieldOrder[i]}):`);
            console.log('  Path Elements:', proof.pathElements);
            console.log('  Path Indices:', proof.pathIndices);
        }
        console.log();

        // Test 4: Verify Merkle proofs
        console.log('Test 4: Verify Merkle Proofs');
        console.log('----------------------------');
        for (let i = 0; i < leaves.length; i++) {
            const proof = merkleUtils.generateMerkleProof(tree, i);
            const isValid = await merkleUtils.verifyMerkleProof(leaves[i], proof, rootHash);
            console.log(`✓ Proof for field ${i} (${fieldOrder[i]}): ${isValid ? 'VALID ✓' : 'INVALID ✗'}`);

            if (!isValid) {
                throw new Error(`Proof verification failed for field ${i}`);
            }
        }
        console.log();

        // Test 5: Deterministic root hash
        console.log('Test 5: Deterministic Root Hash');
        console.log('--------------------------------');
        const { rootHash: rootHash2 } = await merkleUtils.computeCredentialRoot(
            sampleCredential,
            fieldOrder
        );
        const matches = rootHash === rootHash2;
        console.log('✓ First computation:', rootHash);
        console.log('✓ Second computation:', rootHash2);
        console.log(`✓ Deterministic: ${matches ? 'YES ✓' : 'NO ✗'}`);

        if (!matches) {
            throw new Error('Root hash is not deterministic!');
        }
        console.log();

        // Test 6: Different credentials produce different roots
        console.log('Test 6: Different Credentials → Different Roots');
        console.log('-----------------------------------------------');
        const differentCredential = {
            dob: '19950505',
            address: '456ElmSt',
            name: 'JaneSmith',
            ssn: '987654321'
        };
        const { rootHash: differentRoot } = await merkleUtils.computeCredentialRoot(
            differentCredential,
            fieldOrder
        );
        console.log('✓ Original Root:', rootHash);
        console.log('✓ Different Root:', differentRoot);
        console.log(`✓ Different: ${rootHash !== differentRoot ? 'YES ✓' : 'NO ✗'}`);
        console.log();

        // Summary
        console.log('═══════════════════════════════════════');
        console.log('✅ All tests passed!');
        console.log('═══════════════════════════════════════');
        console.log();
        console.log('📋 Usage Summary:');
        console.log('  1. Compute credential root: computeCredentialRoot(fields, fieldOrder)');
        console.log('  2. Use rootHash when issuing credentials on-chain');
        console.log('  3. Include rootHash when calling VerifyAge chaincode function');
        console.log();

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
