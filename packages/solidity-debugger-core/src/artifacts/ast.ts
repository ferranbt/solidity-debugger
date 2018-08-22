
import {Nodex} from '../types';

function isObject(val: any): Boolean {
    return val instanceof Object
}

export function walk(node: Nodex): Nodex[] {
    let nodes: Nodex[] = [node];
    let res: Nodex[] = [];

    while(nodes.length != 0) {
        let node = nodes.pop();
        
        if (node != undefined) {
            res.push(node)
            
            for (const i in node) {
                const val = node[i];

                if (Array.isArray(val)) {
                    for (const j of val) {
                        if (isObject(j)) {
                            nodes.push(Object.assign({}, j, {parent: node.id}))
                        }
                    }
                } else if (isObject(val)) {
                    nodes.push(Object.assign({}, val, {parent: node.id}))
                }
            }
        }
    }

    return res;
}

export function walkAndFind(node: Nodex, type: string): Nodex[] {
    return walk(node).filter(i => i.nodeType == type);
}
