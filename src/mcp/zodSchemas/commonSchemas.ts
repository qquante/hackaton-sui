import { z } from 'zod';

export const formatTokenAmountSchema = z.object({
    rawAmount: z.string().describe("The raw token amount as a string (e.g., from a contract call)."),
    decimals: z.number().int().min(0).describe("The number of decimal places the token uses."),
    fixedDecimalPlaces: z.number().int().min(0).optional().describe("Optional. The number of decimal places to show in the output string.")
});

export const parseTokenAmountSchema = z.object({
    uiAmount: z.string().describe("The UI formatted amount as a string."),
    decimals: z.number().int().min(0).describe("The number of decimal places the token uses.")
});

export const shortenAddressSchema = z.object({
    address: z.string().describe("The full Sui address or object ID string."),
    startChars: z.number().int().min(1).optional().default(6).describe("Optional. Number of characters to show at the start. Defaults to 6."),
    endChars: z.number().int().min(1).optional().default(4).describe("Optional. Number of characters to show at the end. Defaults to 4.")
}); 