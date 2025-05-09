import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';

import {
    getSuiBalanceSchema, getTokenMetadataSchema, getUserTokenBalanceSchema, 
    transferSuiSchema, transferFungibleTokenSchema, getUserRecentTxsSchema
} from './zodSchemas/mystenSuiSchemas';
import {
    formatTokenAmountSchema,
    parseTokenAmountSchema,
    shortenAddressSchema
} from './zodSchemas/commonSchemas';
import {
    getLstSuiExchangeRateSchema,
    getUserLstDetailsSchema,
    discoverLstPoolsSchema,
    getSpringSuiPoolApysSchema,
    stakeSuiForSpringSuiLstSchema,
    stakeSuiForParaSuiSchema,
    redeemSpringSuiLstForSuiSchema
} from './zodSchemas/springSuiSchemas';
import { getAllSteammPoolsSchema, findSteammSwapRoutesSchema, executeSteammSwapSchema, addSteammLiquiditySchema, removeSteammLiquiditySchema, getSteammPoolsExtendedSchema, getSteammSwapQuoteSchema } from './zodSchemas/steammSchemas';
import {
    getSuilendMarketAssetsSchema,
    ensureSuilendObligationSchema,
    depositToSuilendSchema,
    getObligationDetailsSchema,
    withdrawFromSuilendSchema,
    borrowFromSuilendSchema,
    repayToSuilendSchema,
    getObligationHistorySchema
} from './zodSchemas/suilendSchemas';

// Handlers imports
import {
    handleGetSuiBalance, handleGetTokenMetadata, handleGetUserTokenBalance, 
    handleTransferSui, handleTransferFungibleToken, handleGetUserRecentTxs
} from './toolHandlers/mystenSuiHandlers';
import {
    handleFormatTokenAmount,
    handleParseTokenAmount,
    handleShortenAddress
} from './toolHandlers/commonHandlers';
import {
    handleGetLstSuiExchangeRate,
    handleGetUserLstDetails,
    handleDiscoverLstPools,
    handleGetSpringSuiPoolApys,
    handleStakeSuiForSpringSuiLst,
    handleStakeSuiForParaSui,
    handleRedeemSpringSuiLstForSui
} from './toolHandlers/springSuiHandlers';
import { handleGetAllSteammPools, handleFindSteammSwapRoutes, handleExecuteSteammSwap, handleAddSteammLiquidity, handleRemoveSteammLiquidity, handleGetSteammPoolsExtended, handleGetSteammSwapQuote } from './toolHandlers/steammHandlers';
import {
    handleGetSuilendMarketAssets,
    handleEnsureSuilendObligation,
    handleDepositToSuilend,
    handleGetObligationDetails,
    handleWithdrawFromSuilend,
    handleBorrowFromSuilend,
    handleRepayToSuilend,
    handleGetObligationHistory
} from './toolHandlers/suilendHandlers';

async function main() {
    const server = new McpServer({
        name: "DeFiProtocolGateway",
        version: "1.0.0",
        description: "MCP Server for interacting with various Sui DeFi protocols via a TypeScript SDK.",
        tools: [],
    });

    registerMcpTools(server);

    const transport = new StdioServerTransport();
    server.connect(transport);
}

// Registering tools with the server
export function registerMcpTools(server: McpServer) {
    // MystenSui Tools
    server.tool('mystenSui.getSuiBalance', getSuiBalanceSchema.shape, handleGetSuiBalance);
    server.tool('mystenSui.getTokenMetadata', getTokenMetadataSchema.shape, handleGetTokenMetadata);
    server.tool('mystenSui.getUserTokenBalance', getUserTokenBalanceSchema.shape, handleGetUserTokenBalance);
    server.tool('mystenSui.transferSui', transferSuiSchema.shape, handleTransferSui);
    server.tool('mystenSui.transferFungibleToken', transferFungibleTokenSchema.shape, handleTransferFungibleToken);
    server.tool('mystenSui.getUserRecentTxs', getUserRecentTxsSchema.shape, handleGetUserRecentTxs);

    // Common Utility Tools
    server.tool('common.formatTokenAmount', formatTokenAmountSchema.shape, handleFormatTokenAmount);
    server.tool('common.parseTokenAmount', parseTokenAmountSchema.shape, handleParseTokenAmount);
    server.tool('common.shortenAddress', shortenAddressSchema.shape, handleShortenAddress);

    // SpringSui Tools
    server.tool('springSui.getLstSuiExchangeRate', getLstSuiExchangeRateSchema.shape, handleGetLstSuiExchangeRate);
    server.tool('springSui.getUserLstDetails', getUserLstDetailsSchema.shape, handleGetUserLstDetails);
    server.tool('springSui.discoverLstPools', discoverLstPoolsSchema.shape, handleDiscoverLstPools);
    server.tool('springSui.getSpringSuiPoolApys', getSpringSuiPoolApysSchema.shape, handleGetSpringSuiPoolApys);
    server.tool('springSui.stakeSuiForSpringSuiLst', stakeSuiForSpringSuiLstSchema.shape, handleStakeSuiForSpringSuiLst);
    server.tool('springSui.stakeSuiForParaSui', stakeSuiForParaSuiSchema.shape, handleStakeSuiForParaSui);
    server.tool('springSui.redeemSpringSuiLstForSui', redeemSpringSuiLstForSuiSchema.shape, handleRedeemSpringSuiLstForSui);
    
    // Steamm Tools
    server.tool('steamm.getAllSteammPools', getAllSteammPoolsSchema.shape, handleGetAllSteammPools);
    server.tool('steamm.findSteammSwapRoutes', findSteammSwapRoutesSchema.shape, handleFindSteammSwapRoutes);
    server.tool('steamm.executeSteammSwap', executeSteammSwapSchema.shape, handleExecuteSteammSwap);
    server.tool('steamm.addSteammLiquidity', addSteammLiquiditySchema.shape, handleAddSteammLiquidity);
    server.tool('steamm.removeSteammLiquidity', removeSteammLiquiditySchema.shape, handleRemoveSteammLiquidity);
    server.tool('steamm.getSteammPoolsExtended', getSteammPoolsExtendedSchema.shape, handleGetSteammPoolsExtended);
    server.tool('steamm.getSteammSwapQuote', getSteammSwapQuoteSchema.shape, handleGetSteammSwapQuote);

    // Suilend Tools
    server.tool('suilend.getSuilendMarketAssets', getSuilendMarketAssetsSchema.shape, handleGetSuilendMarketAssets);
    server.tool('suilend.ensureSuilendObligation', ensureSuilendObligationSchema.shape, handleEnsureSuilendObligation);
    server.tool('suilend.depositToSuilend', depositToSuilendSchema.shape, handleDepositToSuilend);
    server.tool('suilend.getObligationDetails', getObligationDetailsSchema.shape, handleGetObligationDetails);
    server.tool('suilend.withdrawFromSuilend', withdrawFromSuilendSchema.shape, handleWithdrawFromSuilend);
    server.tool('suilend.borrowFromSuilend', borrowFromSuilendSchema.shape, handleBorrowFromSuilend);
    server.tool('suilend.repayToSuilend', repayToSuilendSchema.shape, handleRepayToSuilend);
    server.tool('suilend.getObligationHistory', getObligationHistorySchema.shape, handleGetObligationHistory);
}

main().catch(error => {
    console.error("Failed to start DeFi Protocol Gateway MCP Server:", error); 
    process.exit(1);
}); 