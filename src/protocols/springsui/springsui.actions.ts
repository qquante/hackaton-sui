import { SuiClient, SuiTransactionBlockResponse, CoinMetadata } from '@mysten/sui/client';
import { Transaction, TransactionObjectInput } from '@mysten/sui/transactions';
import { LstClient, fetchLiquidStakingInfo, LiquidStakingObjectInfo } from '@suilend/springsui-sdk/client';
import { MvpWalletAdapter, getTokenMeta, getUserTokenBalance } from '../mystensui/mystenSui.actions';
import { PARA_SUI_LST_CONFIG_PLACEHOLDER, PARA_SUI_MAINNET_COIN_TYPE } from './springsui.config';
import { getSpecificLstClient } from './springsui.client';
import { SpringSuiUserLSTInfo } from './springsui.types';
import { SuiNetwork } from '../mystensui/mystenSui.config';
import BigNumber from 'bignumber.js';
import {
  fetchRegistryLiquidStakingInfoMap,
} from '@suilend/springsui-sdk/client';
import { SUI_DECIMALS } from '@mysten/sui/utils';

// Helper function to get LST <-> SUI exchange rate
export async function getLstSuiExchangeRate(
    suiClient: SuiClient,
    lstInfo: LiquidStakingObjectInfo
): Promise<BigNumber | null> {
    try {
        const rawSdkLstInfo = await fetchLiquidStakingInfo(lstInfo, suiClient);
        
        const totalSuiRaw = BigInt(rawSdkLstInfo.storage.totalSuiSupply.toString());
        const totalLstRaw = BigInt(rawSdkLstInfo.lstTreasuryCap.totalSupply.value.toString());

        if (totalLstRaw > 0n) {
            const exchangeRate = new BigNumber(totalSuiRaw.toString())
                                 .div(new BigNumber(totalLstRaw.toString()));
            return exchangeRate;
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function getUserLstDetails(
  suiClient: SuiClient,
  lstClient: LstClient,
  userAddress: string,
  lstCoinType: string
): Promise<SpringSuiUserLSTInfo | null> {
  const meta = await getTokenMeta(suiClient, lstCoinType);
  if (!meta) return null;

  const balanceInfo = await getUserTokenBalance(suiClient, userAddress, lstCoinType);
  let lstBalanceUi = "0.00";
  let lstBalanceRaw = "0";

  if (balanceInfo) {
    lstBalanceUi = new BigNumber(balanceInfo.balance).toFixed(meta.decimals > 2 ? meta.decimals : 2);
    lstBalanceRaw = new BigNumber(balanceInfo.balance).shiftedBy(meta.decimals).toString();
  } 

  let apyPercent = "N/A";
  try {
    const apy = await lstClient.getSpringSuiApy();
    apyPercent = apy.multipliedBy(100).toFixed(2) + '%';
  } catch (apyError) {
    if (!balanceInfo) {
        return {
            lstCoinType,
            lstSymbol: meta.symbol,
            lstBalanceUi: "0.00",
            apyPercent: "N/A",
        };
    }
  }

  let suiEquivalentUi: string | undefined;
  try {
    const exchangeRate = await getLstSuiExchangeRate(suiClient, lstClient.liquidStakingObject);
    if (exchangeRate && lstBalanceRaw !== "0") {
      const suiEquivalentRaw = new BigNumber(lstBalanceRaw).multipliedBy(exchangeRate);
      suiEquivalentUi = suiEquivalentRaw.shiftedBy(-SUI_DECIMALS).toFormat(SUI_DECIMALS > 2 ? SUI_DECIMALS : 2);
    }
  } catch (rateError) {
  }

  return {
    lstCoinType,
    lstSymbol: meta.symbol,
    lstBalanceUi,
    apyPercent,
    suiEquivalentUi,
  };
}

// Helper to get an LST client for default afSUI for convenience in UI calls
export async function getDefaultParaSuiLstClient(network: Exclude<SuiNetwork, 'custom'> = 'mainnet'): Promise<LstClient | null> {
    return getSpecificLstClient(network, PARA_SUI_LST_CONFIG_PLACEHOLDER.coinType);
}

/**
 * Discovers available SpringSui LST pools registered in the central registry.
 * 
 * @param suiClient Initialized SuiClient.
 * @returns A promise resolving to a map where keys are LST coin types (strings)
 *          and values are LiquidStakingObjectInfo, or an empty object on error.
 */
export async function discoverSpringSuiLstPools(
  suiClient: SuiClient
): Promise<Record<string, LiquidStakingObjectInfo>> {
  try {
    const lstInfoMap = await fetchRegistryLiquidStakingInfoMap(suiClient);
    const verifiedInfoMap: Record<string, LiquidStakingObjectInfo> = {};
    for (const coinType in lstInfoMap) {
      const info = lstInfoMap[coinType];
      if (info && typeof info.id === 'string' && typeof info.type === 'string' && typeof info.weightHookId === 'string') {
        verifiedInfoMap[coinType] = info as LiquidStakingObjectInfo;
      } else {
      }
    }
    return verifiedInfoMap;
  } catch (error) {
    return {};
  }
}

// ============================================================
// Implementation for getSpringSuiPoolApys
// ============================================================

export interface SpringSuiPoolApyInfo {
  coinType: string;
  symbol: string;
  apyPercent: string;
  lstInfo: LiquidStakingObjectInfo;
}

/**
 * Fetches APY for a specific or all discovered LST pools.
 * @param suiClient 
 * @param lstPools Map of discovered pools (from discoverSpringSuiLstPools).
 * @param specificCoinType Optional: If provided, only fetches APY for this LST.
 */
export async function getSpringSuiPoolApys(
  suiClient: SuiClient,
  lstPools: Record<string, LiquidStakingObjectInfo>,
  specificCoinType?: string
): Promise<SpringSuiPoolApyInfo[]> {
  const results: SpringSuiPoolApyInfo[] = [];
  const targetPools = specificCoinType ? { [specificCoinType]: lstPools[specificCoinType] } : lstPools;

  for (const coinType in targetPools) {
    if (!targetPools[coinType]) {
      continue;
    }
    
    const lstInfo = targetPools[coinType];
    let apyString = "N/A";
    let symbol = coinType.split('::').pop() || "LST";

    try {
      const metadata = await suiClient.getCoinMetadata({ coinType });
      if (metadata?.symbol) {
        symbol = metadata.symbol;
      }

      const tempLstClient = await LstClient.initialize(suiClient, lstInfo);
      const apyBigNumber = await tempLstClient.getSpringSuiApy();
      apyString = apyBigNumber.multipliedBy(100).toFixed(2) + '%';

    } catch (error) {
    }

    results.push({
      coinType,
      symbol,
      apyPercent: apyString,
      lstInfo: lstInfo,
    });
  }
  return results;
}

// ============================================================
// Implementation for stakeSuiForSpringSuiLst
// ============================================================

/**
 * Stakes SUI to mint a specific LST.
 * @param suiClient 
 * @param lstClient Initialized LstClient for the target LST pool.
 * @param wallet 
 * @param amountSuiToStakeString Amount of SUI to stake (e.g., "10.5").
 */
export async function stakeSuiForSpringSuiLst(
  suiClient: SuiClient,
  lstClient: LstClient,
  wallet: MvpWalletAdapter,
  amountSuiToStakeString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) {
    return null;
  }
  if (!lstClient) {
    return null;
  }
  const lstCoinType = lstClient.liquidStakingObject.type;

  let amountSuiToStakeRaw: string;
  try {
    amountSuiToStakeRaw = new BigNumber(amountSuiToStakeString)
      .shiftedBy(SUI_DECIMALS)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toString();
    if (new BigNumber(amountSuiToStakeRaw).lte(0)) {
      throw new Error("Amount to stake must be positive.");
    }
  } catch (e) {
    return null;
  }

  const tx = new Transaction();
  tx.setSender(wallet.address);

  try {
    lstClient.mintAmountAndRebalanceAndSendToUser(
      tx,
      wallet.address,
      amountSuiToStakeRaw
    );
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status.status === 'success') {
      const newLstCoin = result.objectChanges?.find(
        (oc): oc is Extract<typeof oc, { type: 'created' }> => 
          oc.type === 'created' && 
          oc.objectType === lstCoinType && 
          (oc.owner as any)?.AddressOwner === wallet.address 
      );
      // silent success
    } else {
      // silent error
    }
    return result;

  } catch (error) {
    return null;
  }
}

// ============================================================
// Specific Staking Function for ParaSui
// ============================================================
/**
 * Stakes SUI specifically for ParaSUI LST.
 * This is a convenience wrapper around stakeSuiForSpringSuiLst.
 * @param suiClient 
 * @param wallet 
 * @param amountSuiToStakeString
 * @param network
 */
export async function stakeSuiForParaSui(
  suiClient: SuiClient,
  wallet: MvpWalletAdapter,
  amountSuiToStakeString: string,
  network: Exclude<SuiNetwork, 'custom'> = 'mainnet'
): Promise<SuiTransactionBlockResponse | null> {
  const paraSuiLstClient = await getSpecificLstClient(network, PARA_SUI_MAINNET_COIN_TYPE);

  if (!paraSuiLstClient) {
    return null;
  }

  return stakeSuiForSpringSuiLst(
    suiClient,
    paraSuiLstClient,
    wallet,
    amountSuiToStakeString
  );
}

// ============================================================
// Implementation for redeemSpringSuiLstForSui
// ============================================================

/**
 * Redeems a specific LST for SUI.
 * @param suiClient For fetching LST metadata and gas price.
 * @param lstClient Initialized LstClient for the target LST pool.
 * @param wallet 
 * @param amountLstToRedeemString Amount of LST to redeem (e.g., "50.0").
 */
export async function redeemSpringSuiLstForSui(
  suiClient: SuiClient,
  lstClient: LstClient,
  wallet: MvpWalletAdapter,
  amountLstToRedeemString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address) { 
      return null; 
  }
  if (!lstClient) { 
      return null; 
  }

  const lstCoinType = lstClient.liquidStakingObject.type;

  const meta = await getTokenMeta(suiClient, lstCoinType);
  if (!meta) {
      return null;
  }
  const lstDecimals = meta.decimals;

  let amountLstToRedeemRaw: string;
  try {
    amountLstToRedeemRaw = new BigNumber(amountLstToRedeemString)
      .shiftedBy(lstDecimals)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toString();
    if (new BigNumber(amountLstToRedeemRaw).lte(0)) { throw new Error("Amount must be positive."); }
  } catch (e) { 
      return null; 
  }

  const tx = new Transaction();
  tx.setSender(wallet.address);

  try {
      lstClient.redeemAmountAndSendToUser(
      tx,
      wallet.address,
      amountLstToRedeemRaw
    );

    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result?.effects?.status.status === 'success') {
        // silent success
    } else {

    }
    return result;
  } catch (error) { 
      return null; 
  }
} 