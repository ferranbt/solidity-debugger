
import {ContractData} from '../types';

export default abstract class Adapter {
    public abstract async getContractData(): Promise<ContractData[]>;
}
