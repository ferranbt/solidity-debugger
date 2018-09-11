
import {parseContractData} from '../src/artifacts/contracts';
import parseTrace, {StepType, Step} from '../src/trace';
import {toStringObj} from './helpers/state';

import newContract from './helpers/contract';
import {testAdapter} from './helpers/adapter';
import {decodeAssignment, State, Assignment} from '../src/state';

import test from 'ava';
import { Transaction } from 'ethereum-types';

type TraceCase = {
    stepType?:  StepType                    // Type of the step
    variables?: {[name: string]: any},      // Variable names and the values
    calls?: string[],                       // Name of the stack calls
    location?:  number                      // Start of the line
}

type Case = {
    name: string,
    contract?: string,
    method?: string,
    params?: any[],
    trace: TraceCase[],
    source: string,
}

const DEFAULT_CONTRACT  = 'Sample';
const DEFAULT_METHOD    = 'set';

const cases: Case[] = [
    {
        name: "Call to parent contract",
        method: 'set',
        params: ['2'],
        trace: [
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Jump},
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Jump},
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line},
            {stepType: StepType.FunctionOut},
            {stepType: StepType.FunctionOut},
            {stepType: StepType.FunctionOut}
        ],
        source: `pragma solidity ^0.4.22;
contract Other {
    int i;
    function xx(int n) {        // 4
        i = n;                  // 5
    }
}

contract Sample is Other {
    function other(int n) {     // 10
        xx(n);                  // 11
    }
    function set(int n) {       // 13
        other(n);               // 14
    }
}
`
    },
    {
        name: "Modifier from parent",
        trace: [
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line, location: 6},
            {stepType: StepType.Line},
            {stepType: StepType.Line, location: 8},
            {stepType: StepType.FunctionOut},
        ],
        source: `pragma solidity ^0.4.22;

contract A {
    int i;
    modifier simple(int _i) {
        i = _i;
        _;
        i = _i + 1;
    }
}
        
contract Sample is A {
    function set() simple(1) {
        int i = 0;
    }
}`
    },
    {
        name: "For loop",
        params: [3],
        trace: [
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line},
            {stepType: StepType.Line},
            {stepType: StepType.Line, location: 7, variables: {i: '0'}},
            {stepType: StepType.Line, variables: {o: '1'}},
            {stepType: StepType.Line, location: 7, variables: {i: '1'}},
            {stepType: StepType.Line, variables: {o: '2'}},
            {stepType: StepType.Line, location: 7, variables: {i: '2'}},
            {stepType: StepType.Line, variables: {o: '3'}},
            {stepType: StepType.FunctionOut},
        ],
        source: `pragma solidity ^0.4.22;

contract Sample {
    function set(int n) {
        int o = 0;

        for (int i=0; i<n; i++) {   // 7
            o = i + 1;
        }
    }
}`
    },
    {
        name: 'Modifiers',
        params: [[1, 2]],
        trace: [
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line, location: 6},
            {stepType: StepType.Line, location: 6},
            {stepType: StepType.Jump},
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line},
            {stepType: StepType.FunctionOut},
            {stepType: StepType.Line},
            {stepType: StepType.Line},
            {stepType: StepType.Line, location: 8},
            {stepType: StepType.Line, location: 8},
            {stepType: StepType.FunctionOut},
        ],
        source: `pragma solidity ^0.4.22;
contract Sample {
    int i;
    
    modifier example(int j) {
        i = j;      // 6
        _;          
        i = j + 1;  // 8
    }
    function other(int j, int i) returns (int) {
        return j + i + 1;
    }
    function set(   // 13
        int[] v
    ) 
    example(v[0])  // 16
    example(v[1])  // 17
    {
        i = v[0] + v[1] + other(1, v[0]);
        int j = v[1] + i;
    }
}`
    },
    {
        name: 'Multiple calls to same contract',
        trace: [
            {},
            {},
            {},
            {},
            {},
            {},
            {
                stepType: StepType.FunctionIn,
                variables: {
                    'i': '1',
                }
            },
            {},
            {},
            {},
        ],
        source: `pragma solidity ^0.4.22;

contract A {
    int i;
    
    function setI(int _i) {
        i = _i;
    }
}

contract Sample {
    A a;

    function Sample() {
        a = new A();
    }

    function set() {
        a.setI(1);
        a.setI(2);
    }
}
`
    },
    {
        name: 'Multiple calls methods',
        trace: [
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Jump},
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line},
            {stepType: StepType.FunctionOut},
            {stepType: StepType.Line},
            {stepType: StepType.Jump},
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Jump},
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line},
            {stepType: StepType.FunctionOut},
            {stepType: StepType.Line},
            {stepType: StepType.FunctionOut},
            {stepType: StepType.Jump},
            {stepType: StepType.FunctionIn},
            {stepType: StepType.Line},
            {stepType: StepType.FunctionOut},
            {stepType: StepType.Line},
            {stepType: StepType.Line},
            {},
            {},
            {},
            {},
            {},
            {},
            {},
            {stepType: StepType.FunctionOut},
        ],
        source: `pragma solidity ^0.4.22;
contract A {
    int i;
    function A() {  // 4
        i = 1;
    }

    function xx() {        // 8
        i = 2;
    }
}

contract B {
    uint o;
}

contract Sample is B {
    A a;
    A a2;
    uint j;

    function Sample() {
        a2 = new A();
        j = 0;
    }

    function other() returns (int) {  // 27
        a.delegatecall(bytes4(sha3("xx()")));
        return 1;
    }
    
    function set() { // 32
        a = new A();
        other();
        a2.xx();

        if (j == 0) { // 37
            j = 2;
        }

        for (uint i=0; i<3; i++) {  // 41
            j = i;
        }
    }
}
`
    }
]

