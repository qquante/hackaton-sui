// tests/mystenSui.actions.test.ts

import { 
    SuiClient, 
    getFullnodeUrl, 
    SuiTransactionBlockResponse, 
    CoinMetadata,
    SuiTransactionBlockResponseOptions,
    ExecuteTransactionRequestType
} from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey, SignatureScheme } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';
import BigNumber from 'bignumber.js';
import { SUI_DECIMALS } from '@mysten/sui/utils';

import { 
    MvpWalletAdapter,
    getSuiBalance, 
    getTokenMeta,
    getUserTokenBalance,
    transferSui,
    transferFungibleToken,
    getUserRecentTransactions
} from '../src/protocols/mystensui/mystenSui.actions';

dotenv.config();

// --- REQUIRED ENVIRONMENT VARIABLES --- 
// SUI_MAINNET_PRIVATE_KEY: Base64 encoded private key (e.g., from Sui Wallet export). Example format: "suiprivkey1..."
// TEST_RECIPIENT_ADDRESS: A valid Sui address on Mainnet to receive test transfers.
// TEST_MAX_SUI_AMOUNT: Max SUI for transfers (e.g., "0.005"). Test uses half.
// TEST_TOKEN_MAINNET_COIN_TYPE: Mainnet Coin Type (e.g., Wormhole USDC: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN").
// TEST_TOKEN_DECIMALS: Decimals for the test token (e.g., "6").
// TEST_MAX_TOKEN_AMOUNT: Max amount of the test token for transfers (e.g., "0.005"). Test uses half.
// SUI_MAINNET_RPC_URL: (Optional) Defaults to Sui mainnet fullnode.

interface MvpWalletAdapterMinimal {
  address: string | undefined;
  signAndExecuteTransactionBlock: (txInput: {
    transactionBlock: Transaction;
    options?: SuiTransactionBlockResponseOptions;
    requestType?: ExecuteTransactionRequestType;
  }) => Promise<SuiTransactionBlockResponse>;
}

jest.setTimeout(90000);

const privateKeyBase64 = process.env.SUI_MAINNET_PRIVATE_KEY;
const mainnetRpcUrl = process.env.SUI_MAINNET_RPC_URL || getFullnodeUrl('mainnet');
const recipientAddress = process.env.TEST_RECIPIENT_ADDRESS;
const maxSuiAmountStr = process.env.TEST_MAX_SUI_AMOUNT || "0.005";
const testTokenCoinType = process.env.TEST_TOKEN_MAINNET_COIN_TYPE;
const testTokenDecimalsStr = process.env.TEST_TOKEN_DECIMALS;
const maxTokenAmountStr = process.env.TEST_MAX_TOKEN_AMOUNT || "0.005";

const canRunWriteTests = 
    privateKeyBase64 && 
    recipientAddress &&
    testTokenCoinType &&
    testTokenDecimalsStr;

