import { SuiClient, SuiTransactionBlockResponse, CoinMetadata } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuilendClient as SuilendSDKClient } from '@suilend/sdk/client';
import { Obligation as RawSuilendObligation, Deposit as RawSuilendDeposit } from '@suilend/sdk/_generated/suilend/obligation/structs';
import { Reserve } from '@suilend/sdk/_generated/suilend/reserve/structs';
import { MvpWalletAdapter } from '../mystensui/mystenSui.actions';
import { ReserveAssetDataExtended, SuilendObligationDetails, ObligationHistoryPage } from './suilend.types';
import { parseReserve, ParsedReserve } from '@suilend/sdk/parsers/reserve';
import { parseObligation, ParsedObligation } from '@suilend/sdk/parsers/obligation';
import BigNumber from 'bignumber.js';
import { normalizeStructTag } from '@mysten/sui/utils';
import { getObligationHistoryPage as sdkGetObligationHistoryPage } from '@suilend/sdk/utils/obligation';

interface LocalTypeName { name: string; }

export async function getSuilendMarketAssets(
  suilendClient: SuilendSDKClient,
  suiClient: SuiClient
): Promise<ReserveAssetDataExtended[]> {
  if (!suilendClient || !suilendClient.lendingMarket) {
    return [];
  }

  const rawReserves: Reserve<string>[] = suilendClient.lendingMarket.reserves;
  
  if (!rawReserves || rawReserves.length === 0) {
    return [];
  }

  const allCoinTypesToFetch = new Set<string>();
  rawReserves.forEach((r: Reserve<string>) => {
    if (r.coinType && (r.coinType as unknown as LocalTypeName).name) {
      allCoinTypesToFetch.add((r.coinType as unknown as LocalTypeName).name);
    }

    r.depositsPoolRewardManager?.poolRewards?.forEach(pr => {
      if (pr && pr.coinType && (pr.coinType as unknown as LocalTypeName).name) { 
        allCoinTypesToFetch.add((pr.coinType as unknown as LocalTypeName).name);
      }
    });

    r.borrowsPoolRewardManager?.poolRewards?.forEach(pr => {
      if (pr && pr.coinType && (pr.coinType as unknown as LocalTypeName).name) { 
        allCoinTypesToFetch.add((pr.coinType as unknown as LocalTypeName).name);
      }
    });
  });

  const uniqueCoinTypes = Array.from(allCoinTypesToFetch);

  const coinMetadataMap: Record<string, CoinMetadata> = {};
  await Promise.all(
    uniqueCoinTypes.map(async (coinType) => {
      let normalizedCoinType = coinType;
      try {
        normalizedCoinType = normalizeStructTag(coinType);
        const metadata = await suiClient.getCoinMetadata({ coinType: normalizedCoinType });
        if (metadata) {
          coinMetadataMap[normalizedCoinType] = metadata;
        } else {
          coinMetadataMap[normalizedCoinType] = {
            decimals: 0,
            name: normalizedCoinType.split('::').pop() || 'Unknown',
            symbol: normalizedCoinType.split('::').pop()?.substring(0, 4).toUpperCase() || 'UNK',
            description: `Metadata not found for ${normalizedCoinType}`,
            iconUrl: null,
            id: null, 
          };
        }
      } catch (error) {
        try { normalizedCoinType = normalizeStructTag(coinType); } catch (_) { /* keep original coinType if still fails */ }
        coinMetadataMap[normalizedCoinType] = {
            decimals: 0,
            name: normalizedCoinType.split('::').pop() || 'Unknown',
            symbol: normalizedCoinType.split('::').pop()?.substring(0, 4).toUpperCase() || 'UNK',
            description: `Error fetching metadata for ${normalizedCoinType}`,
            iconUrl: null,
            id: null, 
        };
      }
    })
  );

  const extendedAssets: ReserveAssetDataExtended[] = [];
  for (const rawReserve of rawReserves) {
      try {
        const mainCoinTypeName = (rawReserve.coinType as unknown as LocalTypeName)?.name;
        if (!mainCoinTypeName) {
            continue;
        }
        const normalizedMainCoinType = normalizeStructTag(mainCoinTypeName);
        
        const parsed: ParsedReserve = parseReserve(rawReserve, coinMetadataMap);

        extendedAssets.push({
          id: parsed.id, 
          coinType: normalizedMainCoinType, 
          symbol: parsed.token.symbol,
          name: parsed.token.name,
          iconUrl: parsed.token.iconUrl,
          decimals: parsed.token.decimals, 
          price: parsed.price.dp(parsed.token.decimals > 4 ? 4 : parsed.token.decimals).toString(),
          depositLimit: parsed.config.depositLimit.toString(),
          borrowLimit: parsed.config.borrowLimit.toString(),
          supplyApyPercent: parsed.depositAprPercent.toFixed(2) + '%',
          borrowApyPercent: parsed.borrowAprPercent.toFixed(2) + '%',
          totalDepositedUi: parsed.depositedAmount.shiftedBy(-(parsed.token.decimals || 0)).toFormat(2),
          totalBorrowedUi: parsed.borrowedAmount.shiftedBy(-(parsed.token.decimals || 0)).toFormat(2),
          availableAmountUi: parsed.availableAmount.shiftedBy(-(parsed.token.decimals || 0)).toFormat(2),
          ctokenSupplyUi: parsed.ctokenSupply.shiftedBy(-(parsed.mintDecimals || 0)).toFormat(parsed.mintDecimals || 0, BigNumber.ROUND_DOWN),
          utilizationPercent: parsed.utilizationPercent.toFixed(2) + '%',
          config: {
            openLtvPct: parsed.config.openLtvPct,
            closeLtvPct: parsed.config.closeLtvPct,
            maxCloseLtvPct: parsed.config.maxCloseLtvPct,
            borrowWeightBps: parsed.config.borrowWeightBps.toNumber(),
            liquidationBonusBps: parsed.config.liquidationBonusBps,
            depositLimitUsd: parsed.config.depositLimitUsd.toString(),
            borrowLimitUsd: parsed.config.borrowLimitUsd.toString(),
            borrowFeeBps: parsed.config.borrowFeeBps,
            spreadFeeBps: parsed.config.spreadFeeBps,
            protocolLiquidationFeeBps: parsed.config.protocolLiquidationFeeBps,
            isolated: parsed.config.isolated,
          },
          rawParsedData: parsed, 
        });
      } catch (parseError: any) {
      }
  }
  return extendedAssets;
}

