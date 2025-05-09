import { z } from 'zod';
import {
    getSuilendMarketAssetsSchema,
    ensureSuilendObligationSchema,
    depositToSuilendSchema,
    getObligationDetailsSchema,
    withdrawFromSuilendSchema,
    borrowFromSuilendSchema,
    repayToSuilendSchema,
    getObligationHistorySchema
} from '../zodSchemas/suilendSchemas';

import {
    getSuilendMarketAssets as sdkGetSuilendMarketAssets,
    ensureSuilendObligation as sdkEnsureSuilendObligation,
    depositToSuilend as sdkDepositToSuilend,
    getSuilendObligationDetails as sdkGetSuilendObligationDetails,
    withdrawFromSuilend as sdkWithdrawFromSuilend,
    borrowFromSuilend as sdkBorrowFromSuilend,
    repayToSuilend as sdkRepayToSuilend,
    getSuilendObligationHistory as sdkGetSuilendObligationHistory
} from '@/protocols/suilend/suilend.actions';

import {
    getSuiClientInstance,
    getSuilendSdkInstance
} from '../internalSdkClientManager';
import { McpToolOutput, PreparedTransactionOutput } from '../mcpUtils';
import { Transaction } from '@mysten/sui/transactions';
import { SuilendClient as SuilendSDKClientModule } from '@suilend/sdk';
import BigNumber from 'bignumber.js';

export async function handleGetSuilendMarketAssets(
    inputs: z.infer<typeof getSuilendMarketAssetsSchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const suilendClient = await getSuilendSdkInstance(inputs.marketId, inputs.network);

        if (!suilendClient) {
            throw new Error(`SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${inputs.network}`);
        }

        const result = await sdkGetSuilendMarketAssets(suilendClient, suiClient);
        return {
            content: [{ type: "text", text: JSON.stringify(result) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetSuilendMarketAssets:', error);
        throw new Error(`Error fetching Suilend market assets: ${error.message}`);
    }
}

export async function handleEnsureSuilendObligation(
    inputs: z.infer<typeof ensureSuilendObligationSchema>
): Promise<McpToolOutput | PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const suilendClientInstance = await getSuilendSdkInstance(undefined, inputs.network);

        if (!suilendClientInstance) {
            throw new Error(`SuilendSDK could not be initialized for default market on network ${inputs.network}`);
        }

        const marketTypeArgs: string[] = [suilendClientInstance.lendingMarket.$typeArgs[0]];
        const ownerCaps = await SuilendSDKClientModule.getObligationOwnerCaps(
            inputs.userAddress,
            marketTypeArgs,
            suiClient
        );

        if (ownerCaps && ownerCaps.length > 0 && ownerCaps[0]) {
            const cap = ownerCaps[0];
            const existingObligation = {
                obligationId: cap.obligationId,
                ownerCapId: cap.id,
                createdNow: false,
                message: "Obligation already exists."
            };
            return {
                content: [{ type: "text", text: JSON.stringify(existingObligation) }]
            };
        } else {
            const tx = new Transaction();
            tx.setSender(inputs.userAddress);
            suilendClientInstance.createObligation(tx);
            
            const gasPrice = await suiClient.getReferenceGasPrice();
            if (gasPrice) tx.setGasPrice(gasPrice);
            tx.setGasBudget(50000000);

            const preparedTxData = {
                status: "prepared",
                message: "Suilend obligation creation transaction prepared. Client must sign and execute. The new obligationId and ownerCapId will be in the transaction effects.",
                serializedTransactionBlock: tx.serialize()
            };
            return {
                content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
            };
        }
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleEnsureSuilendObligation:', error);
        throw new Error(`Error ensuring Suilend obligation: ${error.message}`);
    }
}

export async function handleDepositToSuilend(
    inputs: z.infer<typeof depositToSuilendSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const suilendClientInstance = await getSuilendSdkInstance(inputs.marketId, inputs.network);

        if (!suilendClientInstance) {
            throw new Error(`SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${inputs.network}`);
        }

        const amountRawString = new BigNumber(inputs.amountToDeposit).shiftedBy(inputs.assetDecimals).toString();
        if (new BigNumber(amountRawString).lte(0)) {
            throw new Error("Amount to deposit must be positive.");
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        await suilendClientInstance.depositIntoObligation(
            inputs.senderAddress,
            inputs.assetCoinType,
            amountRawString,
            tx,
            inputs.userOwnerCapId
        );

        const gasPrice = await suiClient.getReferenceGasPrice();
        if (gasPrice) tx.setGasPrice(gasPrice);
        tx.setGasBudget(100000000);

        const preparedTxData = {
            status: "prepared",
            message: "Suilend deposit transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };

        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleDepositToSuilend:', error);
        throw new Error(`Error preparing Suilend deposit: ${error.message}`);
    }
}

export async function handleGetObligationDetails(
    inputs: z.infer<typeof getObligationDetailsSchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const suilendClient = await getSuilendSdkInstance(inputs.marketId, inputs.network);
        if (!suilendClient) {
            throw new Error('Failed to initialize Suilend SDK client');
        }
        const details = await sdkGetSuilendObligationDetails(suilendClient, suiClient, inputs.obligationId);
        if (!details) {
            throw new Error(`No obligation details found for ID ${inputs.obligationId}`);
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(details, null, 2),
                },
            ],
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetObligationDetails:', error);
        throw new Error(`Error fetching Suilend obligation details: ${error.message}`);
    }
}

