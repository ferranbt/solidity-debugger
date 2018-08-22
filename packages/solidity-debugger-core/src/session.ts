
import {Sources, Breakpoints} from './types';
import {Assignment} from './state';
import {State, decode} from './state';
import {Step, Result, StepType} from './trace';
import {Transaction} from 'ethereum-types';

export enum Actions {  // TODO.

}

export default class Session {
    sources: Sources;
    transaction: Transaction;
    steps: Step[];
    breakpoints: Breakpoints;

    indx: number;
    direction: boolean;

    state: State;

    constructor(sources: Sources, transaction: Transaction, steps: Step[]) {
        this.transaction = transaction;
        this.sources = sources;
        this.steps = steps;

        this.indx = 0;
        this.direction = true;

        if (transaction.blockNumber == null) {
            throw Error(`Block number is null`)
        }

        // state should take a provider object
        this.state = new State(transaction.blockNumber - 1);
    }

    public setBreakpoints(breakpoints: Breakpoints) {
        this.breakpoints = breakpoints;
    }
    
    public getContext(): Step {
		return this.steps[this.indx]
    }
    
    public getSingleVariables(id: string): Assignment[] {
        let step = this.getContext();

        if (id == 'local') {
            return step.assignments.filter(x => !x.Variable.state)
        } else if (id == 'global') {
            return step.assignments.filter(x => x.Variable.state)
        }

        throw Error(`Id not found: ${id}. It should be either local or global`)
	}

    public async decode(variables: Assignment[]): Promise<{[variable: string]: any}> {
        return await decode(this.state, variables);
    }
    
	public async getVariables(id: string): Promise<[Assignment[], {[variable: string]: any}]> {
		let variables = this.getSingleVariables(id);

        // Merge variables and values
		let values = await decode(this.state, variables);

		return [variables, values];
    }
    
    public getLine(): string {
        let line = this.steps[this.indx];
        return this.sources[line.fileName].sliced[line.location.start.line-1]
    }
    
    async step(): Promise<boolean> {
        let line = this.steps[this.indx];
        this.state.setStep(line);
        
        this.indx += this.direction ? 1 : -1;
        if (this.indx == this.steps.length) {
            return true;
        }

        return false;
    }
}
