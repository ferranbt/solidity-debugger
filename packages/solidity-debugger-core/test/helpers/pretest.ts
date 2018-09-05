
// Set up address

var providers = require('ethers').providers;
var ethers = require('ethers');

// provider
const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545', providers.networks.unspecified);

provider.listAccounts()
.then(accounts => {
    process.env.SIGNER_ADDRESS = accounts[0]
})
.catch(err => {
    console.error(err)
})
