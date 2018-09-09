
import {decodeIntFromHex} from '../../src/state';
import {TypeName, Type, Variable, getBytes, parseVariable} from '../../src/artifacts/variables';
import {range, randomNumber, shuffle} from './utils';

const crypto = require('crypto');

type UserTypes = {[name: string]: TypeName}

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

export const validMembers = (variables: Variable[]): Variable[] => variables.filter(v => v.type.name != 'struct' && v.type.name != 'array')

/*
export async function generateStorateRandomValues(type: TypeName): Promise<any> {
    switch (type.name) {
        case 'struct':

            let values0: any[] = [];
            let show0 = {};

            for (const val of validMembers(type.members as Variable[])) {
                const x = await generateRandomValues(val.type);

                values0.push(x)
                show0[val.name] = x;
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
*/

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

const isArray   = (a) => (!!a) && (a.constructor === Array);
const isObject  = (a) => (!!a) && (a.constructor === Object);

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

export const printUserDefinedItems = (userDefined: UserTypes): string => Object.keys(userDefined).map(name => printUserDefined(name, userDefined[name], userDefined)).join('\n    ')

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

export const printVariables = (variables: Variable[]): string[] => variables.map(printTypeName);

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

import newContract from '../helpers/contract';
import {parseStorage} from '../../src/state';
import {arrayToObject} from '../../src/utils';
import {walkAndFind} from '../../src/artifacts/ast';
import {getStateVariables, getUserTypes} from '../../src/artifacts/contracts';

import {compile, DEFAULT_FILENAME} from '../helpers/compiler'

export async function deployStorageContract(sample: string) {

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
