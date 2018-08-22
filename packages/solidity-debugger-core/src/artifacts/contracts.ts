
import {ContractData, Bytecode, Nodex, Source, Sources, LocationByOffset, SourceRange} from '../types'
import {walkAndFind, walk} from './ast';
import {parseStorage, Assignment} from '../state';
import {parseSourceMap, parseSrcMap, SourceMap} from './source_maps';
import parseOpcodes, {Opcode} from './opcodes';
import {getLocationByOffset, getCheckpoints} from './sources';
import { bytecodeId } from '../utils';
import { join } from 'path';
import {parseVariable, Variable} from './variables'

export function arrayToObject(array, keyField) {
    return array.reduce((obj, item) => {
        obj[item[keyField]] = item
        return obj
    }, {})
}

// Struct type
type Struct = {
    name: string,
    members: Variable[],
}

const parseStruct = (node: Nodex): Struct => ({
    name: node.name,
    members: [],
    // members: node.members.map(j => parseVariable(j, {}))
})

// Enum type
export type Enum = {
    name: string,
    values: any[],
}

const parseEnum = (node: Nodex): Enum => ({
    name: node.name,
    values: node.members.map(m => m.name),
})

const retrieveStateVariables = (node: Nodex): Nodex[] => walkAndFind(node, 'VariableDeclaration').filter(i => i.stateVariable).sort((a: Nodex, b: Nodex) => a.id - b.id)

export type UserTypes = {
    contract: string,
    structs: {[struct: string]: Struct},
    enums: {[enm: string]: Enum},
}

const retrieveUserTypes = (node: Nodex): UserTypes => ({
    'contract': node.name,
    'structs':  arrayToObject(walkAndFind(node, 'StructDefinition').map(parseStruct), 'name'),
    'enums':    arrayToObject(walkAndFind(node, 'EnumDefinition').map(parseEnum), 'name'),
})

export type Contract = {
    name: string,
    deployed: Bytecode,
    creation: Bytecode,
    node: Nodex,
    userTypes: UserTypes,
    globals: Assignment[],
    parents: {[parent: number]: number}
    scopes:  {[id: number]: number[]},
    abi: any,
}

export type Contracts = {[name: string]: Contract};

export function getStateVariables(contract: Nodex, contracts: {[id: string]: Nodex}): Nodex[] {
    return [].concat.apply([], contract.linearizedBaseContracts.reverse().map(i => contracts[i]).map(retrieveStateVariables));
}

// return the contract. u have enough there
function parseContract(data: ContractData): Contract | undefined {
    
    // all the contracts that have something to do with the contract
    const contracts: Nodex[] = [].concat.apply([], Object.keys(data.sources).map(i => walkAndFind(data.sources[i].ast, 'ContractDefinition')))
    
    // Contracts lookups
    const byId: {[id: string]: Nodex} = arrayToObject(contracts, 'id');
    const byName: {[name: string]: Nodex} = arrayToObject(contracts, 'name');
    
    // Build enum and structs
    const userTypes = arrayToObject(contracts.map(retrieveUserTypes), 'contract');
    
    // Main contract AST
    const contract = byName[data.contractName]
    if (contract == undefined) {
        return undefined
    }
    
    // Parse state variables and create the assignment
    const stateVariables: Nodex[] = [].concat.apply([], contract.linearizedBaseContracts.reverse().map(i => byId[i]).map(retrieveStateVariables));
    const storageVariables: Assignment[] = parseStorage(stateVariables.map(i => parseVariable(i, userTypes)))

    // Arrange the nodes in the contract ast by the src
    const nodesBySrc: {[src: string]: Nodex} = arrayToObject([].concat.apply([], contracts.map(walk)), 'src')

    // parse bytecodes
    const creation = parseSourceMap(data.sourceMap, data.bytecode, data.sources, nodesBySrc, true);
    const runtime  = parseSourceMap(data.sourceMapRuntime, data.runtimeBytecode, data.sources, nodesBySrc);

    // precompute the parents
    let parents = {};
    contracts.forEach(id => walk(id).forEach(node => {
        parents[node.id] = node.parent
    }))
    
    // precompute the scopes
    let scopes: {[id: number]: number[]} = {};
    contracts.map(walk).map(nodes => {
        for (const node of nodes) {
            if (node.id == undefined) {
                continue
            }
            let _scopes = node.linearizedBaseContracts || [];
            if (node.scope) {
                _scopes.push(node.scope)
            }

            if (_scopes.length != 0) {
                scopes[node.id] = _scopes;
            }
        }
    })
    
    return {
        name: data.contractName,
        deployed: runtime,
        creation: creation,
        node: contract,
        userTypes: userTypes[data.contractName],
        globals: storageVariables,
        parents: parents,
        scopes: scopes,
        abi: data.abi,
    }
}

// Not sure about this parsing
const parseSource = (name: string, content: string): Source => ({
    filename: name,
    content: content,
    sliced: content.split('\n'),
    offsets: getLocationByOffset(content),
})

// quite dummy for now
function parseSources(contracts: ContractData[]): Sources {
    let sources: {[filename: string]: Source} = {};

    contracts.map(contract => {
        Object.keys(contract.sources).map(filename => {
            sources[filename] = parseSource(filename, contract.sources[filename].source)
        })
    })

    return sources;
}

export function parseContractData(contracts: ContractData[]): [Contracts, Sources] {
    const result = contracts.map(parseContract).filter(i => i != undefined);

    let x: Contracts = arrayToObject(result, 'name');
    let y = parseSources(contracts)
    return [x, y]
}
