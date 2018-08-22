
import Provider from './provider';
import { Contracts } from './artifacts/contracts';
import { walkAndFind } from './artifacts/ast';
import { bytecodeId } from './utils';
import { parseVariable, Variable } from './artifacts/variables';

import { SingleFileSourceRange, Nodex, Sources, Bytecode } from './types';
import { Assignment} from './state';
import { parseStack } from './state';
import { List, Map, Set } from 'immutable';
import { Transaction } from 'ethereum-types';

function isLine(position: SingleFileSourceRange): boolean {
    // During the tests, if the last line is the last line of the contract position.end == undefined
    if (position.end == undefined || position.start == undefined) {
        return false;
    }
    return position.start.line == position.end.line
}

function contractCreationToken(index): string { 
    return `(Contract Creation - Step ${index})`
}

function isCall(log: any): boolean {    // TODO. Move to utils
    return log.op == "CALL" || log.op == "DELEGATECALL" || log.op == "CALLCODE"
}

export enum StepType {
    Function,
    Jump,
    Return,
    Line,
    Call,
    Create,
    Stop,
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

export type Context = {
    address: string,
    bytecode: string,
    contract: string,
    function: string,
    isExternal: boolean,
    isContructor: boolean,
}

const isReturn = (variable: Variable): boolean => variable.name.startsWith('<')

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
    cache: {[address: string]: {[slot: string]: string}}

    constructor(contracts: Contracts, sources: Sources) {
        this.provider = new Provider('http://localhost:8545');
        this.contracts = contracts;
        this.sources = sources;

        this.cache = {};

        // Lookup for bytecodes
        this.bytecodes = {};
        for (const name in this.contracts) {
            const contract = this.contracts[name];
            
            this.bytecodes[contract.creation.id] = {contract: name, bytecode: contract.creation};
            this.bytecodes[contract.deployed.id] = {contract: name, bytecode: contract.deployed};
        }
    }
    
    addContract(address: string, bytecodeId: string) {
        let bytecode = this.bytecodes[bytecodeId];
        if (bytecode == undefined) {
            throw Error(`Bytecode ${bytecodeId} not found`)
        }
        
        let contract = this.contracts[bytecode.contract]
        
        this.calls = this.calls.push({
            address: address,
            bytecode: bytecodeId,
            contract: contract.name,
            function: '',
            isExternal: true,
            isContructor: false
        });

        contract.globals.forEach(global => this.setOtherVariableWithScope(contract.node.id, global));
        contract.globals.forEach(global => this.setOtherVariable(global)) // if works with scope is better this way coz then nested contracts can see their own varaibles

        if (this.cache[address] == undefined) {
            this.cache[address] = {}
        }
    }
    
    addFunction(name: string) {
        let {address, contract, bytecode} = this.calls.get(-1);

        this.calls = this.calls.push({
            address,
            bytecode,
            contract,
            function: name,
            isExternal: false,
            isContructor: name == "constructor"
        });
    }

    // add return only removes the call
    addReturn() {
        this.calls = this.calls.pop();
        if (this.calls.get(-1).isExternal) {
            this.calls = this.calls.pop();
        }
    }

    setLocalVariable(node: Nodex, stack: number, isParameter: boolean=false) {
        // TODO. Make it work with memory and storage variables
        if (node.storageLocation == "storageLocation" || node.storageLocation == "memory") {
            return;
        }

        if (isParameter && node.name == "") {
            node.name = `<${stack}>`
        }
        
        let variable = parseStack(parseVariable(node, {}), stack);
        this.setOtherVariable(variable);
    }
    
    setContextByBytecode(bytecode: string) {
        this.addContract('creation', bytecodeId(bytecode))
    }

    async setContextByCreation(address: string, name: string) {
        if (this.contracts[name] == undefined) {
            throw Error(`Contract ${name} not found`)
        }
        this.addContract(address, this.contracts[name].creation.id)
    }

