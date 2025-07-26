import { 
  Account, 
  Aptos, 
  AptosConfig, 
  Network, 
  Ed25519PrivateKey,
  InputEntryFunctionData,
  TransactionResponse
} from "@aptos-labs/ts-sdk";
import * as dotenv from 'dotenv';

dotenv.config();

const MOVEMENT_MAINNET_CONFIG = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: 'https://rpc.ankr.com/http/movement_mainnet/v1',
  clientConfig: {
    HEADERS: {
      'Content-Type': 'application/json',
    }
  }
});

// Convert Ethereum address to bytes32 format for LayerZero
function addressToBytes32(address: string): string {
  const cleanAddress = address.toLowerCase().replace('0x', '');
  const padded = '000000000000000000000000' + cleanAddress;
  return '0x' + padded;
}

// Check rate limit capacity
async function checkRateLimit(aptos: Aptos, endpointId: number): Promise<number> {
  try {
    const startTime = Date.now();
    const result = await aptos.view({
      payload: {
        function: "0x7e4fd97ef92302eea9b10f74be1d96fb1f1511cf7ed28867b0144ca89c6ebc3c::move_oft_adapter::rate_limit_capacity",
        typeArguments: [],
        functionArguments: [endpointId]
      }
    });
    const endTime = Date.now();
    console.log(`✅ Rate limit check completed in ${endTime - startTime}ms`);
    
    return Number(result[0]);
  } catch (error) {
    console.error("Error checking rate limit:", error);
    console.error("Full error details:", JSON.stringify(error, null, 2));
    return 0;
  }
}

// Check account balance
async function checkAccountBalance(aptos: Aptos, accountAddress: string): Promise<number> {
  try {
    const startTime = Date.now();
    const result = await aptos.view({
      payload: {
        function: "0x1::coin::balance",
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [accountAddress]
      }
    });
    const endTime = Date.now();
    console.log(`✅ Balance check completed in ${endTime - startTime}ms`);
    
    return Number(result[0]);
  } catch (error) {
    console.error("Error checking balance:", error);
    console.error("Full error details:", JSON.stringify(error, null, 2));
    return 0;
  }
}

// Execute transaction
async function executeTransaction(aptos: Aptos, account: Account, threshold: number): Promise<void> {
  const ETHEREUM_MAINNET_ENDPOINT_ID = 30101;
  const RECIPIENT_ETH_ADDRESS = process.env.RECIPIENT_ETH_ADDRESS;
  
  if (!RECIPIENT_ETH_ADDRESS) {
    throw new Error("RECIPIENT_ETH_ADDRESS not found in .env file");
  }
  
  // Use the threshold amount (in smallest units)
  const amountToSend = threshold.toString();
  
  // Convert recipient address to bytes32 format
  const recipientBytes32 = addressToBytes32(RECIPIENT_ETH_ADDRESS);
  
  const payload: InputEntryFunctionData = {
    function: "0x7e4fd97ef92302eea9b10f74be1d96fb1f1511cf7ed28867b0144ca89c6ebc3c::oft::send_withdraw",
    typeArguments: [],
    functionArguments: [
      ETHEREUM_MAINNET_ENDPOINT_ID,
      Array.from(Buffer.from(recipientBytes32.slice(2), "hex")), // Remove 0x prefix
      amountToSend,
      amountToSend,
      Array.from(Buffer.from("00030100110100000000000000000000000000061a80", "hex")),
      Array.from(Buffer.from("00", "hex")),
      Array.from(Buffer.from("00", "hex")),
      "2456451314",
      "0"
    ]
  };
  
  try {
    console.log(`🚀 Executing transaction with threshold amount: ${amountToSend}`);
    
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: payload,
    });

    const signature = aptos.transaction.sign({
      signer: account,
      transaction
    });

    const committedTxn = await aptos.transaction.submit.simple({
      transaction,
      senderAuthenticator: signature,
    });

    console.log("✅ Transaction submitted:", committedTxn.hash);

    const response = await aptos.waitForTransaction({
      transactionHash: committedTxn.hash
    });

    console.log("📊 Transaction Result:");
    console.log("- Hash:", response.hash);
    console.log("- Success:", response.success);
    console.log("- Gas Used:", response.gas_used);
    
  } catch (error) {
    console.error("❌ Transaction failed:", error);
    throw error;
  }
}

