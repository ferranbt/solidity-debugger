
// all the variables stuff
import {Nodex} from '../types'
import {UserTypes} from './contracts';
import {parseStorage} from '../state';

// TODO. when creating the assignment check for the location string.
export const parseVariable = (node: Nodex, data: {[contract: string]: UserTypes}={}): Variable => ({
    id: node.id,
    name: node.name,
    location: node.stateVariable ? 'storage' : (node.storageLocation == 'default' ? 'stack' : 'memory'),
    type: parseType(node.typeName, data),
    scope: node.scope,
    state: node.stateVariable,
    bytes: getBytes(parseType(node.typeName, data)),    // not fancy
})

export enum Type {
    ElementaryTypeName,
    UserDefinedTypeName,
    ArrayTypeName,
    Mapping,
}

export type TypeName = {
    type: Type,
    name: string,   
    base?: TypeName,        // arrays
    refName?: string        // structs
    members?: Variable[],   // structs
    keyType?: TypeName,     // mapping
    valueType?: TypeName,   // mapping
    values?: string[],      // enums
}

export type Variable = {
    id: number,
    name: string,
    location: string,
    type: TypeName,
    scope: number,
    state: boolean,
    bytes: number,
}

export function parseType(x: Nodex, data: {[contract: string]: UserTypes}): TypeName {
    switch (x.nodeType) {
        case "ElementaryTypeName":
            return {
                type: Type.ElementaryTypeName,
                name: x.name,
            }
        case "ArrayTypeName":
            return {
                type: Type.ArrayTypeName,
                name: 'array',
                base: parseType(x.baseType, data)
            }
        case "Mapping":
            return {
                type: Type.Mapping,
                name: 'mapping',
                keyType: parseType(x.keyType, data),
                valueType: parseType(x.valueType, data),
            }
        case "UserDefinedTypeName":
            let type = x.typeDescriptions.typeString;

            if (type.startsWith('struct')) {
                type = type.replace("struct ", "")
                
                // TODO. raise error when not found the struct, same with enum

                // contract
                const [contract, struct] = type.split('.')
                let x = {
                    name: 'struct',
                    type: Type.UserDefinedTypeName,
                    members: data[contract].structs[struct].members,
                }

                return x
            }  

            if (type.startsWith('enum')) {
                type = type.replace("enum ", "")

                // contract
                const [contract, enm] = type.split('.');
                return {
                    name: 'enum',
                    type: Type.UserDefinedTypeName,
                    values: data[contract].enums[enm].values,
                }
            }

            if (type.startsWith('contract')) {
                type = type.replace('contract ', '')

                return {
                    name: 'address',    // less things to do for now on state if we put it like this
                    type: Type.ElementaryTypeName
                }
            }

        default:
            throw Error(`Type not found: ${x.nodeType}`)
    }
}

const getBytesFromEnum = (val: TypeName): number => {
    if (val.values == undefined) {
        throw Error('values not found: ' + JSON.stringify(val))
    }

    let storageBytes = 0
    let length: number = val.values.length
            
    while (length > 1) {
        length = length / 256
        storageBytes++
    }
    
    return storageBytes;
}

// TODO: Join with getBytes
export function getSlots(val: TypeName): number {
    switch (val.type) {
        case Type.UserDefinedTypeName:
            if (val.name == 'struct') {
                const {slots} = parseStorage(val.members as Variable[])
                return slots
            }
        case Type.ArrayTypeName:
            // FIX.
    }

    return 1;
}

export function getBytes(val: TypeName): number {
    switch (val.type) {
        case Type.UserDefinedTypeName:
            switch (val.name) {
                case "struct":
                    return 32;
                case "enum":
                    return getBytesFromEnum(val);
            }
        case Type.ArrayTypeName:
        case Type.Mapping:
            return 32
        case Type.ElementaryTypeName:   // TODO. improve
            if (val.name == undefined) {
                throw Error('Elementary Type requires name')
            }
            
            if (['string', 'uint', 'int'].indexOf(val.name) != -1) {
                return 32;
            }
            
            if (val.name == "bool") {
                return 1;
            }

            if (val.name == "address") {
                return 20;
            }
            
            if (val.name == 'bytes') {
                return 32;
            }

            if (val.name == 'string') {
                return 32
            }

            // i.e. uint8
            if (val.name.startsWith('uint')) {
                return parseInt(val.name.replace('uint', '')) / 8
            }

            // i.e. int8
            if (val.name.startsWith('int')) {
                return parseInt(val.name.replace('int', '')) / 8
            }

            if (val.name.startsWith('bytes')) {
                return parseInt(val.name.replace('bytes', ''))
            }
    }

    throw Error(`Typename not found for: ${val.name}`)
}
