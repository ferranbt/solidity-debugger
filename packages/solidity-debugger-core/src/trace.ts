
import Provider from './provider';
import { Contracts, UserTypes } from './artifacts/contracts';
import { walkAndFind, walk } from './artifacts/ast';
import { bytecodeId, arrayToObject, add } from './utils';
import { parseVariable, Variable } from './artifacts/variables';

import { SingleFileSourceRange, Nodex, Sources, Bytecode, SourceRange } from './types';
import { Assignment, parseMemory} from './state';
import { parseStack } from './state';
import { List, Map, Set } from 'immutable';
import { Transaction, StructLog } from 'ethereum-types';

function contractCreationToken(index): string { 
    return `(Contract Creation - Step ${index})`
}

function isCall(log: any): boolean {    // TODO. Move to utils
    return log.op == "CALL" || log.op == "DELEGATECALL" || log.op == "CALLCODE"
}

export enum StepType {
    // Start of the function
    FunctionIn,
    // End of the function (It does not include the return parameter)
    FunctionOut,
    // Jump, call, delegatecall, callcode, create (Everything that changes function)
    Jump,
    // Statements inside functions (assignment, for, if, return...)
    Line,
}

export type Step = {
    type: StepType,
    calls: Context[],
    assignments: Assignment[],
    location: SingleFileSourceRange,
    fileName: string,
    state: {
        memory: string[],
        stack: string[],
        storage: { [location: string]: string },
    }
}

export type Result = {
    block: number,
    steps: Step[],
}

const isReturn = (variable: Variable): boolean => variable.name.startsWith('<')

type Context2 = {
    bytecode: string,
    address: string,
}

export type Context = {
    address: string,
    function: string,
}

type Aux = {
    index: number,
    stepType?: StepType,
    node: Nodex,
    srcmap: SourceRange,
    history: Context2[],
    log: StructLog
}

function setType(t: StepType): ((Aux) => Aux) {
    return function(aux: Aux): Aux {
        return Object.assign({}, aux, {
            stepType: t
        })
    }
}

function collapse(result: Aux[]): Aux[] {
    let res: Aux[] =  []
    for (let i=result.length-1; i>0; i--) {
        if (result[i].node.id != result[i-1].node.id) {
            res.push(result[i-1]);
        }
    }
    return res;
}

function compare(a: Aux,b: Aux) {
    if (a.index < b.index)
      return -1;
    if (a.index > b.index)
      return 1;
    return 0;
}

// TODO. tests with scopes and other features

export class TraceManager {
    provider: Provider;
    contracts: Contracts;
    sources: Sources;

    bytecodes: {[id: string]: { // TODO. inmutable
        contract: string,
        bytecode: Bytecode,
    }}

    // internal calls in the contract
    calls: List<Context> = List();
    
    // scope and the variables for it
    scopes: Map<number, Set<Assignment>> = Map();

    // cache of the storage. sometimes between jumps of calls the storage field in the trace does not show all the storage
    // TODO. not sure if this is a problem outside ganache
    cache: {[address: string]: {[slot: string]: string}} = {};

    // Usertypes for the contracts
    userTypes: {[name: string]: UserTypes} = {};

    // id of the variables already stored
    variableIds: {[id: number]: boolean} = {};

    // node lookup for nodes depending on the src
    nodeLookup: {[contract: string]: {[src: string]: Nodex}} = {};

    constructor(contracts: Contracts, sources: Sources) {
        this.provider = new Provider('http://localhost:8545');
        this.contracts = contracts;
        this.sources = sources;
        
        // Lookup for bytecodes
        this.bytecodes = {};
        for (const name in this.contracts) {
            const contract = this.contracts[name];

            this.bytecodes[contract.creation.id] = {contract: name, bytecode: contract.creation};
            this.bytecodes[contract.deployed.id] = {contract: name, bytecode: contract.deployed};

            this.userTypes[name] = contract.userTypes;
            this.nodeLookup[name] = arrayToObject([].concat.apply([], walk(contract.node)), 'src')
        }
    }
    
    addContract(address: string, bytecodeId: string) {
        let bytecode = this.bytecodes[bytecodeId];
        if (bytecode == undefined) {
            throw Error(`Bytecode ${bytecodeId} not found`)
        }
        
        let contract = this.contracts[bytecode.contract]

        contract.globals.forEach(global => this.setOtherVariableWithScope(contract.node.id, global));
        contract.globals.forEach(global => this.setOtherVariable(global)) // if works with scope is better this way coz then nested contracts can see their own varaibles
        
        if (this.cache[address] == undefined) {
            this.cache[address] = {}
        }
    }

