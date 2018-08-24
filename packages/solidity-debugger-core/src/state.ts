
import Provider from './provider';
import {Variable, getBytes, Type, TypeName} from './artifacts/variables';
import {extractHexByteSlice, pad} from './utils';
import {stripHexPrefix} from 'ethereumjs-util';
import {sha3_256, toBN, add} from './utils';
import {Step} from './trace';

var util = require('web3-utils');

interface StateStore {
    storage(slot: number | string): Promise<string>;
    memory(slot: number): string;
    stack(slot: number): string;
}

export class State {
    _provider: Provider;
    
    _memory: string[];
    _stack: string[];
    _storage: { [location: string]: string };

    _address: string;
    _blockNumber: number;

    _cache: {[address: string]: {[slot: string]: string}};
    _nocache: boolean=false;

    constructor(block: number, nocache: boolean=false) {
        this._provider = new Provider('http://localhost:8545');
        this._blockNumber = block;
        this._cache = {};
        this._storage = {};
        this._nocache = nocache;
    }
    
    setAddress(address) {
        this._address = address;
    }
    
    async storage(slot: number | string | any): Promise<string> {
        if (this._nocache) {
            return this._provider.getStorageAt(this._address, slot, this._blockNumber);
        }

        if (typeof slot === "number") {
            slot = pad(slot, 64);
        } else {
            slot = stripHexPrefix(slot.toString(16))
        }
        
        // cannot cache the result of the storage because it changes between steps so that if we move back we have incorrect values cached
        if (this._storage[slot] != undefined) {
            return this._storage[slot];
        }
        
        if (this._cache[this._address][slot] != undefined) {
            return this._cache[this._address][slot];
        }

        const value = await this._provider.getStorageAt(this._address, slot, this._blockNumber)
        this._cache[this._address][slot] = value;

        return value;
    }

    stack(position: number): string {
        if (position > this._stack.length) {
            throw Error('d')
        }
        return this._stack[position];
    }

    setStep(step: Step) {
        let address = step.calls[step.calls.length - 1].address;
        let {storage, memory, stack} = step.state;
        
        this._stack = stack;
        this._memory = memory;
        this._storage = storage;
        this._address = address;

        if (this._cache[address] == undefined) {
            this._cache[address] = {};
        }
    }
}

const WORD_SIZE = 0x20;

type Storage = {
    kind: "storage"
    slot: number | string,
    offset: number,
}

type Memory = {
    kind: "memory"
}

export type Stack = {
    kind: "stack"
    position: number
}

type Constant = {
    kind: "constant"
    value: any
}

type Location = Stack | Memory | Storage | Constant;

export type Assignment = {
    Variable: Variable,
    Bytes: number,
    Location: Location,
}

export const parseStack = (variable: Variable, stack: number): Assignment => ({
    Variable: variable,
    Bytes: getBytes(variable.type),
    Location: {
        kind: "stack",
        position: stack,
    }
})

export function parseStorage(variables: Variable[]): Assignment[] {
    let offset = 0;
    let slot = 0;
    
    let res: Assignment[] = [];
    for (var variable of variables) {

        let bytes = getBytes(variable.type);

        if (offset + bytes > 32) {
            slot++;
            offset = 0;
        }
        
        const SLOTS_USED = 1;

        res.push({
            Variable: variable,
            Bytes: bytes,
            Location: {
                kind: "storage",
                slot,
                offset
            }
        })

        if (SLOTS_USED === 1 && offset + bytes <= 32) {
            offset += bytes
        } else {
            slot != SLOTS_USED;
            offset = 0;
        }
    }

    return res;
}

var BN = require('ethereumjs-util').BN

export function decodeIntFromHex (value, byteLength, signed) {
    var bigNumber = new BN(stripHexPrefix(value), 16)
    
    if (signed) {
        bigNumber = bigNumber.fromTwos(8 * byteLength)
    }

    return bigNumber
    // return parseInt(bigNumber.toString(10))
}

