import { 
  Aptos, 
  AptosConfig, 
  Network 
} from "@aptos-labs/ts-sdk";

const MOVEMENT_MAINNET_CONFIG = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: 'https://mainnet.movementnetwork.xyz/v1',
});

// Format capacity to 8 decimal places
function formatCapacity(capacity: number): string {
  return (capacity / 1e8).toFixed(8);
}

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

// Monitor rate limit continuously with parking cut detection
async function monitorRateLimit(endpointId: number, intervalSeconds: number = 5) {
  const aptos = new Aptos(MOVEMENT_MAINNET_CONFIG);
  
  console.log(`🔍 Starting rate limit monitor for endpoint ${endpointId}`);
  console.log(`📊 Checking every ${intervalSeconds} seconds...\n`);
  
  let consecutiveAvailable = 0;
  let consecutiveBlocked = 0;
  let previousCapacity: number | null = null;
  
  while (true) {
    try {
      const timestamp = new Date().toLocaleTimeString();
      const { capacity, hasCapacity } = await checkRateLimit(aptos, endpointId);
      
      // Calculate parking cut if we have previous capacity
      let parkingCut: number | null = null;
      if (previousCapacity !== null) {
        const diff = capacity - previousCapacity;
        if (diff < 0) {
          parkingCut = diff;
        }
      }
      
      if (hasCapacity) {
        consecutiveAvailable++;
        consecutiveBlocked = 0;
        
        // Only output when parking cut exists or capacity > 10,000
        if (capacity > 1000000000000) { // 10,000 in original units (10,000 * 1e8)
          let output = `✅ [${timestamp}] Rate limit available - Capacity: ${formatCapacity(capacity)} (${consecutiveAvailable} consecutive)`;
          console.log(output);
        } else if (parkingCut !== null) {
          let output = `✅ [${timestamp}] Rate limit available - 주차 컷: ${formatCapacity(Math.abs(parkingCut))} (${consecutiveAvailable} consecutive)`;
          console.log(output);
        }
      } else {
        consecutiveBlocked++;
        consecutiveAvailable = 0;
        
        // Only output when parking cut exists or capacity > 10,000
        if (capacity > 1000000000000) { // 10,000 in original units
          let output = `❌ [${timestamp}] Rate limit blocked - Capacity: ${formatCapacity(capacity)} (${consecutiveBlocked} consecutive)`;
          console.log(output);
        } else if (parkingCut !== null) {
          let output = `❌ [${timestamp}] Rate limit blocked - 주차 컷: ${formatCapacity(Math.abs(parkingCut))} (${consecutiveBlocked} consecutive)`;
          console.log(output);
        }
      }
      
      // Store current capacity for next iteration
      previousCapacity = capacity;
      
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
      console.log(`🎉 Rate limit available! Capacity: ${formatCapacity(capacity)}`);
      return true;
    }
    
    const elapsed = (attempt * 5) / 60;
    console.log(`⏱️  Still blocked (${elapsed.toFixed(1)}min elapsed) - Capacity: ${formatCapacity(capacity)}`);
    
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
  
  // If no command provided, default to monitor
  if (!command) {
    const endpointId = 30101; // Default to Ethereum mainnet
    const interval = 5; // Default interval
    await monitorRateLimit(endpointId, interval);
    return;
  }
  
  const endpointId = parseInt(args[1]) || 30101;
  
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
      console.log(`Endpoint ${endpointId}: ${hasCapacity ? '✅ Available' : '❌ Blocked'} (Capacity: ${formatCapacity(capacity)})`);
      process.exit(hasCapacity ? 0 : 1);
      break;
      
    default:
      console.log(`
Usage:
  ts-node src/rate-limit-monitor.ts                          - Start monitoring (default)
  ts-node src/rate-limit-monitor.ts check [endpointId]       - Check current rate limit status
  ts-node src/rate-limit-monitor.ts wait [endpointId] [maxMinutes] - Wait until rate limit is available
  ts-node src/rate-limit-monitor.ts monitor [endpointId] [intervalSeconds] - Continuously monitor rate limit

Examples:
  ts-node src/rate-limit-monitor.ts
  ts-node src/rate-limit-monitor.ts check 30101
  ts-node src/rate-limit-monitor.ts wait 30101 15
  ts-node src/rate-limit-monitor.ts monitor 30101 3
      `);
  }
}

main().catch(console.error);