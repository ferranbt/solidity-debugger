
// Generate random tests for storage variables

import newContract from './helpers/contract';
const crypto = require('crypto');

var expect = require('chai').expect

import {TypeName, Type, Variable, getBytes, parseVariable} from '../src/artifacts/variables';
import {decodeAssignment, parseStorage, State, decodeIntFromHex, Assignment, decode} from '../src/state';
import {arrayToObject} from '../src/utils';
import {walkAndFind} from '../src/artifacts/ast';
import {getStateVariables, getUserTypes} from '../src/artifacts/contracts';

import {compile, DEFAULT_FILENAME} from './helpers/compiler'
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
    'byte',
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

            let values0: any[] = [];
            let show0 = {};

            // for (const val of validMembers(type.members as Variable[])) {
            for (const variable of type.members as Variable[]) {

                let value;
                if (variable.type.name == 'array') {
                    value = []
                } else {
                    value = await generateRandomValues(variable.type); 

                    if (variable.type.name != 'struct') {
                        values0.push(value)
                    }
                }

                show0[variable.name] = value;
            }

            return {
                value: values0,
                show: show0
            }

        case 'enum':
            const values = type.values as string[]
            const value = getRandom(values);

            return {
                value: values.indexOf(value),
                show: value,
            }
        case 'array':
            const v = await Promise.all(range(0, randomNumber(0, 10)).map(i => generateRandomValues(type.base as TypeName)))
            return v
        default:
            return generateRandomElementaryTypes(type)
    }
}

const isArray   = (a) => (!!a) && (a.constructor === Array);
const isObject  = (a) => (!!a) && (a.constructor === Object);

export const getTransactionValues = (obj) => getParsedValues(obj, false);
export const getShowValues = (obj) => getParsedValues(obj, true);

// its always an array for now
function getParsedValues(obj, isShow: boolean) {
    if (isArray(obj)) {
        return obj.map(i => getParsedValues(i, isShow))
    } else if (isObject(obj)) {

        if (obj['show'] != undefined && obj['value'] != undefined) {
            return getParsedValues(isShow ? obj['show'] : obj['value'], isShow)
        }

        let res = {};
        for (const name in obj) {
            res[name] = getParsedValues(obj[name], isShow)
        }

        return res;
    }

    // normal value
    return obj  
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
export const validMembers = (variables: Variable[]): Variable[] => variables.filter(v => v.type.name != 'struct' && v.type.name != 'array')

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

export const printUserDefinedItems = (userDefined: UserTypes): string => Object.keys(userDefined).map(name => printUserDefined(name, userDefined[name], userDefined)).join('\n    ')

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

export function createUserTypes(n: number, name: string="Defined"): UserTypes {
    let userDefined: UserTypes={};

    for (let i=0; i<n; i++) {
        userDefined[`${name}${i}`] = createUserDefined(userDefined)
    }

    return userDefined;
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
            ...generateTypes(1, makeArrays, this.userDefined),
        ])

        this.variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));
    }

    public printContract(): string {
        return `pragma solidity ${this.pragma};

${printContract('Sample', this.variables, [], this.userDefined)}
`
    }
}

// To avoid putting a BN object every time on the test cases
// remove the object and convert the value to number
// convet bignumber objects into number in string format (i.e. '123')
export function toStringObj(obj) {
    if (isArray(obj)) {
        return obj.map(i => toStringObj(i))
    } else if (isObject(obj)) {
        let res = {};
        for (const name in obj) {
            res[name] = toStringObj(obj[name])
        }

        return res;
    } else if (obj.constructor.name == 'BN') {
        return obj.toString()
    }

    return obj  
}

import test from 'ava';

