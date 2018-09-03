
import {ContractData, Bytecode, Nodex, Source, Sources, LocationByOffset, SourceRange} from '../types'
import {walkAndFind, walk} from './ast';
import {parseStorage, Assignment} from '../state';
import {parseSourceMap, parseSrcMap, SourceMap} from './source_maps';
import parseOpcodes, {Opcode} from './opcodes';
import {getLocationByOffset, getCheckpoints} from './sources';
import { bytecodeId } from '../utils';
import { join } from 'path';
import {parseVariable, Variable, TypeName, Type, getBytes, parseType} from './variables'

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

type Aux = {[name: string]: {
    structs: {[name: string]: Nodex},
    enums: {[name: string]: Nodex},
}}

const parseStructVariable = (node: Nodex, data: Aux={}, userTypes: {[contract: string]: UserTypes}): Variable => ({
    id: node.id,
    name: node.name,
    location: 'storage',
    type: parseStructType(node.typeName, data, userTypes),
    scope: node.scope,
    state: node.stateVariable,
    bytes: getBytes(parseStructType(node.typeName, data, userTypes)),    // not fancy
})

function parseStructType(x: Nodex, data: Aux, userTypes: {[contract: string]: UserTypes}): TypeName {
    switch (x.nodeType) {
        case "UserDefinedTypeName":
            let type = x.typeDescriptions.typeString;

            if (type.startsWith('struct')) {
                type = type.replace("struct ", "")

                const [contract, struct] = type.split('.')
                return {
                    name: 'struct',
                    type: Type.UserDefinedTypeName,
                    members: data[contract].structs[struct].members.map(i => parseStructVariable(i, data, userTypes)),
                }
            }
    }

    // parsetype wont need those special types since the ones that use them are not connected??
    return parseType(x, userTypes)
}

const parseStruct = (node: Nodex, data: Aux, userTypes: {[contract: string]: UserTypes}): Struct => ({
    name: node.name,
    members: node.members.map(j => parseStructVariable(j, data, userTypes))
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

// FIX: this is quite hacky
export function getUserTypes(contracts: Nodex[]): {[name: string]: UserTypes} {
    let userTypes: {[name: string]: UserTypes} = {}

    let aux: Aux = {}
    
    // prefill enums and prepare structs
    for (const contract of contracts) {
        aux[contract.name] = {
            structs:    arrayToObject(walkAndFind(contract, 'StructDefinition'), 'name'),
            enums:      arrayToObject(walkAndFind(contract, 'EnumDefinition'), 'name'),
        }

        userTypes[contract.name] = {
            contract: contract.name,
            structs: {},
            enums: arrayToObject(walkAndFind(contract, 'EnumDefinition').map(parseEnum), 'name')
        }
    }

    // fill structs
    for (const contract in aux) {
        const {structs, enums} = aux[contract];
        
        for (const s in structs) {
            userTypes[contract].structs[s] = parseStruct(structs[s], aux, userTypes)
        }
    }

    return userTypes;
}

// return the contract. u have enough there
function parseContract(data: ContractData): Contract | undefined {
    
    // all the contracts that have something to do with the contract
    const contracts: Nodex[] = [].concat.apply([], Object.keys(data.sources).map(i => walkAndFind(data.sources[i].ast, 'ContractDefinition')))
    
    // Contracts lookups
    const byId: {[id: string]: Nodex} = arrayToObject(contracts, 'id');
    const byName: {[name: string]: Nodex} = arrayToObject(contracts, 'name');
    
    // Build enum and structs
    const userTypes = getUserTypes(contracts);

    // Main contract AST
    const contract = byName[data.contractName]
    if (contract == undefined) {
        return undefined
    }
    
    // Parse state variables and create the assignment
    // const stateVariables: Nodex[] = [].concat.apply([], contract.linearizedBaseContracts.reverse().map(i => byId[i]).map(retrieveStateVariables));
    const stateVariables = getStateVariables(contract, byId);
    const {assignments} = parseStorage(stateVariables.map(i => parseVariable(i, userTypes)))
    
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
        globals: assignments,
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
