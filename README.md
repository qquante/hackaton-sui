# Sui DeFi Protocol Gateway: A Model Context Protocol (MCP) Implementation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) <!-- Replace with your actual license -->
<!-- Add other badges here: build status, coverage, etc. -->

This project is a TypeScript SDK and server that implements the **Model Context Protocol (MCP)** to provide a structured gateway for Large Language Models (LLMs) and other intelligent agents to interact with various DeFi protocols on the Sui blockchain. It enables programmatic access to DeFi functionalities through a standardized, tool-based interface.

## Overview

The Sui blockchain is a high-performance Layer 1 platform designed for scalability and low latency, making it an ideal environment for DeFi applications. This SDK and MCP Gateway abstracts the complexities of direct smart contract interactions on Sui, exposing functionalities from several DeFi protocols through a unified, developer-friendly interface.

The core of the project is an MCP server (`src/mcp/server.ts`) that registers "tools" corresponding to actions available within the integrated DeFi protocols. This allows MCP-compliant clients (like LLMs) to discover and execute these DeFi operations.

## What is Model Context Protocol (MCP)?

Model Context Protocol (MCP) is an open-source specification and framework designed to facilitate safe and structured interactions between Large Language Models (LLMs) and external tools, APIs, or knowledge bases.

**Key Purposes & Features of MCP:**

*   **Extending LLM Capabilities:** MCP allows LLMs to go beyond their pre-trained knowledge. They can perform actions, retrieve real-time information, or execute complex tasks by invoking registered "tools."
*   **Structured Communication:**
    *   **Tool Definition & Registration:** Developers define tools (essentially functions with specific input/output schemas) that represent external capabilities (e.g., `getSuiBalance`, `executeSwap`). These tools are registered with an MCP server.
    *   **LLM Interaction:** When an LLM determines it needs to perform an action covered by a tool, it requests the MCP server to execute that tool with the necessary parameters.
    *   **Standardized Messaging:** MCP typically uses a JSON-based communication flow (often resembling JSON-RPC) for requests from the LLM (or its host environment) to the MCP server, and for the responses (tool outputs or errors) back to the LLM.
*   **Contextual Awareness:** The "Context" in MCP implies that the server can maintain state or provide contextual information relevant to the tools and their execution, making interactions more robust and intelligent.

**Why MCP for this Project?**

By implementing an MCP gateway, this project empowers LLMs to:

*   **Interact with Sui DeFi:** Directly engage with Sui DeFi protocols without needing to understand the low-level details of blockchain transactions or smart contract ABIs.
*   **Access Real-Time Data:** Incorporate live DeFi data (balances, token prices, pool states, etc.) into their responses or decision-making processes.
*   **Execute Operations:** Perform DeFi actions (like staking, swapping, lending, borrowing) on behalf of users, based on natural language instructions (assuming the LLM can translate these instructions into the appropriate MCP tool calls).
*   **Enhance Safety and Control:** Provide a more controlled and potentially safer environment for LLMs to access on-chain functionalities compared to directly generating and signing raw transactions.

## The Sui Blockchain

Sui is a Layer 1 blockchain and smart contract platform engineered for high throughput, low latency, and horizontal scalability. Its object-centric model and parallel transaction execution capabilities are designed to support a new generation of rich, dynamic on-chain assets and decentralized applications, particularly in the DeFi space.

## Core Features of this Gateway

*   **MCP Server:** Exposes DeFi functionalities as discoverable and executable tools for LLMs (typically via stdin/stdout communication).
*   **Unified DeFi Interface:** Offers a consistent API to interact with multiple, distinct Sui DeFi protocols.
*   **Abstraction Layer:** Simplifies complex blockchain operations, transaction building, and signing.
*   **TypeScript SDK:** Provides type-safe modules for direct programmatic use in TypeScript/JavaScript projects.
*   **Input Validation:** Leverages Zod schemas for robust validation of inputs to MCP tools, enhancing reliability.

## Supported DeFi Protocols

The SDK and MCP Gateway provide modules and tools for the following protocols:

### 1. MystenSui (Base Sui Interactions)

*   **Description:** Core functionalities for fundamental interactions with the Sui blockchain.
*   **Key MCP Tools/SDK Functions:**
    *   Query SUI and other fungible token balances.
    *   Fetch token metadata.
    *   Transfer SUI and fungible tokens.
    *   Retrieve recent user transactions.
