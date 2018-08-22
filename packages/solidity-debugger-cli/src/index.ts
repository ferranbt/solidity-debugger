
import * as program from 'commander';
import * as xx from 'solidity-debugger-core';
import * as Table from 'cli-table';

var readlineSync = require('readline-sync');

async function newDebugger(cmd: any) {
    const {artifacts, contracts, endpoint, adapter} = cmd;
    
    let adapt = xx['newAdapter'](adapter);
    let provider = new xx['Provider'](endpoint);

    const d = new xx['Debugger'](adapt, provider);
    await d.init();

    return d;
}

program
    .option('-a, --artifacts <path>', 'Artifacts path', './contracts')
    .option('-c, --contracts <path>', 'Contracts path', './build')
    .option('-e, --endpoint <endpoint>', 'RPC endpoint', 'http://localhost:8545')
    .option('-p, --adapter <adapter>', 'Debugger adapter (truffle, sol-compiler)', 'truffle')

program
    .command('tx <hash>')
    .action(async (hash, cmd) => {
        const debug = await newDebugger(cmd.parent);
        const session = await debug.debugTxHash(hash);

        do {
            const line = session.getLine();
            console.log(line)

            readlineSync.prompt();
        } while(!(await session.step()));
    })

program
    .command('inspect')
    .action(async cmd => {
        const debug = await newDebugger(cmd.parent);
        const contracts = debug.contracts;

        const table = new Table({
            head: ['Contract', 'Creation', 'Runtime']
        });
        
        for (const name in contracts) {
            const contract = contracts[name]
            table.push([name, contract.creation.id, contract.deployed.id]);
        }

        console.log(table.toString());
    })

program
    .parse(process.argv)