function cases0() {

    type Case = {
        source: string
        method?: string,
        params?: any[],
        variables: {[name: string]: any}
    }
    
    const cases: Case[] = [
        {
            source: `pragma solidity ^0.4.22;
contract Sample {
    struct A {
        int a;
    }
    bytes8 aux;
    A one;

    function test(int x) {
        one.a = x;
    }
}`,
            params: [10],
            variables: {
                'one': {
                    'a': '10'
                }
            }
        },
        {
            source: `pragma solidity ^0.4.22;
contract Sample {
    struct A {
        bytes8 aux;
        int[] a;
    }
    bytes8 aux;
    A one;
            
    function test() {
        one.aux = 0x1;
        one.a.push(10);
        one.a.push(20);
    }
}`,
            variables: {
                'one': {
                    'aux': '0x0000000000000001',
                    'a': ['10', '20']
                }
            }
        },
        {
            source: `pragma solidity ^0.4.22;
contract Sample {
    struct A {
        bytes8 aux;
        int[][] a;
    }
    bytes8 aux;
    A one;

    function test() {
        one.a.push([1, 2, 3]);
    }
}`,
            variables: {
                'one': {
                    'aux': '0x0000000000000000',
                    'a': [['1', '2', '3']]
                }
            }
        }
    ]
    
    for (const indx in cases) {
        test(`cases0_${indx}`, async t => {
        
            const c = cases[indx]
            const method = c.method || 'test'
            const params = c.params || [];
    
            const {contract, assignments} = await deployThings(c.source)
            
            const transaction = await contract.send(method, params);
            
            const state = new State(transaction.blockNumber as number, true);
            state.setAddress(contract.address);
    
            for (const name in c.variables) {
                const variable = c.variables[name];
                const assignment = assignments.filter(a => a.Variable.name == name)
                if (assignment.length != 1) {
                    throw Error(`Variable with name '${name}' not found`)
                }
    
                const value = await decodeAssignment(state, assignment[0]);
    
                /*
                console.log("-- expected --")
                console.log(variable)
    
                console.log("-- value --")
                console.log(value)
                
                console.log(toStringObj(value))
                */
                
                t.deepEqual(variable, toStringObj(value))
                // expect(variable).to.deep.equal(toStringObj(value));
            }

        })
    }
}

cases0();

/*
(async() => {

    await cases0();

})();
*/

// AVA TEST


(async() => {

    // Example with structs (it does not modify structs yet)

    return;

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

async function deployThings(sample: string) {

    const output = compile(sample);
    const result = output.contracts[DEFAULT_FILENAME]['Sample'];

    const bin = result.evm.bytecode.object
    const abi = result.abi;
    const ast = output.sources[DEFAULT_FILENAME].ast;
    
    const contracts         = walkAndFind(ast, 'ContractDefinition');
    const contractsById     = arrayToObject(contracts, 'id')
    const contractsByName   = arrayToObject(contracts, 'name');

    const userTypes         = getUserTypes(contracts);

    const stateVariables    = getStateVariables(contractsByName['Sample'], contractsById)
    const {assignments}     = parseStorage(stateVariables.map(i => parseVariable(i, userTypes)))

    const {contract} = await newContract(abi).deploy('0x' + bin)
    
    return {
        contract,
        assignments
    }
}

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
        /*
        if (assignment.Variable.type.name == 'enum' || assignment.Variable.type.name == 'struct') {
            continue
        }
        */

        const realValue  = await generateRandomValues(assignment.Variable.type)

        console.log("-- real random value --")
        console.log(realValue)

        console.log("-- transaction values --")
        console.log(getTransactionValues(realValue))
        
        console.log("-- show values --")
        console.log(getShowValues(realValue))
        
        let txvalues = getTransactionValues(realValue);
        
        console.log("-- tx values --")
        console.log(txvalues)

        if (assignment.Variable.type.name != 'struct') {
            txvalues = [txvalues]
        }
        
        const transaction = await contract.send('set_' + assignment.Variable.name, txvalues);
        
        const state = new State(transaction.blockNumber as number, true); // disable cache
        state.setAddress(contract.address);
        
        const value = await decodeAssignment(state, assignment);

        console.log("-- get value --")
        console.log(value)
        
        console.log("-- compared value --")
        console.log(getShowValues(realValue))
        
        try {
            /*
            // will throw if not correct
            console.log("- one -")
            console.log(getShowValues(realValue).toString())

            console.log("- two -")
            console.log(value.toString())
            */
            
            expect(getShowValues(realValue).toString()).to.deep.equal(value.toString())
        } catch (err) {
            console.log(`${realValue}, ${value}`)
            console.log(assignment.Variable.type)
            throw Error('values dont match')
        }
        
    }
}
