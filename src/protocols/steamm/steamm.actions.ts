import { SuiClient, SuiTransactionBlockResponse, CoinMetadata, CoinBalance } from '@mysten/sui/client';
import { Transaction, TransactionArgument, TransactionObjectInput } from '@mysten/sui/transactions';
import {
  SteammSDK,
  Pool,          
  Route,         
  CoinPair,      
  DepositLiquidityParams, 
  RedeemLiquidityParams, 
  PoolInfo,
  SwapQuote,
  DepositQuote,
  RedeemQuote,
  BankInfo,
  BankList,
  getBankFromUnderlying,
  getBankFromBToken
} from '@suilend/steamm-sdk';
import { MvpWalletAdapter, getTokenMeta, getUserTokenBalance } from '../mystensui/mystenSui.actions';
import { getDefaultSteammSDK } from './steamm.client';
import { STEAMM_MAINNET_CONFIG } from './steamm.config';
import { SteammPoolExtended, SteammRouteInfo, UserLiquidityPositionInfo } from './steamm.types';
import BigNumber from 'bignumber.js';
import { PoolModule, QuoteSwapParams, SwapParams, QuoteDepositParams, QuoteRedeemParams } from '@suilend/steamm-sdk/modules'; // Specific module if needed and QuoteSwapParams, Added QuoteDepositParams and QuoteRedeemParams
import { SUI_DECIMALS, SUI_TYPE_ARG, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { DepositQuote as SDKDepositQuote } from '@suilend/steamm-sdk/base/pool/poolTypes';
import { SteammAddLiquidityQuoteResult } from './steamm.types';
import { RedeemQuote as SDKRedeemQuote } from '@suilend/steamm-sdk/base/pool/poolTypes';
import { SteammRemoveLiquidityQuoteResult } from './steamm.types';

export async function getAllSteammPools(
  steammSdk: SteammSDK | null
): Promise<PoolInfo[]> {
  if (!steammSdk) {
    return [];
  }
  try {
    const pools = await steammSdk.getPools();
    return pools;
  } catch (error) {
    return [];
  }
}

export async function findSteammSwapRoutes(
  steammSdk: SteammSDK | null,
  inputCoinType: string,
  outputCoinType: string
): Promise<Route[]> {
  if (!steammSdk) {
    return [];
  }
  if (!inputCoinType || !outputCoinType) {
    return [];
  }
  
  try {
    const coinPair: CoinPair = {
      coinIn: inputCoinType,
      coinOut: outputCoinType,
    };
    
    const routes: Route[] = await steammSdk.Router.findSwapRoutes(coinPair);
    
    return routes;

  } catch (error) {
    return [];
  }
}

export async function executeSteammSwap(
  suiClient: SuiClient,
  steammSdk: SteammSDK,
  wallet: MvpWalletAdapter,
  poolInfo: PoolInfo,
  coinInType: string, 
  coinInDecimals: number, 
  coinInObject: TransactionObjectInput,
  coinOutType: string, 
  amountInString: string, 
  minAmountOutString?: string 
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    return null;
  }

  try {
    const amountInRawBigInt = new BigNumber(amountInString).shiftedBy(coinInDecimals);
    if (amountInRawBigInt.lte(0)) {
      return null;
    }

    let coinOutDecimals = 0;
    const coinOutMeta = await getTokenMeta(suiClient, coinOutType);
    if (coinOutMeta) {
      coinOutDecimals = coinOutMeta.decimals;
    } else {
    }
    
    const minAmountOutRawBigInt = minAmountOutString && parseFloat(minAmountOutString) > 0
      ? new BigNumber(minAmountOutString).shiftedBy(coinOutDecimals)
      : new BigNumber(0);
    let a2bLocal: boolean;
    if (poolInfo.coinTypeA === coinInType && poolInfo.coinTypeB === coinOutType) {
      a2bLocal = true;
    } else if (poolInfo.coinTypeB === coinInType && poolInfo.coinTypeA === coinOutType) {
      a2bLocal = false;
    } else {
      return null;
    }

    const banks = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);
    if ((poolInfo.quoterType === 'Oracle' || poolInfo.quoterType === 'OracleV2') && (!bankInfoA || !bankInfoB)) {
      return null;
    }
    
    const tx = new Transaction();
    tx.setSender(wallet.address);


    const [dummyCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);

    const sdkSwapParams: SwapParams = {
      poolInfo,
      bankInfoA,
      bankInfoB,
      coinA: a2bLocal ? coinInObject : dummyCoin, 
      coinB: a2bLocal ? dummyCoin : coinInObject, 
      a2b: tx.pure.bool(a2bLocal),
      amountIn: BigInt(amountInRawBigInt.toString()),
      minAmountOut: BigInt(minAmountOutRawBigInt.toString()),
    };

    const outputCoinArgument = await steammSdk.Pool.swap(tx, sdkSwapParams);
    tx.transferObjects([outputCoinArgument], tx.pure.address(wallet.address));
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status.status === 'success') {
    } else {
    }
    return result;

  } catch (error: any) {
    return null;
  }
}

