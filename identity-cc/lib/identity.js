/*
Identity Chaincode (Node.js) for Hyperledger Fabric v2.5

Files contained here (single-file bundle for convenience):
  - package.json (below as comment)
  - index.js        -> Chaincode implementation (exported Contract)
  - lib/verification_key.json -> expected to be placed under chaincode/lib/

How to use:
  1. Place this file as ~/ssi-fabric-project/chaincode/identity-cc/index.js
  2. Create a folder ~/ssi-fabric-project/chaincode/identity-cc/lib/ and drop verification_key.json there
  3. Create package.json as shown below and run `npm install` in the chaincode folder.
  4. Deploy using fabric-samples/test-network: `./network.sh deployCC -ccn identity -ccp ~/ssi-fabric-project/chaincode/identity-cc -ccl javascript`

Notes:
  - This chaincode depends on `fabric-contract-api`, `fabric-shim`, and `snarkjs` (for in-chain verification).
  - In resource-constrained Fabric environments you may prefer to verify proofs off-chain (backend) and only submit the verification result on-chain.

---------------- package.json (create this as a separate file) ----------------
{
  "name": "identity-cc",
  "version": "1.0.0",
  "main": "index.js",
  "license": "Apache-2.0",
  "dependencies": {
    "fabric-contract-api": "^2.5.0",
    "fabric-shim": "^2.5.0",
    "snarkjs": "^0.7.0"
  }
}
--------------------------------------------------------------------------------
*/

'use strict';

const { Contract } = require('fabric-contract-api');
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

// Path to verification key bundled with chaincode (ensure this file is included in chaincode package)
const VERIFICATION_KEY_PATH = path.join(__dirname, 'verification_key.json');

let verificationKeyCache = null;

/**
 * Lazily load and cache the verification key so we do not read from disk on every transaction.
 * @returns {Promise<object>} Parsed verification key JSON.
 */
async function getVerificationKey() {
    if (verificationKeyCache) {
        return verificationKeyCache;
    }

    try {
        const raw = fs.readFileSync(VERIFICATION_KEY_PATH, 'utf8');
        verificationKeyCache = JSON.parse(raw);
        return verificationKeyCache;
    } catch (err) {
        const msg = `Unable to read verification key at ${VERIFICATION_KEY_PATH}: ${err.message}`;
        console.error(msg);
        throw new Error(msg);
    }
}

/**
 * Shared helper to parse the proof/public signals payloads and run Groth16 verification.
 * @param {string} proofJSON
 * @param {string} publicSignalsJSON
 * @returns {Promise<{valid: boolean, publicSignals: any[]}>}
 */
async function verifyGroth16Payload(proofJSON, publicSignalsJSON) {
    if (!proofJSON || !publicSignalsJSON) {
        throw new Error('proofJSON and publicSignalsJSON are required');
    }

    let proof;
    let publicSignals;

    try {
        proof = JSON.parse(proofJSON);
        publicSignals = JSON.parse(publicSignalsJSON);
    } catch (err) {
        throw new Error('Invalid JSON for proof or public signals');
    }

    const vKey = await getVerificationKey();

    try {
        const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        return { valid, publicSignals };
    } catch (err) {
        const errMsg = `snarkjs verification failed: ${err.message || err}`;
        console.error(errMsg);
        throw new Error(errMsg);
    }
}

function toNumber(value) {
    if (value === undefined || value === null) return NaN;
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
        try {
            return Number(BigInt(value));
        } catch (err) {
            return Number(value);
        }
    }
    return NaN;
}

function toBooleanSignal(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        return value === '1' || value.toLowerCase() === 'true';
    }
    return false;
}

class IdentityContract extends Contract {
    // Helper: Build composite key for credentials
    _credentialKey(ctx, userID) {
        return ctx.stub.createCompositeKey('credential', [userID]);
    }

