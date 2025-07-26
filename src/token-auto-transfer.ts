import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const ETH_PVK = process.env.ETH_PVK;
const ETH_RPC = process.env.ETH_RPC;
const UPBIT_ADDRESS = process.env.UPBIT_ADDRESS;
const TOKEN_ADDRESS = '0x3073f7aAA4DB83f95e9FFf17424F71D4751a3073';
const TOKEN_DECIMALS = 8;
const MIN_BALANCE = ethers.parseUnits('300', TOKEN_DECIMALS);
const CHECK_INTERVAL = 3000; // 3 seconds

const ERC20_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)'
];

async function main() {
    if (!ETH_PVK || !ETH_RPC || !UPBIT_ADDRESS) {
        console.error('Missing required environment variables');
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(ETH_RPC);
    const wallet = new ethers.Wallet(ETH_PVK, provider);
    const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, wallet);

    console.log(`Monitoring wallet: ${wallet.address}`);
    console.log(`Token address: ${TOKEN_ADDRESS}`);
    console.log(`Destination: ${UPBIT_ADDRESS}`);
    console.log(`Minimum balance: 5 tokens`);

    while (true) {
        try {
            const balance = await tokenContract.balanceOf(wallet.address);
            console.log(`Current balance: ${ethers.formatUnits(balance, TOKEN_DECIMALS)} tokens`);

            if (balance >= MIN_BALANCE) {
                console.log('Balance meets minimum threshold. Initiating transfer...');
                
                const feeData = await provider.getFeeData();
                const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
                const maxFeePerGas = (feeData.maxFeePerGas || ethers.parseUnits('30', 'gwei')) + maxPriorityFeePerGas;

                const gasEstimate = await tokenContract.transfer.estimateGas(UPBIT_ADDRESS, balance);
                const gasLimit = gasEstimate * 120n / 100n; // 20% buffer

                const tx = await tokenContract.transfer(UPBIT_ADDRESS, balance, {
                    maxPriorityFeePerGas,
                    maxFeePerGas,
                    gasLimit,
                    type: 2 // EIP-1559
                });

                console.log(`Transaction sent: ${tx.hash}`);
                const receipt = await tx.wait();
                console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
                console.log(`Gas used: ${receipt.gasUsed.toString()}`);
            }

        } catch (error) {
            console.error('Error:', error);
        }

        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    }
}

main().catch(console.error);