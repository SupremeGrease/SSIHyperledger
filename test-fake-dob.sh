#!/bin/bash
cd "$(dirname "$0")/test-network"
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

echo "=== Security Test: Fake DOB Attack ==="

# 1. Generate Fake Input
echo -e "\nStep 1: Generating Fake Input (DOB: 19900102)..."
cd ../identity-cc
node generate-fake-input.js

# 2. Generate Proof for Fake Input
echo -e "\nStep 2: Generating ZK Proof for Fake Input..."
cd circuits
snarkjs groth16 fullprove ../circuit_input.json age_with_merkle_js/age_with_merkle.wasm circuit_final.zkey proof_fake.json public_fake.json

# 3. Attempt Verification
# We use:
# - User: userFullCircuit2 (who has the REAL credential on-chain)
# - Proof: proof_fake.json (generated from FAKE credential)
# - PublicSignals: public_fake.json (contains FAKE root hash)
# - RootHash Arg: REAL Root Hash (841255... from previous test) to satisfy the storage check

# Get the REAL root hash (from the valid public.json we generated earlier)
REAL_ROOT_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('public.json'))[1])")
echo "Real Root Hash (On-Chain): $REAL_ROOT_HASH"

# Get the FAKE root hash (just to show it's different)
FAKE_ROOT_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('public_fake.json'))[1])")
echo "Fake Root Hash (In Proof): $FAKE_ROOT_HASH"

# Compact JSON
PROOF_FAKE=$(jq -c . proof_fake.json | sed 's/"/\\"/g')
PUBLIC_FAKE=$(jq -c . public_fake.json | sed 's/"/\\"/g')

echo -e "\nStep 3: Attempting Verification with Fake Proof + Real Root Hash Arg..."
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/../../test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/../../test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/../../test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c "{\"function\":\"VerifyAge\",\"Args\":[\"userFullCircuit2\",\"18\",\"$PROOF_FAKE\",\"$PUBLIC_FAKE\",\"$REAL_ROOT_HASH\"]}"

echo -e "\n=== Test Complete ==="