// Monitor and trigger transaction when capacity exceeds threshold
async function monitorAndTrigger() {
  const privateKeyString = process.env.PVK;
  if (!privateKeyString) {
    throw new Error("PVK not found in .env file");
  }

  const thresholdTokens = process.env.THRESHOLD_TOKENS!;
  if (!thresholdTokens) {
    throw new Error("THRESHOLD_TOKENS not found in .env file");
  }
  const THRESHOLD = parseFloat(thresholdTokens) * 100000000; // Convert to smallest units (8 decimals)
  
  const privateKey = new Ed25519PrivateKey(privateKeyString);
  const account = Account.fromPrivateKey({ privateKey });
  const aptos = new Aptos(MOVEMENT_MAINNET_CONFIG);
  
  const ENDPOINT_ID = 30101;
  
  console.log("🔍 Starting capacity monitor...");
  console.log(`📍 Account: ${account.accountAddress.toString()}`);
  console.log(`🎯 Threshold: ${thresholdTokens} tokens (${THRESHOLD.toLocaleString()} units)`);
  console.log(`🌐 Endpoint: ${ENDPOINT_ID}`);
  console.log("⏰ Checking every 3 seconds...");
  console.log("🔄 Will continue monitoring after each transaction\n");

  let transactionCount = 0;
  let cycleCount = 0;

  while (true) { // Continue forever
    try {
      cycleCount++;
      console.log(`🔄 Cycle #${cycleCount} starting...`);
      
      // Check account balance every 10 cycles
      if (cycleCount % 10 === 0) {
        console.log(`💳 Checking balance...`);
        const balance = await checkAccountBalance(aptos, account.accountAddress.toString());
        const balanceInTokens = balance / 100000000;
        
        if (balanceInTokens <= 1000) {
          console.log(`\n⚠️  WARNING: Account balance is too low!`);
          console.log(`💰 Current balance: ${balanceInTokens.toLocaleString()} tokens`);
          console.log(`🛑 Minimum required: 1,000 tokens`);
          console.log(`❌ Stopping program to prevent insufficient funds...`);
          process.exit(0);
        }
      }
      
      console.log(`📊 Checking capacity...`);
      const capacity = await checkRateLimit(aptos, ENDPOINT_ID);
      const timestamp = new Date().toLocaleTimeString();
      const tokensAmount = capacity / 100000000;
      
      // Show balance info every 10 cycles when we check it
      if (cycleCount % 10 === 0) {
        const balance = await checkAccountBalance(aptos, account.accountAddress.toString());
        const balanceInTokens = balance / 100000000;
        console.log(`[${timestamp}] Capacity: ${tokensAmount.toLocaleString()} tokens | Balance: ${balanceInTokens.toLocaleString()} tokens`);
      } else {
        console.log(`[${timestamp}] Capacity: ${tokensAmount.toLocaleString()} tokens`);
      }
      
      if (capacity >= THRESHOLD) {
        transactionCount++;
        console.log(`\n🎉 THRESHOLD REACHED! (#${transactionCount})`);
        console.log(`💰 Capacity: ${tokensAmount.toLocaleString()} tokens`);
        console.log("🚀 Triggering transaction...\n");
        
        try {
          await executeTransaction(aptos, account, THRESHOLD);
          console.log(`\n✅ Transaction #${transactionCount} completed successfully!`);
          console.log("🔄 Continuing to monitor for next opportunity...\n");
        } catch (error) {
          console.error(`❌ Transaction #${transactionCount} failed:`, error);
          console.log("🔄 Continuing to monitor...\n");
        }
      }
      
      // Wait 3 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`⚠️  [${new Date().toLocaleTimeString()}] Monitor error:`, error);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

// Main execution
async function main() {
  try {
    await monitorAndTrigger();
  } catch (error) {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  }
}

main();