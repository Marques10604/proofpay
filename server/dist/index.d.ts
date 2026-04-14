import { Keypair } from '@solana/web3.js';
import 'dotenv/config';
export interface ResolveDisputeParams {
    escrowId: Uint8Array;
    releaseToPayee: boolean;
    oracleKeypair: Keypair;
}
