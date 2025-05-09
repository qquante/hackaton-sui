// src/main.ts

import path from 'path';
import { register } from 'tsconfig-paths';
import * as tsConfig from '../tsconfig.json';

const outDirFromTsConfig = tsConfig.compilerOptions.outDir || './dist';
const absoluteBaseUrlForRuntime = path.resolve(process.cwd(), outDirFromTsConfig);
const runtimePaths = { "@/*": ["./*"] };

register({
  baseUrl: absoluteBaseUrlForRuntime,
  paths: runtimePaths,
});

import './mcp/server'; 

console.error("DeFi Protocol Gateway MCP Server process started via main.ts (with tsc-alias build)"); 