
import Adapter from './adapter'
import {ContractData, ContractVersionData} from '../types';

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

const parseSource = (contractsDir: string, filename: string): ContractData | undefined => {
    const artifact: ContractVersionData = JSON.parse(fs.readFileSync(filename).toString());
    if (artifact.compilerOutput.evm == undefined) {
        return undefined;
    }
    
    const sources = {};
    for (const source in artifact.sources) {
        
        const filename = path.resolve(contractsDir, source);
        const sourceCode = fs.readFileSync(filename).toString();
        
        sources[filename] = Object.assign({}, artifact.sources[source], {
            filename,
            source: sourceCode,
        })
    }

    const contractData: ContractData = {
        contractName: artifact.contractName,
        sources: sources,
        bytecode: artifact.compilerOutput.evm.bytecode.object,
        sourceMap: artifact.compilerOutput.evm.bytecode.sourceMap,
        runtimeBytecode: artifact.compilerOutput.evm.deployedBytecode.object,
        sourceMapRuntime: artifact.compilerOutput.evm.deployedBytecode.sourceMap,
        abi: artifact.compilerOutput.abi,
    };

    return contractData
}

export default class SolCompiler extends Adapter {
    artifactsDir: string;
    contractsDir: string;

    constructor(opts: any) {
        super();
        this.artifactsDir = opts.artifactsDir;
        this.contractsDir = opts.contractsDir;
    }

    public async getContractData(): Promise<ContractData[]> {
        const artifactsGlob = `${this.artifactsDir}/**/*.json`;

        const artifacts = glob.sync(artifactsGlob, { absolute: true });
        return artifacts.map(i => parseSource(this.contractsDir, i))
    }
}
