export const SUILEND_VALIDATOR_ADDRESS = "0xce8e537664ba5d1d5a6a857b17bd142097138706281882be6805e17065ecde89";
export const SPRING_SUI_UPGRADE_CAP_ID = "0x4dc657b6c0fe896f4b94fee1ceac96312dde0a36b94e799caaec30deb53dcd67";
export const SPRING_SUI_MAINNET_REGISTRY_ID = "0x577c5a3b474403aec4629a56bab97b95715d3e87867517650651014cbef23e18";
export const PARA_SUI_MAINNET_COIN_TYPE = "0x0f26f0dced338b538e027fca6ac24019791a7578e7eb2e81840e268970fbfbd6::para_sui::PARA_SUI";

/**
 * Represents the core information needed to interact with a specific Liquid Staking Token (LST).
 * This would be typically fetched dynamically using functions like `fetchRegistryLiquidStakingInfoMap`
 * from the SDK, but we might hardcode a primary one for MVP for simplicity if known.
 */
export interface LiquidStakingTokenConfig {
  coinType: string;
  objectInfo: {
    id: string;
    type: string;
    weightHookId: string;
  };
  name: string; 
}

export const PARA_SUI_LST_CONFIG_PLACEHOLDER: LiquidStakingTokenConfig = {
  name: "ParaSUI",
  coinType: "0x0f26f0dced338b538e027fca6ac24019791a7578e7eb2e81840e268970fbfbd6::para_sui::PARA_SUI>",
  objectInfo: {
    id: "",
    type: "",
    weightHookId: "",
  }
}; 