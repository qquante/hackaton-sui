import { z } from 'zod';
import {
    getLstSuiExchangeRateSchema,
    getUserLstDetailsSchema,
    discoverLstPoolsSchema,
    getSpringSuiPoolApysSchema,
    stakeSuiForSpringSuiLstSchema,
    stakeSuiForParaSuiSchema,
    redeemSpringSuiLstForSuiSchema
} from '../zodSchemas/springSuiSchemas';
import {
    getLstSuiExchangeRate as sdkGetLstSuiExchangeRate,
    getUserLstDetails as sdkGetUserLstDetails,
    discoverSpringSuiLstPools as sdkDiscoverSpringSuiLstPools,
    getSpringSuiPoolApys as sdkGetSpringSuiPoolApys,
    stakeSuiForSpringSuiLst as sdkStakeSuiForSpringSuiLst,
    stakeSuiForParaSui as sdkStakeSuiForParaSui,
    redeemSpringSuiLstForSui as sdkRedeemSpringSuiLstForSui
} from '@/protocols/springsui/springsui.actions';
import {
    getSuiClientInstance,
    getSpringSuiLstClientInstance
} from '../internalSdkClientManager';
import { Transaction } from '@mysten/sui/transactions';
import { LstClient } from '@suilend/springsui-sdk/client';
import { SUI_DECIMALS } from '@mysten/sui/utils';
import BigNumber from 'bignumber.js';
import { PARA_SUI_MAINNET_COIN_TYPE } from '@/protocols/springsui/springsui.config';
import { McpToolOutput, PreparedTransactionOutput } from '../mcpUtils';

export async function handleGetLstSuiExchangeRate(
    inputs: z.infer<typeof getLstSuiExchangeRateSchema>
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = getSuiClientInstance(networkArg);
        const lstClient = await getSpringSuiLstClientInstance(networkArg, inputs.lstCoinType);
        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ${inputs.lstCoinType} on network ${networkArg}`);
        }
        const result = await sdkGetLstSuiExchangeRate(suiClient, lstClient.liquidStakingObject);
        return { content: [{ type: "text", text: JSON.stringify(result?.toString() ?? null) }] };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetLstSuiExchangeRate:', error);
        throw new Error(`Error fetching LST-SUI exchange rate: ${error.message}`);
    }
}

export async function handleGetUserLstDetails(
    inputs: z.infer<typeof getUserLstDetailsSchema>
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = getSuiClientInstance(networkArg);
        const lstClient = await getSpringSuiLstClientInstance(networkArg, inputs.lstCoinType);
        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ${inputs.lstCoinType} on network ${networkArg}`);
        }
        const result = await sdkGetUserLstDetails(suiClient, lstClient, inputs.userAddress, inputs.lstCoinType);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetUserLstDetails:', error);
        throw new Error(`Error fetching user LST details: ${error.message}`);
    }
}

export async function handleDiscoverLstPools(
    inputs: z.infer<typeof discoverLstPoolsSchema>
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = getSuiClientInstance(networkArg);
        const pools = await sdkDiscoverSpringSuiLstPools(suiClient);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(pools, null, 2),
                },
            ],
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleDiscoverLstPools:', error);
        throw new Error(`Error discovering SpringSui LST pools from SDK: ${error.message}`);
    }
}

export async function handleGetSpringSuiPoolApys(
    inputs: z.infer<typeof getSpringSuiPoolApysSchema>
): Promise<McpToolOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = getSuiClientInstance(networkArg);
        const pools = await sdkDiscoverSpringSuiLstPools(suiClient);
        const result = await sdkGetSpringSuiPoolApys(suiClient, pools, inputs.specificCoinType);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetSpringSuiPoolApys:', error);
        throw new Error(`Error fetching SpringSui pool APYs: ${error.message}`);
    }
}

export async function handleStakeSuiForSpringSuiLst(
    inputs: z.infer<typeof stakeSuiForSpringSuiLstSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = getSuiClientInstance(networkArg);
        const lstClient = await getSpringSuiLstClientInstance(networkArg, inputs.lstCoinType);
        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ${inputs.lstCoinType} on network ${networkArg}`);
        }

        const amountSuiToStakeRaw = new BigNumber(inputs.amountSuiToStake).shiftedBy(SUI_DECIMALS).integerValue(BigNumber.ROUND_FLOOR).toString();
        if (new BigNumber(amountSuiToStakeRaw).lte(0)) {
            throw new Error("Amount to stake must be positive.");
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);
        lstClient.mintAmountAndRebalanceAndSendToUser(tx, inputs.senderAddress, amountSuiToStakeRaw);

        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(200000000);

        const preparedTxData = {
            status: "prepared",
            message: "Stake SUI for SpringSui LST transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };

        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleStakeSuiForSpringSuiLst:', error);
        throw new Error(`Error preparing stake SUI for SpringSui LST: ${error.message}`);
    }
}

export async function handleStakeSuiForParaSui(
    inputs: z.infer<typeof stakeSuiForParaSuiSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = getSuiClientInstance(networkArg);
        const lstClient = await getSpringSuiLstClientInstance(networkArg, PARA_SUI_MAINNET_COIN_TYPE);
        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ParaSUI (${PARA_SUI_MAINNET_COIN_TYPE}) on network ${networkArg}`);
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);
        const amountSuiToStakeRaw = new BigNumber(inputs.amountSuiToStake).shiftedBy(SUI_DECIMALS).integerValue(BigNumber.ROUND_FLOOR).toString();
        if (new BigNumber(amountSuiToStakeRaw).lte(0)) {
            throw new Error("Amount to stake must be positive.");
        }
        lstClient.mintAmountAndRebalanceAndSendToUser(tx, inputs.senderAddress, amountSuiToStakeRaw);
        
        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(200000000);
        
        const preparedTxData = {
            status: "prepared",
            message: "Stake SUI for ParaSui transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };
        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleStakeSuiForParaSui:', error);
        throw new Error(`Error preparing stake SUI for ParaSui: ${error.message}`);
    }
}

export async function handleRedeemSpringSuiLstForSui(
    inputs: z.infer<typeof redeemSpringSuiLstForSuiSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const networkArg = inputs.network || 'mainnet';
        const suiClient = getSuiClientInstance(networkArg);
        const lstClient = await getSpringSuiLstClientInstance(networkArg, inputs.lstCoinType);
        if (!lstClient) {
            throw new Error(`Could not initialize LST client for ${inputs.lstCoinType} on network ${networkArg}`);
        }
        const lstMetadata = await suiClient.getCoinMetadata({coinType: inputs.lstCoinType});
        if (!lstMetadata) {
            throw new Error(`Could not fetch metadata for LST ${inputs.lstCoinType}`);
        }
        const amountLstToRedeemRaw = new BigNumber(inputs.amountLstToRedeem).shiftedBy(lstMetadata.decimals).integerValue(BigNumber.ROUND_FLOOR).toString();
        if (new BigNumber(amountLstToRedeemRaw).lte(0)) {
            throw new Error("Amount to redeem must be positive.");
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);
        lstClient.redeemAmountAndSendToUser(tx, inputs.senderAddress, amountLstToRedeemRaw);
        
        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(200000000);

        const preparedTxData = {
            status: "prepared",
            message: "Redeem SpringSui LST for SUI transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };
        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleRedeemSpringSuiLstForSui:', error);
        throw new Error(`Error preparing redeem SpringSui LST for SUI: ${error.message}`);
    }
} 