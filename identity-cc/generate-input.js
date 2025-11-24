#!/usr/bin/env node
/**
 * Generate Input Script - Example for Merkle Tree Integration
 * 
 * This script demonstrates how to:
 * 1. Take credential fields as input
 * 2. Compute Merkle tree and root hash
 * 3. Generate Merkle proofs for circuit inputs
 * 4. Prepare data for credential issuance
 * 
 * Usage:
 *   node generate-input.js
 */

'use strict';

const merkleUtils = require('./lib/merkle-utils');
const fs = require('fs');
const path = require('path');

/**
 * Sample credential data
 * In a real application, this would come from user input or a database
 */
const SAMPLE_CREDENTIAL = {
    dob: '19900101',        // Date of birth (YYYYMMDD format)
    address: '123MainSt',   // Address
    name: 'JohnDoe',        // Name
    ssn: '123456789'        // SSN or ID number
};

/**
 * Field order determines the order of leaves in the Merkle tree
 * IMPORTANT: This order must be consistent across credential issuance and verification
 */
const FIELD_ORDER = ['dob', 'address', 'name', 'ssn'];

async function generateInput() {
    console.log('🔐 Merkle Tree Input Generator');
    console.log('================================\n');

    try {
        // Step 1: Compute Merkle tree from credential fields
        console.log('Step 1: Computing Merkle tree from credential fields...');
        const { rootHash, tree, leaves } = await merkleUtils.computeCredentialRoot(
            SAMPLE_CREDENTIAL,
            FIELD_ORDER
        );
        console.log('✓ Root Hash:', rootHash);
        console.log('✓ Number of leaves:', leaves.length);
        console.log();

        // Step 2: Generate Merkle proofs for each field
        console.log('Step 2: Generating Merkle proofs for each field...');
        const proofs = {};
        for (let i = 0; i < FIELD_ORDER.length; i++) {
            const fieldName = FIELD_ORDER[i];
            const proof = merkleUtils.generateMerkleProof(tree, i);
            proofs[fieldName] = proof;
            console.log(`✓ Proof for ${fieldName}:`, {
                pathElements: proof.pathElements,
                pathIndices: proof.pathIndices
            });
        }
        console.log();

        // Step 3: Prepare circuit input
        console.log('Step 3: Preparing circuit input...');

        // 4. Write input.json for ZK circuit (Standard format)
        const input = {
            dob: SAMPLE_CREDENTIAL.dob,
            dobMerkleProof: proofs.dob.pathElements,
            dobMerkleIndices: proofs.dob.pathIndices,
            merkleRoot: rootHash,
            address: SAMPLE_CREDENTIAL.address,
            name: SAMPLE_CREDENTIAL.name,
            ssn: SAMPLE_CREDENTIAL.ssn,
            addressMerkleProof: proofs.address.pathElements,
            addressMerkleIndices: proofs.address.pathIndices
        };

        const inputPath = path.join(__dirname, 'input.json');
        fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
        console.log('✓ Generated input.json');

        // 5. Write circuit_input.json (Clean input for age_with_merkle.circom)
        const circuitInput = {
            dob: SAMPLE_CREDENTIAL.dob,
            merklePathElements: proofs.dob.pathElements,
            merklePathIndices: proofs.dob.pathIndices
        };
        const circuitInputPath = path.join(__dirname, 'circuit_input.json');
        fs.writeFileSync(circuitInputPath, JSON.stringify(circuitInput, null, 2));
        console.log('✓ Generated circuit_input.json (for age_with_merkle.circom)');

        // 6. Write credential-issuance.json for blockchain
        const issuanceData = {
            userID: "user123",
            credentialHash: rootHash,
            issuer: "TrustedIssuer",
            timestamp: new Date().toISOString(),
            fieldOrder: FIELD_ORDER
        };

        const issuancePath = path.join(__dirname, 'credential-issuance.json');
        fs.writeFileSync(issuancePath, JSON.stringify(issuanceData, null, 2));
        console.log('✓ Generated credential-issuance.json');

        console.log('\nNext Steps:');
        console.log('1. Generate ZK proof using circuit_input.json');
        console.log('2. Issue credential using credential-issuance.json');
        console.log('3. Call VerifyAge on chaincode');

        return {
            rootHash,
            circuitInput,
            issuanceData
        };

    } catch (error) {
        console.error('❌ Error generating input:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    generateInput().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { generateInput };