export async function ensureSuilendObligation(
  suiClient: SuiClient,
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter
): Promise<{ obligationId?: string; ownerCapId?: string; createdNow: boolean } | null> {
  if (!wallet.address || !suilendClient) {
    return null;
  }

  const marketTypeArgs: string[] = [suilendClient.lendingMarket.$typeArgs[0]];
  let obligationId: string | undefined;
  let ownerCapId: string | undefined;
  let createdNow = false;

  try {
    const ownerCaps = await SuilendSDKClient.getObligationOwnerCaps(
      wallet.address,
      marketTypeArgs,
      suiClient
    );

    if (ownerCaps && ownerCaps.length > 0) {
      const cap = ownerCaps[0];
      ownerCapId = cap.id as string;
      obligationId = cap.obligationId;
    } else {
      const tx = new Transaction();
      tx.setSender(wallet.address);
      const gasPrice = await suiClient.getReferenceGasPrice();
      tx.setGasPrice(gasPrice);

      suilendClient.createObligation(tx);
      
      const response = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true },
      });

      if (response?.effects?.status.status === 'success') {
        createdNow = true;
        
        response.objectChanges?.forEach(change => {
          if (change.type === 'created') {
            if (change.objectType.includes('::obligation::Obligation')) {
              obligationId = change.objectId;
            }
            if (change.objectType.includes('::lending_market::ObligationOwnerCap') && 
                (change.owner as { AddressOwner: string })?.AddressOwner === wallet.address) {
              ownerCapId = change.objectId;
            }
          }
        });

        if (obligationId && ownerCapId) {
        } else {
          const refreshedCaps = await SuilendSDKClient.getObligationOwnerCaps(wallet.address, marketTypeArgs, suiClient);
          if (refreshedCaps && refreshedCaps.length > 0) {
            const newCap = refreshedCaps[0];
            if (newCap) {
                ownerCapId = newCap.id as string;
                obligationId = newCap.obligationId;
            } else {
                 return null;
            }
          } else {
            return null;
          }
        }
      } else {
        return null;
      }
    }
    if (!obligationId || !ownerCapId) {
        return null;
    }
    return { obligationId, ownerCapId, createdNow };
  } catch (error) {
    return null;
  }
}

