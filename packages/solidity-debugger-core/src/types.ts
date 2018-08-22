
import { SourceMap } from './artifacts/source_maps';

export interface Src {
    filename: string,
    source: string,
    id: number;
    ast: Nodex;
}

export interface Srcs {[sourceName: string]: Src;};

export interface ContractData {
    contractName: string;
    bytecode: string;
    sourceMap: string;
    runtimeBytecode: string;
    sourceMapRuntime: string;
    sources: Srcs;
    abi?: string;
}

export interface LineColumn {
    line: number;
    column: number;
}

export interface SourceLocation {
    offset: number;
    length: number;
    fileIndex: number;
    jump: string;
}

export interface SingleFileSourceRange {
    start: LineColumn;
    end: LineColumn;
}

export interface SourceRange {
    location: SingleFileSourceRange;
    srcmap: SourceLocation,
    fileName: string;
    opcode: string;
    position: string;
    node: Nodex;
}

export interface LocationByOffset {
    [offset: number]: LineColumn;
}

export type Artifact = {
    contractName: string,
    bytecode: string,
    deployedBytecode: string,
    sourceMap: string,
    deployedSourceMap: string,
    source: string,
    sourcePath: string,
    ast: Nodex;
}

export type Source = {
    filename: string,
    content: string,
    sliced: string[],
    offsets: LocationByOffset
}

export type Sources = {
    [filename: string]: Source
}

export type Bytecode = {
    isCreation: boolean,
    id: string,
    source: SourceMap,
    raw?: string;
}

import * as solc from 'solc';

export interface ContractVersionData {
    contractName: string;
    compiler: {
        name: 'solc';
        version: string;
    };
    sources: {
        [sourceName: string]: {
            id: number;
            ast: Nodex;
        };
    };
    sourceCodes: {
        [sourceName: string]: string;
    };
    sourceTreeHashHex: string;
    compilerOutput: solc.StandardContractOutput;
}

export type Nodex = {
    id: number;
    absolutePath: string;
    nodeType: string;
    linearizedBaseContracts: number[];
    src: string;
    name: string;
    constant: boolean;
    scope: number;
    expression: Nodex;
    stateVariable: boolean;
    storageLocation: String;
    isConstant: boolean;
    baseType: Nodex;
    members: [Nodex];
    value: Nodex | string | null;
    parent: number;

    parameters: Nodex;
    returnParameters: Nodex;
    
    // -- types
    keyType: Nodex
    valueType: Nodex
    typeName: Nodex
    typeDescriptions: {
        typeString: string
    }
}

export type Breakpoints = {[filename: string]: number[]}
