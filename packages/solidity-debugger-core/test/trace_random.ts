
import {randomNumber, randomItemFromList, randomString, range} from './helpers/utils';
import {parseContractData} from '../src/artifacts/contracts';
import parseTrace from '../src/trace';

import newContract from './helpers/contract';
import {testAdapter} from './helpers/adapter';

function lessThan(i: number): boolean {
    return i < randomNumber(0, 100);
}

type CallType = 'DELEGATECALL' | 'JUMP' | 'CALL'

type Call = {
    kind: 'call'
    type: CallType
    contract: string
    funcname: string
}

// i.e int x = 0
type Plain = {
    kind: 'plain'
    content: string
}

type IfBlock = {
    kind: 'if',
    valid: boolean,
}

type ForBlock = {
    kind: 'for',
    i: string,
    n: number,
}

type Func = Statement[]

type Statement = Call | Plain | IfBlock | ForBlock

type Contract = {[name: string]: Func}

type Trace = {
    contract: string,
    funcname: string
}[]

function getRandomVariableName(): string {
    return randomString(10, 'abcdefghijklmno');
}

function removeDuplicates<T>(a: T[]): T[] {
    return Array.from(new Set(a));
}

function addTrace(t: Trace, contract: string, funcname: string): Trace {
    let t1 = Object.assign([], t);
    t1.push({contract, funcname})
    return t1
}

function getLast(t: Trace): {contract: string, funcname: string} {
    return t[t.length - 1]
}

const CIRCULAR_REFERENCE = 'Circular reference';

class Scenario {
    contracts: {[name: string]: Contract} = {}
    statements: ((t: Trace) => Statement | undefined)[] = [
        this.createDummy.bind(this),
        this.createJump.bind(this),
        this.createExternalCall.bind(this),
        this.createExternalCall.bind(this),
        this.createFor.bind(this),
        this.createIf.bind(this),
    ]
    
    getFunctions(contract: string, filter: string[]=[]): string[] {
        return Object.keys(this.contracts[contract]).filter(i => filter.indexOf(i) == -1)
    }

    getContracts(filter: string[]=[]): string[] {
        return Object.keys(this.contracts).filter(i => filter.indexOf(i) == -1)
    }

    createIf(t: Trace): IfBlock {
        return {
            kind: 'if',
            valid: randomItemFromList([true, false])
        }
    }

    createFor(t: Trace): ForBlock {
        return {
            kind: 'for',
            i: getRandomVariableName(),
            n: randomNumber(1, 10),
        }
    }

    createDummy(t: Trace): Plain {
        return {
            kind: 'plain',
            content: `int ${getRandomVariableName()} = 0;`
        }
    }
    
    createExternalCall(t: Trace): Call | undefined {
        let contract: string;
        let funcname: string;

        if (lessThan(30)) {
            // create contract and function
            const result = this.createContract();
            contract = result.contract
            funcname = result.funcname;
        } else {
            if (Object.keys(this.contracts).length == 1) {
                return undefined
            }

            contract = randomItemFromList(this.getContracts([getLast(t).contract]))
            if (lessThan(60)) {
                // Create a new function
                funcname = this.createFunction(t, contract);
            } else {
                // Use an existing function
                funcname = randomItemFromList(this.getFunctions(contract))
            }
        }
        
        if (funcname == undefined) {
            return undefined;
        }

        const type = randomItemFromList(['DELEGATECALL', 'CALL']) as CallType

        return {
            kind: 'call',
            type: type,
            contract: contract,
            funcname: funcname,
        }
    }

    createJump(t: Trace): Call | undefined {
        return undefined
    }

    createStatements(t: Trace): Statement[] {
        return range(0, randomNumber(1, 5)).map(i => randomItemFromList(this.statements)(t)).filter(i => i != undefined) as Statement[]
    }
    
    createFunction(t: Trace, contract: string): string {
        // function
        const funcname = `func_${Object.keys(this.contracts[contract]).length}`;
        this.contracts[contract][funcname] = this.createStatements(addTrace(t, contract, funcname));
        return funcname
    }
    
    createContract(t: Trace=[]): {contract: string, funcname: string} {
        // contract
        const contract = `Contract_${Object.keys(this.contracts).length}`
        this.contracts[contract] = {};

        const funcname = this.createFunction(t, contract);
        return {contract, funcname};
    }
}

function contractToObj(contract: string): string {
    return contract.replace('Contract_', 'obj_');
}

function printStatement(statement: Statement): string {
    if (statement.kind == 'plain') {
        return statement.content
    } else if (statement.kind == 'call') {
        switch (statement.type) {
            case 'DELEGATECALL':
                return `${contractToObj(statement.contract)}.delegatecall(bytes4(sha3("${statement.funcname}()")));`
            case 'CALL':
                return `${contractToObj(statement.contract)}.${statement.funcname}();`
            case 'JUMP':
                return `${statement.funcname}();`
            default:
                throw Error('')
        }
    } else if (statement.kind == 'if') {
        return `if (${statement.valid}) {
            int ${getRandomVariableName()} = 0;
        }`
    } else if (statement.kind == 'for') {
        const v = getRandomVariableName();

        return `int ${v} = 0;
        for (int ${statement.i}=0; ${statement.i}<${statement.n}; ${statement.i}++) {
            ${v} = ${statement.i};
        }`
    }

    throw Error('')
}

function getObjects(functions: Contract): string[] {
    const stms: Statement[] = [].concat.apply([], Object.keys(functions).map(f => functions[f]));
    
    const res = stms.map(i => {
        if (i.kind == 'call' && i.contract != '') {
            return i.contract
        }
    })

    return res.filter(i => i != undefined) as string[];
}

function printContract(name: string, contract: Contract) {
    const objects = removeDuplicates(getObjects(contract))

    // Declare Objects
    const declaration = objects.map(i => `${i} ${contractToObj(i)};`).join('\n')

    // Constructor creates objects
    const constructors = `function ${name}() {
            ${objects.map(i => `${contractToObj(i)} = new ${i}();`).join('\n')}
        }`
    
    // Create functions
    let funcs: string = Object.keys(contract).map(func => {
        const statements = contract[func].map(i => printStatement(i)).join('\n');

        return `function ${func}() {
            ${statements}
        }`
    }).join('\n')

    return `contract ${name} {
    ${declaration}
    ${constructors}
    ${funcs}
}`
}

function printContracts(contracts: {[name: string]: Contract}) {
    return `pragma solidity ^0.4.22;
    ${Object.keys(contracts).map(name => printContract(name, contracts[name])).join('\n')}
    `
}

/*
(async() => {

    for (let i=0; i<1000; i++) {
        console.log(i)

        let s = new Scenario()
        s.createContract();

        console.log(JSON.stringify(s.contracts, null, 4))

        const sample = printContracts(s.contracts)
        console.log(sample)
        
        try {
            const adapter = testAdapter(sample);

            let data = await adapter.getContractData();
            let [contracts, sources] = parseContractData(data)
            
            let result = contracts['Contract_0']
            let {contract, txhash} = await newContract(result.abi).deploy(result.creation.raw as string);
        
            let transaction = await contract.send('func_0', []);
            let steps = await parseTrace(contracts, sources, transaction);
            
            console.log(steps)
        } catch (err) {
            console.log("- err -")
            console.log(err)
            if(err.toString().indexOf(CIRCULAR_REFERENCE) != -1) {
                // skip it
            } else {
                throw Error(err)
            }
        }

        console.log("- done -")

    }

})();
*/
