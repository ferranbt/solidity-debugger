
// Generate random tests for storage variables

import newContract from '../utils/contract';
const crypto = require('crypto');

var expect = require('chai').expect

import {TypeName, Type, Variable, getBytes, parseVariable} from '../../src/artifacts/variables';
import {decodeAssignment, parseStorage, State, decodeIntFromHex, Assignment, decode} from '../../src/state';
import {arrayToObject} from '../../src/utils';
import {walkAndFind} from '../../src/artifacts/ast';
import {getStateVariables, getUserTypes} from '../../src/artifacts/contracts';

import {compile, DEFAULT_FILENAME} from '../utils/compiler'
var BN = require('ethereumjs-util').BN

// ---- utils ----

export function randomNumber(low: number, high: number): number {
    return Math.floor(Math.random() * (high - low) + low)
}

export function range(min: number, max: number): number[] {
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

export function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

type UserTypes = {[name: string]: TypeName}

// ---- Generate random types ----

const elementaryTypes = [
    'int',
    'intx',
    'uint',
    'uintx',
    'address',
    'bytesx',
    'bytes',
    'string',

    // special case
    'user',
]

const integersX = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128, 136, 144, 152, 160, 168, 176, 184, 192, 200, 208, 216, 224, 232, 240, 248, 256];
const bytesX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]

function getRandom<T>(list: T[]): T {
    return list[Math.floor(Math.random()*list.length)];
}

export const createStorageVariable = (name: string, type: TypeName): Variable => ({
    id: -1,
    name: name,
    location: 'storage',
    type: type,
    scope: -1,
    state: true,
    bytes: getBytes(type),
})