    // IssueCredential(ctx, userID, credentialHash, issuer, timestamp)
    // Stores a credential record (only hashes/metadata are stored)
    async IssueCredential(ctx, userID, credentialHash, issuer, timestamp) {
        if (!userID || !credentialHash) {
            throw new Error('userID and credentialHash are required');
        }

        const key = this._credentialKey(ctx, userID);
        const exists = await ctx.stub.getState(key);
        if (exists && exists.length > 0) {
            throw new Error(`Credential for user ${userID} already exists`);
        }

        const data = {
            credentialHash,
            issuer: issuer || 'unknown',
            timestamp: timestamp || new Date().toISOString(),
            valid: true
        };

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(data)));
        // Emit an event for off-chain listeners
        await ctx.stub.setEvent('IssueCredential', Buffer.from(JSON.stringify({ userID, credentialHash })));

        return JSON.stringify(data);
    }

    // GetCredential(ctx, userID)
    async GetCredential(ctx, userID) {
        if (!userID) throw new Error('userID is required');
        const key = this._credentialKey(ctx, userID);
        const b = await ctx.stub.getState(key);
        if (!b || b.length === 0) {
            throw new Error(`No credential found for user ${userID}`);
        }
        return b.toString();
    }

    // RevokeCredential(ctx, userID, reason)
    async RevokeCredential(ctx, userID, reason) {
        if (!userID) throw new Error('userID is required');
        const key = this._credentialKey(ctx, userID);
        const b = await ctx.stub.getState(key);
        if (!b || b.length === 0) {
            throw new Error(`No credential found for user ${userID}`);
        }

        const obj = JSON.parse(b.toString());
        obj.valid = false;
        obj.revokedAt = new Date().toISOString();
        if (reason) obj.revocationReason = reason;

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(obj)));
        await ctx.stub.setEvent('RevokeCredential', Buffer.from(JSON.stringify({ userID })));
        return JSON.stringify(obj);
    }

    // VerifyProof(ctx, userID, proofJSON, publicSignalsJSON)
    // - proofJSON and publicSignalsJSON are expected to be JSON strings (stringified objects)
    // - The verification_key.json file must be present in chaincode/lib/verification_key.json
    // Returns: { valid: boolean, error?: string }
    async VerifyProof(ctx, userID, proofJSON, publicSignalsJSON) {
        const { valid, publicSignals } = await verifyGroth16Payload(proofJSON, publicSignalsJSON);

        // Optionally record verification result on ledger keyed by userID + proof hash
        // Create a verification record key
        const verificationKey = ctx.stub.createCompositeKey('verification', [userID, ctx.stub.getTxID()]);
        const record = {
            userID,
            txID: ctx.stub.getTxID(),
            timestamp: new Date().toISOString(),
            valid,
            publicSignals
        };

        await ctx.stub.putState(verificationKey, Buffer.from(JSON.stringify(record)));
        await ctx.stub.setEvent('VerifyProof', Buffer.from(JSON.stringify({ userID, txID: record.txID, valid })));

        return JSON.stringify({ valid });
    }

    /**
     * VerifyAge(ctx, userID, minimumAge, proofJSON, publicSignalsJSON)
     * minimumAge: stringified integer (e.g. "18")
     * publicSignals are expected to follow: [minimumAge, credentialHash, isOfAgeFlag, ...]
     */
    async VerifyAge(ctx, userID, minimumAge, proofJSON, publicSignalsJSON) {
        if (!userID) throw new Error('userID is required');
        if (!minimumAge) throw new Error('minimumAge is required');

        const minAgeInt = parseInt(minimumAge, 10);
        if (Number.isNaN(minAgeInt) || minAgeInt <= 0) {
            throw new Error('minimumAge must be a positive integer');
        }

        const { valid, publicSignals } = await verifyGroth16Payload(proofJSON, publicSignalsJSON);
        if (!valid) {
            throw new Error('Proof verification failed');
        }

        if (!Array.isArray(publicSignals) || publicSignals.length < 3) {
            throw new Error('Public signals must include at least [minimumAge, credentialHash, isOfAgeFlag]');
        }

        const circuitMinAge = toNumber(publicSignals[0]);
        if (Number.isNaN(circuitMinAge)) {
            throw new Error('Circuit minimum age signal could not be parsed');
        }

        if (circuitMinAge !== minAgeInt) {
            throw new Error(`Circuit minimum age (${circuitMinAge}) does not match requested minimum age (${minAgeInt})`);
        }

        const isOfAgeFlag = toBooleanSignal(publicSignals[2]);
        if (!isOfAgeFlag) {
            throw new Error('Proof indicates the holder does not meet the minimum age requirement');
        }

        const verificationKey = ctx.stub.createCompositeKey('ageVerification', [userID, ctx.stub.getTxID()]);
        const record = {
            userID,
            txID: ctx.stub.getTxID(),
            timestamp: new Date().toISOString(),
            minimumAge: minAgeInt,
            credentialHash: publicSignals[1],
            isOfAge: true,
            publicSignals
        };

        await ctx.stub.putState(verificationKey, Buffer.from(JSON.stringify(record)));
        await ctx.stub.setEvent('VerifyAge', Buffer.from(JSON.stringify({ userID, minimumAge: minAgeInt })));

        return JSON.stringify({ valid: true, minimumAge: minAgeInt });
    }

    // Helper: Query all verifications (optional)
    async QueryVerifications(ctx) {
        const iterator = await ctx.stub.getStateByPartialCompositeKey('verification', []);
        const results = [];
        for await (const res of iterator) {
            if (res.value && res.value.toString()) {
                results.push(JSON.parse(res.value.toString('utf8')));
            }
        }
        return JSON.stringify(results);
    }

}

module.exports = IdentityContract;
