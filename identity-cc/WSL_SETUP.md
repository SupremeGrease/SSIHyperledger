# WSL Setup Guide for Hyperledger Fabric

## Step 1: Start Docker Desktop
Docker Desktop should be starting. Wait for it to fully start (you'll see the Docker icon in the system tray).

## Step 2: Start WSL and Navigate to Project

Open WSL (Ubuntu) and run:

```bash
# Start WSL Ubuntu
wsl -d Ubuntu

# Navigate to your project (Windows paths are accessible via /mnt/)
cd /mnt/f/courses/csd436/proj2/fabric-samples/test-network

# Verify Docker is accessible from WSL
docker ps
```

## Step 3: Verify Docker Integration

Docker Desktop should integrate with WSL automatically. If `docker ps` works, you're ready!

## Step 4: Start the Network

```bash
# Make sure network.sh is executable
chmod +x network.sh

# Start the network and create channel
./network.sh up createChannel
```

## Step 5: Deploy Chaincode

```bash
# Deploy the identity chaincode
./network.sh deployCC -ccn identity -ccp ../identity-cc -ccl javascript -ccv 1.0 -ccs 1
```

## Troubleshooting

### Docker not accessible in WSL?
1. Ensure Docker Desktop is running
2. In Docker Desktop: Settings > Resources > WSL Integration
3. Enable integration for "Ubuntu"
4. Restart WSL: `wsl --shutdown` then reopen

### Permission denied on network.sh?
```bash
chmod +x network.sh
chmod +x scripts/*.sh
```

### Path issues?
Windows paths in WSL: `/mnt/f/` = `F:\` drive

