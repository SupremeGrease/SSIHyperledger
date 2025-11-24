# Merkle Tree Integration Guide

This guide explains how the Poseidon-based Merkle tree binding system works and how to use it with the identity chaincode.

## Overview

The Merkle tree binding system cryptographically links ZK proofs to issuer-issued credentials stored on the Fabric blockchain. This ensures that proofs cannot be created with arbitrary data—they must correspond to credentials that were officially issued and recorded on-chain.

### How It Works

1. **Credential Issuance**: Issuer computes a Merkle root from the user's credential fields and stores it on-chain as `credentialHash`
2. **Proof Generation**: User generates a ZK proof about their credential (e.g., proving age ≥ 18) 
3. **Proof Verification**: Chaincode verifies both:
   - The ZK proof is mathematically valid (using snarkjs)
   - The Merkle root matches the on-chain `credentialHash` (binding proof to issued credential)

### Architecture

```
Credential Fields (DOB, Address, Name, SSN)
           ↓
    Poseidon Hash (per field)
           ↓
       Leaf Hashes
           ↓
   Build Merkle Tree
           ↓
      Root Hash ━━━┳━━━ Stored on-chain as credentialHash (IssueCredential)
                    ┃
                    ┗━━━ Passed with ZK proof (VerifyAge)
                         ↓
                    Chaincode checks: proof.rootHash === onchain.credentialHash
```

## Using the Merkle Tree Utility

### 1. Computing a Credential Root Hash

```javascript
const merkleUtils = require('./lib/merkle-utils');

// Define your credential fields
const credential = {
    dob: '19900101',
    address: '123MainSt',
    name: 'JohnDoe',
    ssn: '123456789'
};

// IMPORTANT: Field order must be consistent across issuance and verification
const fieldOrder = ['dob', 'address', 'name', 'ssn'];

// Compute Merkle root
const { rootHash, tree, leaves } = await merkleUtils.computeCredentialRoot(
    credential,
    fieldOrder
);

console.log('Root Hash:', rootHash);
// Root Hash: 12345678901234567890...
```

### 2. Issuing a Credential On-Chain

Use the computed `rootHash` as the `credentialHash` parameter:

```bash
peer chaincode invoke ... -c '{
  "function": "IssueCredential",
  "Args": [
    "user123",
    "12345678901234567890...",  // <-- rootHash from step 1
    "TrustedIssuer",
    "2024-01-01T00:00:00Z"
  ]
}'
```

### 3. Generating Merkle Proofs

If your circuit needs Merkle proofs (for per-field verification):

```javascript
// Generate proof for a specific field (e.g., DOB is field index 0)
const dobProof = merkleUtils.generateMerkleProof(tree, 0);

console.log('DOB Merkle Proof:', {
    pathElements: dobProof.pathElements,
    pathIndices: dobProof.pathIndices
});

// Use this in your circuit input
const circuitInput = {
    dob: credential.dob,
    merkleProof: dobProof.pathElements,
    merkleIndices: dobProof.pathIndices,
    merkleRoot: rootHash
};
```

### 4. Verifying Age with Merkle Binding

The `VerifyAge` function now requires the `rootHash` as a parameter:

```bash
peer chaincode invoke ... -c '{
  "function": "VerifyAge",
  "Args": [
    "user123",                    # userID
    "18",                          # minimumAge
    "{\"pi_a\":[...],\"pi_b\":[...],\"pi_c\":[...]}",  # proofJSON
    "[\"1\"]",                     # publicSignalsJSON (just [isAdult])
    "12345678901234567890..."      # rootHash
  ]
}'
```

**What happens during verification:**
1. ✅ Verifies the ZK proof is mathematically valid (snarkjs)
2. ✅ Checks `isAdult === "1"` in public signals
3. ✅ Retrieves on-chain credential for the user
4. ✅ Ensures credential is not revoked
5. ✅ Compares `rootHash` with on-chain `credentialHash`
6. ✅ If all checks pass, records successful verification

## Complete Workflow Example

### Step 1: Generate Input and Root Hash

```bash
cd /path/to/identity-cc
node generate-input.js
```

This creates:
- `input.json` - Circuit input with Merkle proofs
- `credential-issuance.json` - Data for on-chain issuance including rootHash

### Step 2: Issue Credential On-Chain

```bash
# Extract rootHash from credential-issuance.json
ROOT_HASH="12345678901234567890..."

peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c "{\"function\":\"IssueCredential\",\"Args\":[\"user123\",\"$ROOT_HASH\",\"TrustedIssuer\",\"2024-01-01T00:00:00Z\"]}"
```

### Step 3: Generate ZK Proof