    setLocalVariable(node: Nodex, stack: number, isParameter: boolean=false) {
        // TODO. Make it work with memory and storage variables
        if (node.storageLocation == "storageLocation") {
            return;
        }
        
        if (isParameter && node.name == "") {
            node.name = `<${stack}>`
        }
        
        const variable = parseVariable(node, this.userTypes);

        // Check if variable is already there
        if (this.variableIds[variable.id] === true) {
            return
        }

        let assignment;
        switch (node.storageLocation) {
            case 'memory':
                assignment = parseMemory(variable, stack);
                break
            case 'default':
                assignment = parseStack(variable, stack);
                break
            default:
                throw Error(`Storage location not handled: ${node.storageLocation}`)
        }

        this.setOtherVariable(assignment);
        this.variableIds[variable.id] = true;
    }
    
    setOtherVariableWithScope(scope: number, variable: Assignment) {
        if (this.scopes.get(scope) == undefined) {
            this.scopes = this.scopes.update(scope, (x) => Set([variable]))
        } else {
            this.scopes = this.scopes.update(scope, (x) => x.add(variable))
        }
    }
    
    setOtherVariable(variable: Assignment) {
        this.setOtherVariableWithScope(variable.Variable.scope, variable)
    }
    
    findScope(bytecode: string, id: number): number[] {
        let {parents, scopes} = this.contracts[this.bytecodes[bytecode].contract];

        let res: number[] = scopes[id] || [];
        while (res.length == 0) {
            id = parents[id]
            res = scopes[id] || [];
        }
        return [ ...res, id];
    }

    findAssignments(bytecode: string, id: number): Assignment[] {
        let aux = this.findScope(bytecode, id).map(x => this.scopes.get(x)).filter(i => i != undefined).map(i => i.toJS())
        
        // union of the nested sets in aux
        return Set([].concat.apply([], aux)).toJS();
    }

