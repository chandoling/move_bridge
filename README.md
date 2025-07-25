# Movement Bridge Bot

Automated rate limit monitoring and transaction execution for Movement Network bridge.

## Features

- **Rate Limit Monitoring**: Real-time monitoring of Movement Network rate limits
- **Auto Transaction**: Automatically executes transactions when rate limit capacity exceeds threshold
- **Environment Configuration**: Configurable recipient address and threshold via environment variables
- **Continuous Operation**: Keeps monitoring and executing multiple transactions

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```
PVK=0X```
RECIPIENT_ETH_ADDRESS=0X```
THRESHOLD_TOKENS=2000
```

## Usage

### Rate Limit Monitoring
```bash
# Check current rate limit status
npm run rate-limit check 30101

# Wait until rate limit is available
npm run rate-limit wait 30101 15

# Monitor rate limit continuously
npm run rate-limit monitor 30101 3
```

### Auto Transaction Trigger
```bash
# Start automatic transaction execution
npm run auto-trigger
```

## Environment Variables

- `PVK`: Private key for the Movement Network account
- `RECIPIENT_ETH_ADDRESS`: Ethereum address to receive tokens
- `THRESHOLD_TOKENS`: Token threshold for triggering transactions (default: 10000)

## Scripts

- `npm run rate-limit`: Rate limit monitoring tools
- `npm run auto-trigger`: Automated transaction execution
- `npm run dev`: Manual transaction execution
