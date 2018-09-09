
import * as solc from 'solc';

export const DEFAULT_FILENAME = '';

const DEFAULT_SOLC_SETTINGS = {
    optimizer: {
        enabled: false,
    },
    outputSelection: {
        ['*']: {
            ['*']: [
                'abi', 
                'evm.bytecode.object',
                'evm.deployedBytecode.object'
            ],
            "": [ "ast" ]
        },
    },
}

export function compile(source: string) {
    const input = {
        'language': 'Solidity',
        'settings': DEFAULT_SOLC_SETTINGS,
        'sources': {
            [DEFAULT_FILENAME]: {
                "content": source
            },
        }
    }

    const output = JSON.parse(solc.compileStandardWrapper(JSON.stringify(input)));

    for (const err of output.errors || []) {
        if (err.severity == 'error') {
            throw Error(`Error compiling: ${err.formattedMessage}`)
        }
    }

    return output;
}
