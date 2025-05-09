import { z } from 'zod';

// Optional: Define a reusable network schema if many tools in this module need it.
const networkSchema = z.enum(['mainnet', 'testnet', 'devnet', 'localnet'])
    .optional()
    .default('mainnet')
    .describe("Optional. The Sui network to query. Defaults to mainnet.");

export const getSuiBalanceSchema = z.object({
    userAddress: z.string().describe("The Sui wallet address to fetch the SUI balance for."),
    network: networkSchema
});

export const getTokenMetadataSchema = z.object({
    coinType: z.string().describe("The full coin type string (e.g., '0x2::sui::SUI')."),
    network: networkSchema
});

export const getUserTokenBalanceSchema = z.object({
    userAddress: z.string().describe("The Sui address of the user."),
    coinType: z.string().describe("The coin type of the token (e.g., '0x...::stable_coin::STABLE_COIN')."),
    network: networkSchema
});

export const transferFungibleTokenSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender."),
    recipientAddress: z.string().describe("The Sui address of the recipient."),
    amount: z.string().describe("The amount of tokens to transfer, as a string (e.g., '10.5')."),
    tokenCoinType: z.string().describe("The coin type of the token to transfer."),
    tokenDecimals: z.number().int().min(0).describe("The number of decimals the token uses."),
    coinObjectId: z.string().optional().describe("Optional. The specific object ID of the coin to use for the transfer. If not provided, the handler will attempt to find a suitable coin."),
    network: networkSchema
});

export const transferSuiSchema = z.object({
    senderAddress: z.string().describe("The Sui address of the transaction sender."),
    recipientAddress: z.string().describe("The Sui address of the recipient."),
    amount: z.string().describe("The amount of SUI to transfer, as a string (e.g., '1.0')."),
    network: networkSchema
});

export const getUserRecentTxsSchema = z.object({
    userAddress: z.string().describe("The Sui address of the user."),
    limit: z.number().int().min(1).default(10).optional()
        .describe("Optional. Maximum number of transactions to return. Defaults to 10."),
    network: networkSchema
}); 