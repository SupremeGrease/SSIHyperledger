#!/bin/bash
cd "$(dirname "$0")/test-network"
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

ROOT_HASH="8412550286024366496761021225573402804105404741730529033897646272334110688748"

echo "=== Test 1: VerifyAge with CORRECT Merkle Root (should succeed) ==="
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c '{"function":"VerifyAge","Args":["user123","18","{\"pi_a\":[\"1\",\"1\",\"1\"],\"pi_b\":[[\"1\",\"1\"],[\"1\",\"1\"],[\"1\",\"0\"]],\"pi_c\":[\"1\",\"1\",\"1\"],\"protocol\":\"groth16\",\"curve\":\"bn128\"}","[\"1\"]","'"$ROOT_HASH"'"]}'

sleep 5

echo -e "\n=== Test 2: VerifyAge with WRONG Merkle Root (should fail) ==="
WRONG_HASH="9999999999999999999999999999999999999999999999999999999999999999999999999999"
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c '{"function":"VerifyAge","Args":["user123","18","{\"pi_a\":[\"1\",\"1\",\"1\"],\"pi_b\":[[\"1\",\"1\"],[\"1\",\"1\"],[\"1\",\"0\"]],\"pi_c\":[\"1\",\"1\",\"1\"],\"protocol\":\"groth16\",\"curve\":\"bn128\"}","[\"1\"]","'"$WRONG_HASH"'"]}'

echo -e "\n=== Tests Complete ==="
