
// Generate random tests for storage variables

import newContract from '../utils/contract';
const crypto = require('crypto');

import {TypeName, Type, Variable, getBytes} from '../../src/artifacts/variables';
import {decodeAssignment, parseStorage, State, decodeIntFromHex, Assignment, decode} from '../../src/state';
import {arrayToObject} from '../../src/utils';
import {walkAndFind} from '../../src/artifacts/ast';
import {getStateVariables} from '../../src/artifacts/contracts';

import {compile, DEFAULT_FILENAME} from '../utils/compiler'

// ---- utils ----

function randomNumber(low: number, high: number): number {
    return Math.floor(Math.random() * (high - low) + low)
}

function range(min: number, max: number): number[] {
    var list: number[] = [];
    for (var i = min; i <= max; i++) {
        list.push(i);
    }
    return list
}

function randSplits(n: number, min: number = 2, max: number = n / 2): number[] {
    let res: number[] = [];
    let count = 0;
    while (n > 0) {
        const chunk = Math.floor(Math.min(Math.min(max, Math.floor((Math.random() * max ) + min)), n));

        res.push(count + chunk)
        n -= chunk;
        count += chunk;
    }

    res.unshift(0)
    return res; // [0, ..., n]
}

function randChunkSplit<T>(arr: T[], min: number = 2, max: number = arr.length / 2): T[][] {
    let res: T[][] = [];

    const splits = randSplits(arr.length, min, max);
    for (let i = 0; i < splits.length - 1; i++) {
        res.push(arr.slice(splits[i], splits[i + 1]))
    }

    return res;
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---- Generate random types ----

const elementaryTypes = [
    'int',
    'intx',
    'uint',
    'uintx',
    'address',
    'bytesx',
    'bytes',
    'string'
]

const integersX = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128, 136, 144, 152, 160, 168, 176, 184, 192, 200, 208, 216, 224, 232, 240, 248, 256];
const bytesX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]

function getRandom<T>(list: T[]): T {
    return list[Math.floor(Math.random()*list.length)];
}

const createStorageVariable = (name: string, type: TypeName): Variable => ({
    id: -1,
    name: name,
    location: 'storage',
    type: type,
    scope: -1,
    state: true,
    bytes: getBytes(type),
})

function makeSimpleVariable(): TypeName {
    let type = getRandom(elementaryTypes)

    if (type == 'intx' || type == 'uintx') {
        type = type.replace('x', '') + getRandom(integersX)
    }

    if (type == 'int') {
        type = 'int256'
    }

    if (type == 'uint') {
        type = 'uint256'
    }

    if (type == 'bytesx') {
        type = type.replace('x', '') + getRandom(bytesX)
    }

    return {
        type: Type.ElementaryTypeName,
        name: type,
    }
}

function makeArrays(): TypeName {
    return {
        type: Type.ArrayTypeName,
        name: 'array',
        base: makeSimpleVariable()
    }
}

function generateTypes(n: number, generator: () => TypeName): TypeName[] {
    return range(0, n).map(generator)
}


// ---- Generate random values ----

function randomString(n: number) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  
    for (var i = 0; i < n; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));
  
    return text;
}

async function randomBytes(bytes: number) {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(bytes, (err, buf) => {
            if (err)
                reject(err)
            else
                resolve('0x' + buf.toString('hex'))
        });
    })
}

async function randomAddress() {
    return randomBytes(20);
}

// TODO. Change to bignumber. Since uses integer we need to cap the bytes of the numbers
async function randomNum(bytes: number=32, signed: boolean=true) {
    const buf = await crypto.randomBytes(randomNumber(0, Math.min(4, bytes)));
    return decodeIntFromHex(buf, bytes, signed)
}

// Different sizes for dynamic types string and bytes
const DYNAMIC_TYPES_SIZES = [5, 10, 20, 30, 40, 50, 100, 150, 200]

