import { SuiClient } from '@mysten/sui/client';
import { LstClient, fetchRegistryLiquidStakingInfoMap, LiquidStakingObjectInfo } from '@suilend/springsui-sdk/client';
import { SPRING_SUI_UPGRADE_CAP_ID, LiquidStakingTokenConfig, PARA_SUI_LST_CONFIG_PLACEHOLDER } from './springsui.config';
import { getSuiClient } from '../mystensui/mystenSui.client';
import { SuiNetwork } from '../mystensui/mystenSui.config';

const lstClientCache: Partial<Record<string, LstClient>> = {};
const lstInfoCache: Partial<Record<string, LiquidStakingObjectInfo>> = {};
let dynamicSpringSuiPackageId: string | null = null;

/**
 * Fetches the latest package ID for the SpringSui protocol using the UpgradeCap ID.
 * Caches the package ID after the first fetch.
 */
async function getSpringSuiPackageId(suiClient: SuiClient): Promise<string> {
  if (dynamicSpringSuiPackageId) {
    return dynamicSpringSuiPackageId;
  }
  const packageObject = await suiClient.getObject({
    id: SPRING_SUI_UPGRADE_CAP_ID,
    options: { showContent: true, showType: true },
  });
  if (packageObject.data?.content?.dataType !== 'moveObject') {
    throw new Error('UpgradeCap ID did not return a Move object for SpringSui package ID.');
  }
  dynamicSpringSuiPackageId = (packageObject.data.content.fields as { package: string }).package;
  if (!dynamicSpringSuiPackageId) {
    throw new Error('Could not extract package ID from UpgradeCap object for SpringSui.');
  }
  return dynamicSpringSuiPackageId;
}

/**
 * Initializes and returns an LstClient for a given LST configuration.
 * Dynamically resolves the package ID on first initialization of any LstClient.
 *
 * @param suiClient The underlying SuiClient instance.
 * @param lstConfig The configuration for the target LST.
 * @returns An initialized LstClient instance.
 */
export async function initializeLstClient(
  suiClient: SuiClient,
  lstObjectInfo: LiquidStakingObjectInfo
): Promise<LstClient> {
  if (lstClientCache[lstObjectInfo.id]) {
    return lstClientCache[lstObjectInfo.id]!;
  }

  await getSpringSuiPackageId(suiClient); 

  const client = await LstClient.initialize(suiClient, lstObjectInfo);
  lstClientCache[lstObjectInfo.id] = client;
  return client;
}

/**
 * Fetches LiquidStakingObjectInfo for a given LST coin type from the registry.
 * Caches the result.
 * @param suiClient 
 * @param targetCoinType e.g., AFSUI_LST_CONFIG_PLACEHOLDER.coinType
 * @returns LiquidStakingObjectInfo or null if not found
 */
export async function getLstInfoByCoinType(
  suiClient: SuiClient,
  targetCoinType: string
): Promise<LiquidStakingObjectInfo | null> {
  if (lstInfoCache[targetCoinType]) {
    return lstInfoCache[targetCoinType]!;
  }

  const registryMap = await fetchRegistryLiquidStakingInfoMap(suiClient);
  const foundEntry = Object.values(registryMap).find(info => info.type.endsWith(targetCoinType)); 

  if (foundEntry) {
    const lstInfo: LiquidStakingObjectInfo = {
        id: foundEntry.id as string,
        type: foundEntry.type as string,
        weightHookId: foundEntry.weightHookId as string
    };
    lstInfoCache[targetCoinType] = lstInfo;
    return lstInfo;
  }
  return null;
}


/**
 * Gets an LstClient for a specific LST, e.g., afSUI, by first fetching its info.
 *
 * @param network The Sui network.
 * @param lstConfig The static part of the LST config (like name and target coin type).
 * @returns An initialized LstClient or null if info cannot be fetched.
 */
export async function getSpecificLstClient(
  network: Exclude<SuiNetwork, 'custom'> = 'mainnet',
  targetLstCoinType: string = PARA_SUI_LST_CONFIG_PLACEHOLDER.coinType
): Promise<LstClient | null> {
  const suiClient = getSuiClient(network);
  const lstObjectInfo = await getLstInfoByCoinType(suiClient, targetLstCoinType);

  if (!lstObjectInfo) {
    return null;
  }
  
  return initializeLstClient(suiClient, lstObjectInfo);
} 