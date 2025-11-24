# Identity Chaincode Deployment Guide

This guide will help you deploy and execute the Identity Chaincode on Hyperledger Fabric test-network.

## Prerequisites

1. Hyperledger Fabric test-network is set up
2. Docker and Docker Compose are running
3. Node.js and npm are installed
4. All Fabric binaries are in the `fabric-samples/bin` directory

## Step 1: Start the Test Network

Navigate to the test-network directory and start the network:

```bash
cd fabric-samples/test-network
./network.sh up createChannel
```

This will:
- Start the network with 2 organizations (Org1 and Org2)
- Create a channel named "mychannel"

## Step 2: Deploy the Chaincode

From the `test-network` directory, deploy the chaincode:

```bash
./network.sh deployCC -ccn identity -ccp ../identity-cc -ccl javascript -ccv 1.0 -ccs 1
```

Parameters:
- `-ccn identity`: Chaincode name
- `-ccp ../identity-cc`: Path to chaincode directory
- `-ccl javascript`: Chaincode language
- `-ccv 1.0`: Chaincode version
- `-ccs 1`: Chaincode sequence number

## Step 3: Execute Chaincode Functions

### Set Environment Variables

First, set up the environment for Org1:

```bash
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
```

### Issue a Credential

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n identity --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{"function":"IssueCredential","Args":["user1","0x1234567890abcdef","IssuerOrg","2024-01-01T00:00:00Z"]}'
```

### Get a Credential

```bash
peer chaincode query -C mychannel -n identity -c '{"function":"GetCredential","Args":["user1"]}'
```

### Revoke a Credential

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n identity --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{"function":"RevokeCredential","Args":["user1","Security breach"]}'
```

### Verify a Proof (requires valid proof and public signals)

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n identity --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{"function":"VerifyProof","Args":["user1","{\"pi_a\":[...],\"pi_b\":[...],\"pi_c\":[...]}","[\"0x1234\"]"]}'
```

### Verify Age (Groth16 proof that age ≥ threshold)

The `VerifyAge` function assumes your circuit exposes public signals in the order `[minimumAge, credentialHash, isOfAgeFlag, ...]`. `isOfAgeFlag` must evaluate to `1` (or `true`) when the subject meets or exceeds the threshold.

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C mychannel -n identity \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c '{"function":"VerifyAge","Args":["user1","21","{\"pi_a\":[...],\"pi_b\":[...],\"pi_c\":[...]}","[\"21\",\"0xabcd...\",\"1\"]"]}'
```

If the proof is valid and the age constraint is satisfied, the chaincode will emit a `VerifyAge` event and store the verification outcome under the `ageVerification` composite key space.

### Query All Verifications

```bash
peer chaincode query -C mychannel -n identity -c '{"function":"QueryVerifications","Args":[]}'
```

## Step 4: Stop the Network (when done)

```bash
./network.sh down
```

## Important Notes

1. **Verification Key**: The `lib/verification_key.json` file is currently a placeholder. For production use, replace it with your actual verification key from your zk-SNARK circuit setup.

2. **Proof Verification**: The `VerifyProof` function requires valid Groth16 proof JSON and public signals. You'll need to generate these using your zk-SNARK circuit.

3. **Channel Name**: If you're using a different channel name, replace `mychannel` in all commands.

4. **Chaincode Updates**: To update the chaincode, increment the version (`-ccv`) and sequence (`-ccs`) numbers.

## Troubleshooting

- If deployment fails, check that all dependencies are installed: `cd identity-cc && npm install`
- Ensure Docker containers are running: `docker ps`
- Check peer logs: `docker logs peer0.org1.example.com`
- Verify chaincode is installed: `peer lifecycle chaincode queryinstalled`

