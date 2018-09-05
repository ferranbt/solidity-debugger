
import {Adapter} from '../../src/adapters';
import {ContractData} from '../../src/types';
import {compile, DEFAULT_FILENAME} from './compiler';

export class TestAdapter implements Adapter {
    contractData: ContractData[];

    constructor(content: string) {
        let output = compile(content);
        
        const contracts = output.contracts[DEFAULT_FILENAME];
        const source    = output.sources[DEFAULT_FILENAME];

        const sources = {
            [DEFAULT_FILENAME]: {
                filename: DEFAULT_FILENAME,
                source: content,
                id: source.id,
                ast: source.ast
            }
        }
        
        this.contractData = Object.keys(contracts).map(name => {
            const contract = contracts[name];

            return {
                contractName: name,
                bytecode: '0x' + contract.evm.bytecode.object,
                sourceMap: contract.evm.bytecode.sourceMap,
                runtimeBytecode: '0x' + contract.evm.deployedBytecode.object,
                sourceMapRuntime: contract.evm.deployedBytecode.sourceMap,
                sources: Object.assign({}, sources),
                abi: contract.abi
            }
        })
    }

    public async getContractData(): Promise<ContractData[]> {
        return this.contractData;
    }
}

export function testAdapter(source: string): Adapter {
    return new TestAdapter(source)
}