for (const cc of cases) {
    test(cc.name, async t => {
        await applyCase(cc, t);
    });
}

async function checkStep(indx: string, t, step: Step, trace: TraceCase, transaction: Transaction) {
    
    const fail = (place: string, expected: any, found: any) => {
        t.fail(`${indx}. ${place}: Expected ${expected} but found ${found}`)
    }

    // steptype
    if (trace.stepType != undefined) {
        if (trace.stepType != step.type) {
            fail('Steptype', StepType[trace.stepType], StepType[step.type])
        }
    }

    // calls
    if (trace.calls != undefined) {
        t.deepEqual(step.calls.map(i => i.function), trace.calls)
    }
    
    // variables
    if (trace.variables != undefined) {
        let assignmentsByName: {[name: string]: Assignment} = {}
        for (const assignment of step.assignments) {
            assignmentsByName[assignment.Variable.name] = assignment;
        }

        const state = new State(transaction.blockNumber as number - 1);
        state.setStep(step)
        state.setAddress(step.calls[step.calls.length - 1].address);

        for (const variable in trace.variables) {
            const assignment = assignmentsByName[variable]
            if (assignment == undefined) {
                t.fail(`Assignment ${variable} not found`)
            }

            const value = await decodeAssignment(state, assignment);
            t.deepEqual(trace.variables[variable], toStringObj(value))
        }
    }

    // location
    if (trace.location != undefined) {
        if ((trace.location as number) != step.location.start.line) {
            fail('Location', trace.location, step.location.start.line)
        }
    }
}

async function applyCase(c: Case, t: any) {
    const adapter = testAdapter(c.source);

    let data = await adapter.getContractData();
    let [contracts, sources] = parseContractData(data)
    
    let result = contracts[c.contract || DEFAULT_CONTRACT]
    let {contract, txhash} = await newContract(result.abi).deploy(result.creation.raw as string);

    let transaction = await contract.send(c.method || DEFAULT_METHOD, c.params || []);

    let steps = await parseTrace(contracts, sources, transaction);

    if (steps.length != c.trace.length) {
        t.fail(`Step and trace mismatch: ${steps.length} and ${c.trace.length}`)
    }

    for (const indx in steps) {
        await checkStep(indx, t, steps[indx], c.trace[indx], transaction)
    }
    
    t.pass();
}