*   **Module:** `src/protocols/mystensui/`
*   **Detailed Docs:** (Refer to `docs/mystensui.md` if it exists and is maintained)

### 2. SpringSui (Liquid Staking)

*   **Description:** Implements standards for Liquid Staking Tokens (LSTs) on Sui (e.g., based on or inspired by SpringSui concepts). This allows users to stake SUI and receive a liquid token representation (like afSUI or haSUI) that can be utilized in other DeFi protocols while the underlying SUI earns staking rewards.
*   **Key MCP Tools/SDK Functions:**
    *   Stake SUI to mint LSTs (e.g., ParaSui via specific integrations).
    *   Query user's LST details and balances.
    *   Discover available LST pools or configurations.
*   **Module:** `src/protocols/springsui/`
*   **Detailed Docs:** (Refer to `docs/springsui.md`)

### 3. Steamm Finance (AMM/DEX)

*   **Description:** Integrates with Steamm Finance, an Automated Market Maker (AMM) and Decentralized Exchange (DEX) protocol on Sui, enabling token swaps and liquidity provision.
*   **Key MCP Tools/SDK Functions:**
    *   Execute token swaps.
    *   Add and remove liquidity from pools.
    *   Get swap quotes and price impact.
    *   Discover liquidity pools and their details.
*   **Module:** `src/protocols/steamm/`
*   **Detailed Docs:** (Refer to `docs/steamm.md`)

### 4. Suilend (Lending & Borrowing)

*   **Description:** Provides an interface to Suilend, a decentralized lending and borrowing protocol on Sui. Users can lend their assets to earn interest or borrow assets by providing collateral.
*   **Key MCP Tools/SDK Functions:**
    *   Deposit assets into lending pools.
    *   Withdraw assets from lending pools.
    *   Borrow assets against collateral.
    *   Repay borrowed assets.
    *   View details of user obligations (loan/deposit positions).
*   **Module:** `src/protocols/suilend/`
*   **Detailed Docs:** (Refer to `docs/suilend.md`)

## Common Utilities Module (`src/common/`)

This module offers shared resources for the entire SDK and MCP tools:

*   **`common.types.ts`**: Defines reusable TypeScript types (e.g., `PaginatedResponse`, `OperationStatus`, `SuiNetwork`).
*   **`common.utils.ts`**: Contains utility functions such as:
    *   `formatTokenAmount`: Formats raw token amounts (from contracts) into human-readable strings.
    *   `parseTokenAmount`: Converts human-readable token amounts into their raw string format for contract interaction.
    *   `shortenAddress`: Truncates Sui addresses or object IDs for display purposes.

## Project Structure

```
.
├── src/
│   ├── common/             # Shared types and utility functions
│   ├── mcp/                # Model Context Protocol Server implementation
│   │   ├── server.ts       # MCP server entry point, tool registration
│   │   ├── toolHandlers/   # Logic for each MCP tool/handler
│   │   └── zodSchemas/     # Zod schemas for validating MCP tool inputs
│   ├── protocols/          # SDK modules for specific DeFi protocols
│   │   ├── mystensui/
│   │   ├── springsui/
│   │   ├── steamm/
│   │   └── suilend/
│   ├── index.ts            # Main SDK entry point (re-exports functionalities)
│   └── main.ts             # Application entry point (starts the MCP server)
├── docs/                   # Detailed documentation per module (if maintained)
├── tests/                  # Unit and integration tests
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

### Prerequisites

*   Node.js (Recommended version: >=18.x)
*   npm or yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone <YOUR_REPOSITORY_URL>
    cd <YOUR_PROJECT_DIRECTORY>
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

### Configuration

(Detail any necessary `.env` file setup or other specific configurations here. For example, RPC endpoints for different Sui networks if they are not hardcoded or default appropriately within the SDK modules.)
Currently, network configurations (mainnet, testnet, devnet) are typically passed during client instantiation or tool calls.

## Usage

### As a TypeScript SDK

The protocol functionalities can be directly imported and used in your TypeScript/JavaScript projects:

```typescript
import {
  MystenSuiClient,
  getSuiBalance,
  // ... other MystenSui imports

  SpringSuiClient,
  stakeSuiForParaSui, // Example specific LST minting
  // ... other SpringSui imports
  
  // ... and so on for Steamm, Suilend, and common utilities
} from './src'; // Or the package name if this SDK is published