const dummyVariable = (type: TypeName): Variable => ({
    id: 0,
    name: 'dummy',
    location: 'storage',
    type: type,
    bytes: getBytes(type),
    scope: 0,
    state: false,
})

const dummyStorageAssignment = (variable: Variable, bytes: number, slot: number | string, offset: number): Assignment => ({
    Variable: variable,
    Bytes: bytes,
    Location: {
        kind: "storage",
        slot: slot,
        offset: offset,
    }
})

var BN = require('ethereumjs-util').BN

async function read(state: State, assignment: Assignment): Promise<string> {
    switch (assignment.Location.kind) {
        case 'storage':
            let data = normalizeHex(await state.storage(assignment.Location.slot));
            return extractHexByteSlice(data, assignment.Bytes, assignment.Location.offset);
        case 'stack':
            return state.stack(assignment.Location.position)
        default:
            throw Error('Not found')
    }
}

function normalizeHex (hex) {
    hex = hex.replace('0x', '')
    if (hex.length < 64) {
      return (new Array(64 - hex.length + 1).join('0')) + hex
    }
    return hex
  }


// TODO. Some cases the while loop gets stuck in an infinite loop
async function decodeDynamicBytes(state: State, variable: Variable, location: Storage) {
    let value = await state.storage(location.slot)
    value = normalizeHex(value);
    value = extractHexByteSlice(value, 32, 0);

    var bn = new BN(value, 16)

    if (!bn.testn(0)) {
        var size = parseInt(value.substr(value.length - 2, 2), 16) / 2
        return value.substr(0, size * 2)
    }

    let ret = '0x';
    let length = parseInt(value, 16);

    var dataPos = new BN(sha3_256(location.slot).replace('0x', ''), 16)

    let currentSlot = await state.storage(dataPos); // Alreay with some data

    while (length > ret.length) {
        currentSlot = normalizeHex(currentSlot.replace('0x', ''))
        ret += currentSlot
        dataPos = dataPos.add(new BN(1))

        currentSlot = await state.storage(dataPos);
    }

    return ret.substr(0, length+1);
}

async function readRange(state: State, slot: string, slotbyte: number, offset: number, bytes: number): Promise<string> {
    let res = '';
    do {
        res = res + pad(stripHexPrefix(await state.storage(slot)), slotbyte);
        slot = '0x' + add(slot, 1).toString(16)
    } while((res.length/2) < bytes);
    return res.substr(offset, bytes-1)
}

async function decodeSlice(state: State, variable: Variable, location: Storage): Promise<any[]> {

    // get the underlying
    let base = variable.type.base;
    if (base == undefined) {
        throw Error('Array expects a base object but found undefined')
    }

    // Underlying type data
    const bytes = getBytes(base);
    const underlyingVariable = dummyVariable(base);
    
    const slotValue = await state.storage(location.slot);
    const size = toBN(slotValue).toNumber();
    
    /*
    console.log(bytes)

    console.log(size * underlyingVariable.bytes)
    console.log(size * underlyingVariable.bytes / 32);
    */

    let slot = sha3_256(location.slot);
    
    /*
    const xxx = await readRange(state, slot, bytes, 0, size * underlyingVariable.bytes);

    console.log("--- xxxx ---")
    console.log(xxx)
    
    console.log("-- OTHER --")
    */

    let offset = 0;

    // Again hardcode the number of slots. TODO: Change this.
    const SLOTS = 1;
    let res: any[] = [];

    for (var i=0; i<size; i++) {
        // console.log(`Slot: ${slot}`)

        let underlying = dummyStorageAssignment(underlyingVariable, bytes, slot, offset);

        const val = await _decodeStorage(state, underlying);
        // console.log(val)
        res.push(val);

        if (SLOTS === 1 && offset + bytes <= 32) {
            offset += bytes
            if (offset + bytes > 32) {
                offset = 0
                slot = '0x' + add(slot, 1).toString(16)
            }
        } else {
            slot = '0x' + add(slot, SLOTS).toString(16)
            offset = 0
        }

    }
    
    return res;
}

