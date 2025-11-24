const merkleUtils = require('./lib/merkle-utils');
const fs = require('fs');
const path = require('path');

// Original credential (matches what's on chain for userFullCircuit2)
const ORIGINAL_CREDENTIAL = {
    dob: '19900101',
    address: '123MainSt',
    name: 'JohnDoe',
    ssn: '123456789'
};

// Fake credential (different DOB, but still > 18)
const FAKE_CREDENTIAL = {
    dob: '19900102', // One day later
    address: '123MainSt',
    name: 'JohnDoe',
    ssn: '123456789'
};

const FIELD_ORDER = ['dob', 'address', 'name', 'ssn'];

async function generateFakeInput() {
    console.log('😈 Generating FAKE Input (Different DOB)...');

    // 1. Compute Tree for FAKE credential
    const { rootHash, tree } = await merkleUtils.computeCredentialRoot(FAKE_CREDENTIAL, FIELD_ORDER);
    console.log('Fake Root Hash:', rootHash);

    // 2. Generate Proof for FAKE DOB
    const dobProof = merkleUtils.generateMerkleProof(tree, 0);

    // 3. Write circuit_input.json with FAKE data
    const circuitInput = {
        dob: FAKE_CREDENTIAL.dob,
        merklePathElements: dobProof.pathElements,
        merklePathIndices: dobProof.pathIndices
    };

    fs.writeFileSync('circuit_input.json', JSON.stringify(circuitInput, null, 2));
    console.log('✓ Generated circuit_input.json with FAKE DOB');
}

generateFakeInput().catch(console.error);