async function sdkExample() {
  // Example: Using MystenSui to get SUI balance
  const mystenSuiClient = new MystenSuiClient({ network: 'devnet' }); // Specify network
  const userAddress = '0xYOUR_SUI_ADDRESS_HERE'; // Replace with an actual Sui address
  
  try {
    const balanceInfo = await getSuiBalance(mystenSuiClient.client, userAddress);
    if (balanceInfo) {
      console.log(`SUI Balance for ${userAddress}: ${balanceInfo.balance} SUI (Raw: ${balanceInfo.rawBalance})`);
    } else {
      console.log(`Could not retrieve balance for ${userAddress}.`);
    }
  } catch (error) {
    console.error("Error fetching SUI balance:", error);
  }

  // Further SDK usage examples can be added here
}

sdkExample();
```

### As an MCP Gateway (for LLMs and Agents)

The MCP server is the primary interaction point for LLMs.

1.  **Build the project:**
    ```bash
    npm run build
    ```
    This compiles the TypeScript code into JavaScript, typically outputting to the `dist/` directory.

2.  **Start the MCP server:**
    ```bash
    npm start
    ```
    This command executes the compiled `dist/main.js` script, which in turn initializes and starts the MCP server defined in `src/mcp/server.ts`. The server will listen on `stdin` for requests and send responses to `stdout`.

    You should see a confirmation message in your console (via `console.error`):
    `DeFi Protocol Gateway MCP Server process started via main.ts (with tsc-alias build)`

3.  **Interaction:**
    An LLM or an MCP client application can then send JSON-formatted MCP requests to the running process's `stdin` to list available tools or execute specific tools with parameters. The server will respond on `stdout`.

## Available MCP Tools

The MCP server (`src/mcp/server.ts`) registers a comprehensive suite of tools that map to the SDK's functionalities. Each tool has a strictly defined input schema (using Zod, found in `src/mcp/zodSchemas/`) to ensure data integrity and provide clear usage contracts for LLMs.

**Examples of Registered Tools (Non-Exhaustive List):**

*   `mcp_sui-defi-protocol-gateway_mystenSui_getSuiBalance`
*   `mcp_sui-defi-protocol-gateway_mystenSui_getTokenMetadata`
*   `mcp_sui-defi-protocol-gateway_mystenSui_transferSui`
*   `mcp_sui-defi-protocol-gateway_springSui_stakeSuiForParaSui`
*   `mcp_sui-defi-protocol-gateway_steamm_findSteammSwapRoutes`
*   `mcp_sui-defi-protocol-gateway_steamm_executeSteammSwap`
*   `mcp_sui-defi-protocol-gateway_suilend_depositToSuilend`
*   `mcp_sui-defi-protocol-gateway_suilend_borrowFromSuilend`
*   `mcp_sui-defi-protocol-gateway_common_formatTokenAmount`

**To see the full list of available tools and their specific parameters, refer to:**
*   The `registerMcpTools` function within `src/mcp/server.ts`.
*   The individual handler files within `src/mcp/toolHandlers/`.
*   The Zod schema definitions in `src/mcp/zodSchemas/`.

## Development

### Key NPM Scripts

*   `npm run build`: Compiles TypeScript to JavaScript (output to `dist/`).
*   `npm start`: Starts the MCP server by running the compiled code in `dist/main.js`.
*   `npm test`: Executes the test suite (configured via Jest in `jest.config.js`).
*   _(Recommended additions for larger projects)_:
    *   `npm run dev`: To run the server in development mode with hot-reloading (e.g., using `ts-node-dev`).
    *   `npm run lint`: To enforce code style and catch errors using a linter like ESLint.
    *   `npm run format`: To automatically format code using a tool like Prettier.

### Testing

Tests are located in the `tests/` directory. To run them:
```bash
npm test
```
(More detailed information about the testing strategy, types of tests included, and how to write new tests can be added here.)

## Contributing

Contributions are highly welcome! If you'd like to contribute, please:
1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes.
4.  Ensure tests pass (and add new ones if applicable).
5.  Submit a Pull Request with a clear description of your changes.

(Consider adding more specific guidelines on coding style, commit message formats, and the PR review process for a more formal open-source project.)

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE.md) file for details. (If you don't have a LICENSE.md file, you can create one with the MIT license text, or choose another license.) 