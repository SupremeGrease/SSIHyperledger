// Test script to check if module loads correctly
try {
    const mod = require('./index.js');
    console.log('Module loaded successfully');
    console.log('Exports:', Object.keys(mod));
    console.log('Contracts:', mod.contracts);
    if (mod.contracts && mod.contracts.length > 0) {
        console.log('Contract name:', mod.contracts[0].name || 'No name');
    }
} catch(e) {
    console.error('Error loading module:', e.message);
    console.error(e.stack);
    process.exit(1);
}