export async function depositToSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  assetCoinType: string,
  assetDecimals: number, 
  amountToDepositString: string,
  userOwnerCapId: string 
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userOwnerCapId) {
    return null;
  }

  const amountRawString = new BigNumber(amountToDepositString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const gasPrice = await suiClient.getReferenceGasPrice();
  tx.setGasPrice(gasPrice);

  try {
    await suilendClient.depositIntoObligation(
      wallet.address,
      assetCoinType,
      amountRawString,
      tx,
      userOwnerCapId
    );
    
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });

    if (response && response.effects && response.effects.status) {
      // silent log
      if (response.effects.status.status === 'failure') {
      }
    } else {
      if (response && response.effects) {
      } else if (response) {
      } else {
      }
    }
    return response;
  } catch (error: any) {
    return null;
  }
}

export async function getSuilendObligationDetails(
  suilendClient: SuilendSDKClient,
  suiClient: SuiClient, 
  obligationId: string,
): Promise<SuilendObligationDetails | null> {
  if (!obligationId || !suilendClient) { 
    return null; 
  }

  try {
    const rawObligation: RawSuilendObligation<string> | null = await suilendClient.getObligation(obligationId);

    if (!rawObligation) {
      return null;
    }
    const marketAssets = await getSuilendMarketAssets(suilendClient, suiClient);
    const parsedReserveMap: Record<string, ParsedReserve> = {};
    marketAssets.forEach(asset => {
        if (asset.rawParsedData && asset.coinType) {
             parsedReserveMap[asset.coinType] = asset.rawParsedData;
        } else {
        }
    });

    const parsedObligation: ParsedObligation = parseObligation(rawObligation, parsedReserveMap);

    const processedDeposits = parsedObligation.deposits.map(dep => {
      const depositedAmountBn = dep.depositedAmount; 
      return {
        coinType: dep.reserve.token.coinType,
        symbol: dep.reserve.token.symbol,
        decimals: dep.reserve.token.decimals,
        depositedAmountBn: depositedAmountBn,
        depositedAmountUi: depositedAmountBn.toFormat(dep.reserve.token.decimals > 4 ? 4 : dep.reserve.token.decimals),
        depositedValueUsd: dep.depositedAmountUsd.toFormat(2),
      }
    });

    const processedBorrows = parsedObligation.borrows.map(borrow => {
      const borrowedAmountBn = borrow.borrowedAmount; 
      return {
        coinType: borrow.reserve.token.coinType,
        symbol: borrow.reserve.token.symbol,
        decimals: borrow.reserve.token.decimals,
        borrowedAmountBn: borrowedAmountBn,
        borrowedAmountUi: borrowedAmountBn.toFormat(borrow.reserve.token.decimals > 4 ? 4 : borrow.reserve.token.decimals),
        borrowedValueUsd: borrow.borrowedAmountUsd.toFormat(2),
      }
    });

    const totalDepositedValueUsdStr = parsedObligation.depositedAmountUsd.toFormat(2);
    const totalBorrowedValueUsdStr = parsedObligation.borrowedAmountUsd.toFormat(2);
    
    let calculatedWeightedCollateralUsd = new BigNumber(0);
    parsedObligation.deposits.forEach(dep => {
        const ltvRate = (dep.reserve?.config?.openLtvPct !== undefined) ? new BigNumber(dep.reserve.config.openLtvPct).dividedBy(100) : new BigNumber(0);
        calculatedWeightedCollateralUsd = calculatedWeightedCollateralUsd.plus(
            dep.depositedAmountUsd.multipliedBy(ltvRate)
        );
    });

    let healthFactor = "N/A";
    const weightedBorrowsUsd = parsedObligation.weightedBorrowsUsd;
    
    if (weightedBorrowsUsd && weightedBorrowsUsd.isGreaterThan(0)) {
        if (calculatedWeightedCollateralUsd.isZero()) {
            healthFactor = "0.00";
        } else {
            healthFactor = calculatedWeightedCollateralUsd.dividedBy(weightedBorrowsUsd).toFormat(2);
        }
    } else {
        healthFactor = "Healthy";
    }
    

    return {
      obligationId: obligationId, 
      totalDepositedValueUsd: totalDepositedValueUsdStr, 
      totalBorrowedValueUsd: totalBorrowedValueUsdStr,  
      healthFactor: healthFactor,
      collateral: processedDeposits,
      borrows: processedBorrows,
    };
  } catch (error) {
    return null;
  }
}

