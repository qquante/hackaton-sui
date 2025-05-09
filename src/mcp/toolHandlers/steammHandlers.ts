import { z } from 'zod';
import { getAllSteammPoolsSchema } from '../zodSchemas/steammSchemas';
import { getAllSteammPools as sdkGetAllSteammPools } from '@/protocols/steamm/steamm.actions';
import { getSteammSdkInstance, getSuiClientInstance } from '../internalSdkClientManager';
import { McpToolOutput, PreparedTransactionOutput } from '../mcpUtils';
import { Transaction, TransactionArgument } from '@mysten/sui/transactions';
import { PoolInfo } from '@suilend/steamm-sdk';
import { findSteammSwapRoutesSchema, executeSteammSwapSchema, addSteammLiquiditySchema, removeSteammLiquiditySchema } from '../zodSchemas/steammSchemas';
import { 
    findSteammSwapRoutes as sdkFindSteammSwapRoutes,
} from '@/protocols/steamm/steamm.actions';
import { SteammSDK, Pool } from '@suilend/steamm-sdk';
import { getTokenMeta } from '@/protocols/mystensui/mystenSui.actions';
import BigNumber from 'bignumber.js';
import {
    SwapParams,
    getBankFromBToken,
    DepositLiquidityParams,
    RedeemLiquidityParams
} from '@suilend/steamm-sdk';
import { getSteammPoolsExtendedSchema } from '../zodSchemas/steammSchemas';
import { getSteammPoolsExtended as sdkGetSteammPoolsExtended } from '@/protocols/steamm/steamm.actions';
import { getSteammSwapQuoteSchema } from '../zodSchemas/steammSchemas';
import { getSteammSwapQuote as sdkGetSteammSwapQuote } from '@/protocols/steamm/steamm.actions';

