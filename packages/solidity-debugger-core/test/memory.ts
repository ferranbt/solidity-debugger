
import {toStringObj} from './helpers/state';
import {decodeAssignment, State} from '../src/state';
import {parseContractData} from '../src/artifacts/contracts';
import parseTrace from '../src/trace';

import newContract from './helpers/contract';
import {testAdapter} from './helpers/adapter';

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
            enum Defined3{
                Z,
                X,
                R
            }    
            struct Defined4{
                bytes val1;
                Defined3 val2;
                uint232[] val3;
                bytes13[] val4;
                address val5;
                int40 val6;
            }
            
            function apply() {
                Defined4 memory val;
                val.val1 = hex"02a86e26fdca6a172f9f20aeb1b48da939634c362f52e0d38f869b583f991d73ac3c1a9804e328554c2f82a73c";
                val.val2 = Defined3.Z;
    
                val.val3 = new uint232[](3);
                val.val3[0] = 1;
                val.val3[1] = 2;
                val.val3[2] = 3;
                
                val.val5 = 0x852ff60dc709d03e0280a47e999fe5b282900a47;
                val.val6 = 111111;

                int dummy = 0;
            }
        }`,
        variables: {
            'val': {
                'val1': '0x02a86e26fdca6a172f9f20aeb1b48da939634c362f52e0d38f869b583f991d73ac3c1a9804e328554c2f82a73c',
                'val2': 'Z',
                'val3': ['1','2','3'],
                'val4': [],
                'val5': '0x852ff60dc709d03e0280a47e999fe5b282900a47',
                'val6': '111111'
            },
        }
    },
    {
        source: `pragma solidity ^0.4.22;

        contract Sample {
            struct Defined4{
                bytes val0;
                int[] val1;
                int val2;
            }
            
            function apply() {
                Defined4 memory val;
                val.val0 = hex"1122334455";
                val.val2 = 111111;

                int dummy = 0;
            }
        }`,
        variables: {
            "val": {
                'val0': '0x1122334455',
                'val1': [],
                'val2': '111111'
            }
        }
    },
    {
        source: `pragma solidity ^0.4.22;

        contract Sample {
            function apply() {
                bytes memory val = hex"02a86e26fdca6a172f9f20aeb1b48da939634c362f52e0d38f869b583f991d73ac3c1a9804e328554c2f82a73c";
                
                bytes8[] memory val3 = new bytes8[](2);
                val3[0] = 0x1111111;
                val3[1] = 0x2222222;

                uint232[] memory val2 = new uint232[](3);
                val2[0] = 1;
                val2[1] = 2;
                val2[2] = 3;

                string memory val4 = "qwertzuiopasdfghjkl";

                int dummy = 0;
            }
        }`,
        variables: {
            "val": '0x02a86e26fdca6a172f9f20aeb1b48da939634c362f52e0d38f869b583f991d73ac3c1a9804e328554c2f82a73c',
            'val2': ['1','2','3'],
            "val3": ['0x0000000001111111', '0x0000000002222222'],
            "val4": 'qwertzuiopasdfghjkl'
        }
    },
    {
        source: `pragma solidity ^0.4.22;

        contract Sample {
            struct B {
                int b;
            }
            struct A {
                int a;
                B b;
            }
            function apply() {
                A memory val;
                val.a = 1;

                int dummy = 0;
            }
        }`,
        variables: {
            "val": {
                "a": '1',
                "b": {
                    "b": '0'
                }
            }
        }
    }
];

async function applyCase(c: Case, t: any) {
    const values = await run(c.source, c.method, c.params);

    for (const name in c.variables) {
        const expected = c.variables[name];

        const retrieved = values[name]
        if (retrieved == undefined) {
            t.fail(`Not values found for ${name}`)
        }
        
        t.deepEqual(expected, toStringObj(retrieved))
    }
}

for (const indx in cases) {
    test(`memory_case_${indx}`, async t => {
        await applyCase(cases[indx], t);
    })
}

export async function run(sample: string, method: string='apply', params: any[] = []) {

    const adapter = testAdapter(sample);

    let data = await adapter.getContractData();
    let [contracts, sources] = parseContractData(data)
    
    let result = contracts['Sample']
    let {contract} = await newContract(result.abi).deploy(result.creation.raw as string);

    let transaction = await contract.send(method, params);

    let steps = await parseTrace(contracts, sources, transaction);

    // One before the return statement
    const stmt = steps[steps.length - 2]

    const state = new State(transaction.blockNumber as number, true); // disable cache
    state.setStep(stmt)
    state.setAddress(contract.address);
    
    let values: {[name: string]: any} = {}
    for (const assignment of stmt.assignments) {
        if (assignment.Location.kind != "memory") {
            continue
        }

        values[assignment.Variable.name] = await decodeAssignment(state, assignment);
    }

    return values;
}
