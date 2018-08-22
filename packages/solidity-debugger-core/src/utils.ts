
var ethutil = require('ethereumjs-util');
var BN = require('ethereumjs-util').BN

import { sha256, stripHexPrefix } from 'ethereumjs-util';

const MIN_CONTRACT_BYTECODE_LENGTH = 88;

export function arrayToObject<T>(array: T[], keyField): {[id: string]: T} {
    return array.reduce((obj, item) => {
        obj[item[keyField]] = item
        return obj
    }, {})
}

export function bytecodeId(bytecode: string) {
    return sha256(bytecodeToBytecodeRegex(stripHexPrefix(bytecode))).toString('hex').substr(0, 8);
}

export function removeHexPrefix(hex: string): string {
    const hexPrefix = '0x';
    return hex.startsWith(hexPrefix) ? hex.slice(hexPrefix.length) : hex;
}

// https://github.com/0xProject/0x-monorepo/blob/development/packages/sol-cov/src/utils.ts#L26
export function bytecodeToBytecodeRegex(bytecode: string): string {
    const bytecodeRegex = bytecode
        // Library linking placeholder: __ConvertLib____________________________
        .replace(/_.*_/, '.*')
        // Last 86 characters is solidity compiler metadata that's different between compilations
        //.replace(/.{86}$/, '')
        .replace(/(a165627a7a72.*?0029)/g, '')  // http://solidity.readthedocs.io/en/develop/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode 
        // Libraries contain their own address at the beginning of the code and it's impossible to know it in advance
        .replace(/^0x730000000000000000000000000000000000000000/, '0x73........................................');
    // HACK: Node regexes can't be longer that 32767 characters. Contracts bytecode can. We just truncate the regexes. It's safe in practice.
    const MAX_REGEX_LENGTH = 32767;
    const truncatedBytecodeRegex = bytecodeRegex.slice(0, MAX_REGEX_LENGTH);
    return truncatedBytecodeRegex;
}

export function extractHexByteSlice (slotValue, byteLength, offsetFromLSB) {
    var offset = slotValue.length - 2 * offsetFromLSB - 2 * byteLength
    return slotValue.substr(offset, 2 * byteLength)
}

export function sha3_256 (value): string {
    if (typeof value === 'string' && value.indexOf('0x') !== 0) {
      value = '0x' + value
    }
    var ret = ethutil.bufferToHex(ethutil.setLengthLeft(value, 32))
    ret = ethutil.sha3(ret)
    return ethutil.bufferToHex(ret)
}

export function toBN (value) {
    if (value instanceof BN) {
        return value
    } else if (value.indexOf && value.indexOf('0x') === 0) {
        value = ethutil.unpad(value.replace('Ox', ''))
        value = new BN(value === '' ? '0' : value, 16)
    } else if (!isNaN(value)) {
        value = new BN(value)
    }

    return value
}

export function add (value1, value2) {
    return toBN(value1).add(toBN(value2))
}

export function pad(num:number, size:number): string {
    let s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}
