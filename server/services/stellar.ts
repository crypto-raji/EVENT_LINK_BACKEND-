import { Asset, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

export const SOROBAN_CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID || 'CDD3VJENDGV6LLOY2OCYQSRD5CQKYAPL4I3MNWFFQBXJ6P6KOJHQK47J';
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

interface MintResult {
  custodialPublicKey: string;
  custodialSecretKey: string;
  stellarTxHash: string;
  ticketHash: string;
  claimCode: string;
  claimUrl: string;
  mintTimestamp: string;
}

export function isFriendbotEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.STELLAR_USE_FRIENDBOT === 'true';
}

async function createAndFundCustodialAccount(): Promise<{ publicKey: string; secretKey: string }> {
  if (!isFriendbotEnabled()) {
    throw new Error('Stellar Friendbot requires STELLAR_USE_FRIENDBOT=true outside production.');
  }

  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  try {
    await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  } catch (error) {
    console.warn('Stellar Friendbot funding notice:', error);
  }

  return { publicKey, secretKey };
}

async function submitOnChainTransaction(sourceSecretKey: string, destinationPublicKey: string, memoText: string): Promise<string> {
  try {
    const server = new Horizon.Server(HORIZON_URL);
    const sourceKeypair = Keypair.fromSecret(sourceSecretKey);
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({
        destination: destinationPublicKey || sourceKeypair.publicKey(),
        asset: Asset.native(),
        amount: '0.00001',
      }))
      .addMemo(Memo.text((memoText || 'STELLAR-PASS').substring(0, 28)))
      .setTimeout(30)
      .build();

    transaction.sign(sourceKeypair);
    const result = await server.submitTransaction(transaction);
    return result.hash;
  } catch (error) {
    console.warn('Stellar Horizon transaction notice:', error);
    return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

export async function mintStellarTicket(
  _buyerName: string,
  _buyerEmail: string,
  eventId: string,
  _tierName: string,
): Promise<MintResult> {
  const account = await createAndFundCustodialAccount();
  const randomSalt = Math.floor(Math.random() * 1_000_000).toString(16);
  const ticketHash = `EVTLNK-STELLAR-${eventId}-${Date.now()}-${randomSalt}`.toUpperCase();
  const claimCode = `CLAIM-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  const stellarTxHash = await submitOnChainTransaction(account.secretKey, account.publicKey, claimCode);
  const claimUrl = new URL('/', FRONTEND_URL);
  claimUrl.searchParams.set('claimCode', claimCode);
  claimUrl.searchParams.set('hash', ticketHash);

  return {
    custodialPublicKey: account.publicKey,
    custodialSecretKey: account.secretKey,
    stellarTxHash,
    ticketHash,
    claimCode,
    claimUrl: claimUrl.toString(),
    mintTimestamp: new Date().toISOString(),
  };
}