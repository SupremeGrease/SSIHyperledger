# Age Verification Circuit with Merkle Proof

This circuit implements **complete cryptographic binding** between ZK proofs and on-chain credentials through Merkle tree verification.

## Circuit Logic

The circuit proves two things simultaneously:

1. **Age Verification**: The user's DOB indicates they are ≥ 18 years old
2. **Credential Binding**: The DOB is part of a credential whose Merkle root matches the public rootHash

## How It Works

```
Private Inputs:
  - dob: 19900101 (date of birth)
  - merklePathElements: [sibling1, sibling2] (Merkle proof)
  - merklePathIndices: [0, 0] (left/right positions)

Public Outputs:
  - isAdult: 1 (if age >= 18)
  - rootHash: 84125502860...  (Merkle root)
```

The circuit:
1. Hashes the DOB using Poseidon
2. Verifies the Merkle proof by climbing the tree
3. Outputs the computed rootHash as a public signal
4. Checks if age >= 18

## Setup and Usage

### Prerequisites

```bash
npm install -g circom
npm install -g snarkjs
```

### Step 1: Compile Circuit

```bash
cd circuits
circom age_with_merkle.circom --r1cs --wasm --sym
```

This creates:
- `age_with_merkle.r1cs` - R1CS constraint system
- `age_with_merkle.wasm` - WebAssembly for witness generation
- `age_with_merkle.sym` - Symbol table

### Step 2: Generate Powers of Tau (one-time setup)

```bash
# Download or generate Powers of Tau ceremony file
snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -v
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v
```

### Step 3: Generate Proving and Verification Keys

```bash
# Generate zkey
snarkjs groth16 setup age_with_merkle.r1cs pot12_final.ptau circuit_0000.zkey

# Contribute to the ceremony (for production)
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="1st Contributor" -v

# Export verification key
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

### Step 4: Generate Input

Use the provided script to generate input with Merkle proofs:

```bash
cd ..
node generate-input.js
```

This creates `input.json`:
```json
{
  "dob": "19900101",
  "merklePathElements": [
    "17496016504088756945878697323122345926490434107499748444525471398667742396808",
    "20865137519102261789131118239953148598374980882077152418957024848528592124969"
  ],
  "merklePathIndices": [0, 0]
}
```

### Step 5: Generate Proof

```bash
cd circuits
snarkjs groth16 fullprove ../input.json age_with_merkle.wasm circuit_final.zkey proof.json public.json
```

This creates:
- `proof.json` - The Groth16 proof
- `public.json` - Public signals: `[isAdult, rootHash]`

### Step 6: Verify Locally (optional)

```bash
snarkjs groth16 verify verification_key.json public.json proof.json
```

### Step 7: Use on Chaincode

```bash
# Copy verification key to chaincode
cp verification_key.json ../lib/

# Issue credential with rootHash (from public.json)
ROOT_HASH=$(cat public.json | jq -r '.[1]')

# Call VerifyAge with proof
peer chaincode invoke ... -c '{
  "function": "VerifyAge",
  "Args": [
    "user123",
    "18",
    "'$(cat proof.json)'",
    "'$(cat public.json)'",
    "'$ROOT_HASH'"
  ]
}'
```

## Important Notes

### Public Signals Order

The circuit outputs **2 public signals** in this order:
1. `isAdult` (index 0)
2. `rootHash` (index 1)

The chaincode `VerifyAge` function needs to be updated to extract `rootHash` from `publicSignals[1]` instead of accepting it as a separate parameter.

### Circuit vs Chaincode Verification

**Current Implementation (Wrapper)**:
- Circuit outputs: `[isAdult]` (1 signal)
- Chaincode accepts: `rootHash` as separate parameter
- Chaincode verifies: `rootHash === onChainHash`

**Full Integration (This Circuit)**:
- Circuit outputs: `[isAdult, rootHash]` (2 signals)  
- Circuit verifies: Merkle proof inside the circuit
- Chaincode extracts: `rootHash` from `publicSignals[1]`
- Chaincode verifies: `publicSignals[1] === onChainHash`

### Security Properties

With this circuit:
- ✅ User cannot fake DOB (Merkle proof will fail)
- ✅ User cannot use someone else's credential (different Merkle root)
- ✅ Chaincode verifies both ZK proof AND rootHash binding
- ✅ Complete cryptographic chain: DOB → Merkle tree → Root → On-chain

## Troubleshooting

### "circomlib not found"

Install circomlib in the identity-cc directory:
```bash
npm install circomlib
```

### "Powers of Tau file too small"

The circuit has ~100 constraints. Power of Tau 12 (2^12 = 4096 constraints) is sufficient.

### "Merkle proof verification fails"

Ensure:
- Field order is consistent: `['dob', 'address', 'name', 'ssn']`
- DOB is at index 0 in the Merkle tree
- Path elements and indices match the generated Merkle tree

## Next Steps

1. Compile this circuit
2. Generate proving/verification keys
3. Update `verification_key.json` in chaincode
4. Modify chaincode to extract `rootHash` from `publicSignals[1]`
5. Generate proof and test end-to-end
