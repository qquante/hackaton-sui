import { z } from 'zod';
import {
    formatTokenAmountSchema,
    parseTokenAmountSchema,
    shortenAddressSchema
} from '../zodSchemas/commonSchemas';
import {
    formatTokenAmount as sdkFormatTokenAmount,
    parseTokenAmount as sdkParseTokenAmount,
    shortenAddress as sdkShortenAddress
} from '@/common/common.utils';
import { McpToolOutput } from '../mcpUtils';

export async function handleFormatTokenAmount(
    inputs: z.infer<typeof formatTokenAmountSchema>
): Promise<McpToolOutput> {
    try {
        const result = sdkFormatTokenAmount(inputs.rawAmount, inputs.decimals, inputs.fixedDecimalPlaces);
        return { content: [{ type: "text", text: result }] };
    } catch (error: any) {
        throw new Error(`Error formatting token amount: ${error.message}`);
    }
}

export async function handleParseTokenAmount(
    inputs: z.infer<typeof parseTokenAmountSchema>
): Promise<McpToolOutput> {
    try {
        const result = sdkParseTokenAmount(inputs.uiAmount, inputs.decimals);
        return { content: [{ type: "text", text: result }] };
    } catch (error: any) {
        throw new Error(`Error parsing token amount: ${error.message}`);
    }
}

export async function handleShortenAddress(
    inputs: z.infer<typeof shortenAddressSchema>
): Promise<McpToolOutput> {
    try {
        const result = sdkShortenAddress(inputs.address, inputs.startChars, inputs.endChars);
        return { content: [{ type: "text", text: result }] };
    } catch (error: any) {
        throw new Error(`Error shortening address: ${error.message}`);
    }
} 