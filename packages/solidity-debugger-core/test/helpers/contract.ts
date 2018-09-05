import {Transaction} from 'ethereum-types';

var providers = require('ethers').providers;
var ethers = require('ethers');

// provider
const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545', providers.networks.unspecified);

const signer = provider.getSigner(process.env.SIGNER_ADDRESS);

// Default gas price and limit
const opts = {
    gasPrice: "0x70000000",
    gasLimit: "0x600000",
}

class Contract {
    contract: any;
    address: any;

    constructor(address: string, abi) {
        this.address = address;
        this.contract = new ethers.Contract(address, abi, signer);
    }

    async send(method: string, args: any[]): Promise<Transaction> {
        let receipt = await this.contract[method](...args, opts);
        const tx = await provider.getTransaction(receipt.hash)
        return tx;
    }
}

async function deploy(abi: string, bytecode: string, ...args) {
    const data = ethers.Contract.getDeployTransaction(bytecode, abi, ...args);

    let tx = await signer.sendTransaction(Object.assign({}, data, opts));
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
