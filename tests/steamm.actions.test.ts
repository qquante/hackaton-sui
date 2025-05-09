// tests/steamm.actions.test.ts
import { SuiClient, getFullnodeUrl, SuiTransactionBlockResponse, CoinMetadata, SuiParsedData, PaginatedCoins, SuiTransactionBlockResponseOptions } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Keypair, Signer } from '@mysten/sui/cryptography';
import { decodeSuiPrivateKey, ParsedKeypair } from '@mysten/sui/cryptography';
import { SteammSDK, PoolInfo, Route, SwapQuote, DepositQuote, RedeemQuote } from '@suilend/steamm-sdk';
import dotenv from 'dotenv';
import BigNumber from 'bignumber.js';
import { Transaction } from '@mysten/sui/transactions';

import {
  getAllSteammPools,
  findSteammSwapRoutes,
  getSteammSwapQuote,
  executeSteammSwap,
  getSteammAddLiquidityQuote,
  addSteammLiquidity,
  getSteammRemoveLiquidityQuote,
  removeSteammLiquidity,
  getSteammUserPositions,
  executeSteammRoutedSwap,
  getSteammPoolsExtended,
  getUserSteammLpBalance,
} from '../src/protocols/steamm/steamm.actions';
import { MvpWalletAdapter, getSuiBalance, getTokenMeta, getUserTokenBalance } from '../src/protocols/mystensui/mystenSui.actions';
import { getSuiClient } from '../src/protocols/mystensui/mystenSui.client';
import { initializeSteammSDK } from '../src/protocols/steamm/steamm.client';
import { STEAMM_MAINNET_CONFIG } from '../src/protocols/steamm/steamm.config';
import { SteammPoolExtended, UserLiquidityPositionInfo } from '../src/protocols/steamm/steamm.types';
import { SUI_TYPE_ARG } from '@mysten/sui/utils';

dotenv.config();

const TEST_NETWORK: 'mainnet' | 'testnet' = 'mainnet';
const TARGET_POOL_ID = '0xe4455aac45acee48f8b69c671c245363faa7380b3dcbe3af0fbe00cc4b68e9eb';

const envPrivateKey = process.env.TEST_WALLET_PRIVATE_KEY;
const suiCoinType = process.env.TEST_ASSET_1_COIN_TYPE || SUI_TYPE_ARG;
const suiDecimals = parseInt(process.env.TEST_ASSET_1_DECIMALS || '9');

const walCoinType = '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL';
const walDecimals = 9;

const usdcCoinType = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const usdcDecimals = 6;

const walDepositAmountString = '0.01';
const usdcDepositAmountString = '0.01';

let suiCoinObjectIdForLp: string | null = null;
let walCoinObjectIdForLp: string | null = null; 
let usdcCoinObjectIdForLp: string | null = null;
let lpCoinObjectIdForRemove: string | null = null; 
let canRunWriteTests = false;

if (!envPrivateKey) {
  console.warn("TEST_WALLET_PRIVATE_KEY not found in .env. Skipping write tests.");
}

async function findCoinObjectIdWithBalance(
  client: SuiClient,
  owner: string,
  coinType: string,
  requiredAmountRaw: bigint 
): Promise<string | null> {
  console.log(`Searching for ${coinType} coin >= ${requiredAmountRaw} raw units for ${owner}...`);
  let cursor: string | null = null;
  let foundCoinId: string | null = null;

  try {
    do {
      const coins: PaginatedCoins = await client.getCoins({ owner, coinType, cursor });
      const suitableCoin = coins.data.find(c => 
          BigInt(c.balance) >= requiredAmountRaw && 
          c.balance !== '0'
      );
      
      if (suitableCoin) {
        console.log(`  Found suitable coin: ${suitableCoin.coinObjectId} (Balance: ${suitableCoin.balance})`);
        foundCoinId = suitableCoin.coinObjectId;
        break; 
      }
      cursor = coins.nextCursor ?? null;
    } while (cursor);

    if (!foundCoinId && coinType === SUI_TYPE_ARG) { 
       const gasCoinInfo = await client.getBalance({ owner, coinType: SUI_TYPE_ARG });
       if (BigInt(gasCoinInfo.totalBalance) >= requiredAmountRaw) {
            console.warn(`  No separate SUI coin found >= ${requiredAmountRaw}. Will attempt to use gas coin if no object ID passed to functions.`);
       }
    }
  } catch (error) {
      console.error(`Error fetching coins for ${coinType}:`, error);
  }

  if (!foundCoinId && coinType !== SUI_TYPE_ARG) { 
      console.warn(`  Could not find a single, unlocked ${coinType} coin object with at least ${requiredAmountRaw} raw units.`);
  } else if (!foundCoinId && coinType === SUI_TYPE_ARG) {
       console.warn(`  Could not find a separate, unlocked ${coinType} coin object with at least ${requiredAmountRaw} raw units (gas might be used).`);
  }
  return foundCoinId;
}


