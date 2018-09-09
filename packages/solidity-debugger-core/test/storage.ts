
import newContract from './helpers/contract';
import {parseVariable} from '../src/artifacts/variables';
import {decodeAssignment, parseStorage, State} from '../src/state';
import {arrayToObject} from '../src/utils';
import {walkAndFind} from '../src/artifacts/ast';
import {getStateVariables, getUserTypes} from '../src/artifacts/contracts';

import {compile, DEFAULT_FILENAME} from './helpers/compiler'
import {toStringObj, deployStorageContract} from './helpers/state';

import test from 'ava';

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
    },
    {
        source: `pragma solidity ^0.4.22;

contract Sample  {
    bytes val0;

    function set_val0(bytes val) public payable {
        val0 = val;
    }
}`,
        method: 'set_val0',
        params: ['0x012345'],
        variables: {
            'val0': '0x012345'
        }
    }
]

for (const indx in cases) {
    test(`storage_case_${indx}`, async t => {
        await applyCase(cases[indx], t);
    })
}

async function applyCase(c: Case, t) {
    const method = c.method || 'test'
    const params = c.params || [];

    const {contract, assignments} = await deployStorageContract(c.source)
    const transaction = await contract.send(method, params);

    const state = new State(transaction.blockNumber as number, true);
    state.setAddress(contract.address);

    for (const name in c.variables) {
        const variable = c.variables[name];
        const assignment = assignments.filter(a => a.Variable.name == name)
        if (assignment.length != 1) {
            t.fail(`Variable with name '${name}' not found`)
        }

        const value = await decodeAssignment(state, assignment[0]);

        console.log(value)
        t.deepEqual(variable, toStringObj(value))
    }
}
