import { SuiClient } from '@mysten/sui/client';
import { SteammSDK, SdkOptions } from '@suilend/steamm-sdk';
import { STEAMM_MAINNET_CONFIG, SteammSdkOptionsConfig } from './steamm.config';
import { getSuiClient, getCustomSuiClient } from '../mystensui/mystenSui.client';
import { SuiNetwork } from '../mystensui/mystenSui.config';

const steammSdkCache: Partial<Record<string, SteammSDK>> = {};

/**
 * Initializes and returns a SteammSDK instance for the given SdkOptions configuration.
 * Caches clients by RPC URL to avoid re-initialization for the same endpoint.
 *
 * @param suiClient The underlying SuiClient instance.
 * @param sdkConfig The SdkOptions configuration for SteammSDK.
 * @returns An initialized SteammSDK instance.
 */
export function initializeSteammSDK(
  suiClient: SuiClient,
  sdkConfig: SteammSdkOptionsConfig
): SteammSDK {
  const cacheKey = sdkConfig.fullRpcUrl;
  if (steammSdkCache[cacheKey]) {
    return steammSdkCache[cacheKey]!;
  }

  const client = new SteammSDK(sdkConfig as any as SdkOptions);
  steammSdkCache[cacheKey] = client;
  return client;
}

/**
 * Gets a SteammSDK instance for the default mainnet configuration.
 *
 * @param network The Sui network (determines which SuiClient is implicitly used, though SteammSDK uses its own RPC).
 * @returns An initialized SteammSDK instance for mainnet.
 */
export function getDefaultSteammSDK(network: Exclude<SuiNetwork, 'custom'> = 'mainnet'): SteammSDK {
  const suiClient = getSuiClient(network); 
  return initializeSteammSDK(suiClient, STEAMM_MAINNET_CONFIG);
}

/**
 * Gets a SteammSDK instance for a custom RPC and potentially custom Steamm configuration.
 * Note: This is a simplified version. A truly custom Steamm config would require building
 * the full SdkOptions structure, not just changing the RPC.
 * For now, it uses mainnet Steamm object IDs but with a custom RPC for the SuiClient.
 * 
 * @param customRpcUrl 
 * @returns SteammSDK instance
 */
export function getCustomSteammSDK(customRpcUrl: string): SteammSDK {
    const suiClient = getCustomSuiClient(customRpcUrl);
    const customSdkConfig: SteammSdkOptionsConfig = {
        ...STEAMM_MAINNET_CONFIG,
        fullRpcUrl: customRpcUrl,
    };
    return initializeSteammSDK(suiClient, customSdkConfig);
} 