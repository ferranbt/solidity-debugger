
import Adapter from './adapter'
var {Compiler} = require('@0xproject/sol-compiler')
import {ContractData} from '../types';
import SolCompiler from './sol-compiler';

const DEFAULT_SOLC_SETTINGS = {
    optimizer: {
        enabled: false,
    },
    outputSelection: {
        ['*']: {
            ['*']: [
                'abi', 
                'evm.bytecode.object',
                'evm.deployedBytecode.object'
            ],
            "": [ "ast" ]
        },
    },
}

const DEFAULT_SOLC_ARTIFACTS = ".debugger"

export default class Truffle extends Adapter {
    contractsDir: string;
    artifactsDir: string;

    constructor(opts: any) {
        super();
        this.contractsDir = opts.contractsDir || 'contracts'
        this.artifactsDir = opts.artifactsDir || DEFAULT_SOLC_ARTIFACTS
    }

    public async getContractData(): Promise<ContractData[]> {
        const compiler = new Compiler({
            contractsDir: this.contractsDir,
            artifactsDir: this.artifactsDir,
            compilerSettings: DEFAULT_SOLC_SETTINGS,
        });
        
        await compiler.compileAsync();

        const solAdapter = new SolCompiler({
            artifactsDir: this.artifactsDir,
            contractsDir: this.contractsDir,
        })

        return solAdapter.getContractData();
    }
}