export async function withdrawFromSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  userObligationId: string,
  userObligationOwnerCapId: string,
  assetCoinType: string,
  assetDecimals: number,
  amountToWithdrawString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userObligationId || !userObligationOwnerCapId) {
    return null;
  }

  const amountRawString = new BigNumber(amountToWithdrawString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const gasPrice = await suiClient.getReferenceGasPrice();
  tx.setGasPrice(gasPrice);

  try {
    const obligationData: RawSuilendObligation<string> | null = await suilendClient.getObligation(userObligationId);
    if (!obligationData) {
      return null; 
    }
    
    await suilendClient.refreshAll(tx, obligationData);

    await suilendClient.withdrawAndSendToUser(
      wallet.address,
      userObligationOwnerCapId,
      userObligationId,
      assetCoinType,
      amountRawString,
      tx
    );
    
    const response = await wallet.signAndExecuteTransactionBlock({ 
        transactionBlock: tx, 
        options: { showEffects: true, showObjectChanges: true, showEvents: true }
    });

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'success') {
      } else {
      }
    } else {
    }
    return response;
  } catch (error: any) {
    return null;
  }
}

export async function borrowFromSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  userObligationId: string,
  userObligationOwnerCapId: string,
  assetCoinType: string,
  assetDecimals: number,
  amountToBorrowString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userObligationId || !userObligationOwnerCapId) {
    return null;
  }
  
  const amountRawString = new BigNumber(amountToBorrowString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const gasPrice = await suiClient.getReferenceGasPrice();
  tx.setGasPrice(gasPrice);

  try {
    const obligationData: RawSuilendObligation<string> | null = await suilendClient.getObligation(userObligationId);
    if (!obligationData) {
      return null;
    }
    
    await suilendClient.refreshAll(tx, obligationData);

    await suilendClient.borrowAndSendToUser(
      wallet.address,
      userObligationOwnerCapId,
      userObligationId,
      assetCoinType,
      amountRawString,
      tx
    );

    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'failure') {
      }
    } else {
    }
    return response;
  } catch (error: any) {
    return null;
  }
}

export async function repayToSuilend(
  suiClient: SuiClient, 
  suilendClient: SuilendSDKClient,
  wallet: MvpWalletAdapter,
  userObligationId: string,
  assetCoinType: string,
  assetDecimals: number,
  amountToRepayString: string
): Promise<SuiTransactionBlockResponse | null> {
  if (!wallet.address || !suilendClient) { 
    return null; 
  }
  if (!userObligationId) {
    return null;
  }

  const amountRawString = new BigNumber(amountToRepayString).shiftedBy(assetDecimals).toString();

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const gasPrice = await suiClient.getReferenceGasPrice();
  tx.setGasPrice(gasPrice);

  try {
    const obligationData: RawSuilendObligation<string> | null = await suilendClient.getObligation(userObligationId);
    if (!obligationData) {
      return null;
    }
    await suilendClient.refreshAll(tx, obligationData);

    await suilendClient.repayIntoObligation(
      wallet.address,
      userObligationId,
      assetCoinType,
      amountRawString,
      tx
    );

    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });

    if (response && response.effects && response.effects.status) {
      if (response.effects.status.status === 'failure') {
      }
    } else {
    }
    return response;
  } catch (error) {
    return null;
  }
}

/**
 * Fetches a paginated history of transactions for a specific Suilend obligation.
 *
 * @param suiClient The SuiClient instance.
 * @param obligationId The ID of the obligation to fetch history for.
 * @param maxQuantity The maximum number of history items to return per page.
 * @param cursor The cursor for pagination (from a previous response, or null to start).
 * @returns A promise that resolves to an ObligationHistoryPage object or null if an error occurs.
 */
export async function getSuilendObligationHistory(
  suiClient: SuiClient,
  obligationId: string,
  maxQuantity: number = 10,
  cursor: string | null = null
): Promise<ObligationHistoryPage | null> {
  if (!obligationId) {
    return null;
  }
  try {
    const historyPage = await sdkGetObligationHistoryPage(
      suiClient,
      obligationId,
      maxQuantity,
      cursor
    );
    return historyPage as ObligationHistoryPage;
  } catch (error) {
    return null;
  }
}

// We will add more functions here as needed, for example, to parse events from a digest. 