    async setContextByCall(address: string) {
        const code = await this.provider.getCode(address);
        this.addContract(address, bytecodeId(code))
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

    getCurrentBytecode(): Bytecode {
        return this.bytecodes[this.calls.get(-1).bytecode].bytecode;
    }

    getCurrentContract() {
        return this.contracts[this.calls.get(-1).contract];
    }

    findScope(id: number): number[] {
        let {parents, scopes} = this.getCurrentContract();

        let res: number[] = scopes[id] || [];
        while (res.length == 0) {
            id = parents[id]
            res = scopes[id] || [];
        }
        return [ ...res, id];
    }

    findAssignments(id: number): Assignment[] {
        let aux = this.findScope(id).map(x => this.scopes.get(x)).filter(i => i != undefined).map(i => i.toJS())
        
        // union of the nested sets in aux
        return Set([].concat.apply([], aux)).toJS();
    }

    async trace(transaction: Transaction): Promise<Step[]> {

        if (transaction.to == undefined) {
            throw Error(`Tx to is undefined ${transaction.hash}`)
        }

        if (transaction.to == '0x0') {
            // Contract creation
            this.setContextByBytecode(transaction.input);
        } else {
            // Call
            await this.setContextByCall(transaction.to)
        }
        
        const trace = await this.provider.debugTransaction(transaction.hash);

        let steps: Step[] = [];
        let lastLine: number = -1;

        for (const log of trace.structLogs) {
            if (this.calls.size == 0) {
                break;
            }

            const bytecode = this.getCurrentBytecode();
            const line = bytecode.source[log.pc];

            if (line == undefined) {
                continue
            }
            
            let step: undefined | StepType = undefined;

            // Return from constructor
            if (log.op == 'RETURN' && this.calls.get(-1).isContructor) {
                step = StepType.Return
            }

            // Return normal calls
            else if (line.srcmap.jump == 'o' && line.node.nodeType != 'ContractDefinition' /* && line.node.nodeType != "FunctionDefinition" */) {
                step = StepType.Return
            }
            
            // Call to another contract. Either 'DELEGATE_CALL', 'CALL' or 'CALLCODE'.
            else if (isCall(log)) {
                step = StepType.Call;
            }
            
            // Local variable declaration
            else if (line.node.nodeType == 'VariableDeclaration' && !line.node.stateVariable) {
                this.setLocalVariable(line.node, log.stack.length);
            }
            
            // Function definition line.opcode == "JUMPDEST" &&
            // Last function definition
            else if (line.node.nodeType == 'FunctionDefinition') {
                const next = bytecode.source[log.pc + 1];

                if (next != undefined && next.node.nodeType != 'FunctionDefinition') {
                    step = StepType.Function
                    
                    this.addFunction(line.node.name);
                    
                    const parameters = walkAndFind(line.node.parameters, 'VariableDeclaration').reverse();
                    const returns = walkAndFind(line.node.returnParameters, 'VariableDeclaration');
                    
                    returns.concat(parameters).reverse().forEach((variable, index) => {
                        this.setLocalVariable(variable, log.stack.length - 1 - index, true);
                    });
                }
            }
            
            // Jump to another function
            else if (line.srcmap.jump == 'i' && line.node.nodeType == 'FunctionCall') {
                step = StepType.Jump
            }
            
            // Line
            else if (isLine(line.location)) {
                if (line.node.nodeType != 'VariableDeclaration' && line.node.nodeType != 'ElementaryTypeName') {
                    let position = line.location.start.line;
                    if (position != lastLine) {
                        step = StepType.Line
                        lastLine = position;
                    }  
                }
            }

            if (step != undefined) {
                
                // if its jump or call, check the last, if its line remove it.
                if (step == StepType.Call || step == StepType.Jump) {
                    if (steps[steps.length - 1].type == StepType.Line) {
                        steps.splice(-1, 1)
                    }
                }
                
                // Between different calls, storage dont show the storage as it was modified previously
                let storage = log.storage;
                let address = this.calls.get(-1).address;
                storage = Object.assign(this.cache[address], log.storage);
                this.cache[address] = storage;
                
                // Variables for this scope. Return variables are only shown on Return step
                let variables = this.findAssignments(line.node.id)
                variables = variables.filter(x => !isReturn(x.Variable) !== (step == StepType.Return));    // XOR
                
                steps.push({
                    type: step,
                    assignments: variables,
                    calls: this.calls.toJS(),
                    fileName: line.fileName,
                    location: line.location,
                    state: {
                        memory: Object.assign([], log.memory),
                        stack: Object.assign([], log.stack),
                        storage: Object.assign([], storage),
                    },
                })
            }
            
            if (step == StepType.Return) {
                this.addReturn();
                lastLine = -1;
            }
            
            // set the context later
            if (log.op == 'CREATE') {
                this.setContextByCreation(contractCreationToken(log.pc),line.node.expression.typeName.name)
                this.addFunction('constructor');
            }

            if (isCall(log)) {
                const address = '0x' + log.stack[log.stack.length-2].substr(24, 64);
                await this.setContextByCall(address);
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
