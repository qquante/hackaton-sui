import { z } from 'zod';
import {
    getSuiBalanceSchema,
    getTokenMetadataSchema,
    getUserTokenBalanceSchema,
    transferFungibleTokenSchema,
    transferSuiSchema,
    getUserRecentTxsSchema
} from '../zodSchemas/mystenSuiSchemas';
import {
    getSuiBalance as sdkGetSuiBalance,
    getTokenMeta as sdkGetTokenMeta,
    getUserTokenBalance as sdkGetUserTokenBalance,
    transferFungibleToken as sdkTransferFungibleToken,
    transferSui as sdkTransferSui,
    getUserRecentTransactions as sdkGetUserRecentTransactions,
    MvpWalletAdapter
} from '@/protocols/mystensui/mystenSui.actions';
import { getSuiClientInstance } from '../internalSdkClientManager';
import { SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction, TransactionArgument } from '@mysten/sui/transactions';
import { McpToolOutput, PreparedTransactionOutput } from '../mcpUtils';
import { SUI_DECIMALS } from '@mysten/sui/utils';
import BigNumber from 'bignumber.js';

export async function handleGetSuiBalance(
    inputs: z.infer<typeof getSuiBalanceSchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const result = await sdkGetSuiBalance(suiClient, inputs.userAddress);
        
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result)
                }
            ]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetSuiBalance:', error);
        throw new Error(`Error fetching SUI balance from SDK: ${error.message}`);
    }
}

export async function handleGetTokenMetadata(
    inputs: z.infer<typeof getTokenMetadataSchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const result = await sdkGetTokenMeta(suiClient, inputs.coinType);
        return { 
            content: [
                {
                    type: "text", 
                    text: JSON.stringify(result)
                }
            ]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetTokenMetadata:', error);
        throw new Error(`Error fetching token metadata from SDK: ${error.message}`);
    }
}

export async function handleGetUserTokenBalance(
    inputs: z.infer<typeof getUserTokenBalanceSchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const result = await sdkGetUserTokenBalance(suiClient, inputs.userAddress, inputs.coinType);
        return { 
            content: [
                {
                    type: "text", 
                    text: JSON.stringify(result)
                }
            ]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetUserTokenBalance:', error);
        throw new Error(`Error fetching user token balance from SDK: ${error.message}`);
    }
}

export async function handleTransferFungibleToken(
    inputs: z.infer<typeof transferFungibleTokenSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        const targetAmountRaw = new BigNumber(inputs.amount)
            .shiftedBy(inputs.tokenDecimals)
            .integerValue(BigNumber.ROUND_FLOOR);

        if (targetAmountRaw.lte(0)) {
            throw new Error("Token amount to transfer must be positive.");
        }

        let coinToUseId: string | undefined = inputs.coinObjectId;
        let coinToUseBalance: BigNumber | undefined;

        if (!coinToUseId) {
            let cursor: string | null | undefined = null;
            let foundCoinStruct: { coinObjectId: string; balance: string } | null = null;

            do {
                const coinsPage = await suiClient.getCoins({
                    owner: inputs.senderAddress,
                    coinType: inputs.tokenCoinType,
                    cursor: cursor,
                });

                for (const coin of coinsPage.data) {
                    const currentCoinBalance = new BigNumber(coin.balance);
                    if (currentCoinBalance.gte(targetAmountRaw)) {
                        if (!foundCoinStruct || currentCoinBalance.lt(new BigNumber(foundCoinStruct.balance))) {
                            foundCoinStruct = coin;
                        }
                        if (currentCoinBalance.eq(targetAmountRaw)) {
                            foundCoinStruct = coin;
                            break; 
                        }
                    }
                }
                if (foundCoinStruct && new BigNumber(foundCoinStruct.balance).eq(targetAmountRaw)) {
                    break; 
                }
                cursor = coinsPage.nextCursor;
            } while (cursor);
            
            if (foundCoinStruct) {
                coinToUseId = foundCoinStruct.coinObjectId;
                coinToUseBalance = new BigNumber(foundCoinStruct.balance);
            } else {
                throw new Error(`No single suitable coin object found for ${inputs.tokenCoinType} with sufficient balance to transfer ${inputs.amount}.`);
            }
        }

        if (!coinToUseId) { 
             throw new Error("Could not determine a coin object ID for the transfer.");
        }

        if (coinToUseBalance === undefined) { 
            const coinObjectData = await suiClient.getObject({ id: coinToUseId, options: { showContent: true } });
            const fields = coinObjectData.data?.content?.dataType === 'moveObject' ? coinObjectData.data.content.fields as { balance: string; id: { id: string } } : null;
            if (fields && typeof fields.balance === 'string') {
                coinToUseBalance = new BigNumber(fields.balance);
            } else {
                throw new Error(`Could not fetch balance for provided coinObjectId: ${coinToUseId}. Object data: ${JSON.stringify(coinObjectData.data)}`);
            }
        }
        
        if (!coinToUseBalance) { 
            throw new Error("Could not determine the balance of the coin to be used for transfer.");
        }

        let coinToSendArg: TransactionArgument;
        const coinObjectRef = tx.object(coinToUseId);

        if (coinToUseBalance.eq(targetAmountRaw)) {
            coinToSendArg = coinObjectRef;
        } else if (coinToUseBalance.gt(targetAmountRaw)) {
            const [splitCoin] = tx.splitCoins(coinObjectRef, [targetAmountRaw.toString()]);
            coinToSendArg = splitCoin;
        } else {
            throw new Error(`Selected coin balance ${coinToUseBalance.toString()} is less than target amount ${targetAmountRaw.toString()}. This indicates an issue in coin selection or a race condition.`);
        }

        tx.transferObjects([coinToSendArg], tx.pure.address(inputs.recipientAddress));

        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(30000000); 

        const preparedTxData = {
            status: "prepared",
            message: "Fungible token transfer transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };

        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleTransferFungibleToken:', error);
        throw new Error(`Error preparing fungible token transfer: ${error.message}`);
    }
}

export async function handleTransferSui(
    inputs: z.infer<typeof transferSuiSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);
        
        const amountSui = parseFloat(inputs.amount);
        if (isNaN(amountSui) || amountSui <= 0) {
            throw new Error("Invalid SUI amount provided.");
        }

        const amountMist = BigInt(Math.floor(amountSui * Math.pow(10, SUI_DECIMALS)));
        if (amountMist <= 0n) {
            throw new Error("Amount in MIST must be greater than 0.");
        }

        const [coin] = tx.splitCoins(tx.gas, [amountMist]);
        tx.transferObjects([coin], tx.pure.address(inputs.recipientAddress));
        
        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(20000000);

        const preparedTxData = {
            status: "prepared",
            message: "SUI transfer transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };

        return {
            content: [{
                type: "text",
                text: JSON.stringify(preparedTxData)
            }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleTransferSui:', error);
        throw new Error(`Error preparing SUI transfer: ${error.message}`);
    }
}

export async function handleGetUserRecentTxs(
    inputs: z.infer<typeof getUserRecentTxsSchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const result = await sdkGetUserRecentTransactions(suiClient, inputs.userAddress, inputs.limit);
        
        const limit = inputs.limit ?? 10; // Defaulting to 10 if undefined, matching schema default
        const recentTransactions = result.slice(0, limit);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(recentTransactions, null, 2),
                },
            ],
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetUserRecentTxs:', error);
        throw new Error(`Error fetching user recent transactions from SDK: ${error.message}`);
    }
} 