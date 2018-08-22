
import {assert} from 'chai';

import {parseContractData} from '../src/artifacts/contracts';
import parseTrace, {StepType} from '../src/trace';

import newContract from './utils/contract';
import {testAdapter} from './utils/adapter';

import {cases, Case} from './trace_cases';

describe('Trace Table tests', () => {
    for (const tt of cases) {
        it(tt.name, async () => {
            await applyCase(tt);
        });
    }
});

async function applyCase(c: Case) {
    const adapter = testAdapter(c.source);

    let data = await adapter.getContractData();
    let [contracts, sources] = parseContractData(data)
    
    let result = contracts['Sample']
    let {contract, txhash} = await newContract(result.abi).deploy(result.creation.raw as string);

    let transaction = await contract.send(c.send[0], c.send.splice(1, c.send.length));

    let steps = await parseTrace(contracts, sources, transaction);

    /*
    // Real trace

    for (const step of steps) {
        console.log(`Line: ${step.location.start.line}. Type: ${StepType[step.type]}`)
    }
    */

    const lines = c.trace;
    if (lines.length != steps.length) {
        assert.fail(`Trace length ${lines.length} and the xpected dont match ${steps.length}`)
    }

    for (const indx in steps) {
        const step = steps[indx];
        const [line, type] = lines[indx];

        if (line != step.location.start.line) {
            assert.fail(`Line at indx ${indx}. Expected ${lines[indx][0]} but found ${step.location.start.line}`)
        }
        if (type != StepType[step.type]) {
            assert.fail(`Type at indx ${indx}. Expected ${lines[indx][1]} but found ${StepType[step.type]}`)
        }
    }
}