async function decodeStruct(state: State, variable: Variable, location: Storage): Promise<{}> {
    var ret = {}

    // create the offsets
    let members = variable.type.members;
    if (members == undefined) {
        throw Error('Members should not be undefined')
    }

    let members2 = parseStorage(members)

    for (var member of members2) {
        
        let loc = member.Location;
        if (loc.kind !== "storage") {
            throw Error('XX')
        }

        const offset = location.offset + loc.offset;
        const slot = add(location.slot, loc.slot);
        
        const underlying = dummyStorageAssignment(dummyVariable(member.Variable.type), member.Bytes, slot, offset);
        ret[member.Variable.name] = await _decodeStorage(state, underlying);
    }

    return ret;
}

export function getName(name: string): string {
    if (name.startsWith('uint')) {
        return 'uint'
    }

    if (name.startsWith('int')) {
        return 'int'
    }

    if (name.startsWith('bytes')) {
        return 'bytes'
    }

    return name
}

function _decodeEnum(data: string, assignment: Assignment): any {
    if (assignment.Variable.type.values == undefined) {
        throw Error('xx')
    }

    const members = assignment.Variable.type.values;
    if (!data) {
        return members[0]
    } else {
        let xx = parseInt(data, 16)
        if (members.length > xx) {
            return members[xx]
        } else {
            return 'INVALID'
        }
    }
}

function _decodeValue(data: string, assignment: Assignment): any {
    switch (getName(assignment.Variable.type.name)) {
        case "bool":
            return data !== '00'
        case "enum":
            return _decodeEnum(data, assignment)
        case "uint":
            return decodeIntFromHex(data, assignment.Variable.bytes, false)
        case "int":
            return decodeIntFromHex(data, assignment.Variable.bytes, true)
        case "address":
            return '0x' + data
        case "string":
            return data == '0' ? '' :  util.hexToString(data)
        case "bytes":
            return data.startsWith('0x') ? data : '0x' + data;
    }

    throw Error(assignment.Variable.type.name)
}

async function _decodeStorage(state: State, assignment: Assignment) {
    if (assignment.Location.kind != "storage") {
        throw Error('')
    }

    switch (assignment.Variable.type.name) {
        case 'array':
            return decodeSlice(state, assignment.Variable, assignment.Location);
        case 'mapping':
            return 'mapping'
        case 'struct':
            return decodeStruct(state, assignment.Variable, assignment.Location);
        case 'bytes':
        case 'string':
            const data = await decodeDynamicBytes(state, assignment.Variable, assignment.Location);
            return _decodeValue(data, assignment);
        default:
            /*
            console.log("-- decode --")
            console.log(assignment)
            */

            const xx = await read(state, assignment);

            /*
            console.log("-- xx --")
            console.log(xx)

            console.log("-- raw --")
            console.log(await state.storage(assignment.Location.slot))
            */

            return _decodeValue(xx, assignment)
    }
}

export async function decodeAssignment(state: State, assignment: Assignment): Promise<any> {
    switch (assignment.Location.kind) {
        case "storage":
            return _decodeStorage(state, assignment);
        case "stack":
            return _decodeValue(state.stack(assignment.Location.position), assignment);
        case "memory":
            return 'memory' // TODO. Retrieve state from memory
        default:
            throw Error(`State location kind ${assignment.Location.kind} not found.`)
    }
}

export async function decode(state: State, assignments: Assignment[]): Promise<{}> {
    let values = {};
    for (const assignment of assignments) {
        let result = 'undefined';
        try {
            result = await decodeAssignment(state, assignment)
        } catch (err) {
            // log
        }

        values[assignment.Variable.name] = result;
    }
    return values;
}