export async function handleWithdrawFromSuilend(
    inputs: z.infer<typeof withdrawFromSuilendSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const suilendClientInstance = await getSuilendSdkInstance(inputs.marketId, inputs.network);

        if (!suilendClientInstance) {
            throw new Error(`SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${inputs.network}`);
        }

        const amountRawString = new BigNumber(inputs.amountToWithdraw).shiftedBy(inputs.assetDecimals).toString();
        if (new BigNumber(amountRawString).lte(0) && inputs.amountToWithdraw.toUpperCase() !== 'MAX') {
            throw new Error("Amount to withdraw must be positive or 'MAX'.");
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        const obligationData = await suilendClientInstance.getObligation(inputs.userObligationId);
        if (!obligationData) {
            throw new Error(`Could not fetch obligation ${inputs.userObligationId} for refresh before withdrawal.`);
        }
        await suilendClientInstance.refreshAll(tx, obligationData);

        await suilendClientInstance.withdrawAndSendToUser(
            inputs.senderAddress,
            inputs.userObligationOwnerCapId,
            inputs.userObligationId,
            inputs.assetCoinType,
            amountRawString,
            tx
        );

        const gasPrice = await suiClient.getReferenceGasPrice();
        if (gasPrice) tx.setGasPrice(gasPrice);
        tx.setGasBudget(150000000);

        const preparedTxData = {
            status: "prepared",
            message: "Suilend withdraw transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };

        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleWithdrawFromSuilend:', error);
        throw new Error(`Error preparing Suilend withdraw: ${error.message}`);
    }
}

export async function handleBorrowFromSuilend(
    inputs: z.infer<typeof borrowFromSuilendSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const suilendClientInstance = await getSuilendSdkInstance(inputs.marketId, inputs.network);

        if (!suilendClientInstance) {
            throw new Error(`SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${inputs.network}`);
        }

        const amountRawString = new BigNumber(inputs.amountToBorrow).shiftedBy(inputs.assetDecimals).toString();
        if (new BigNumber(amountRawString).lte(0)) {
            throw new Error("Amount to borrow must be positive.");
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        const obligationData = await suilendClientInstance.getObligation(inputs.userObligationId);
        if (!obligationData) {
            throw new Error(`Could not fetch obligation ${inputs.userObligationId} for refresh before borrowing.`);
        }
        await suilendClientInstance.refreshAll(tx, obligationData);

        await suilendClientInstance.borrowAndSendToUser(
            inputs.senderAddress,
            inputs.userObligationOwnerCapId,
            inputs.userObligationId,
            inputs.assetCoinType,
            amountRawString,
            tx
        );

        const gasPrice = await suiClient.getReferenceGasPrice();
        if (gasPrice) tx.setGasPrice(gasPrice);
        tx.setGasBudget(150000000);

        const preparedTxData = {
            status: "prepared",
            message: "Suilend borrow transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };

        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleBorrowFromSuilend:', error);
        throw new Error(`Error preparing Suilend borrow: ${error.message}`);
    }
}

export async function handleRepayToSuilend(
    inputs: z.infer<typeof repayToSuilendSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const suilendClientInstance = await getSuilendSdkInstance(inputs.marketId, inputs.network);

        if (!suilendClientInstance) {
            throw new Error(`SuilendSDK could not be initialized for market ${inputs.marketId || 'default'} on network ${inputs.network}`);
        }

        const amountRawString = new BigNumber(inputs.amountToRepay).shiftedBy(inputs.assetDecimals).toString();
        if (new BigNumber(amountRawString).lte(0) && inputs.amountToRepay.toUpperCase() !== 'MAX') {
            throw new Error("Amount to repay must be positive or 'MAX'.");
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        const obligationData = await suilendClientInstance.getObligation(inputs.userObligationId);
        if (!obligationData) {
            throw new Error(`Could not fetch obligation ${inputs.userObligationId} for refresh before repaying.`);
        }
        await suilendClientInstance.refreshAll(tx, obligationData);

        await suilendClientInstance.repayIntoObligation(
            inputs.senderAddress,
            inputs.userObligationId,
            inputs.assetCoinType,
            amountRawString,
            tx
        );

        const gasPrice = await suiClient.getReferenceGasPrice();
        if (gasPrice) tx.setGasPrice(gasPrice);
        tx.setGasBudget(100000000);

        const preparedTxData = {
            status: "prepared",
            message: "Suilend repay transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };

        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleRepayToSuilend:', error);
        throw new Error(`Error preparing Suilend repay: ${error.message}`);
    }
}

export async function handleGetObligationHistory(
    inputs: z.infer<typeof getObligationHistorySchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const history = await sdkGetSuilendObligationHistory(
            suiClient, 
            inputs.obligationId, 
            inputs.maxQuantity, 
            inputs.cursor
        );
        if (!history) {
            throw new Error(`No obligation history found for ID ${inputs.obligationId}`);
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(history, null, 2),
                },
            ],
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetObligationHistory:', error);
        throw new Error(`Error fetching Suilend obligation history: ${error.message}`);
    }
}
