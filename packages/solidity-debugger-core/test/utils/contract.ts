import {Transaction} from 'ethereum-types';

var providers = require('ethers').providers;
var ethers = require('ethers');

// provider
const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545', providers.networks.unspecified);

const privateKey = process.env.PRIVATE_KEY;

// Wallet
let wallet = new ethers.Wallet(privateKey, provider);
wallet.provider = provider;

class Contract {
    contract: any;
    address: any;

    constructor(address: string, abi) {
        this.address = address;
        this.contract = new ethers.Contract(address, abi, wallet);
    }

    async send(method: string, args: any[]): Promise<Transaction> {
        let receipt = await this.contract[method](...args);
        const tx = await provider.getTransaction(receipt.hash)
        return tx;
    }
}

async function deploy(abi: string, bytecode: string, ...args) {
    const data = ethers.Contract.getDeployTransaction(bytecode, abi, ...args);

    const tx      = await wallet.sendTransaction(data);
    const receipt = await provider.getTransactionReceipt(tx.hash);

    const address   = receipt.contractAddress;
    const contract  = new Contract(address, abi);

    return {
        contract,
        txhash: tx.hash,
    };
}

export default function(abi) {
    return {
        at: (address: string) => {
            return new Contract(address, abi)
        },
        deploy: (bytecode: string, ...args) => {
            return deploy(abi, bytecode, ...args)
        }
    }
}
