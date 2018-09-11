
import {shuffle} from './helpers/utils';
import {TypeName, Variable, getBytes} from '../src/artifacts/variables';
import {makeUserDefined, writeSome, generateTypes, printUserDefinedItems, printVariables, createUserTypes} from './helpers/state';
import {generateRandomValues, deployStorageContract, toStringObj, getShowValues} from './helpers/state';
import {decode, State} from '../src/state';

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

export const createStorageVariable = (name: string, type: TypeName): Variable => ({
    id: -1,
    name: name,
    location: 'storage',
    type: type,
    scope: -1,
    state: true,
    bytes: getBytes(type),
});

function generateRandomVariables(userTypes: UserTypes={}): Variable[] {
    let types: TypeName[] = shuffle([
        ...generateTypes(5, makeUserDefined, userTypes),
    ])

    return types.map((type, indx) => createStorageVariable(`val${indx}`, type));
}

for (let i=0; i<50; i++) {
    test(`storage_random_${i}`, async t => {
        await runRandom(t, 5);
    })
}

async function runRandom(t, n: number) {
    const userTypes = createUserTypes(5)
    const variables = generateRandomVariables(userTypes);

    for (let j=0; j<n; j++) {
        const funcs: string[] = [];
        const values: {[name: string]: any} = {};

        for (const variable of variables) {
            let value = toStringObj(getShowValues(await generateRandomValues(variable.type)));

            values[variable.name] = value;
            funcs.push(writeSome(variable.name, variable.type, value))
        }

        const sample = `pragma solidity ^0.4.22;

        contract Sample {
            
            ${printUserDefinedItems(userTypes)}
            ${printVariables(variables)}

            function apply() {
                ${funcs.join('\n')}
            }
        }`

        const {contract, assignments} = await deployStorageContract(sample);
        const transaction = await contract.send('apply', []);

        const state = new State(transaction.blockNumber as number, true);
        state.setAddress(contract.address);

        const result = toStringObj(await decode(state, assignments));
        t.deepEqual(result, values);
    }
}

// TODO: Bring back contracts with inheritance