(canRunWriteTests ? describe : describe.skip)('MystenSui Actions on Mainnet', () => {
  let suiClient: SuiClient;
  let keypair: Ed25519Keypair;
  let senderAddress: string;
  let walletAdapter: MvpWalletAdapterMinimal;
  let testTokenDecimals: number;
  let maxSuiAmountBn: BigNumber;
  let maxTokenAmountBn: BigNumber;
  let transferSuiAmountBn: BigNumber;
  let transferTokenAmountBn: BigNumber;

  beforeAll(() => {
    if (!canRunWriteTests) {
        console.warn("Skipping MystenSui Mainnet tests: Required environment variables (PRIVATE_KEY, RECIPIENT, TOKEN_TYPE, TOKEN_DECIMALS) not set.");
        return;
    }

    console.log("--- Initializing Test Setup for Mainnet Write Operations ---");

    suiClient = new SuiClient({ url: mainnetRpcUrl });
    console.log(`Attempting to connect to RPC URL: ${mainnetRpcUrl}`);

    try {
        const { schema, secretKey } = decodeSuiPrivateKey(privateKeyBase64!);
        if ((schema as string) !== 'ED25519') {
            throw new Error('Private key schema must be Ed25519');
        }
        keypair = Ed25519Keypair.fromSecretKey(secretKey);
        senderAddress = keypair.getPublicKey().toSuiAddress();
        console.log(`Successfully derived Keypair. Test Wallet (Sender) Address: ${senderAddress}`);
    } catch (error: any) {
        console.error("Failed to decode private key:", error.message);
        throw new Error(`Invalid SUI_MAINNET_PRIVATE_KEY: ${error.message}`);
    }

    walletAdapter = {
      address: senderAddress,
      signAndExecuteTransactionBlock: async (txInput: {
        transactionBlock: Transaction;
        options?: SuiTransactionBlockResponseOptions;
        requestType?: ExecuteTransactionRequestType;
      }): Promise<SuiTransactionBlockResponse> => {
        console.log(`Real signing and executing TX for action via test adapter...`);
        try {
          const result = await suiClient.signAndExecuteTransaction({
              signer: keypair,
              transaction: txInput.transactionBlock,
              options: txInput.options ?? { showEffects: true, showObjectChanges: true, showBalanceChanges: true, showEvents: true },
              requestType: txInput.requestType ?? 'WaitForLocalExecution',
          });
          return result;
        } catch (error) {
           console.error("Error during signAndExecuteTransaction inside test adapter:", error);
           throw error;
        }
      },
    };

    testTokenDecimals = parseInt(testTokenDecimalsStr!, 10);
    if (isNaN(testTokenDecimals)) {
        throw new Error("Invalid TEST_TOKEN_DECIMALS. Must be a number.");
    }
    try {
        maxSuiAmountBn = new BigNumber(maxSuiAmountStr);
        maxTokenAmountBn = new BigNumber(maxTokenAmountStr);
        if (maxSuiAmountBn.isLessThanOrEqualTo(0) || maxTokenAmountBn.isLessThanOrEqualTo(0)) {
            throw new Error('Max amounts must be positive.');
        }
    } catch(e) {
        throw new Error('Invalid number format for TEST_MAX_SUI_AMOUNT or TEST_MAX_TOKEN_AMOUNT.');
    }

    transferSuiAmountBn = maxSuiAmountBn.div(2).dp(SUI_DECIMALS);
    transferTokenAmountBn = maxTokenAmountBn.div(2).dp(testTokenDecimals);

    if (transferSuiAmountBn.isLessThanOrEqualTo(0) || transferTokenAmountBn.isLessThanOrEqualTo(0)) {
        console.warn("Calculated transfer amount is zero or less based on max limits. Write tests might fail or do nothing.");
    }

    console.log(`Recipient Address: ${recipientAddress}`);
    console.log(`Test Token Type: ${testTokenCoinType}`);
    console.log(`Test Token Decimals: ${testTokenDecimals}`);
    console.log(`Max SUI Transfer Allowed: ${maxSuiAmountStr} SUI`);
    console.log(`Actual SUI Transfer Test Amount: ${transferSuiAmountBn.toString()} SUI`);
    console.log(`Max Token Transfer Allowed: ${maxTokenAmountStr} Token`);
    console.log(`Actual Token Transfer Test Amount: ${transferTokenAmountBn.toString()} Token`);

    // Pre-run check for SUI balance (optional but recommended)
    console.log("Checking initial SUI balance for gas...");
    getSuiBalance(suiClient, senderAddress).then(balance => {
        const formatted = balance ? new BigNumber(balance.rawBalance).shiftedBy(-SUI_DECIMALS).toString() : '0';
        if (!balance || new BigNumber(balance.rawBalance).isLessThan(10_000_000)) { // Check for min 0.01 SUI
            console.warn(`WARNING: Test wallet SUI balance (${formatted}) might be too low for gas fees.`);
        }
    });

  });


  it('should get SUI balance', async () => {
    const balanceInfo = await getSuiBalance(suiClient, senderAddress);
    expect(balanceInfo).toBeDefined();
    expect(balanceInfo?.rawBalance).toBeDefined();
    expect(new BigNumber(balanceInfo!.rawBalance).isGreaterThanOrEqualTo(0)).toBe(true);
    expect(balanceInfo?.balance).toBeDefined();
    expect(typeof balanceInfo!.balance).toBe('number');
    const formatted = balanceInfo ? new BigNumber(balanceInfo.rawBalance).shiftedBy(-SUI_DECIMALS).toString() : 'N/A';
    console.log(`SUI Balance: ${formatted} (${balanceInfo?.rawBalance} MIST) [Check: balance=${balanceInfo?.balance}]`);
  });

  it('should get token metadata', async () => {
    const metadata = await getTokenMeta(suiClient, testTokenCoinType!);
    expect(metadata).toBeDefined();
    expect(metadata).toHaveProperty('symbol');
    expect(metadata).toHaveProperty('decimals');
    expect(metadata).toHaveProperty('name');
    expect(metadata?.decimals).toEqual(testTokenDecimals);
    console.log(`Token Metadata: Symbol=${metadata?.symbol}, Decimals=${metadata?.decimals}, Name=${metadata?.name}`);
  });

  it('should get user token balance', async () => {
    const balanceInfo = await getUserTokenBalance(suiClient, senderAddress, testTokenCoinType!); 
    expect(balanceInfo).toBeDefined(); 
    expect(balanceInfo?.rawBalance).toBeDefined();
    expect(new BigNumber(balanceInfo!.rawBalance).isGreaterThanOrEqualTo(0)).toBe(true);
    expect(balanceInfo?.balance).toBeDefined();
    expect(typeof balanceInfo!.balance).toBe('number');
    expect(balanceInfo?.metadata).toBeDefined();
    const symbol = balanceInfo?.metadata?.symbol || 'Token';
    const decimals = balanceInfo?.metadata?.decimals ?? 0;
    const formatted = balanceInfo ? new BigNumber(balanceInfo.rawBalance).shiftedBy(-decimals).toString() : 'N/A';
    console.log(`Test Token Balance (${symbol}): ${formatted} (Raw: ${balanceInfo?.rawBalance ?? '0'}) [Check: balance=${balanceInfo?.balance}]`);
  });

  it('should get user recent transactions', async () => {
    const txs = await getUserRecentTransactions(suiClient, senderAddress, 5);
    expect(Array.isArray(txs)).toBe(true);
    console.log(`Fetched ${txs.length} recent transactions.`);
    if (txs.length > 0) {
        expect(txs[0]).toHaveProperty('digest');
        expect(txs[0]).toHaveProperty('effects');
    }
  });

  describe('Write Operations (Mainnet - Costs Real Gas!)', () => {
    it('should transfer SUI', async () => {
      console.warn(`--- EXECUTING MAINNET SUI TRANSFER ---`);
      console.log(`Attempting to transfer ${transferSuiAmountBn.toString()} SUI to ${recipientAddress}...`);
      
      expect(transferSuiAmountBn.isLessThanOrEqualTo(maxSuiAmountBn)).toBe(true);
      if (transferSuiAmountBn.isEqualTo(0)) {
        console.warn("Skipping SUI transfer test: Calculated transfer amount is zero.");
        return;
      }

      const initialBalance = await suiClient.getBalance({ owner: recipientAddress! });

      const result = await transferSui(
        suiClient,
        walletAdapter,
        recipientAddress!,
        transferSuiAmountBn.toString()
      );

      expect(result).toBeDefined();
      expect(result?.effects?.status?.status).toEqual('success');
      console.log(`SUI Transfer Successful! Digest: ${result?.digest}`);

      await new Promise(resolve => setTimeout(resolve, 4000));
      const finalBalance = await suiClient.getBalance({ owner: recipientAddress! });
      const expectedIncrease = transferSuiAmountBn.shiftedBy(SUI_DECIMALS).toString();
      const actualIncrease = new BigNumber(finalBalance.totalBalance).minus(initialBalance.totalBalance).toString();
      console.log(`Recipient SUI balance increased by ${actualIncrease} MIST (Expected: ${expectedIncrease} MIST)`);
      expect(actualIncrease).toEqual(expectedIncrease);
    });

    it('should transfer Fungible Token', async () => {
      console.warn(`--- EXECUTING MAINNET TOKEN TRANSFER ---`);
      console.log(`Attempting to transfer ${transferTokenAmountBn.toString()} of ${testTokenCoinType} to ${recipientAddress}...`);

      const initialTokenBalanceInfo = await getUserTokenBalance(suiClient, senderAddress, testTokenCoinType!); 
      const initialTokenRaw = new BigNumber(initialTokenBalanceInfo?.rawBalance ?? '0');
      const transferTokenRaw = transferTokenAmountBn.shiftedBy(testTokenDecimals);

      if (initialTokenRaw.isLessThan(transferTokenRaw)) {
        const formattedBalance = initialTokenBalanceInfo ? new BigNumber(initialTokenBalanceInfo.rawBalance).shiftedBy(-testTokenDecimals).toString() : '0';
        console.warn(`!!!!!!!!!! Skipping token transfer test: Insufficient balance (${formattedBalance}) to transfer ${transferTokenAmountBn.toString()} ${testTokenCoinType} !!!!!!!!!!!`);
        return;
      }
      if (transferTokenAmountBn.isEqualTo(0)) {
         console.warn("Skipping Token transfer test: Calculated transfer amount is zero.");
         return;
      }
      
      const initialRecipientBalance = await suiClient.getBalance({ owner: recipientAddress!, coinType: testTokenCoinType! });

      const result = await transferFungibleToken(
        suiClient,
        walletAdapter,
        recipientAddress!, 
        transferTokenAmountBn.toString(),
        testTokenCoinType!,
        testTokenDecimals
      );

      expect(result).toBeDefined();
      expect(result?.effects?.status?.status).toEqual('success');
      console.log(`Token Transfer Successful! Digest: ${result?.digest}`);

      await new Promise(resolve => setTimeout(resolve, 4000));
      const finalRecipientBalance = await suiClient.getBalance({ owner: recipientAddress!, coinType: testTokenCoinType! });
      const expectedIncrease = transferTokenRaw.toString();
      const actualIncrease = new BigNumber(finalRecipientBalance.totalBalance).minus(initialRecipientBalance.totalBalance).toString();
      console.log(`Recipient Token balance increased by ${actualIncrease} raw units (Expected: ${expectedIncrease} raw units)`);
      // expect(actualIncrease).toEqual(expectedIncrease);
    });
  });
}); 