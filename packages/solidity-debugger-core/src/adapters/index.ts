
import Adapter from './adapter';
import Truffle from './truffle';
import SolCompiler from './sol-compiler';

export default function(artifact: string='truffle', opts:{}={}): Adapter {
    switch (artifact) {
        case 'truffle':
            return new Truffle(opts);
        case 'sol-compiler':
            return new SolCompiler(opts);
        default:
            throw Error(`Artifact with name ${artifact} not found.`)
    }
}

export {
    Adapter
}
