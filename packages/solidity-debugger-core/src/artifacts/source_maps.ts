import * as _ from 'lodash';

import {getLocationByOffset, getCheckpoints} from './sources';
import parseOpcodes, {Opcode} from './opcodes';
import { Nodex, SourceRange, SourceLocation, Srcs, Sources, LocationByOffset, Bytecode } from '../types';
import { sha256, stripHexPrefix } from 'ethereumjs-util';

const RADIX = 10;

export type SourceMap = { [programCounter: number]: SourceRange }

export function parseSrcMap(srcMap): SourceLocation[] {
    let lastParsedEntry: SourceLocation = {} as any;

    return srcMap.split(';').map((entry: string, indx: number) => { 
        const current = entry.split(':');
        
        if (current[0]) {
            lastParsedEntry.offset = parseInt(current[0])
        }

        if (current[1]) {
            lastParsedEntry.length = parseInt(current[1])
        }

        if (current[2]) {
            lastParsedEntry.fileIndex = parseInt(current[2])
        }

        if (current[3]) {
            lastParsedEntry.jump = current[3]
        }

        if (lastParsedEntry.fileIndex !== -1) {
            return Object.assign({}, lastParsedEntry);
        } else {
            return undefined;
        }
    })
}

import { bytecodeId } from '../utils';

export function parseSourceMap(srcMap: string, bytecodeHex: string, sources: Srcs, nodeLookup: {[src: string]: Nodex}, isCreation: boolean=false): Bytecode {
    const pcToInstructionIndex: { [programCounter: number]: Opcode } = parseOpcodes(stripHexPrefix(bytecodeHex));
    
    let loc = parseSrcMap(srcMap);

    let fileIndexLookup = {}
    let offsets = {};

    for (const filename in sources) {
        fileIndexLookup[sources[filename].id] = filename;
        offsets[sources[filename].id] = getLocationByOffset(sources[filename].source)
    }
    
    const pcsToSourceRange: { [programCounter: number]: SourceRange } = {};
    for (const programCounterKey of _.keys(pcToInstructionIndex)) {
        const pc = parseInt(programCounterKey, RADIX);
        const instructionIndex: number = pcToInstructionIndex[pc].index;

        let aux = loc[instructionIndex];
        if (aux == undefined) {
            continue
        }

        let position = `${aux.offset}:${aux.length}:${aux.fileIndex}`;

        const node = nodeLookup[position];
        if (node == undefined) {
            continue
        }

        const source = sources[fileIndexLookup[aux.fileIndex]];
        
        pcsToSourceRange[pc] = {
            location: {
                start: offsets[aux.fileIndex][aux.offset],
                end: offsets[aux.fileIndex][aux.offset + aux.length],
            },
            opcode: pcToInstructionIndex[pc].opcode,
            srcmap: aux,
            position: position,
            fileName: source.filename,
            node: node,
        }
    }
    
    return {
        isCreation,
        source: pcsToSourceRange,
        id: bytecodeId(bytecodeHex),
        raw: bytecodeHex,
    }
}