export async function addSteammLiquidity(
  suiClient: SuiClient,
  steammSdk: SteammSDK,
  wallet: MvpWalletAdapter,
  poolInfo: PoolInfo,
  coinAInObjectId: string,
  coinADecimals: number,
  amountADesiredString: string,
  coinBInObjectId: string,
  coinBDecimals: number,
  amountBDesiredString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    return null;
  }

  try {
    const amountADesiredRaw = BigInt(new BigNumber(amountADesiredString).shiftedBy(coinADecimals).toFixed(0));
    const amountBDesiredRaw = BigInt(new BigNumber(amountBDesiredString).shiftedBy(coinBDecimals).toFixed(0));

    if (amountADesiredRaw <= 0n || amountBDesiredRaw <= 0n) {
      return null;
    }
    const banks = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA); 
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB); 

    if (!bankInfoA || !bankInfoB) {
        return null;
    }

    const tx = new Transaction();
    tx.setSender(wallet.address);
    const sdkDepositParams = {
        poolInfo: poolInfo,
        bankInfoA: bankInfoA, 
        bankInfoB: bankInfoB,
        coinA: tx.object(coinAInObjectId),
        coinB: tx.object(coinBInObjectId),
        maxA: amountADesiredRaw,
        maxB: amountBDesiredRaw,
    };

    await steammSdk.Pool.depositLiquidityEntry(tx, sdkDepositParams);
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status.status === 'success') {
    } else {
    }
    return result;

  } catch (error: any) {
    return null;
  }
}

export async function removeSteammLiquidity(
  suiClient: SuiClient,
  steammSdk: SteammSDK,
  wallet: MvpWalletAdapter,
  poolInfo: PoolInfo,
  lpCoinObjectId: string,
  lpDecimals: number,
  lpAmountString: string,
  minAmountAString: string,
  minAmountBString: string,
  coinADecimals: number,
  coinBDecimals: number
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    return null;
  }
  if (!lpCoinObjectId) {
    return null;
  }

  let minAmountARaw: bigint;
  let minAmountBRaw: bigint;
  try {
    minAmountARaw = BigInt(new BigNumber(minAmountAString).shiftedBy(coinADecimals).toFixed(0));
    minAmountBRaw = BigInt(new BigNumber(minAmountBString).shiftedBy(coinBDecimals).toFixed(0));

    if (minAmountARaw < 0n || minAmountBRaw < 0n) {
      throw new Error("Min amounts cannot be negative.");
    }
  } catch (e) {
    return null;
  }

  const tx = new Transaction();
  tx.setSender(wallet.address);

  try {
    const banks: BankList = await steammSdk.getBanks(); 
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);
    
    if (!bankInfoA || !bankInfoB) {
         return null;
    }

    const params: RedeemLiquidityParams = {
      poolInfo: poolInfo,
      bankInfoA: bankInfoA,
      bankInfoB: bankInfoB,
      lpCoin: tx.object(lpCoinObjectId),
      minA: minAmountARaw,
      minB: minAmountBRaw,
    };

    await steammSdk.Pool.redeemLiquidityEntry(tx, params);
    
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status.status === 'success') {
    } else {
    }
    return result;

  } catch (error: any) { 
    return null;
  }
}

