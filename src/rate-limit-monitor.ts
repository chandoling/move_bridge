import { 
  Aptos, 
  AptosConfig, 
  Network 
} from "@aptos-labs/ts-sdk";

const MOVEMENT_MAINNET_CONFIG = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: 'https://mainnet.movementnetwork.xyz/v1',
});

// Check rate limit capacity for specific endpoint
async function checkRateLimit(aptos: Aptos, endpointId: number): Promise<{ capacity: number, hasCapacity: boolean }> {
  try {
    const result = await aptos.view({
      payload: {
        function: "0x7e4fd97ef92302eea9b10f74be1d96fb1f1511cf7ed28867b0144ca89c6ebc3c::move_oft_adapter::rate_limit_capacity",
        typeArguments: [],
        functionArguments: [endpointId]
      }
    });
    
    const capacity = Number(result[0]);
    return { capacity, hasCapacity: capacity > 0 };
  } catch (error) {
    console.error("Error checking rate limit:", error);
    return { capacity: 0, hasCapacity: false };
  }
}

// Monitor rate limit continuously
async function monitorRateLimit(endpointId: number, intervalSeconds: number = 5) {
  const aptos = new Aptos(MOVEMENT_MAINNET_CONFIG);
  
  console.log(`🔍 Starting rate limit monitor for endpoint ${endpointId}`);
  console.log(`📊 Checking every ${intervalSeconds} seconds...\n`);
  
  let consecutiveAvailable = 0;
  let consecutiveBlocked = 0;
  
  while (true) {
    try {
      const timestamp = new Date().toLocaleTimeString();
      const { capacity, hasCapacity } = await checkRateLimit(aptos, endpointId);
      
      if (hasCapacity) {
        consecutiveAvailable++;
        consecutiveBlocked = 0;
        console.log(`✅ [${timestamp}] Rate limit available - Capacity: ${capacity} (${consecutiveAvailable} consecutive)`);
      } else {
        consecutiveBlocked++;
        consecutiveAvailable = 0;
        console.log(`❌ [${timestamp}] Rate limit blocked - Capacity: ${capacity} (${consecutiveBlocked} consecutive)`);
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
      
    } catch (error) {
      console.error(`⚠️  [${new Date().toLocaleTimeString()}] Monitor error:`, error);
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
    }
  }
}

// Wait for rate limit to become available
async function waitForRateLimit(endpointId: number, maxWaitMinutes: number = 10): Promise<boolean> {
  const aptos = new Aptos(MOVEMENT_MAINNET_CONFIG);
  const maxAttempts = (maxWaitMinutes * 60) / 5; // Check every 5 seconds
  
  console.log(`⏳ Waiting for rate limit to become available (max ${maxWaitMinutes} minutes)...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { capacity, hasCapacity } = await checkRateLimit(aptos, endpointId);
    
    if (hasCapacity) {
      console.log(`🎉 Rate limit available! Capacity: ${capacity}`);
      return true;
    }
    
    const elapsed = (attempt * 5) / 60;
    console.log(`⏱️  Still blocked (${elapsed.toFixed(1)}min elapsed) - Capacity: ${capacity}`);
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
  }
  
  console.log(`❌ Rate limit did not become available within ${maxWaitMinutes} minutes`);
  return false;
}

// Main function to run the monitor
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const endpointId = parseInt(args[1]) || 30101; // Default to Ethereum mainnet
  
  switch (command) {
    case 'monitor':
      const interval = parseInt(args[2]) || 5;
      await monitorRateLimit(endpointId, interval);
      break;
      
    case 'wait':
      const maxWait = parseInt(args[2]) || 10;
      const available = await waitForRateLimit(endpointId, maxWait);
      process.exit(available ? 0 : 1);
      break;
      
    case 'check':
      const aptos = new Aptos(MOVEMENT_MAINNET_CONFIG);
      const { capacity, hasCapacity } = await checkRateLimit(aptos, endpointId);
      console.log(`Endpoint ${endpointId}: ${hasCapacity ? '✅ Available' : '❌ Blocked'} (Capacity: ${capacity})`);
      process.exit(hasCapacity ? 0 : 1);
      break;
      
    default:
      console.log(`
Usage:
  npm run rate-limit check [endpointId]     - Check current rate limit status
  npm run rate-limit wait [endpointId] [maxMinutes] - Wait until rate limit is available
  npm run rate-limit monitor [endpointId] [intervalSeconds] - Continuously monitor rate limit

Examples:
  npm run rate-limit check 30101
  npm run rate-limit wait 30101 15
  npm run rate-limit monitor 30101 3
      `);
  }
}

main().catch(console.error);