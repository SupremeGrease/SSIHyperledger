#!/bin/bash
# Automated setup script for age verification circuit with Merkle proofs

set -e  # Exit on error

echo "========================================="
echo "ZK Circuit Setup - Age with Merkle Proof"
echo "========================================="
echo

# Check prerequisites
echo "Step 1: Checking prerequisites..."
if ! command -v circom &> /dev/null; then
    echo "❌ circom not found. Install with: npm install -g circom"
    exit 1
fi

if ! command -v snarkjs &> /dev/null; then
    echo "❌ snarkjs not found. Install with: npm install -g snarkjs"
    exit 1
fi

echo "✅ circom and snarkjs are installed"
echo

# Create circuits directory if it doesn't exist
mkdir -p circuits
cd circuits

# Step 2: Compile circuit
echo "Step 2: Compiling circuit..."
if [ -f "age_with_merkle.circom" ]; then
    circom age_with_merkle.circom --r1cs --wasm --sym --output .
    echo "✅ Circuit compiled successfully"
else
    echo "❌ age_with_merkle.circom not found"
    exit 1
fi
echo

# Step 3: Powers of Tau ceremony
echo "Step 3: Setting up Powers of Tau..."
if [ ! -f "pot12_final.ptau" ]; then
    echo "Generating Powers of Tau (this may take a few minutes)..."
    
    # Start ceremony
    snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
    
    # First contribution
    snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau \
        --name="First contribution" \
        --entropy="random text $(date)" \
        -v
    
    # Prepare for phase 2
    snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v
    
    # Cleanup intermediate files
    rm pot12_0000.ptau pot12_0001.ptau
    
    echo "✅ Powers of Tau ceremony completed"
else
    echo "✅ Using existing Powers of Tau file"
fi
echo

# Step 4: Generate zkey
echo "Step 4: Generating proving and verification keys..."
snarkjs groth16 setup age_with_merkle.r1cs pot12_final.ptau circuit_0000.zkey

# Contribute to zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey \
    --name="1st Contributor" \
    --entropy="random text $(date)" \
    -v

# Export verification key
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json

# Cleanup
rm circuit_0000.zkey

echo "✅ Keys generated successfully"
echo

# Step 5: Copy verification key to chaincode
echo "Step 5: Copying verification key to chaincode..."
cp verification_key.json ../lib/verification_key.json
echo "✅ Verification key copied to lib/verification_key.json"
echo

# Step 6: Generate circuit info
echo "Step 6: Generating circuit info..."
snarkjs r1cs info age_with_merkle.r1cs > circuit_info.txt
echo "✅ Circuit info saved to circuit_info.txt"
echo

# Summary
echo "========================================="
echo "✅ Circuit Setup Complete!"
echo "========================================="
echo
echo "Files created:"
echo "  - age_with_merkle.wasm (witness generator)"
echo "  - circuit_final.zkey (proving key)"
echo "  - verification_key.json (for chaincode)"
echo
echo "Next steps:"
echo "  1. Generate input: cd .. && node generate-input.js"
echo "  2. Generate proof: cd circuits && snarkjs groth16 fullprove ../input.json age_with_merkle.wasm circuit_final.zkey proof.json public.json"
echo "  3. Update chaincode if needed"
echo "  4. Test on Fabric network"
echo