/**
 * Fetches extended data (like token symbols, decimals) for discovered pools for UI display.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getSteammPoolsExtended(
  steammSdk: SteammSDK | null,
  suiClient: SuiClient,
  limit?: number
): Promise<SteammPoolExtended[]> {
  if (!steammSdk) {
     return [];
  }

  const basicPools: PoolInfo[] = await getAllSteammPools(steammSdk);
  if (!basicPools || basicPools.length === 0) {
    return [];
  }

  const poolsToProcess = limit ? basicPools.slice(0, limit) : basicPools;

  const settledResults = await Promise.allSettled(
    poolsToProcess.map(async (poolInfo) => {
      await delay(200);
      const [metaA, metaB, metaLp] = await Promise.all([
        suiClient.getCoinMetadata({ coinType: poolInfo.coinTypeA }),
        suiClient.getCoinMetadata({ coinType: poolInfo.coinTypeB }),
        suiClient.getCoinMetadata({ coinType: poolInfo.lpTokenType })
      ]);

      const getSymbol = (meta: CoinMetadata | null, fallbackCoinType: string) => 
          meta?.symbol || fallbackCoinType.split('::').pop()?.substring(0, 6) || 'UNK';
      const getDecimals = (meta: CoinMetadata | null) => meta?.decimals ?? 0;

      const extendedPool: SteammPoolExtended = {
        ...poolInfo,
        symbolA: getSymbol(metaA, poolInfo.coinTypeA),
        symbolB: getSymbol(metaB, poolInfo.coinTypeB),
        decimalsA: getDecimals(metaA),
        decimalsB: getDecimals(metaB),
        lpSymbol: getSymbol(metaLp, poolInfo.lpTokenType),
        lpDecimals: getDecimals(metaLp),
        reserveA_ui: '0',
        reserveB_ui: '0',
        balanceAUi: '0',
        balanceBUi: '0',
        rawPoolInfo: poolInfo,
      };
      return extendedPool;
    })
  );

  const successfulPools: SteammPoolExtended[] = [];
  settledResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulPools.push(result.value);
    } else {
    }
  });

  return successfulPools;
}

/**
 * Gets a swap quote for a specific pool and input amount.
 */
export async function getSteammSwapQuote(
  steammSdk: SteammSDK | null,
  poolInfo: PoolInfo,
  inputCoinType: string,
  outputCoinType: string,
  inputAmountString: string,
  inputCoinDecimals: number
): Promise<SwapQuote | null> {
  if (!steammSdk) {
    return null;
  }
  if (!poolInfo) {
    return null;
  }

  let inputAmountRaw: string;
  try {
    inputAmountRaw = new BigNumber(inputAmountString)
      .shiftedBy(inputCoinDecimals)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toString();
    if (new BigNumber(inputAmountRaw).isLessThanOrEqualTo(0)) {
      throw new Error("Input amount must be positive.");
    }
  } catch (e) {
    return null;
  }

  try {
    const banks: BankList = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);

    if (!bankInfoA || !bankInfoB) {
      return null;
    }

    const a_is_input = (inputCoinType === poolInfo.coinTypeA);
    const b_is_input = (inputCoinType === poolInfo.coinTypeB);

    if (!a_is_input && !b_is_input) {
        throw new Error(`Input coin ${inputCoinType} does not match pool assets ${poolInfo.coinTypeA} / ${poolInfo.coinTypeB}`);
    }
    const a2b = a_is_input;

    const params: QuoteSwapParams = {
      poolInfo: poolInfo,
      bankInfoA: bankInfoA,
      bankInfoB: bankInfoB,
      amountIn: BigInt(inputAmountRaw), 
      a2b: a2b,
    };

    const quote: SwapQuote = await steammSdk.Pool.quoteSwap(params);
    return quote;

  } catch (error) {
    return null;
  }
}

