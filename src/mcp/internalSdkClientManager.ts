import { SuiClient } from '@mysten/sui/client';
import { LstClient } from '@suilend/springsui-sdk/client';
import { SteammSDK } from '@suilend/steamm-sdk';
import { SuilendClient } from '@suilend/sdk';
import { 
    SuiNetwork, 
    getSuiClient, 
    getSpecificLstClient, 
    getDefaultSteammSDK,
    getDefaultSuilendClient,
    initializeSuilendClient
} from '../index'; 
import { SUILEND_MAINNET_MARKETS, SUILEND_DEFAULT_MARKET_CONFIG } from '../protocols/suilend/suilend.config';

// Cache for client instances to avoid re-initialization if not handled by underlying getters
const clientCache = new Map<string, any>();

/**
 * Retrieves a SuiClient instance for the specified network.
 * @param network - The Sui network (mainnet, testnet, devnet, localnet). Defaults to mainnet.
 * @returns A SuiClient instance.
 */
export function getSuiClientInstance(network: Exclude<SuiNetwork, 'custom'> = 'mainnet'): SuiClient {
    return getSuiClient(network);
}

/**
 * Retrieves a specific LST client for SpringSui.
 * @param network - The Sui network.
 * @param lstCoinType - The LST coin type.
 * @returns A Promise resolving to an LstClient instance or null.
 */
export async function getSpringSuiLstClientInstance(
    network: Exclude<SuiNetwork, 'custom'>,
    lstCoinType: string
): Promise<LstClient | null> {
    const cacheKey = `springsui-lst-${lstCoinType}-${network}`;
    if (clientCache.has(cacheKey)) {
        return clientCache.get(cacheKey) as LstClient;
    }
    const client = await getSpecificLstClient(network, lstCoinType);
    if (client) {
        clientCache.set(cacheKey, client);
    }
    return client;
}

/**
 * Retrieves a SteammSDK instance for the specified network.
 * @param network - The Sui network.
 * @returns A SteammSDK instance.
 */
export function getSteammSdkInstance(network: Exclude<SuiNetwork, 'custom'>): SteammSDK { // Changed SuiNetwork to Exclude<SuiNetwork, 'custom'>
    const cacheKey = `steamm-sdk-${network}`;
    if (clientCache.has(cacheKey)) {
        return clientCache.get(cacheKey) as SteammSDK;
    }
    // getDefaultSteammSDK expects Exclude<SuiNetwork, 'custom'> or a compatible subset
    const sdk = getDefaultSteammSDK(network);
    clientCache.set(cacheKey, sdk);
    return sdk;
}

/**
 * Retrieves a SuilendClient instance for the specified market and network.
 * @param marketId - Optional. The Suilend market ID. Defaults to the main market if not provided.
 * @param network - Optional. The Sui network. Defaults to mainnet.
 * @returns A Promise resolving to a SuilendClient instance or null.
 */
export async function getSuilendSdkInstance(
    marketId?: string, 
    network: Exclude<SuiNetwork, 'custom'> = 'mainnet' // Changed SuiNetwork to Exclude<SuiNetwork, 'custom'>
): Promise<SuilendClient | null> {
    marketId = marketId || SUILEND_DEFAULT_MARKET_CONFIG?.id;
    const cacheKey = `suilend-sdk-${marketId}-${network}`;

    if (!marketId) {
        return null;
    }

    if (clientCache.has(cacheKey)) {
        return clientCache.get(cacheKey) as SuilendClient;
    }

    const suiClient = getSuiClientInstance(network);
    let client: SuilendClient | null = null;

    if (marketId === SUILEND_DEFAULT_MARKET_CONFIG?.id) {
        client = await getDefaultSuilendClient(network);
    } else {
        const marketConfig = SUILEND_MAINNET_MARKETS.find(m => m.id === marketId);
        if (marketConfig) {
            client = await initializeSuilendClient(suiClient, marketConfig);
        } else {
            return null;
        }
    }

    if (client) {
        clientCache.set(cacheKey, client);
    }
    return client;
}