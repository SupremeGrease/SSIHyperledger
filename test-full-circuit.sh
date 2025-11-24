#!/bin/bash
cd "$(dirname "$0")/test-network"
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Read proof and public signals
# Use jq -c to compact and sed to escape quotes for JSON embedding
PROOF=$(jq -c . ../identity-cc/circuits/proof.json | sed 's/"/\\"/g')
PUBLIC=$(jq -c . ../identity-cc/circuits/public.json | sed 's/"/\\"/g')

# Extract rootHash from public.json (it's the second element)
# We use node to safely parse the JSON
ROOT_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('../identity-cc/circuits/public.json'))[1])")

echo "=== Final Test: Full Circuit Integration ==="
echo "Root Hash from Circuit Output: $ROOT_HASH"

echo -e "\nStep 1: Issue Credential with Circuit's Root Hash"
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c "{\"function\":\"IssueCredential\",\"Args\":[\"userFullCircuit2\",\"$ROOT_HASH\",\"TrustedIssuer\",\"2024-11-24T00:00:00Z\"]}"

sleep 3

echo -e "\nStep 2: Verify Age with Full ZK Proof"
# Note: We pass the FULL public signals (including rootHash) and ALSO the rootHash as 5th arg
# The chaincode will:
# 1. Verify proof using vKey (checks against public signals [isAdult, rootHash])
# 2. Check publicSignals[0] == '1' (isAdult)
# 3. Check rootHash arg == on-chain credentialHash
# This confirms the COMPLETE binding!

peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c "{\"function\":\"VerifyAge\",\"Args\":[\"userFullCircuit2\",\"18\",\"$PROOF\",\"$PUBLIC\",\"$ROOT_HASH\"]}"

echo -e "\n=== Test Complete ==="