export async function handleGetAllSteammPools(
    inputs: z.infer<typeof getAllSteammPoolsSchema>
): Promise<McpToolOutput> {
    try {
        const steammSdk = getSteammSdkInstance(inputs.network);
        if (!steammSdk) {
            throw new Error(`SteammSDK could not be initialized for network ${inputs.network}`);
        }
        const result = await sdkGetAllSteammPools(steammSdk);
        return {
            content: [{ type: "text", text: JSON.stringify(result) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetAllSteammPools:', error);
        throw new Error(`Error fetching Steamm pools: ${error.message}`);
    }
}

export async function handleFindSteammSwapRoutes(
    inputs: z.infer<typeof findSteammSwapRoutesSchema>
): Promise<McpToolOutput> {
    try {
        const steammSdk = getSteammSdkInstance(inputs.network);
        if (!steammSdk) {
            throw new Error(`SteammSDK could not be initialized for network ${inputs.network}`);
        }
        const result = await sdkFindSteammSwapRoutes(steammSdk, inputs.inputCoinType, inputs.outputCoinType);
        return {
            content: [{ type: "text", text: JSON.stringify(result) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleFindSteammSwapRoutes:', error);
        throw new Error(`Error finding Steamm swap routes: ${error.message}`);
    }
}

export async function handleExecuteSteammSwap(
    inputs: z.infer<typeof executeSteammSwapSchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const steammSdk = getSteammSdkInstance(inputs.network);

        if (!steammSdk) {
            throw new Error(`SteammSDK could not be initialized for network ${inputs.network}`);
        }

        const allPools = await steammSdk.getPools();
        const poolInfo = allPools.find(p => p.poolId === inputs.poolId);

        if (!poolInfo) {
            throw new Error(`Pool with ID ${inputs.poolId} not found.`);
        }

        const amountInRawBigInt = new BigNumber(inputs.amountIn).shiftedBy(inputs.coinInDecimals);
        if (amountInRawBigInt.lte(0)) {
            throw new Error("Amount in must be positive.");
        }

        let coinOutDecimals = 0;
        const coinOutMeta = await getTokenMeta(suiClient, inputs.coinOutType);
        if (coinOutMeta) {
            coinOutDecimals = coinOutMeta.decimals;
        }

        const minAmountOutRawBigInt = inputs.minAmountOut && parseFloat(inputs.minAmountOut) > 0
            ? new BigNumber(inputs.minAmountOut).shiftedBy(coinOutDecimals)
            : new BigNumber(0);

        let a2bLocal: boolean;
        if (poolInfo.coinTypeA === inputs.coinInType && poolInfo.coinTypeB === inputs.coinOutType) {
            a2bLocal = true;
        } else if (poolInfo.coinTypeB === inputs.coinInType && poolInfo.coinTypeA === inputs.coinOutType) {
            a2bLocal = false;
        } else {
            throw new Error(`Invalid coin pair for pool ${poolInfo.poolId}.`);
        }

        const banks = await steammSdk.getBanks();
        const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
        const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);

        if ((poolInfo.quoterType === 'Oracle' || poolInfo.quoterType === 'OracleV2') && (!bankInfoA || !bankInfoB)) {
            throw new Error(`Oracle pool ${poolInfo.poolId} requires BankInfo for both assets.`);
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        const coinInObjectArg = tx.object(inputs.coinInObjectId);
        const [dummyCoin] = tx.splitCoins(tx.gas, [BigInt(0)]);

        const sdkSwapParams: SwapParams = {
            poolInfo,
            bankInfoA: bankInfoA || undefined,
            bankInfoB: bankInfoB || undefined,
            coinA: a2bLocal ? coinInObjectArg : dummyCoin, 
            coinB: a2bLocal ? dummyCoin : coinInObjectArg, 
            a2b: tx.pure.bool(a2bLocal),
            amountIn: BigInt(amountInRawBigInt.toString()),
            minAmountOut: BigInt(minAmountOutRawBigInt.toString()),
        };
        
        const outputCoinArgument = await steammSdk.Pool.swap(tx, sdkSwapParams);
        tx.transferObjects([outputCoinArgument], tx.pure.address(inputs.senderAddress));
        
        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(100000000); 

        const preparedTxData = {
            status: "prepared",
            message: "Steamm swap transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };
        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleExecuteSteammSwap:', error);
        throw new Error(`Error preparing Steamm swap: ${error.message}`);
    }
}

export async function handleAddSteammLiquidity(
    inputs: z.infer<typeof addSteammLiquiditySchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const steammSdk = getSteammSdkInstance(inputs.network);

        if (!steammSdk) {
            throw new Error(`SteammSDK could not be initialized for network ${inputs.network}`);
        }

        const allPools = await steammSdk.getPools();
        const poolInfo = allPools.find(p => p.poolId === inputs.poolId);
        if (!poolInfo) {
            throw new Error(`Pool with ID ${inputs.poolId} not found.`);
        }

        const amountADesiredRaw = BigInt(new BigNumber(inputs.amountADesired).shiftedBy(inputs.coinADecimals).toFixed(0));
        const amountBDesiredRaw = BigInt(new BigNumber(inputs.amountBDesired).shiftedBy(inputs.coinBDecimals).toFixed(0));

        if (amountADesiredRaw <= 0n || amountBDesiredRaw <= 0n) {
            throw new Error("Both desired amounts for adding liquidity must be positive.");
        }

        const banks = await steammSdk.getBanks();
        const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
        const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);

        if (!bankInfoA || !bankInfoB) {
            throw new Error(`Could not find bankInfoA or bankInfoB for pool ${poolInfo.poolId}.`);
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        const sdkDepositParams: DepositLiquidityParams = {
            poolInfo: poolInfo,
            bankInfoA: bankInfoA, 
            bankInfoB: bankInfoB,
            coinA: tx.object(inputs.coinAInObjectId),
            coinB: tx.object(inputs.coinBInObjectId),
            maxA: amountADesiredRaw,
            maxB: amountBDesiredRaw,
        };

        const lpCoinArgument = await steammSdk.Pool.depositLiquidityEntry(tx, sdkDepositParams) as unknown as TransactionArgument;
        tx.transferObjects([lpCoinArgument], tx.pure.address(inputs.senderAddress));

        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(150000000);

        const preparedTxData = {
            status: "prepared",
            message: "Steamm add liquidity transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };
        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleAddSteammLiquidity:', error);
        throw new Error(`Error preparing Steamm add liquidity: ${error.message}`);
    }
}

export async function handleRemoveSteammLiquidity(
    inputs: z.infer<typeof removeSteammLiquiditySchema>
): Promise<PreparedTransactionOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const steammSdk = getSteammSdkInstance(inputs.network);

        if (!steammSdk) {
            throw new Error(`SteammSDK could not be initialized for network ${inputs.network}`);
        }

        const allPools = await steammSdk.getPools();
        const poolInfo = allPools.find(p => p.poolId === inputs.poolId);
        if (!poolInfo) {
            throw new Error(`Pool with ID ${inputs.poolId} not found.`);
        }

        const lpAmountRaw = BigInt(new BigNumber(inputs.lpAmount).shiftedBy(inputs.lpDecimals).toFixed(0));
        const minAmountARaw = BigInt(new BigNumber(inputs.minAmountA).shiftedBy(inputs.coinADecimals).toFixed(0));
        const minAmountBRaw = BigInt(new BigNumber(inputs.minAmountB).shiftedBy(inputs.coinBDecimals).toFixed(0));

        if (lpAmountRaw <= 0n) {
            throw new Error("LP amount to remove must be positive.");
        }

        const banks = await steammSdk.getBanks();
        const bankInfoA = getBankFromBToken(banks, poolInfo.coinTypeA);
        const bankInfoB = getBankFromBToken(banks, poolInfo.coinTypeB);

        if (!bankInfoA || !bankInfoB) {
            throw new Error(`Could not find bankInfoA or bankInfoB for pool ${poolInfo.poolId}.`);
        }

        const tx = new Transaction();
        tx.setSender(inputs.senderAddress);

        const sdkRedeemParams: any = {
            poolInfo: poolInfo,
            bankInfoA: bankInfoA,
            bankInfoB: bankInfoB,
            lpCoin: tx.object(inputs.lpCoinObjectId),
            amount: lpAmountRaw, 
            minA: minAmountARaw,
            minB: minAmountBRaw,
        };

        const [coinAOut, coinBOut] = await steammSdk.Pool.redeemLiquidityEntry(tx, sdkRedeemParams as RedeemLiquidityParams) as unknown as [TransactionArgument, TransactionArgument];
        tx.transferObjects([coinAOut, coinBOut], tx.pure.address(inputs.senderAddress));

        const gasPrice = await suiClient.getReferenceGasPrice();
        tx.setGasPrice(gasPrice);
        tx.setGasBudget(150000000);

        const preparedTxData = {
            status: "prepared",
            message: "Steamm remove liquidity transaction prepared. Client must sign and execute.",
            serializedTransactionBlock: tx.serialize()
        };
        return {
            content: [{ type: "text", text: JSON.stringify(preparedTxData) }]
        };

    } catch (error: any) {
        console.error('[MCP Handler] Error in handleRemoveSteammLiquidity:', error);
        throw new Error(`Error preparing Steamm remove liquidity: ${error.message}`);
    }
}

export async function handleGetSteammPoolsExtended(
    inputs: z.infer<typeof getSteammPoolsExtendedSchema>
): Promise<McpToolOutput> {
    try {
        const suiClient = getSuiClientInstance(inputs.network);
        const steammSdk = getSteammSdkInstance(inputs.network);

        if (!steammSdk) {
            throw new Error(`SteammSDK could not be initialized for network ${inputs.network}`);
        }
        const result = await sdkGetSteammPoolsExtended(steammSdk, suiClient, inputs.limit);
        return {
            content: [{ type: "text", text: JSON.stringify(result) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetSteammPoolsExtended:', error);
        throw new Error(`Error fetching Steamm extended pools: ${error.message}`);
    }
}

export async function handleGetSteammSwapQuote(
    inputs: z.infer<typeof getSteammSwapQuoteSchema>
): Promise<McpToolOutput> {
    try {
        const steammSdk = getSteammSdkInstance(inputs.network);
        if (!steammSdk) {
            throw new Error(`SteammSDK could not be initialized for network ${inputs.network}`);
        }

        const allPools = await steammSdk.getPools();
        const poolInfo = allPools.find(p => p.poolId === inputs.poolId);
        if (!poolInfo) {
            throw new Error(`Pool with ID ${inputs.poolId} not found for swap quote.`);
        }

        const result = await sdkGetSteammSwapQuote(
            steammSdk, 
            poolInfo, 
            inputs.inputCoinType, 
            inputs.outputCoinType, 
            inputs.inputAmount, 
            inputs.inputCoinDecimals
        );
        return {
            content: [{ type: "text", text: JSON.stringify(result) }]
        };
    } catch (error: any) {
        console.error('[MCP Handler] Error in handleGetSteammSwapQuote:', error);
        throw new Error(`Error fetching Steamm swap quote: ${error.message}`);
    }
}

// ... other Steamm handlers will be added here ... 