
import {walk, walkAndFind} from './ast';

import {Nodex, LocationByOffset, Source, Sources } from '../types';

export function getCheckpoints(node: Nodex, source: LocationByOffset): number[] {
    let checkpoints: Set<number> = new Set();
    
    walkAndFind(node, 'FunctionDefinition').map(fn => {
        walk(fn).forEach(child => {
            let aux = child.src.split(':');
            
            let ini = parseInt(aux[0])
            let offset = parseInt(aux[1]);

            let start = source[ini];
            let end = source[ini + offset];

            if (start.line == end.line) {
                checkpoints.add(start.line)
            }
        })
    })

    return Array.from(checkpoints);
}

export function getLocationByOffset(str: string): LocationByOffset {
    let res = {};

    let line = 1;
    let column = 0;

    str.split('').map((char, offset) => {
        if (char === '\n') { // new line
            line = line + 1;
            column = 0;
        } else {
            column = column + 1;
        }

        res[offset] = {
            line,
            column,
        }
    })

    return res;
}