    async trace(transaction: Transaction): Promise<Step[]> {
        
        if (transaction.to == undefined) {
            throw Error(`Tx to is undefined ${transaction.hash}`)
        }

        let created = 0;

        let id;
        let address;
        if (transaction.to == '0x0') {
            // Contract creation
            address = contractCreationToken('0')
            id = bytecodeId(transaction.input)

            created = 1;
        } else {
            // Call
            address = transaction.to;
            id = bytecodeId(await this.provider.getCode(transaction.to));
        }
        
        const trace = await this.provider.debugTransaction(transaction.hash);

        let history: Context2[] = [{
            bytecode: id,
            address: address,
        }];
        
        let result: Aux[] = [];

        let count = 0;
        for (const indx in trace.structLogs) {
            const log = trace.structLogs[indx]

            const bytecode = this.bytecodes[history[history.length - 1].bytecode]
            const srcmap = bytecode.bytecode.source[log.pc];
            
            if (srcmap == undefined) {
                continue
            }

            if (srcmap.opcode != log.op) {
                throw Error(`Opcodes dont match: ${srcmap.opcode} ${log.op}`)
            }

            if (srcmap.node == undefined) {
                continue
            }

            const node = srcmap.node;
            if (node.nodeType == 'VariableDeclaration') {
                this.setLocalVariable(node, log.stack.length);
            }

            // Call
            if (log.op == 'DELEGATECALL' || log.op == 'CALL') {
                const address = '0x' + log.stack[log.stack.length - 2].substr(24, 64);
                const destiny = bytecodeId(await this.provider.getCode(address));

                history.push({
                    bytecode: destiny,
                    address: address,
                });
            }

            // Create contract
            else if (log.op == 'CREATE') {
                const id = this.contracts[node.expression.typeName.name].creation.id;

                history.push({
                    bytecode: id,
                    address: contractCreationToken(created)
                })

                created++;
            }

            // Return from constructor (RETURN is from constructor and STOP is from function)
            else if (log.op == 'RETURN' || log.op == 'STOP') {
                history.splice(-1, 1)
            }

            result.push({
                index: count,
                node: Object.assign({}, node),
                srcmap: Object.assign({}, srcmap),
                history: Object.assign([], history),
                log: Object.assign({}, log),
            })

            count++;
        }
        
        if (history.length != 0) {
            throw Error(`History must be zero at the end but found: ${history.length}`)
        }

        const resultByIndex = arrayToObject(result, 'index');
        
        const nextFunctionDefinition = (index: number) => {
            for (let j=index; j<result.length; j++) {
                const case1 = resultByIndex[j.toString()];
                const case2 = resultByIndex[(j+1).toString()];

                if (case1.node.nodeType == 'FunctionDefinition' && case2.node.nodeType != 'FunctionDefinition') {
                    return case1
                }
            }

            throw Error('nothing found')
        }

        // Calls to other functions (DELEGATE CALL, CALL, Function JUMP)
        const functionCalls = result.filter(n => (n.srcmap.srcmap.jump == 'i' && n.node.nodeType == 'FunctionCall') || isCall(n.log)).map(setType(StepType.Jump));
        
        // Function definitions
        const functionDef = functionCalls.map(i => nextFunctionDefinition(i.index)).map(setType(StepType.FunctionIn));
        
        // Returns from a function
        const functionReturn = result.filter(n => n.log.op == 'RETURN' || (n.srcmap.srcmap.jump == 'o' && n.node.nodeType != 'ContractDefinition')).map(setType(StepType.FunctionOut));

        // Body
        const simpleTypes = [
            'Assignment',
            'VariableDeclarationStatement',
            'Return'
        ]

        const branchTypes = [
            'IfStatement',
            'ForStatement'
        ]

        const bodySmtm      = collapse(result);
        const simpleStmts   = bodySmtm.filter(n => simpleTypes.indexOf(n.node.nodeType) != -1).map(setType(StepType.Line));
        const branchStmts   = bodySmtm.filter(n => branchTypes.indexOf(n.node.nodeType) != -1 && n.log.op as string == 'JUMPI').map(setType(StepType.Line));

        const smts: Aux[] = [
            ...functionCalls,
            ...functionDef,
            ...functionReturn,
            ...simpleStmts,
            ...branchStmts,
            setType(StepType.FunctionIn)(nextFunctionDefinition(0))
        ]

        smts.sort(compare)

        let steps: Step[] = [];
        
        let otherHistory: Context[] = [];
        for (const i of smts) {
            const stepType = i.stepType as StepType;
                            
            // Function declaration
            if (stepType == StepType.FunctionIn) {
                // check for a different contract
                if (otherHistory.length == 0 || i.history[i.history.length - 1].address != otherHistory[otherHistory.length -1].address) {
                    this.addContract(i.history[i.history.length - 1].address, i.history[i.history.length - 1].bytecode)
                }
                
                otherHistory.push({
                    address: i.history[i.history.length - 1].address,
                    function: i.node.name
                })

                const parameters    = walkAndFind(i.node.parameters, 'VariableDeclaration').reverse();
                const returns       = walkAndFind(i.node.returnParameters, 'VariableDeclaration');
                
                returns.concat(parameters).reverse().forEach((variable, index) => {
                    this.setLocalVariable(variable, i.log.stack.length - 1 - index, true);
                });
            }
            
            let assignments: Assignment[] = [];
            if (stepType != StepType.FunctionOut) {
                assignments = this.findAssignments(i.history[i.history.length - 1].bytecode, i.node.id)
                assignments = assignments.filter(x => !isReturn(x.Variable) !== (i.node.nodeType == 'Return'));    // XOR
            }

            // Between different calls, storage dont show the storage as it was modified previously
            let storage = i.log.storage;
            let address = otherHistory[otherHistory.length - 1].address;
            storage = Object.assign(this.cache[address], i.log.storage);
            this.cache[address] = storage;

            steps.push({
                type: i.stepType as StepType,
                calls: Object.assign([], otherHistory),
                assignments: assignments,
                fileName: i.srcmap.fileName,
                location: i.srcmap.location,
                state: {
                    memory: Object.assign([], i.log.memory),
                    stack: Object.assign([], i.log.stack),
                    storage: Object.assign([], storage),
                },
            })

            // Function return
            if (stepType == StepType.FunctionOut) {
                // Safe check, the function we return from is the last one on the stack
                if (i.node.name != otherHistory[otherHistory.length - 1].function) {
                    throw Error('')
                }

                otherHistory.splice(-1, 1)
            }
        }

        return steps;
    }
}

export default async function parseTrace(contracts: Contracts, sources: Sources, transaction: Transaction): Promise<Step[]> {
    let traceManager = new TraceManager(contracts, sources);
    let steps = await traceManager.trace(transaction)
    return steps;
}
