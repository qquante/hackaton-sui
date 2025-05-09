import { Pool, Route } from '@suilend/steamm-sdk';
import { PoolInfo as SDKPoolInfo, BankInfo as SDKBankInfo, QuoterData as SDKQuoterData } from '@suilend/steamm-sdk/types';
import { DepositQuote as SDKDepositQuote, SwapQuote as SDKSwapQuote, RedeemQuote as SDKRedeemQuote } from '@suilend/steamm-sdk/base/pool/poolTypes';

export interface SteammPoolExtended {
  poolId: string; 
  coinTypeA: string;
  coinTypeB: string;
  lpTokenType: string;
  quoterType: string;
  swapFeeBps: number;
  quoterData?: SDKQuoterData;
  symbolA: string;
  symbolB: string;
  decimalsA: number;
  decimalsB: number;
  lpSymbol: string; 
  lpDecimals: number; 
  balanceAUi: string; 
  balanceBUi: string; 
  reserveA_ui?: string; 
  reserveB_ui?: string; 
  lpCoinBalanceUi?: string; 
  aprPercent?: string;  
  rawPoolInfo: SDKPoolInfo;
}

export interface SteammRouteInfo {
  route: Route;
  inputCoinType: string;
  outputCoinType: string;
  inputAmountUi: string;
  outputAmountUi: string;
  inputSymbol: string;
  outputSymbol: string;
}

export interface UserLiquidityPositionInfo {
    poolId: string;
    poolType: string;
    coinTypeA: string;
    coinTypeB: string;
    symbolA: string;
    symbolB: string;
    lpCoinType: string;
    lpSymbol: string;
    lpDecimals: number;
    lpCoinBalanceUi: string;
    sharePercent?: string;
    pooledAmountAUi: string;
    pooledAmountBUi: string;
}

export interface SteammAddLiquidityQuoteResult {
  poolId: string;
  amountAInUi: string;
  amountBInUi: string;
  lpTokensOutUi: string;
  coinTypeA: string;
  coinTypeB: string;
  lpCoinType: string;
  rawQuote: SDKDepositQuote; 
}

export interface SteammRemoveLiquidityQuoteResult {
  poolId: string;
  amountAOutUi: string;
  amountBOutUi: string;
  lpTokensInUi: string;
  coinTypeA: string;
  coinTypeB: string;
  lpCoinType: string;
  rawQuote: SDKRedeemQuote;
} 