/**
 * Gets a quote for adding liquidity to a pool.
 */
export async function getSteammAddLiquidityQuote(
  suiClient: SuiClient,
  steammSdk: SteammSDK,
  poolInfo: PoolInfo,
  maxAmountAString: string | null | undefined, 
  decimalsA: number,
  maxAmountBString: string | null | undefined, 
  decimalsB: number,
  userAddress?: string
): Promise<SteammAddLiquidityQuoteResult | null> {
  try {
    const banks = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);

    if (!bankInfoA || !bankInfoB) {
      return null;
    }

    let maxARaw = 0n;
    if (maxAmountAString && parseFloat(maxAmountAString) > 0) {
      maxARaw = BigInt(new BigNumber(maxAmountAString).shiftedBy(decimalsA).toFixed(0));
    }

    let maxBRaw = 0n;
    if (maxAmountBString && parseFloat(maxAmountBString) > 0) {
      maxBRaw = BigInt(new BigNumber(maxAmountBString).shiftedBy(decimalsB).toFixed(0));
    }

    if (maxARaw <= 0n && maxBRaw <= 0n) {
        return null;
    }

    const sdkQuoteDepositParams: QuoteDepositParams = {
      poolInfo,
      bankInfoA,
      bankInfoB,
      maxA: maxARaw,
      maxB: maxBRaw,
    };

    const rawQuote: SDKDepositQuote = await steammSdk.Pool.quoteDeposit(sdkQuoteDepositParams);

    let lpTokenDecimals = 9;
    const lpCoinMeta = await getTokenMeta(suiClient, poolInfo.lpTokenType);
    if (lpCoinMeta) {
      lpTokenDecimals = lpCoinMeta.decimals;
    } else {
    }

    return {
      poolId: poolInfo.poolId,
      amountAInUi: new BigNumber(rawQuote.depositA.toString()).shiftedBy(-decimalsA).toFormat(),
      amountBInUi: new BigNumber(rawQuote.depositB.toString()).shiftedBy(-decimalsB).toFormat(),
      lpTokensOutUi: new BigNumber(rawQuote.mintLp.toString()).shiftedBy(-lpTokenDecimals).toFormat(),
      coinTypeA: poolInfo.coinTypeA,
      coinTypeB: poolInfo.coinTypeB,
      lpCoinType: poolInfo.lpTokenType,
      rawQuote: rawQuote,
    };

  } catch (error: any) {
    return null;
  }
}

/**
 * Gets the user's LP token balance for a specific pool.
 */
export async function getUserSteammLpBalance(
  suiClient: SuiClient,
  userAddress: string,
  poolInfo: PoolInfo | null
): Promise<CoinBalance | null> {
  if (!suiClient || !userAddress) {
    return null;
  }
  if (!poolInfo || !poolInfo.lpTokenType) {
    return null;
  }

  try {
    const lpBalance = await suiClient.getBalance({
      owner: userAddress,
      coinType: poolInfo.lpTokenType,
    });
    return lpBalance;
  } catch (error) {
    return null;
  }
}

/**
 * Gets a quote for removing liquidity based on LP token amount.
 */
