
import {getShowValues, validMembers, createUserTypes, makeSimpleVariable, toStringObj, makeArrays, shuffle, generateTypes, range, generateRandomValues} from './storage';
import {TypeName, Variable, getBytes} from '../src/artifacts/variables';
import {printUserDefinedItems} from './storage';
import {removeHexPrefix} from '../src/utils';
import {decodeAssignment, State} from '../src/state';
import {parseContractData} from '../src/artifacts/contracts';
import parseTrace, {StepType} from '../src/trace';

import newContract from './helpers/contract';
import {testAdapter} from './helpers/adapter';

import test from 'ava';

const createMemoryVariable = (name: string, type: TypeName): Variable => ({
    id: -1,
    name: name,
    location: 'memory', // actually not necessary
    type: type,
    scope: -1,
    state: true,
    bytes: getBytes(type),
});

// write some dont starts the variables, just write the values
// so that we can make recursive calls to writesome
// i.e. one struct creates an array
function writeSome(name: string, type: TypeName, value: any) {
    switch (type.name) {
        case 'array':
            return value.map((v, indx) => `${name}[${indx}] = ${v};`).join('\n')
        case 'struct':
            return (validMembers(type.members as Variable[])).map(v => writeSome(`${name}.${v.name}`, v.type, value[v.name])).join('\n')
        case 'enum':
            return `${name} = ${type.refName}.${value};`
        case 'string':
            return `${name} = "${value}";`
        case 'bytes':
            return `${name} = hex"${removeHexPrefix(value)}";`
        default:
            return `${name} = ${value};`
    }
}

// maybe just do that part for all of them.
function writeVariable(variable: Variable, value: any) {
    const {type, name} = variable;

    switch (type.name) {
        case 'string':
        case 'bytes':
            return `
                ${type.name} memory ${name};
                ${writeSome(name, type, value)}
            `
        case 'array':
            const base = type.base as TypeName;
            return `
                ${base.name}[] memory ${name} = new ${base.name}[](${value.length});
                ${writeSome(name, type, value)}
            `
        case 'struct':
            return `
                ${variable.type.refName as string} memory ${name};
                ${writeSome(name, type, toStringObj(getShowValues(value)))}
            `
        default:
            throw Error(`Value not found ${type.name}`)
    }
}

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
    },
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
    test(`cases0_${indx}`, async t => {
        await applyCase(cases[indx], t);
    })
}

for (let i=0; i<1; i++) {
    test(`random_${i}`, async t => {
        await generate(t);
    });
}

/*
// Random
(async() => {
    // return;

    await generate();
})();
*/

async function generate(t) {

    console.log("-- generate --")

    const userTypes = createUserTypes(5);

    console.log(userTypes)

    // Create variable types

    const avoid = [
        'int',
        'intx',
        'uint',
        'uintx',
        'address',
        'byte',
        'bytesx'
    ]
    
    let types: TypeName[] = shuffle([
        ...range(0, 2).map(i => makeSimpleVariable(userTypes, avoid)),
        ...generateTypes(2, makeArrays, userTypes),
    ])

    // Remove enum variables
    types = types.filter(type => type.name != 'enum');

    console.log(types)

    // create variables to have a name reference

    const variables = types.map((type, i) => createMemoryVariable(`val${i++}`, type));

    console.log(JSON.stringify(variables, null, 4))

    // create the results as the variable with a random value

    let values: {[name: string]: any} = {}
    let funcStr: string[] = [];
    for (const variable of variables) {
        const value = await generateRandomValues(variable.type);

        values[variable.name] = value;
        funcStr.push(writeVariable(variable, value))
    }

    let userTypesStr = printUserDefinedItems(userTypes)

    const sample = `pragma solidity ^0.4.22;

contract Sample {
    ${userTypesStr}

    function apply() {
        ${funcStr.join('\n')}

        int dummy = 0;
    }
}
`

    console.log(sample)

    const retrieved = await run(sample)
    
    // values generated by random program
    const cmp1 = toStringObj(getShowValues(values));

    // values retrieved
    const cmp2 = toStringObj(retrieved);

    console.log("-- values --")
    console.log(cmp1)

    console.log("-- retrieved --")
    console.log(cmp2)

    t.deepEqual(cmp1, cmp2)
}

async function run(sample: string, method: string='apply', params: any[] = []) {

    const adapter = testAdapter(sample);

    let data = await adapter.getContractData();
    let [contracts, sources] = parseContractData(data)
    
    let result = contracts['Sample']
    let {contract} = await newContract(result.abi).deploy(result.creation.raw as string);

    let transaction = await contract.send(method, params);

    let steps = await parseTrace(contracts, sources, transaction);

    // One before the return statemenet
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