async function generateRandomElementaryTypes(type: TypeName) {

    // address
    if (type.name == 'address') {
        return randomAddress();
    }
    
    // boolean
    if (type.name == 'bool') {
        return getRandom([true, false])
    }

    // i.e. uint8
    if (type.name.startsWith('uint')) {
        return randomNum(parseInt(type.name.replace('uint', '')) / 8, false);
    }
    
    // i.e. int8
    if (type.name.startsWith('int')) {
        return randomNum(parseInt(type.name.replace('int', '')) / 8);
    }

    // string
    if (type.name == 'string') {
        return randomString(getRandom(DYNAMIC_TYPES_SIZES))
    }

    // dynamic bytes
    if (type.name == 'bytes') {
        return randomBytes(getRandom(DYNAMIC_TYPES_SIZES))
    }

    // byte
    if (type.name == 'byte') {
        return randomBytes(1)
    }

    // i.e. bytes1
    if (type.name.startsWith('bytes')) {
        return randomBytes(parseInt(type.name.replace('bytes', '')))
    }

    throw Error(`Type not supported: ${type.name}`)
}

async function generateRandomValues(type: TypeName): Promise<any> {
    switch (type.name) {
        case 'array':
            return Promise.all(range(0, randomNumber(0, 10)).map(i => generateRandomElementaryTypes(type.base as TypeName)))
        default:
            return generateRandomElementaryTypes(type)
    }
}

// ---- Generate contract.sol ----

function printTypeName(type: TypeName): string {
    switch(type.name) {
        case 'array':
            return `uint[]`;
        default:
            return type.name
    }
}

function printFunctionParameters(type: TypeName): string {
    switch (type.name) {
        case 'array':
            return `uint[] val`;
        default:
            return `${type.name} val`
    }
}

function printFunctionBody(variableName: string, type: TypeName): string {
    switch (type.name) {
        case 'array':
            return `for (uint i = 0; i < val.length; i++) {
            ${variableName}.push(val[i]);
        }`

        default:
            return `${variableName} = val;`
    }
}

function printFunction(variable: Variable): string {
    return `function set_${variable.name}(${printFunctionParameters(variable.type)}) public payable {
        ${printFunctionBody(variable.name, variable.type)}
    }`
}

function printContract(name: string, vars: Variable[], parent: string[]=[]): string {
    let variables: string[] = vars.map((v, indx) => `${printTypeName(v.type)} ${v.name};`)
    let functions: string[] = vars.map(printFunction)

    return `contract ${name} ${parent.length == 0 ? '' : 'is ' + parent.join(', ')} {
    ${variables.join('\n    ')}

    ${functions.join('\n    ')}
}`
}

// ---- Different hierarchy configurations ----

// A -> B -> C -> D
const printContractsLinear = (chunks: Variable[][]): string[] => {
    return chunks.map((v, indx) => printContract('Sample' + (indx == 0 ? '' : indx), v, indx == chunks.length - 1 ? [] : ['Sample' + (indx + 1).toString()])).reverse()
}

// B -> |
//      | -> C
// C -> |
const printContractWithDifferentFathers = (chunks: Variable[][]): string[] => {
    let stepFathers = range(1, chunks.length-1)

    const parents = (): string[] => {   // for each contract, take the next n as parents
        const n = randomNumber(0, stepFathers.length);

        const parents = stepFathers.slice(0, n + 1).map(i => 'Sample' + i);
        stepFathers.splice(0, n + 1)

        return parents;
    }
    
    return chunks.map((v, indx) => printContract('Sample' + (indx == 0 ? '' : indx), v, parents())).reverse()
}

type Case = {
    name: string,
    chunks: TypeName[][]
}

