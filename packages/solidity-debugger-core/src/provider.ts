
import {TransactionTrace, Transaction, BlockWithTransactionData} from 'ethereum-types';
var providers = require('ethers').providers;

class Provider {
    provider: any;
    
    constructor(endpoint: String) {
        this.provider = new providers.JsonRpcProvider(endpoint, providers.networks.unspecified);
    }
    
    async getBlockByHash(hash: string): Promise<BlockWithTransactionData> {
        return this.provider.send('eth_getBlockByHash', [hash, true]);
    }
    
    async getStorageAt(address: String, position: String, block: number) {
        return this.provider.send('eth_getStorageAt', [address, position, block]);
    }
    
    async getCode(hash: String): Promise<string> {
        return this.provider.send('eth_getCode', [hash, 'latest']);
    }

    async getTransactionByHash(hash: String): Promise<Transaction> {
        return this.provider.send('eth_getTransactionByHash', [hash]);
    }

    async debugTransaction(hash: String): Promise<TransactionTrace> {
        return this.provider.send('debug_traceTransaction', [hash, {}]);
    }
}

export default Provider;
