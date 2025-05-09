import { SuiClient } from '@mysten/sui/client';
import { SuilendClient as SuilendSDKClient } from '@suilend/sdk/client';
import {
  SUILEND_DEFAULT_MARKET_CONFIG,
  SuilendUiLendingMarketConfig,
} from './suilend.config';
import { getSuiClient } from '../mystensui/mystenSui.client';
import { SuiNetwork } from '../mystensui/mystenSui.config';

const suilendClientCache: Partial<Record<string, SuilendSDKClient>> = {};

/**
 * Initializes and returns a SuilendSDKClient for the specified lending market configuration.
 * Caches clients by market ID to avoid re-initialization.
 *
 * @param suiClient The underlying SuiClient instance.
 * @param marketConfig The configuration for the target lending market.
 * @returns An initialized SuilendSDKClient instance.
 */
export async function initializeSuilendClient(
  suiClient: SuiClient,
  marketConfig: SuilendUiLendingMarketConfig
): Promise<SuilendSDKClient> {
  if (suilendClientCache[marketConfig.id]) {
    return suilendClientCache[marketConfig.id]!;
  }
  
  const client = await SuilendSDKClient.initialize(
    marketConfig.id,
    marketConfig.type,
    suiClient
  );
  suilendClientCache[marketConfig.id] = client;
  return client;
}

/**
 * Gets a SuilendSDKClient for the default mainnet market.
 *
 * @param network The Sui network for the underlying SuiClient (should typically match Suilend market's network).
 * @returns An initialized SuilendSDKClient instance for the default market.
 * @throws Error if default market config is not found.
 */
export async function getDefaultSuilendClient(network: Exclude<SuiNetwork, 'custom'> = 'mainnet'): Promise<SuilendSDKClient> {
  const suiClient = getSuiClient(network);
  if (!SUILEND_DEFAULT_MARKET_CONFIG) {
    throw new Error("Default Suilend Market configuration is not defined in suilend.config.ts");
  }
  return initializeSuilendClient(suiClient, SUILEND_DEFAULT_MARKET_CONFIG);
} 