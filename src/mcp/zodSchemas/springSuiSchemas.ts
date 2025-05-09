import { z } from 'zod';

const networkSchema = z.enum(['mainnet', 'testnet', 'devnet'])
    .default('mainnet')
    .describe("Optional. The Sui network to query. Defaults to mainnet.");

export const getLstSuiExchangeRateSchema = z.object({
    lstCoinType: z.string().describe("The coin type of the Liquid Staking Token (e.g., afSUI coin type)."),
    network: networkSchema.optional(),
});

export const getUserLstDetailsSchema = z.object({
    userAddress: z.string().describe("The Sui address of the user."),
    lstCoinType: z.string().describe("The coin type of the Liquid Staking Token."),
    network: networkSchema.optional(),
});

export const discoverLstPoolsSchema = z.object({
    network: networkSchema.optional()
        .describe("Optional. The Sui network to query. Defaults to mainnet."),
});

export const getSpringSuiPoolApysSchema = z.object({
    network: networkSchema.optional(),
    specificCoinType: z.string().optional()
        .describe("Optional. If provided, fetches APY only for this LST coin type."),
});

export const stakeSuiForSpringSuiLstSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender."),
    lstCoinType: z.string().describe("The coin type of the LST to mint."),
    amountSuiToStake: z.string().describe("Amount of SUI to stake (e.g., '10.5')."),
    network: networkSchema.optional(),
});

export const stakeSuiForParaSuiSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender."),
    amountSuiToStake: z.string().describe("Amount of SUI to stake for ParaSui."),
    network: networkSchema.optional(),
});

export const redeemSpringSuiLstForSuiSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender."),
    lstCoinType: z.string().describe("The coin type of the LST to redeem."),
    amountLstToRedeem: z.string().describe("Amount of LST to redeem."),
    network: networkSchema.optional(),
}); 