const cases: Case[] = [
    {
        name: "Simple",
        chunks: [
            [
                {
                    type: Type.ElementaryTypeName,
                    name: 'bytes',
                },
                {
                    type: Type.ElementaryTypeName,
                    name: 'address'
                },
                {
                    type: Type.ElementaryTypeName,
                    name: 'uint96',
                },
                {
                    type: Type.ElementaryTypeName,
                    name: 'uint256',
                },
                {
                    type: Type.ElementaryTypeName,
                    name: 'address',
                },
                {
                    type: Type.ElementaryTypeName,
                    name: 'int104',
                },
            ]
        ]
    },
];

(async() => {

    // Table cases
    
    return;

    for (const cc of cases) {
        
        let count = 0;
        const chunks = cc.chunks.map((types, i) => types.map((type, j) => createStorageVariable(`val${count++}`, type)))
        const variablesByName = arrayToObject([].concat.apply([], chunks) as Variable[], 'name');
        
        let sampleText = printContractsLinear(chunks);

        const sample = `pragma solidity ^0.4.22;

        ${sampleText.join('\n\n')}
        `

        console.log(sample)

        await applyRandom(variablesByName, sample);
    }
})();

(async() => {

    // Different parents

    return;

    let types: TypeName[] = shuffle([
        ...generateTypes(10, makeSimpleVariable),
    ])

    let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));
    let variablesByName = arrayToObject(variables, 'name');

    let chunks = randChunkSplit(variables, 1, 3);
    let sampleText = printContractWithDifferentFathers(chunks);

    const sample = `pragma solidity ^0.4.22;

    ${sampleText.join('\n\n')}
    `

    console.log(sample);

    applyRandom(variablesByName, sample);
})();

// Arrays with push

(async() => {

    // Arrays as variables test

    return;

    let types: TypeName[] = shuffle([
        ...generateTypes(1, makeArrays),
    ])

    let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));
    let variablesByName = arrayToObject(variables, 'name');

    const sample = `pragma solidity ^0.4.22;

    ${printContract('Sample', variables)}
    `

    console.log(sample);

    applyRandom(variablesByName, sample);
})();

(async() => {

    // One contract
    
    return;

    let types: TypeName[] = shuffle([
        ...generateTypes(5, makeSimpleVariable),
    ])

    let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));
    let variablesByName = arrayToObject(variables, 'name');

    const sample = `pragma solidity ^0.4.22;

    ${printContract('Sample', variables)}
    `
    
    applyRandom(variablesByName, sample);

})();

(async() => {
    
    // Linear contracts
    
    return;

    let types: TypeName[] = shuffle([
        ...generateTypes(10, makeSimpleVariable),
    ])

    let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));
    let variablesByName = arrayToObject(variables, 'name');

    let chunks = randChunkSplit(variables);
    let sampleText = printContractsLinear(chunks);

    const sample = `pragma solidity ^0.4.22;

    ${sampleText.join('\n\n')}
    `

    applyRandom(variablesByName, sample);

})();

async function applyRandom(variables: {[name: string]: Variable}, sample: string, n: number=10) {

    const output = compile(sample);
    const result = output.contracts[DEFAULT_FILENAME]['Sample'];

    const bin = result.evm.bytecode.object
    const abi = result.abi;
    const ast = output.sources[DEFAULT_FILENAME].ast;
    
    const contracts         = walkAndFind(ast, 'ContractDefinition');
    const contractsById     = arrayToObject(contracts, 'id')
    const contractsByName   = arrayToObject(contracts, 'name');

    const stateVariables = getStateVariables(contractsByName['Sample'], contractsById)
    const assignments = parseStorage(stateVariables.map(v => v.name).map(n => variables[n]))

    const {contract} = await newContract(abi).deploy('0x' + bin)
    
    for (let i=0; i<n; i++) {
        const assignment = getRandom(assignments);

        const realValue     = await generateRandomValues(assignment.Variable.type)
        const transaction   = await contract.send('set_' + assignment.Variable.name, [realValue]);

        const state = new State(transaction.blockNumber as number, true); // disable cache
        state.setAddress(contract.address);
        
        const value = decodeAssignment(state, assignment);
        // realValue == value
    }
}
