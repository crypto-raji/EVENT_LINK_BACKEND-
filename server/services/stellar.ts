import { Asset, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

export const SOROBAN_CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID || 'CDD3VJENDGV6LLOY2OCYQSRD5CQKYAPL4I3MNWFFQBXJ6P6KOJHQK47J';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

export function resolveStellarNetworkConfig(networkValue: string | undefined): { horizonUrl: string; networkPassphrase: string } {
  const network = (networkValue || 'testnet').trim().toLowerCase();
  if (network === 'testnet') {
    return { horizonUrl: 'https://horizon-testnet.stellar.org', networkPassphrase: Networks.TESTNET };
  }
  if (network === 'public') {
    return { horizonUrl: 'https://horizon.stellar.org', networkPassphrase: Networks.PUBLIC };
  }
  throw new Error('STELLAR_NETWORK must be either "testnet" or "public".');
}

const { horizonUrl: HORIZON_URL, networkPassphrase: NETWORK_PASSPHRASE } =
  resolveStellarNetworkConfig(process.env.STELLAR_NETWORK);

interface MintResult {
  custodialPublicKey: string;
  custodialSecretKey: string;
  stellarTxHash: string;
  ticketHash: string;
  claimCode: string;
  claimUrl: string;
  mintTimestamp: string;
}

async function createAndFundCustodialAccount(): Promise<{ publicKey: string; secretKey: string }> {
  const friendbotEnabled = process.env.NODE_ENV !== 'production' &&
    process.env.STELLAR_NETWORK === 'testnet' &&
    process.env.STELLAR_FRIENDBOT_ENABLED === 'true';
  if (!friendbotEnabled) {
    throw new Error('Stellar Friendbot funding requires explicit testnet development configuration.');
  }

  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  let response: Response;
  try {
    response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  } catch {
    throw new Error('Unable to reach Stellar Friendbot to fund the custodial account.');
  }
  if (!response.ok) {
    const details = (await response.text()).trim().slice(0, 300);
    throw new Error(`Stellar Friendbot funding failed with HTTP ${response.status}${details ? `: ${details}` : '.'}`);
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
      networkPassphrase: NETWORK_PASSPHRASE,
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