describe('Steamm Protocol Actions on Mainnet', () => {
  let suiClient: SuiClient;
  let steammSdk: SteammSDK;
  let walletAdapter: MvpWalletAdapter;
  let senderAddress: string;
  let testSigner: Signer;
  let targetPool: PoolInfo | undefined = undefined;

  jest.setTimeout(120000);

  beforeAll(async () => {
    suiClient = getSuiClient(TEST_NETWORK);
    
    if (envPrivateKey) {
      try {
          const parsedKeypair = decodeSuiPrivateKey(envPrivateKey);
          if (parsedKeypair.schema !== 'ED25519') {
              throw new Error("Private key schema must be ED25519");
          }
          testSigner = Ed25519Keypair.fromSecretKey(parsedKeypair.secretKey);
          senderAddress = testSigner.getPublicKey().toSuiAddress();

          steammSdk = initializeSteammSDK(suiClient, {
            ...STEAMM_MAINNET_CONFIG,
            senderAddress: senderAddress, 
          });
          steammSdk.senderAddress = senderAddress;

          walletAdapter = {
            address: senderAddress,
            signAndExecuteTransactionBlock: async (txInput: { 
              transactionBlock: Transaction, 
              options?: SuiTransactionBlockResponseOptions 
            }) => {
              console.log(" -> Signing and executing transaction...");
              const result = await suiClient.signAndExecuteTransaction({
                signer: testSigner,
                transaction: txInput.transactionBlock,
                options: txInput.options || { showEffects: true, showObjectChanges: true },
                requestType: 'WaitForLocalExecution'
              });
              console.log(` -> Tx Digest: ${result.digest}`);
              return result;
            },
          };
          console.log(`--- Initializing Steamm Test Setup for ${TEST_NETWORK} ---`);
          console.log(`Test Wallet Address: ${senderAddress}`);
          
          console.log("\n--- Wallet Summary ---");
          const suiBalanceInfo = await getSuiBalance(suiClient, senderAddress);
          console.log(`SUI Balance: ${suiBalanceInfo?.balance || 0} (Raw: ${suiBalanceInfo?.rawBalance || '0'})`);
          
          const walUserBalanceInfo = await getUserTokenBalance(suiClient, senderAddress, walCoinType); 
          console.log(`WAL (underlying) Balance: ${walUserBalanceInfo?.balance || 0} (Raw: ${walUserBalanceInfo?.rawBalance || '0'}, Decimals: ${walUserBalanceInfo?.metadata?.decimals ?? 'unknown'})`);
          
          const usdcUserBalanceInfo = await getUserTokenBalance(suiClient, senderAddress, usdcCoinType);
          console.log(`USDC (underlying) Balance: ${usdcUserBalanceInfo?.balance || 0} (Raw: ${usdcUserBalanceInfo?.rawBalance || '0'}, Decimals: ${usdcUserBalanceInfo?.metadata?.decimals ?? 'unknown'})`);
          console.log("--- End Wallet Summary ---\n");
          
          console.log(`Searching for target pool (${TARGET_POOL_ID})...`);
          const allPools = await getAllSteammPools(steammSdk);
          targetPool = allPools.find(p => p.poolId === TARGET_POOL_ID);
          
          if (targetPool) {
              console.log(`Found target pool: ${targetPool.poolId}`);
              console.log(`  Pool Coin A (BToken): ${targetPool.coinTypeA}, Pool Coin B (BToken): ${targetPool.coinTypeB}, LP: ${targetPool.lpTokenType}`);

              console.log(`\n--- Fetching Raw State for Pool: ${targetPool.poolId} ---`);
              try {
                const poolObject = await suiClient.getObject({ 
                  id: targetPool.poolId, 
                  options: { showContent: true } 
                });
                if (poolObject.data?.content?.dataType === 'moveObject' && poolObject.data.content.hasPublicTransfer) {
                  console.log("  Pool Object Content:");
                  console.log(`    Type: ${poolObject.data.content.type}`);
                  const fields = poolObject.data.content.fields as any;
                  console.log(`    LP Supply: ${fields?.lp_supply?.fields?.value ?? 'N/A'}`); 
                  console.log(`    Balance A (B_WAL): ${fields?.balance_a ?? 'N/A'}`);
                  console.log(`    Balance B (B_USDC): ${fields?.balance_b ?? 'N/A'}`);
                  console.log(`    Fee Rate (Swap): ${fields?.swap_fee_rate ?? 'N/A'}`); 
                  console.log(`    (Full Raw Fields): ${JSON.stringify(fields, null, 2)}`);
                } else {
                  console.log("  Could not retrieve detailed Move object content.");
                }
              } catch (err) {
                console.error(`  Error fetching raw pool object: ${err}`);
              }
              console.log("--- End Raw Pool State ---\n");

              console.log(`Getting add liquidity quote for ${walDepositAmountString} underlying WAL into B_WAL/B_USDC pool ${targetPool.poolId}...`);
              
              const quote = await getSteammAddLiquidityQuote(
                suiClient,
                steammSdk,
                targetPool,             
                walDepositAmountString, 
                walDecimals,            
                '1000000',              
                usdcDecimals,           
                senderAddress
              ); 
              
              if (quote && quote.rawQuote.depositA > 0n && quote.rawQuote.depositB > 0n) {
                  const requiredWalRaw = quote.rawQuote.depositA; 
                  const requiredUsdcRaw = quote.rawQuote.depositB; 
                  console.log(`  Quote requires: ${requiredWalRaw} raw WAL, ${requiredUsdcRaw} raw USDC. Expected LP: ${quote.rawQuote.mintLp}`);
                  
                  console.log("Attempting to find suitable coin objects in wallet for LP...");
                  walCoinObjectIdForLp = await findCoinObjectIdWithBalance(suiClient, senderAddress, walCoinType, requiredWalRaw);
                  usdcCoinObjectIdForLp = await findCoinObjectIdWithBalance(suiClient, senderAddress, usdcCoinType, requiredUsdcRaw);
                                    
                  canRunWriteTests = !!(walCoinObjectIdForLp && usdcCoinObjectIdForLp);

                  if (canRunWriteTests) {
                    console.log(`  Found WAL object: ${walCoinObjectIdForLp}, USDC object: ${usdcCoinObjectIdForLp}. Write tests enabled.`);
                  } else {
                    console.warn(`  Could not find sufficient coin objects for LP (Need WAL >= ${requiredWalRaw}, USDC >= ${requiredUsdcRaw}). Write tests will be skipped.`);
                  }

              } else {
                 console.error("  Failed to get add liquidity quote. Cannot determine required asset amounts. Quote response:", quote);
                 canRunWriteTests = false;
              }
          } else {
              console.error(`Could not find the target pool (${TARGET_POOL_ID}). Write tests will be skipped.`);
              canRunWriteTests = false;
          }

          if (!canRunWriteTests) {
              console.warn("Prerequisites for write tests (LP or Swap) not met. Skipping relevant tests.");
          }

      } catch (error) {
          console.error("Error during test setup:", error);
          canRunWriteTests = false; 
      }
    } else {
      console.warn('Skipping write test setup due to missing env var: TEST_WALLET_PRIVATE_KEY.');
      steammSdk = initializeSteammSDK(suiClient, STEAMM_MAINNET_CONFIG);
    }
  }, 120000); 

  afterEach(async () => {
    console.log('Waiting 5 seconds for RPC sync...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  test('should fetch all Steamm pools', async () => {
    const pools = await getAllSteammPools(steammSdk);
    expect(pools).toBeDefined();
    expect(pools.length).toBeGreaterThan(0);
    console.log(`Fetched ${pools.length} Steamm pools. First pool ID: ${pools[0]?.poolId}`);
  });

  test('should fetch extended Steamm pools data', async () => {
    console.log(`\n--- Test: Fetch Extended Pool Data ---`);
    const extendedPools = await getSteammPoolsExtended(steammSdk, suiClient, 10);
    expect(extendedPools).toBeDefined();
    expect(extendedPools.length).toBeGreaterThan(0);
    expect(extendedPools.length).toBeLessThanOrEqual(10);
    const targetExtended = extendedPools.find(p => p.poolId === TARGET_POOL_ID);
    if (targetExtended) {
        console.log(`  Found extended data for target pool: ${targetExtended.symbolA}-${targetExtended.symbolB}, LP: ${targetExtended.lpSymbol}`);
        expect(targetExtended.symbolA).toBeDefined();
        expect(targetExtended.symbolA).not.toBe('UNK'); 
        expect(targetExtended.decimalsA).toBeGreaterThanOrEqual(0);
        expect(targetExtended.lpDecimals).toBeDefined();
        expect(targetExtended.lpDecimals).toBeGreaterThanOrEqual(0);
    } else {
        console.warn(`  Target pool ${TARGET_POOL_ID} not found in extended results.`);
    }
  });


  describe('B_WAL/B_USDC Pool Liquidity Lifecycle', () => {
    let addedLpAmountRaw: bigint = 0n;
    let expectedLpOutRaw: bigint = 0n;
    let lpCoinDecimals: number = 9;

    test('should add WAL/USDC liquidity to the B_WAL/B_USDC pool', async () => {
      if (!canRunWriteTests) {
          console.warn('Skipping add liquidity test as prerequisites not met in beforeAll.');
          return;
      }
      if (!targetPool) throw new Error("Target pool not found in setup");
      if (!walCoinObjectIdForLp) throw new Error("Underlying WAL coin object not found");
      if (!usdcCoinObjectIdForLp) throw new Error("Underlying USDC coin object not found");

      console.log(`
--- Test: Add Liquidity (underlying WAL & USDC) to pool ${targetPool.poolId} ---`);
      
      console.log(`Re-quoting add liquidity for ${walDepositAmountString} underlying WAL...`);
      const quote = await getSteammAddLiquidityQuote(
        suiClient,
        steammSdk,
        targetPool,             
        walDepositAmountString, 
        walDecimals,            
        '1000000',              
        usdcDecimals,
        senderAddress         
      ); 

      expect(quote).toBeDefined();
      expect(quote).not.toBeNull();
      expect(quote!.rawQuote.depositA).toBeGreaterThan(0n);
      expect(quote!.rawQuote.depositB).toBeGreaterThan(0n);
      expect(quote!.rawQuote.mintLp).toBeGreaterThan(0n);

      const requiredWalRaw = quote!.rawQuote.depositA; 
      const requiredUsdcRaw = quote!.rawQuote.depositB; 
      expectedLpOutRaw = quote!.rawQuote.mintLp;

      console.log(`  Add Liquidity Quote: Requires ${requiredWalRaw} raw WAL & ${requiredUsdcRaw} raw USDC. Expected LP: ${expectedLpOutRaw}`);

      const lpMeta = await getTokenMeta(suiClient, targetPool.lpTokenType);
      if (lpMeta) {
        lpCoinDecimals = lpMeta.decimals;
        console.log(`  LP Token Decimals: ${lpCoinDecimals}`);
      } else {
        console.warn(`  Could not fetch LP token metadata, using default decimals: ${lpCoinDecimals}`);
      }

      const initialLpBalance = await getUserSteammLpBalance(suiClient, senderAddress, targetPool);
      const initialWalBalance = await getUserTokenBalance(suiClient, senderAddress, walCoinType);
      const initialUsdcBalance = await getUserTokenBalance(suiClient, senderAddress, usdcCoinType);

      console.log(`  Initial Balances - LP: ${initialLpBalance?.totalBalance || 0}, WAL: ${initialWalBalance?.rawBalance || 0}, USDC: ${initialUsdcBalance?.rawBalance || 0}`);
      
      const result = await addSteammLiquidity(
        suiClient, 
        steammSdk, 
        walletAdapter, 
        targetPool, 
        walCoinObjectIdForLp, 
        walDecimals, 
        quote!.amountAInUi, 
        usdcCoinObjectIdForLp, 
        usdcDecimals, 
        quote!.amountBInUi 
      );

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      await new Promise(resolve => setTimeout(resolve, 3000)); 
      expect(result!.effects?.status.status).toBe('success');
      console.log(`Add liquidity successful! Digest: ${result!.digest}`);

      const finalLpBalance = await getUserSteammLpBalance(suiClient, senderAddress, targetPool);
      const finalWalBalance = await getUserTokenBalance(suiClient, senderAddress, walCoinType);
      const finalUsdcBalance = await getUserTokenBalance(suiClient, senderAddress, usdcCoinType);
      
      expect(finalLpBalance).toBeDefined();
      expect(finalWalBalance).toBeDefined();
      expect(finalUsdcBalance).toBeDefined();

      console.log(`  Final Balances - LP: ${finalLpBalance!.totalBalance}, WAL: ${finalWalBalance!.rawBalance}, USDC: ${finalUsdcBalance!.rawBalance}`);

      const lpBalanceDiff = BigInt(finalLpBalance!.totalBalance) - BigInt(initialLpBalance?.totalBalance || 0n);
      addedLpAmountRaw = lpBalanceDiff; 
      
      console.log(`  LP Token Balance Change: +${addedLpAmountRaw} raw units.`);
      const tolerance = expectedLpOutRaw / 100n > 1n ? expectedLpOutRaw / 100n : 1n;
      expect(lpBalanceDiff).toBeGreaterThanOrEqual(expectedLpOutRaw - tolerance); 
      expect(lpBalanceDiff).toBeLessThanOrEqual(expectedLpOutRaw + tolerance); 

      console.log("  Attempting to find LP coin object for removal...");
      const createdObjects = result?.effects?.created;
      let foundNewLpId = false;
      if (createdObjects) {
        for (const obj of createdObjects) {
            if (obj.owner === 'Immutable') continue; 
            const ownerAddress = typeof obj.owner === 'object' && 'AddressOwner' in obj.owner ? obj.owner.AddressOwner : null;
            if (ownerAddress !== senderAddress) continue; 

            try {
                const objDetails = await suiClient.getObject({ id: obj.reference.objectId, options: { showType: true } });
                if (objDetails.data?.type === targetPool.lpTokenType) {
                    const coinCheck = await suiClient.getBalance({owner: senderAddress, coinType: targetPool.lpTokenType});
                    const coinData = await suiClient.getCoinMetadata({coinType: targetPool.lpTokenType}); 
                    const currentLpDecimals = coinData?.decimals ?? lpCoinDecimals; 
                    const userLpCoins = await suiClient.getCoins({ owner: senderAddress, coinType: targetPool.lpTokenType });
                    const matchingCoin = userLpCoins.data.find(c => c.coinObjectId === obj.reference.objectId && BigInt(c.balance) === addedLpAmountRaw);
                    if(matchingCoin){
                        lpCoinObjectIdForRemove = obj.reference.objectId;
                        console.log(`    Detected new LP coin object ID: ${lpCoinObjectIdForRemove} with expected balance ${addedLpAmountRaw}`);
                        foundNewLpId = true;
                        break;
                    }
                }
            } catch (fetchError) {
                console.warn(`    Could not fetch/verify details for created object ${obj.reference.objectId}`, fetchError);
            }
        }
      }
      if (!foundNewLpId && addedLpAmountRaw > 0n) { 
         console.log("    Created object search failed or insufficient, trying broader search by balance...");
         const allLpCoins = await suiClient.getCoins({ owner: senderAddress, coinType: targetPool.lpTokenType });
         const potentialCoin = allLpCoins.data.find(c => BigInt(c.balance) === addedLpAmountRaw); 
         if (potentialCoin) {
             lpCoinObjectIdForRemove = potentialCoin.coinObjectId;
             console.log(`    Found potential LP coin object ID by balance: ${lpCoinObjectIdForRemove}`);
             foundNewLpId = true;
         } else {
            console.warn(`    Could not find any LP coin object with balance ${addedLpAmountRaw}. Removal test may fail.`);
         }
      }
      expect(foundNewLpId).toBe(true); 

    }); // End Add Liquidity Test

    test('should remove WAL/USDC liquidity from the B_WAL/B_USDC pool', async () => {
        if (!canRunWriteTests || !lpCoinObjectIdForRemove || addedLpAmountRaw <= 0n) {
            console.warn('Skipping remove liquidity test as prerequisites not met (add failed, LP not found, or zero amount).');
            return;
        }
        if (!targetPool) throw new Error("Target pool not found in setup");

        console.log(`\n--- Test: Remove Liquidity (LP object: ${lpCoinObjectIdForRemove}, Amount: ${addedLpAmountRaw}) from pool ${targetPool!.poolId} ---`);

        const lpAmountToRemoveString = new BigNumber(addedLpAmountRaw.toString()).shiftedBy(-lpCoinDecimals).toString();
        console.log(`  Attempting to remove ${lpAmountToRemoveString} LP tokens (raw: ${addedLpAmountRaw}) with ${lpCoinDecimals} decimals.`);

        console.log("  Getting remove liquidity quote...");
        const removeQuote = await getSteammRemoveLiquidityQuote(
            steammSdk,
            targetPool,
            lpAmountToRemoveString, 
            lpCoinDecimals
        );

        expect(removeQuote).toBeDefined();
        expect(removeQuote).not.toBeNull();
        expect(removeQuote!.withdrawA).toBeGreaterThan(0n); 
        expect(removeQuote!.withdrawB).toBeGreaterThan(0n); 
        console.log(`  Remove Liquidity Quote: Expects to receive ${removeQuote!.withdrawA} raw WAL and ${removeQuote!.withdrawB} raw USDC.`);

        const minAmountAOutString = new BigNumber(removeQuote!.withdrawA.toString()).shiftedBy(-walDecimals).multipliedBy(0.99).toString(); // Accept 1% less
        const minAmountBOutString = new BigNumber(removeQuote!.withdrawB.toString()).shiftedBy(-usdcDecimals).multipliedBy(0.99).toString(); // Accept 1% less

        const initialLpBalance = await getUserSteammLpBalance(suiClient, senderAddress, targetPool);
        const initialWalBalance = await getUserTokenBalance(suiClient, senderAddress, walCoinType);
        const initialUsdcBalance = await getUserTokenBalance(suiClient, senderAddress, usdcCoinType);
        console.log(`  Initial Balances - LP: ${initialLpBalance?.totalBalance || '0'}, WAL: ${initialWalBalance?.rawBalance || '0'}, USDC: ${initialUsdcBalance?.rawBalance || '0'}`);


        const result = await removeSteammLiquidity(
            suiClient,
            steammSdk,
            walletAdapter,
            targetPool,
            lpCoinObjectIdForRemove!, 
            lpCoinDecimals,
            lpAmountToRemoveString,  
            minAmountAOutString,      
            minAmountBOutString,      
            walDecimals,              
            usdcDecimals              
        );

        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        await new Promise(resolve => setTimeout(resolve, 3000)); 
        expect(result!.effects?.status.status).toBe('success');
        console.log(`Remove liquidity successful! Digest: ${result!.digest}`);

        const finalLpBalance = await getUserSteammLpBalance(suiClient, senderAddress, targetPool);
        const finalWalBalance = await getUserTokenBalance(suiClient, senderAddress, walCoinType);
        const finalUsdcBalance = await getUserTokenBalance(suiClient, senderAddress, usdcCoinType);

        expect(finalLpBalance).toBeDefined();
        expect(finalWalBalance).toBeDefined();
        expect(finalUsdcBalance).toBeDefined();
        
        console.log(`  Final Balances - LP: ${finalLpBalance!.totalBalance}, WAL: ${finalWalBalance!.rawBalance}, USDC: ${finalUsdcBalance!.rawBalance}`);

        const lpBalanceDiff = BigInt(initialLpBalance?.totalBalance || 0n) - BigInt(finalLpBalance!.totalBalance);
        const walBalanceDiff = BigInt(finalWalBalance!.rawBalance) - BigInt(initialWalBalance?.rawBalance || 0n);
        const usdcBalanceDiff = BigInt(finalUsdcBalance!.rawBalance) - BigInt(initialUsdcBalance?.rawBalance || 0n);

        console.log(`  LP Token Balance Change: -${lpBalanceDiff} raw units.`);
        console.log(`  WAL Balance Change: +${walBalanceDiff} raw units.`);
        console.log(`  USDC Balance Change: +${usdcBalanceDiff} raw units.`);
        
        expect(lpBalanceDiff).toEqual(addedLpAmountRaw); 

        expect(walBalanceDiff).toBeGreaterThanOrEqual(BigInt(new BigNumber(minAmountAOutString).shiftedBy(walDecimals).toFixed(0)));
        expect(usdcBalanceDiff).toBeGreaterThanOrEqual(BigInt(new BigNumber(minAmountBOutString).shiftedBy(usdcDecimals).toFixed(0)));

        lpCoinObjectIdForRemove = null;
        addedLpAmountRaw = 0n;
    });

 });

 (canRunWriteTests ? test : test.skip)('should execute a routed swap of SUI for WAL', async () => {
    console.log(`SKIPPING SUI to WAL routed swap test due to B_WAL/B_USDC target pool context.`);
 });

 test('should fetch user Steamm LP positions', async () => {
    const positions = await getSteammUserPositions(steammSdk, suiClient, senderAddress);
    console.log('User Steamm LP Positions:', JSON.stringify(positions, null, 2));
    expect(positions).toBeDefined();
    expect(Array.isArray(positions)).toBe(true);
 });

});