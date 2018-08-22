
import {Adapter} from './adapters'
import Provider from './provider';
import {Transaction} from 'ethereum-types';
import {Breakpoints, Sources} from './types';
import {parseContractData, Contracts} from './artifacts/contracts';
import Session from './session';
import parseTrace from './trace';
const WebSocket = require('ws');

const RPC_SUBSCRIBE = '{"id": 1, "method": "eth_subscribe", "params": ["newHeads", {}]}'

export class Debugger {
    adapter: Adapter;
    provider: Provider;
    breakpoints: Breakpoints
    contracts: Contracts;
    sources: Sources;

    txPool: Transaction[];
    ws: any = undefined;

    constructor(adapter: Adapter, provider: Provider) {
        this.adapter = adapter;
        this.provider = provider;
    }

    async init() {
        let data = await this.adapter.getContractData();
        let [contracts, sources] = parseContractData(data)

        this.contracts = contracts;
        this.sources = sources;
    }
    
    async debugTxHash(txHash: string): Promise<Session> {
        return this.debugTx(await this.provider.getTransactionByHash(txHash))
    }

    async debugTx(transaction: Transaction): Promise<Session> {
        let steps = await parseTrace(this.contracts, this.sources, transaction);
        return new Session(this.sources, transaction, steps);
    }
    
    watchTxs() {
        this.ws = new WebSocket('ws://localhost:8545');

        this.ws.on('open', () => {
            this.ws.on('message', (data) => {
                data = JSON.parse(data);

                if (data.method != undefined) {
                    const hash = data.params.result.hash;

                    this.provider.getBlockByHash(hash).then(block => {
                        for (const tx of block.transactions) {
                            this.txPool.push(tx)
                        }
                    })
                }
            });
          
            this.ws.send(RPC_SUBSCRIBE);
        });
    }

    stop() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
