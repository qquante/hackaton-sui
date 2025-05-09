import { z } from 'zod';

const networkSchema = z.enum(['mainnet', 'testnet', 'devnet'])
    .default('mainnet')
    .describe("Optional. The Sui network for Suilend operations. Defaults to mainnet.");

export const getSuilendMarketAssetsSchema = z.object({
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
});

export const ensureSuilendObligationSchema = z.object({
    userAddress: z.string().describe("The Sui address of the user for whom to ensure or create an obligation."),
    network: networkSchema.optional(),
});

export const depositToSuilendSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender (user's address)."),
    userOwnerCapId: z.string().describe("The user's ObligationOwnerCap ID for the target market."),
    assetCoinType: z.string().describe("The coin type of the asset to deposit."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToDeposit: z.string().describe("Amount of the asset to deposit, as a string."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
});

export const getObligationDetailsSchema = z.object({
    obligationId: z.string().describe("The ID of the Suilend obligation to fetch details for."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
});

export const withdrawFromSuilendSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender (user's address)."),
    userObligationId: z.string().describe("The user's Suilend obligation ID."),
    userObligationOwnerCapId: z.string().describe("The user's ObligationOwnerCap ID for the target market."),
    assetCoinType: z.string().describe("The coin type of the asset to withdraw."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToWithdraw: z.string()
        .describe("Amount of the asset to withdraw, as a string ('MAX' for full withdrawal of a specific asset can be a special value handled by the handler if SDK supports)."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
});

export const borrowFromSuilendSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender (user's address)."),
    userObligationId: z.string().describe("The user's Suilend obligation ID."),
    userObligationOwnerCapId: z.string().describe("The user's ObligationOwnerCap ID for the target market."),
    assetCoinType: z.string().describe("The coin type of the asset to borrow."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToBorrow: z.string().describe("Amount of the asset to borrow, as a string."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
});

export const repayToSuilendSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender (user's address)."),
    userObligationId: z.string().describe("The user's Suilend obligation ID."),
    assetCoinType: z.string().describe("The coin type of the asset to repay."),
    assetDecimals: z.number().int().min(0).describe("The number of decimals for the asset."),
    amountToRepay: z.string()
        .describe("Amount of the asset to repay, as a string ('MAX' for full repayment of a specific debt can be a special value handled by the handler if SDK supports)."),
    marketId: z.string().optional()
        .describe("Optional. The specific Suilend market ID. Defaults to the main market if not provided."),
    network: networkSchema.optional(),
});

export const getObligationHistorySchema = z.object({
    obligationId: z.string().describe("The ID of the Suilend obligation."),
    maxQuantity: z.number().int().min(1).default(10).optional()
        .describe("Optional. Maximum number of history items per page. Defaults to 10."),
    cursor: z.string().nullable().optional()
        .describe("Optional. Cursor for pagination."),
    network: networkSchema.optional(),
}); 