```bash
# Use your existing circom/snarkjs pipeline
snarkjs groth16 fullprove input.json circuit.wasm circuit.zkey proof.json public.json
```

### Step 4: Verify Age with Proof

```bash
# Read proof and public signals
PROOF=$(cat proof.json)
PUBLIC=$(cat public.json)

peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c "{\"function\":\"VerifyAge\",\"Args\":[\"user123\",\"18\",\"$PROOF\",\"$PUBLIC\",\"$ROOT_HASH\"]}"
```

Expected response:
```json
{
  "valid": true,
  "isOfAge": true,
  "rootHashVerified": true
}
```

## Testing the Merkle Utility

### Run Unit Tests

```bash
cd /path/to/identity-cc
npm install  # Install circomlibjs dependency
node test-merkle-utils.js
```

This runs 6 test cases:
1. ✓ Leaf hashing
2. ✓ Merkle tree building
3. ✓ Merkle proof generation
4. ✓ Merkle proof verification
5. ✓ Deterministic root hash
6. ✓ Different credentials produce different roots

## Important Notes

### Field Order Consistency

**CRITICAL**: The order of fields when computing the Merkle tree must be **exactly the same** every time:

```javascript
// ✅ GOOD: Use consistent field order
const fieldOrder = ['dob', 'address', 'name', 'ssn'];

// ❌ BAD: Changing order produces different root hash
const fieldOrder = ['ssn', 'name', 'address', 'dob'];  // Different root!
```

**Best Practice**: Store the field order with the credential issuance record for future reference.

### Hash Format

The Merkle tree utility returns hashes as **decimal strings** (compatible with circom):

```javascript
rootHash = "12345678901234567890123456789012345678901234567890"
```

You can also use `0x` prefixed hex format if needed—the chaincode normalizes both formats for comparison.

### Circuit Integration (Optional)

If you want the circuit to verify Merkle proofs (not just the chaincode):

1. Add Merkle proof verification to your `.circom` file:
   ```circom
   include "circomlib/poseidon.circom";
   include "circomlib/merkle-tree.circom";
   
   component merkleChecker = MerkleTreeChecker(4); // 4 levels
   merkleChecker.leaf <== dobHash;
   merkleChecker.pathElements <== dobMerkleProof;
   merkleChecker.pathIndices <== dobMerkleIndices;
   merkleChecker.root <== merkleRoot;
   ```

2. Add `merkleRoot` as a public output in your circuit

3. Recompile circuit and regenerate verification key

4. Update chaincode to extract `rootHash` from `publicSignals[1]` instead of accepting it as a separate parameter

**Current Implementation**: Uses wrapper approach (rootHash as separate parameter) to avoid circuit changes.

## Security Considerations

### Why Merkle Binding Matters

Without Merkle binding, a user could:
1. Generate a valid ZK proof about *arbitrary* data (e.g., fake DOB)
2. Submit the proof to chaincode and claim they're of age

With Merkle binding:
1. Issuer computes and stores Merkle root on-chain during credential issuance
2. User's ZK proof must use the **exact same** credential fields to produce matching root
3. Chaincode rejects proofs with non-matching roots → **proof is bound to issued credential**

### Revocation Check

The updated `VerifyAge` function also checks if credentials have been revoked:

```javascript
if (!credential.valid) {
    throw new Error(`Credential for user ${userID} has been revoked`);
}
```

This prevents users from proving things with revoked credentials.

## Troubleshooting

### "Proof rootHash does not match on-chain credential"

**Causes**:
- Field order is different between issuance and proof generation
- Credential fields were modified
- Wrong rootHash parameter passed to VerifyAge

**Solution**: Ensure field order and values are exactly the same as when credential was issued.

### "rootHash is required"

**Cause**: Forgot to pass rootHash as 5th argument to VerifyAge

**Solution**: Add rootHash parameter:
```javascript
Args: [userID, minimumAge, proofJSON, publicSignalsJSON, rootHash]
```

### Determinism Issues

If the same credential produces different root hashes:
- Check that circomlibjs version is consistent
- Ensure field order is the same
- Verify field values haven't been modified

## API Reference

See [`lib/merkle-utils.js`](file:///f:/courses/csd436/proj2/fabric-samples/identity-cc/lib/merkle-utils.js) for complete API documentation.

**Key Functions**:
- `computeLeafHash(fieldValue, salt)` - Hash a single field
- `buildMerkleTree(leaves)` - Build tree from leaf hashes
- `getRootHash(tree)` - Extract root from tree
- `generateMerkleProof(tree, leafIndex)` - Generate proof for field
- `verifyMerkleProof(leaf, proof, root)` - Verify a proof
- `computeCredentialRoot(fields, fieldOrder)` - Complete workflow helper