export function makeSimpleVariable(usertypes: UserTypes={}, avoid: string[] = []): TypeName {
    if (Object.keys(usertypes).length == 0) {
        avoid.push('user')
    }

    // Try until you find a valid type
    let type: string; 
    do {
        type = getRandom(elementaryTypes)
    } while(avoid.indexOf(type) != -1)
    
    if (type == 'user') {
        return makeUserDefined(usertypes);
    }

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

export function makeArrays(usertypes: UserTypes, depth: number=0): TypeName {
    return {
        type: Type.ArrayTypeName,
        name: 'array',
        base: makeSimpleVariable({}, ['bytes', 'string'])
    }
}

export function makeUserDefined(userDefined: UserTypes): TypeName {
    const name = getRandom(Object.keys(userDefined));

    return Object.assign({}, userDefined[name], {
        refName: name
    });
}

export function generateTypes(n: number, generator: (usertypes: UserTypes) => TypeName, usertypes: UserTypes={}): TypeName[] {
    return range(0, n).map(i => generator(usertypes))
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
    const buf = await crypto.randomBytes(randomNumber(0, bytes));
    const val = decodeIntFromHex(buf, bytes, signed);
    
    return val;
}

// Different sizes for dynamic types string and bytes
const DYNAMIC_TYPES_SIZES = [5, 10, 20, 30, 40, 50, 100, 150, 200]

export async function generateRandomElementaryTypes(type: TypeName) {

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

export async function generateRandomValues(type: TypeName): Promise<any> {
    switch (type.name) {
        case 'struct':
            const vals = await Promise.all(validMembers(type.members as Variable[]).map(v => generateRandomValues(v.type)));
            return vals
        case 'enum':
            // 'string'
            const values = type.values as string[]
            return values.indexOf(getRandom(values))
        case 'array':
            const v = await Promise.all(range(0, randomNumber(0, 10)).map(i => generateRandomValues(type.base as TypeName)))
            return v
        default:
            return generateRandomElementaryTypes(type)
    }
}

// ---- Generate contract.sol ----

const printVariables = (variables: Variable[]): string[] => variables.map(printTypeName);

function printTypeName(variable: Variable): string {
    switch(variable.type.name) {
        case 'enum':
        case 'struct':
            return `${variable.type.refName} ${variable.name};`
        case 'array':
            // FIX
            const name = (variable.type.base as TypeName).name;
            return `${name == 'struct' || name == 'enum' ? (variable.type.base as TypeName).refName : name}[] ${variable.name};`;
        default:
            return `${variable.type.name} ${variable.name};`
    }
}

// valid members for struct objects (simpler random objects if we dont consider neither arrays not structs)
const validMembers = (variables: Variable[]): Variable[] => variables.filter(v => v.type.name != 'struct' && v.type.name != 'array')

function printFunctionParameters(type: TypeName): string {
    switch (type.name) {
        case 'enum':
            return `${type.refName} val`;
        case 'struct':
            return validMembers(type.members as Variable[]).map((v, indx) => {
                const name = printFunctionParameters(v.type).replace(' val', '');
                return `${name} val_${indx}`
            }).join(', ')
        case 'array':
            const name = printFunctionParameters((type.base as TypeName)).replace(' val', '');
            return `${name}[] val`;
        default:
            return `${type.name} val`
    }
}

function printFunctionBody(variableName: string, type: TypeName): string {
    switch (type.name) {
        case 'struct':
            return validMembers(type.members as Variable[]).map((v, indx) => `${variableName}.${v.name} = val_${indx};`).join('\n')
        case 'array':
            return `${variableName}.length = 0;
        for (uint i = 0; i < val.length; i++) {
            ${variableName}.push(val[i]);
        }`
        case 'enum':
        default:
            return `${variableName} = val;`
    }
}

function printFunction(variable: Variable): string {
    return `function set_${variable.name}(${printFunctionParameters(variable.type)}) public payable {
        ${printFunctionBody(variable.name, variable.type)}
    }`
}

function printContract(name: string, vars: Variable[], parent: string[]=[], userDefined: UserTypes={}): string {
    let variables: string[] = printVariables(vars);
    let functions: string[] = vars.map(printFunction)
    let userDef: string[] = Object.keys(userDefined).map(name => printUserDefined(name, userDefined[name], userDefined))

    return `contract ${name} ${parent.length == 0 ? '' : 'is ' + parent.join(', ')} {
    ${userDef.join('\n    ')}
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

const DEFAULT_PRAGMA = "^0.4.22";

// At the beggining of the contract run this to show structs and enums
// TODO. add contract
function printUserDefined(name: string, type: TypeName, userDefined: UserTypes) {
    switch (type.name) {
        case 'enum':
            return `enum ${name}{\n        ${(type.values as string[]).join(',\n        ')}\n    }`;
        case 'struct':
            const body = (type.members as Variable[]).map(i => printTypeName(i))
            return `struct ${name}{\n        ${body.join('\n        ')}\n    }`;
        default:
            throw Error('')
    }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function createUserDefined(userDefined: UserTypes={}): TypeName {
    if (randomNumber(0, 10) < 5) {
        // enum

        let values: string[] = [];
        for (let i = 0; i < randomNumber(2, 10); i++) {
            let value;
            do {
                value = getRandom(ALPHABET)
            } while (values.indexOf(value) != -1);
            values.push(value)
        }

        return {
            type: Type.UserDefinedTypeName,
            name: 'enum',
            values: values
        }
    } else {

        let rawTypes: TypeName[] = [
            ...generateTypes(1, makeArrays, userDefined),
            ...generateTypes(2, makeSimpleVariable, userDefined),
        ]

        if (Object.keys(userDefined).length != 0) {
            rawTypes.push(...generateTypes(1, makeUserDefined, userDefined))
        }

        let types = shuffle(rawTypes)

        let variables = types.map((type, i) => createStorageVariable(`val${i++}`, type));

        return {
            type: Type.UserDefinedTypeName,
            name: 'struct',
            members: variables,
        }
    }
}

class Scenario {
    pragma: string=DEFAULT_PRAGMA;
    userDefined: UserTypes={};
    variables: Variable[];

    // create UserDefined types (struct, enum)
    public createUserDefined() {
        for (let i=0; i<3; i++) {
            this.userDefined[`Defined${i}`] = createUserDefined(this.userDefined)
        }
    }

    public generateVariables() {
        let types: TypeName[] = shuffle([
            ...generateTypes(3, makeSimpleVariable, this.userDefined),
            // ...generateTypes(1, makeArrays, this.userDefined),
        ])

        this.variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));
    }

    public printContract(): string {
        return `pragma solidity ${this.pragma};

${printContract('Sample', this.variables, [], this.userDefined)}
`
    }
}

const sampl = `pragma solidity ^0.4.22;

contract Sample  {
    enum Defined0{
        H,
        P
    }
    struct Defined1{
        address val0;
        string val1;
        Defined0 val2;
        address val3;
        Defined0 val4;
        address[] val5;
        bytes21[] val6;
    }
    struct Defined2{
        bytes val0;
        Defined0 val1;
        uint72[] val2;
        int128[] val3;
        Defined0 val4;
        bytes val5;
        bytes val6;
    }
    bytes val0;
    Defined2 val1;
    uint96 val2;
    address val3;

    function set_val0(bytes val) public payable {
        val0 = val;
    }
    function set_val1(bytes val_0, Defined0 val_1, Defined0 val_2, bytes val_3, bytes val_4) public payable {
        val1.val0 = val_0;
        val1.val1 = val_1;
        val1.val4 = val_2;
        val1.val5 = val_3;
        val1.val6 = val_4;
    }
    function set_val2(uint96 val) public payable {
        val2 = val;
    }
    function set_val3(address val) public payable {
        val3 = val;
    }
}
`;

(async() => {

    // specific use cases
    
    return;

    await applyRandom(sampl);

})();

(async() => {

    // Example with structs (it does not modify structs yet)
    
    for (let i=0; i < 100; i++) {
        let scenario = new Scenario();
        scenario.createUserDefined()
        scenario.generateVariables();
    
        const sample = scenario.printContract();

        await applyRandom(sample);
    
        /*
        console.log(sample)
        let output = compile(sample);
    
        console.log("-- output --")
        console.log(output)
        */
    }
    
})();

//console.log(JSON.stringify(scenario.generateTypes(), null, 2))

/*
for (const name in scenario.userDefined) {
    console.log(name)
    console.log(printUserDefined(name, scenario.userDefined[name], scenario.userDefined))
}
*/

// console.log(scenario.printContract())

type Case = {
    name: string,
    chunks: TypeName[][]
    send?: any[]
}

/*
let types: TypeName[] = shuffle([
    ...generateTypes(5, makeSimpleVariable),
    ...generateTypes(2, makeUserDefined),
])

let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));

const sample = `pragma solidity ^0.4.22;

${printContract('Sample', variables)}
`

console.log(sample)

// 0x081bfa5e47025c3d9df11b003b38cf8096dcb9c432eed1f40c1fbf18434b
*/

const cases: Case[] = [
    {
        name: "Simple",
        chunks: [
            [
                /*
                {
                    type: Type.ArrayTypeName,
                    name: 'array',
                    base: {
                        type: Type.ElementaryTypeName,
                        name: 'bytes8',
                    }
                },
                */
                {
                    type: Type.ElementaryTypeName,
                    name: 'string'
                },
                /*
                {
                    type: Type.ElementaryTypeName,
                    name: 'bytes'
                }
                */
            ]
        ],
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

        await applyRandom(sample);
    }
})();

(async() => {

    // Different parents

    return;

    for (let i=0; i<100; i++) {
        let types: TypeName[] = shuffle([
            ...generateTypes(10, makeSimpleVariable),
        ])

        let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));

        let chunks = randChunkSplit(variables, 1, 3);
        let sampleText = printContractWithDifferentFathers(chunks);

        const sample = `pragma solidity ^0.4.22;

        ${sampleText.join('\n\n')}
        `

        console.log(sample);

        await applyRandom(sample);
    }
})();

// Arrays with push

(async() => {

    // Arrays as variables test

    return;

    for (let i=0; i<100; i++) {
        let types: TypeName[] = shuffle([
            ...generateTypes(5, makeSimpleVariable),
            ...generateTypes(1, makeArrays),
        ])
        
        let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));

        const sample = `pragma solidity ^0.4.22;

        ${printContract('Sample', variables)}
        `

        console.log(sample);

        await applyRandom(sample);
    }
})();

(async() => {

    // One contract

    return;

    let types: TypeName[] = shuffle([
        ...generateTypes(5, makeSimpleVariable),
    ])

    let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));

    const sample = `pragma solidity ^0.4.22;

    ${printContract('Sample', variables)}
    `
    
    applyRandom(sample);

})();

(async() => {
    
    // Linear contracts
    
    return;
    
    let types: TypeName[] = shuffle([
        ...generateTypes(10, makeSimpleVariable),
    ])

    let variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));

    let chunks = randChunkSplit(variables);
    let sampleText = printContractsLinear(chunks);

    const sample = `pragma solidity ^0.4.22;

    ${sampleText.join('\n\n')}
    `

    applyRandom(sample);

})();

async function applyRandom(sample: string) {
    
    console.log(sample)

    const output = compile(sample);
    const result = output.contracts[DEFAULT_FILENAME]['Sample'];

    const bin = result.evm.bytecode.object
    const abi = result.abi;
    const ast = output.sources[DEFAULT_FILENAME].ast;
    
    const contracts         = walkAndFind(ast, 'ContractDefinition');
    const contractsById     = arrayToObject(contracts, 'id')
    const contractsByName   = arrayToObject(contracts, 'name');

    const userTypes         = getUserTypes(contracts);

    //console.log("-- user types --")
    //console.log(JSON.stringify(userTypes, null, 4))

    const stateVariables    = getStateVariables(contractsByName['Sample'], contractsById)
    const {assignments}     = parseStorage(stateVariables.map(i => parseVariable(i, userTypes)))

    //console.log("-- asignments --")
    //console.log(JSON.stringify(assignments, null, 4))

    // throw Error('aux')

    const {contract} = await newContract(abi).deploy('0x' + bin)
    
    for (let i=0; i<=20; i++) {
        console.log("#####################################################")

        const assignment = getRandom(assignments);

        console.log(`${i}|${1000}`)
        console.log(assignment.Variable.name)
        
        // skip enum now
        if (assignment.Variable.type.name == 'enum' || assignment.Variable.type.name == 'struct') {
            continue
        }
        
        const realValue     = await generateRandomValues(assignment.Variable.type)

        console.log("-- real random value --")
        console.log(realValue)

        const transaction   = await contract.send('set_' + assignment.Variable.name, [realValue]);
        
        const state = new State(transaction.blockNumber as number, true); // disable cache
        state.setAddress(contract.address);
        
        const value = await decodeAssignment(state, assignment);

        console.log("-- get value --")
        console.log(value)
        
        try {
            // will throw if not correct
            expect(realValue.toString()).to.deep.equal(value.toString())
        } catch (err) {
            console.log(`${realValue}, ${value}`)
            console.log(assignment.Variable.type)
            throw Error('values dont match')
        }
        
        /*
        if (realValue != value.toString()) {
            throw Error('')
        }
        */
       
        /*
        if (value != realValue) {
            throw Error('')
        }
        */
        
        // realValue == value
    }
}