export async function getSteammRemoveLiquidityQuote(
  steammSdk: SteammSDK | null,
  poolInfo: PoolInfo,
  lpAmountString: string,
  lpDecimals: number 
): Promise<RedeemQuote | null> {
  if (!steammSdk) { return null; }
  if (!poolInfo) { return null; }

  let lpAmountRawBigInt: bigint;
  try {
    lpAmountRawBigInt = BigInt(new BigNumber(lpAmountString).shiftedBy(lpDecimals).integerValue(BigNumber.ROUND_FLOOR).toString());
    if (lpAmountRawBigInt <= 0n) {
      throw new Error("LP amount must be positive.");
    }
  } catch (e) {
    return null;
  }

  try {
    const banks: BankList = await steammSdk.getBanks();
    const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
    const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);
    if (!bankInfoA || !bankInfoB) throw new Error(`Could not find BankInfo for pool assets ${poolInfo.coinTypeA}/${poolInfo.coinTypeB}`);

    const params: QuoteRedeemParams = {
      poolInfo: poolInfo,
      bankInfoA: bankInfoA,
      bankInfoB: bankInfoB,
      lpTokens: lpAmountRawBigInt,
    };

    const quote: RedeemQuote = await steammSdk.Pool.quoteRedeem(params);
    return quote;

  } catch (error) {
    return null;
  }
}

/**
 * Fetches and formats user positions across all relevant STEAMM pools using sdk.getUserPositions.
 */
export async function getSteammUserPositions(
  steammSdk: SteammSDK | null,
  suiClient: SuiClient,
  userAddress: string
): Promise<UserLiquidityPositionInfo[]> {
  if (!steammSdk) { return []; }
  if (!suiClient || !userAddress) { return []; }
  
  try {
    const rawPositions = await steammSdk.getUserPositions(userAddress);

    if (!rawPositions || rawPositions.length === 0) {
        return [];
    }

    const allPools = await steammSdk.getPools();
    const poolInfoMap: Record<string, PoolInfo> = {};
    allPools.forEach(p => { poolInfoMap[p.poolId] = p; });

    const formattedPositions: UserLiquidityPositionInfo[] = [];
    const metadataCache: Record<string, CoinMetadata | null> = {};

    const getMeta = async (coinType: string): Promise<CoinMetadata | null> => {
      if (!coinType) return null;
      if (metadataCache[coinType] === undefined) {
          try {
              metadataCache[coinType] = await suiClient.getCoinMetadata({ coinType }) || null;
          } catch (e) {
              metadataCache[coinType] = null;
          }
      }
      return metadataCache[coinType];
    };

    for (const pos of rawPositions) {
      const poolInfo = poolInfoMap[pos.poolId];
      await delay(200);
      
      const [metaA, metaB, metaLp] = await Promise.all([
        getMeta(pos.coinTypeA),
        getMeta(pos.coinTypeB),
        poolInfo ? getMeta(poolInfo.lpTokenType) : Promise.resolve(null),
      ]);

      const decimalsA = metaA?.decimals ?? 0;
      const decimalsB = metaB?.decimals ?? 0;
      const decimalsLp = metaLp?.decimals ?? 9; 

      const symbolA = metaA?.symbol || pos.coinTypeA.split('::').pop()?.substring(0, 6) || 'UNK';
      const symbolB = metaB?.symbol || pos.coinTypeB.split('::').pop()?.substring(0, 6) || 'UNK';
      const lpSymbol = metaLp?.symbol || poolInfo?.lpTokenType.split('::').pop()?.substring(0,6) || 'LP';

      formattedPositions.push({
        poolId: pos.poolId,
        poolType: poolInfo?.quoterType ?? 'Unknown',
        coinTypeA: pos.coinTypeA,
        coinTypeB: pos.coinTypeB,
        symbolA: symbolA,
        symbolB: symbolB,
        lpCoinType: poolInfo?.lpTokenType ?? 'UnknownLPType',
        lpSymbol: lpSymbol,
        lpDecimals: decimalsLp,
        lpCoinBalanceUi: pos.lpTokenBalance.shiftedBy(-decimalsLp).toFormat(decimalsLp > 6 ? 6 : decimalsLp), 
        pooledAmountAUi: pos.balanceA.shiftedBy(-decimalsA).toFormat(decimalsA > 6 ? 6 : decimalsA), 
        pooledAmountBUi: pos.balanceB.shiftedBy(-decimalsB).toFormat(decimalsB > 6 ? 6 : decimalsB), 
      });
    }
    return formattedPositions;

  } catch (error: any) {
    return [];
  }
}

