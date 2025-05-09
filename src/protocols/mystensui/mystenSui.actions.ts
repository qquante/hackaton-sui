import { SuiClient, CoinMetadata, SuiTransactionBlockResponse, CoinStruct, PaginatedCoins } from '@mysten/sui/client';
import { Transaction, TransactionArgument } from '@mysten/sui/transactions';
import { SUI_DECIMALS, SUI_TYPE_ARG } from '@mysten/sui/utils';
import { getSuiClient } from './mystenSui.client';
import BigNumber from 'bignumber.js';

export interface MvpWalletAdapter {
  address?: string;
  signAndExecuteTransactionBlock: (params: { transactionBlock: Transaction, options?: any }) => Promise<SuiTransactionBlockResponse>;
}

export async function getSuiBalance(
  suiClient: SuiClient,
  userAddress: string
): Promise<{ balance: number; rawBalance: string } | null> {
  if (!userAddress) {
    return null;
  }
  try {
    const balanceResponse = await suiClient.getBalance({
      owner: userAddress,
      coinType: SUI_TYPE_ARG,
    });

    const rawBalance = balanceResponse.totalBalance;
    const balance = parseInt(rawBalance, 10) / Math.pow(10, SUI_DECIMALS);

    return { balance, rawBalance };
  } catch (error) {
    return null;
  }
}

export async function getTokenMeta(
  suiClient: SuiClient,
  coinType: string
): Promise<CoinMetadata | null> {
  if (!coinType) {
    return null;
  }
  try {
    const metadata = await suiClient.getCoinMetadata({ coinType });
    if (!metadata) {
      return null;
    }
    return metadata;
  } catch (error) {
    return null;
  }
}

export async function getUserTokenBalance(
  suiClient: SuiClient,
  userAddress: string,
  coinType: string
): Promise<{ balance: number; rawBalance: string; metadata: CoinMetadata } | null> {
  if (!userAddress || !coinType) {
    return null;
  }

  try {
    const metadata = await getTokenMeta(suiClient, coinType);
    if (!metadata) {
      return null;
    }

    const balanceResponse = await suiClient.getBalance({
      owner: userAddress,
      coinType: coinType,
    });

    const rawBalance = balanceResponse.totalBalance;
    const balance = parseInt(rawBalance, 10) / Math.pow(10, metadata.decimals);
    
    return { balance, rawBalance, metadata };

  } catch (error) {
    return null;
  }
}

// Helper function to find a suitable coin (simplified for MVP)
// Returns a CoinStruct if a single coin is found that can satisfy the amount (either exact or larger for splitting)
async function findSuitableCoinForTransfer(
  suiClient: SuiClient,
  owner: string,
  coinType: string,
  targetAmountRaw: bigint
): Promise<CoinStruct | null> {
  let cursor: string | null | undefined = null;
  let bestCoin: CoinStruct | null = null;

  do {
    const coinsResponse: PaginatedCoins = await suiClient.getCoins({ owner, coinType, cursor });
    for (const coin of coinsResponse.data) {
      const coinBalanceRaw = BigInt(coin.balance);
      if (coinBalanceRaw === targetAmountRaw) {
        return coin;
      }
      if (coinBalanceRaw > targetAmountRaw) {
        if (!bestCoin || coinBalanceRaw < BigInt(bestCoin.balance)) {
          bestCoin = coin;
        }
      }
    }
    cursor = coinsResponse.nextCursor;
  } while (cursor && !bestCoin); // Stop if exact match found or if bestCoin is already found (and we're looking for smallest larger)
                               // Or iterate all pages if a larger coin strategy is more complex.
  return bestCoin; 
}

export async function transferFungibleToken(
  suiClient: SuiClient,
  wallet: MvpWalletAdapter,
  recipientAddress: string,
  amountTokenString: string,
  tokenCoinType: string,
  tokenDecimals: number
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    return null;
  }
  if (!recipientAddress || !/^(0x)?[0-9a-fA-F]{64,66}$/.test(recipientAddress)) {
    return null;
  }
  const amountToken = parseFloat(amountTokenString);
  if (isNaN(amountToken) || amountToken <= 0) {
    return null;
  }

  const targetAmountRaw = BigInt(new BigNumber(amountTokenString).shiftedBy(tokenDecimals).integerValue(BigNumber.ROUND_FLOOR).toString());

  if (targetAmountRaw <= 0n) {
      return null;
  }

  const tx = new Transaction();
  try {
    tx.setSender(wallet.address);
    const gasPrice = await suiClient.getReferenceGasPrice();
    tx.setGasPrice(gasPrice);
    tx.setGasBudget(30000000); // Example budget, might need adjustment

    const coinToUse = await findSuitableCoinForTransfer(suiClient, wallet.address, tokenCoinType, targetAmountRaw);

    if (!coinToUse) {
      return null;
    }

    let coinToSendArg: TransactionArgument;
    const coinToUseBalanceRaw = BigInt(coinToUse.balance);

    if (coinToUseBalanceRaw === targetAmountRaw) {
      coinToSendArg = tx.object(coinToUse.coinObjectId);
    } else if (coinToUseBalanceRaw > targetAmountRaw) {
      const [splitCoin] = tx.splitCoins(tx.object(coinToUse.coinObjectId), [targetAmountRaw]);
      coinToSendArg = splitCoin;
    } else {
      return null;
    }

    tx.transferObjects([coinToSendArg], recipientAddress);
    
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true, showBalanceChanges: true },
    });

    if (result.effects?.status.status === 'success') {
      
    } else {
      
    }
    return result;

  } catch (error) {
    return null;
  }
}

export async function transferSui(
  suiClient: SuiClient,
  wallet: MvpWalletAdapter,
  recipientAddress: string,
  amountSuiString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    return null;
  }
  if (!recipientAddress || !/^(0x)?[0-9a-fA-F]{64,66}$/.test(recipientAddress)) {
    return null; 
  }
  const amountSui = parseFloat(amountSuiString);
  if (isNaN(amountSui) || amountSui <= 0) {
    return null; 
  }

  const amountMist = Math.floor(amountSui * Math.pow(10, SUI_DECIMALS));
  if (amountMist <= 0) {
      return null;
  }

  const tx = new Transaction();
  try {
    tx.setSender(wallet.address);

    const gasPrice = await suiClient.getReferenceGasPrice();
    tx.setGasPrice(gasPrice);
    tx.setGasBudget(20000000);

    const amountMistBigInt = BigInt(amountMist);

    const [coinToSend] = tx.splitCoins(tx.gas, [amountMistBigInt]);

    tx.transferObjects([coinToSend], recipientAddress);

    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx, 
      options: { showEffects: true, showEvents: true, showObjectChanges: true, showBalanceChanges: true },
    });

    if (result.effects?.status.status === 'success') {
      
    } else {
      
    }
    return result;

  } catch (error) {
    return null;
  }
}

export async function getUserRecentTransactions(
  suiClient: SuiClient,
  userAddress: string,
  limit: number = 10
): Promise<SuiTransactionBlockResponse[]> {
  if (!userAddress) {
    return [];
  }

  try {
    const response = await suiClient.queryTransactionBlocks({
      filter: { FromAddress: userAddress },
      options: { 
        showEffects: true,
        showInput: false,
        showEvents: false,
        showObjectChanges: false,
        showBalanceChanges: false,
      },
      limit,
      order: 'descending', // Get newest first
    });

    return Array.isArray(response.data) ? response.data : [];

  } catch (error) {
    return [];
  }
} 