import { Reserve } from '@suilend/sdk/_generated/suilend/reserve/structs';
import BigNumber from 'bignumber.js';
import { ParsedReserve } from '@suilend/sdk/parsers/reserve';


export interface ReserveAssetDataExtended { 

  id: string;
  coinType: string;
  symbol: string; 
  decimals: number; 
  supplyApyPercent: string; 
  borrowApyPercent: string; 
  totalDepositedUi: string;
  totalBorrowedUi: string; 
  availableAmountUi: string;
  utilizationPercent: string;
  ctokenSupplyUi: string;
  price: string;
  name: string;
  iconUrl?: string | null;
  depositLimit: string;
  borrowLimit: string;
  config?: any;
  rawParsedData?: ParsedReserve;
}

interface SuilendCollateralItem {
  coinType: string;
  symbol: string;
  decimals: number;
  depositedAmountUi: string;
  depositedValueUsd: string;
  depositedAmountBn: BigNumber;
}

interface SuilendBorrowItem {
  coinType: string;
  symbol: string;
  decimals: number;
  borrowedAmountUi: string;
  borrowedValueUsd: string;
  borrowedAmountBn: BigNumber;
}

export interface SuilendObligationDetails {
  obligationId: string;
  collateral: SuilendCollateralItem[];
  borrows: SuilendBorrowItem[];
  totalDepositedValueUsd: string;
  totalBorrowedValueUsd: string;
  healthFactor?: string;
  // netApyPercent?: string;
}

export type NonLiquidationHistoryEvent = {
    reserveId: string;
    quantity: number;
    action: string;
    timestampMs: number;
    digest: string;
};

export type LiquidationHistoryEvent = {
    repayReserveId: string;
    repayQuantity: number;
    withdrawReserveId: string;
    withdrawQuantity: number;
    action: "Liquidation";
    timestampMs: number;
    digest: string;
};

export type FormattedObligationHistory = NonLiquidationHistoryEvent | LiquidationHistoryEvent;

export interface ObligationHistoryPage {
  cursor: string | null | undefined;
  history: FormattedObligationHistory[];
} 