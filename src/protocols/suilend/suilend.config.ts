/**
 * Represents the configuration for a Suilend lending market as defined in the SDK.
 */
export interface SuilendUiLendingMarketConfig {
  name: string;
  slug: string;
  id: string;
  type: string;
  ownerCapId: string;
  isHidden?: boolean;
}

export const SUILEND_MAINNET_MARKETS: SuilendUiLendingMarketConfig[] = [
  {
    name: "Main market",
    slug: "main",
    id: "0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1",
    type: "0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL",
    ownerCapId: "0xf7a4defe0b6566b6a2674a02a0c61c9f99bd012eed21bc741a069eaa82d35927",
    isHidden: false,
  },
  {
    name: "STEAMM LM",
    slug: "steamm-lm",
    id: "0xc1888ec1b81a414e427a44829310508352aec38252ee0daa9f8b181b6947de9f",
    type: "0x0a071f4976abae1a7f722199cf0bfcbe695ef9408a878e7d12a7ca87b7e582a6::lp_rewards::LP_REWARDS",
    ownerCapId: "0x55a0f33b24e091830302726c8cfbff8cf8abd2ec1f83a4e6f4bf51c7ba3ad5ab",
    isHidden: true,
  },
];

export const SUILEND_DEFAULT_MARKET_CONFIG = SUILEND_MAINNET_MARKETS.find(m => m.slug === 'main');

if (!SUILEND_DEFAULT_MARKET_CONFIG) {
  throw new Error("Default Suilend Main Market configuration not found. Check suilend.config.ts");
}

export const SUILEND_DEFAULT_MAINNET_MARKET_ID: string = SUILEND_DEFAULT_MARKET_CONFIG.id;
export const SUILEND_DEFAULT_MAINNET_MARKET_TYPE: string = SUILEND_DEFAULT_MARKET_CONFIG.type;
export const SUILEND_MAINNET_REGISTRY_ID = "0x64faff8d91a56c4f55debbb44767b009ee744a70bc2cc8e3bbd2718c92f85931";
export const SUILEND_MAINNET_ADMIN_ADDRESS = "0xb1ffbc2e1915f44b8f271a703becc1bf8aa79bc22431a58900a102892b783c25";