// ============================================================
// ==                ROUTED SWAP FUNCTIONS                   ==
// ============================================================

/**
 * Executes a multi-hop swap using the best route found by the SDK.
 */
export async function executeSteammRoutedSwap(
  suiClient: SuiClient,
  steammSdk: SteammSDK | null,
  wallet: MvpWalletAdapter,
  coinInType: string, 
  coinInDecimals: number, 
  coinOutType: string, 
  amountInString: string, 
  coinInObjectId?: string 
): Promise<SuiTransactionBlockResponse | null> {
  if (!steammSdk) {
    return null;
  }
  if (!wallet.address) {
    return null;
  }

  try {
    const amountInRaw = BigInt(new BigNumber(amountInString).shiftedBy(coinInDecimals).toString());
    if (amountInRaw <= 0n) {
      return null;
    }

    const swapRouteData = await steammSdk.Router.getBestSwapRoute(
      { coinIn: coinInType, coinOut: coinOutType }, 
      amountInRaw
    );

    if (!swapRouteData || !swapRouteData.route || swapRouteData.route.length === 0) {
      return null;
    }
    const { route, quote: multiSwapQuote } = swapRouteData;

    const tx = new Transaction();
    tx.setSender(wallet.address);

    let coinInArg: TransactionArgument | string;
    if (coinInObjectId) {
      coinInArg = tx.object(coinInObjectId); 
    } else if (coinInType === SUI_TYPE_ARG) {
      const suiCoin = await findOrCreateCoinOfRequiredBalance(tx, suiClient, wallet.address, amountInRaw.toString());
      if (!suiCoin) {
        return null;
      }
      coinInArg = suiCoin;
    } else {
      return null;
    }

    // steammSdk.Router.swapWithRoute is Promise<void>
    // It modifies the transaction (tx) in place and the contract handles sending output to the user.
    await steammSdk.Router.swapWithRoute(tx, {
      coinIn: coinInArg, 
      route: route,
      quote: multiSwapQuote 
    });
    
    // No explicit transferObjects needed here if swapWithRoute handles output transfer internally.

    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status.status === 'success') {
      // silent success
    } else {
      // silent error
    }
    return result;

  } catch (error: any) {
    return null;
  }
}

async function findOrCreateCoinOfRequiredBalance(
  tx: Transaction, 
  suiClient: SuiClient, 
  ownerAddress: string, 
  amountRequiredRaw: string
): Promise<TransactionArgument | null> {
  const requiredBN = new BigNumber(amountRequiredRaw);
  const coins = await suiClient.getCoins({ owner: ownerAddress, coinType: SUI_TYPE_ARG });
  
  let primaryCoinArg: TransactionArgument | undefined;
  const otherCoinArgs: TransactionArgument[] = [];

  for (const coin of coins.data) {
    const coinObjArg = tx.object(coin.coinObjectId);
    if (new BigNumber(coin.balance).gte(requiredBN)) {
      const [splitCoin] = tx.splitCoins(coinObjArg, [tx.pure.u64(amountRequiredRaw)]);
      return splitCoin;
    }
    if (!primaryCoinArg) primaryCoinArg = coinObjArg;
    else otherCoinArgs.push(coinObjArg);
  }

  if (primaryCoinArg && otherCoinArgs.length > 0) {
    tx.mergeCoins(primaryCoinArg, otherCoinArgs);
    const [splitCoin] = tx.splitCoins(primaryCoinArg, [tx.pure.u64(amountRequiredRaw)]);
    return splitCoin;
  } else if (primaryCoinArg) {
    const [splitCoin] = tx.splitCoins(primaryCoinArg, [tx.pure.u64(amountRequiredRaw)]);
    return splitCoin;
  }
  
  return null;
} 