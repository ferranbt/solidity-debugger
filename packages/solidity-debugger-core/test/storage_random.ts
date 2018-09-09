
import {range, randomNumber, shuffle, getRandom} from './helpers/utils';
import {TypeName, Variable, getBytes} from '../src/artifacts/variables';
import {deployStorageContract, makeUserDefined, makeSimpleVariable, makeArrays, generateTypes, printUserDefinedItems, printVariables, createUserTypes} from './helpers/state';
import {decodeAssignment, State} from '../src/state';
import {generateRandomValues, getTransactionValues, toStringObj, getShowValues} from './helpers/state';

import test from 'ava';

type UserTypes = {[name: string]: TypeName}

const DEFAULT_PRAGMA = "^0.4.22";

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

export const createStorageVariable = (name: string, type: TypeName): Variable => ({
    id: -1,
    name: name,
    location: 'storage',
    type: type,
    scope: -1,
    state: true,
    bytes: getBytes(type),
});

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
    let userTypesStr = printUserDefinedItems(userDefined)

    return `contract ${name} ${parent.length == 0 ? '' : 'is ' + parent.join(', ')} {
    ${userTypesStr}
    ${variables.join('\n    ')}

    ${functions.join('\n    ')}
}`
}

function generateRandomVariables(userTypes: UserTypes={}): Variable[] {
    let types: TypeName[] = shuffle([
        ...generateTypes(5, makeSimpleVariable, userTypes),
        ...generateTypes(5, makeArrays, userTypes),
    ])

    return types.map((type, indx) => createStorageVariable(`val${indx}`, type));
}

function generateRandomContract(pragma: string=DEFAULT_PRAGMA): string {
    const variables = generateRandomVariables();

    let contract;
    let aux = randomNumber(0, 10);
    if (aux < 3) {
        // Different parents
        let chunks  = randChunkSplit(variables, 1, 3);
        contract    = printContractWithDifferentFathers(chunks).join('\n\n');
    } else if (aux < 6) {
        // Linear contract
        let chunks  = randChunkSplit(variables);
        contract    = printContractsLinear(chunks).join('\n\n');
    } else {
        contract    = printContract('Sample', variables)
    }

    return `pragma solidity ${pragma};
    ${contract}
    `
}

function generateRandomContractWithStructs(): string {
    const userTypes = createUserTypes(5)

    let types: TypeName[] = shuffle([
        ...generateTypes(5, makeUserDefined, userTypes),
    ])

    const variables = types.map((type, indx) => createStorageVariable(`val${indx}`, type));

    return `pragma solidity ${DEFAULT_PRAGMA};
    ${printContract('Sample', variables, [], userTypes)}
    `
}

for (let i=0; i<50; i++) {
    test(`storage_random_normal_${i}`, async t => {
        await applyRandom(generateRandomContract(), t);
    })
}

/*
for (let i=0; i<50; i++) {
    test(`storage_random_userdefined_${i}`, async t => {
        await applyRandom(generateRandomContractWithStructs(), t);
    })
}
*/

async function applyRandom(sample: string, t: any, n: number=10) {
    const {contract, assignments} = await deployStorageContract(sample);

    for (let i=0; i<=n; i++) {
        const assignment = getRandom(assignments);

        const realValue  = await generateRandomValues(assignment.Variable.type)

        let txvalues = getTransactionValues(realValue);
        if (assignment.Variable.type.name != 'struct') {
            txvalues = [txvalues]
        }
        
        const transaction = await contract.send('set_' + assignment.Variable.name, txvalues);
        
        const state = new State(transaction.blockNumber as number, true); // disable cache
        state.setAddress(contract.address);
        
        const value = await decodeAssignment(state, assignment);
        
        t.deepEqual(toStringObj(value), toStringObj(getShowValues(realValue)))
    }

    t.pass();
}
