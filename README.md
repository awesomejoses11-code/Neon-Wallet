# Neon Wallet

A premium TON blockchain wallet with integrated DEX swaps, QR scanning, and multi-chain expansion roadmap.

## Features

- **Wallet Management**
  - Create new wallet with seed phrase
  - Import existing wallet via seed phrase
  - TON Connect integration for secure key management
  - Multi-wallet support

- **Core Functionality**
  - View TON balance in real-time
  - Send TON to any address
  - Receive TON with shareable QR code
  - Transaction history and status tracking

- **Advanced Features**
  - QR code scanner for quick address input
  - StonFi DEX integration for token swapping
  - Slippage tolerance configuration
  - Transaction confirmation and monitoring

- **Design**
  - Premium dark theme with neon accents
  - Glass-morphism UI components
  - Responsive single-page layout
  - Smooth animations and transitions

## Tech Stack

- **Blockchain:** TON SDK
- **Wallet Management:** TON Connect
- **DEX Integration:** StonFi SDK
- **QR Handling:** qr-scanner, qrcode.js
- **Styling:** Tailwind CSS
- **State:** Browser localStorage + Supabase (optional)
- **Deployment:** Vercel, Netlify, or static hosting

## Getting Started

### Prerequisites
- Node.js 16+ (for development build tools)
- TON wallet (Tonkeeper recommended for TON Connect)
- Git

### Installation

```bash
git clone https://github.com/yourusername/neon-wallet.git
cd neon-wallet
```

### Development

For local testing, simply open `index.html` in a modern browser. For enhanced development:

```bash
npx http-server
# or
python -m http.server 8000
```

### Deployment

Deploy the `index.html` file to any static hosting:

```bash
# Vercel
vercel

# Netlify
netlify deploy

# GitHub Pages
git push origin main
```

## Architecture

```
Neon Wallet
├── Wallet Management (TON Connect)
│   ├── Connect/Disconnect
│   ├── Create New Wallet
│   └── Import Seed Phrase
├── Core Features
│   ├── Balance Display
│   ├── Send TON
│   └── Receive TON (with QR)
├── Advanced Features
│   ├── QR Scanner
│   ├── StonFi Swaps
│   └── Transaction History
└── Persistence
    ├── LocalStorage (client)
    └── Supabase (optional backend)
```

## Roadmap

**Phase 1 (Current):**
- [ ] TON wallet core functionality
- [ ] QR scanner integration
- [ ] StonFi swap interface

**Phase 2:**
- [ ] Enhanced UI/UX refinements
- [ ] Token support (Jettons)
- [ ] NFT viewing
- [ ] Advanced transaction analytics

**Phase 3:**
- [ ] EVM chain support (Ethereum, Polygon, etc.)
- [ ] SVM support (Solana)
- [ ] Multi-chain unified wallet
- [ ] White-label options

## Security Considerations

- Keys managed exclusively through TON Connect (no server-side key storage)
- All transactions signed client-side
- No sensitive data stored unencrypted
- Regular security audits recommended before production use

## Contributing

This is a portfolio/personal project. Contributions welcome via pull requests.

## License

Creative Commons

---

## 🔒 Solana (SVM) Proxy — Hardened Deployment Guide

The wallet now supports **Solana (SVM)** via a hardened Vercel serverless proxy (`/api/*`). Premium RPC keys (Alchemy, Helius) never touch the browser.

### What's New

1. **Correct Helius hosts** — Enhanced transactions use `api.helius.xyz/v0/…`, NFTs use modern DAS (`getAssetsByOwner`)
2. **CORS locked** — `https://neon-crypto-wallet.vercel.app` + `http://localhost:3000` by default; override with `ALLOWED_ORIGINS` env var
3. **Per-IP rate limiting** — Token bucket (60 burst, 20/sec refill); prevents runaway browser requests
4. **Method allowlist** — `/api/rpc` blocks expensive calls like `getProgramAccounts` without filters
5. **Server-side keys** — Client talks only to same-origin `/api/*`; rotate providers via env vars, no frontend redeploy needed

### Files Added

| File | Purpose |
| --- | --- |
| `api/rpc.js` | Generic JSON-RPC proxy, Alchemy → Helius → public fallback, method allowlist |
| `api/helius-tx.js` | Enhanced Transactions proxy |
| `api/helius-nfts.js` | DAS `getAssetsByOwner` proxy (fungibles + NFTs + cNFTs) |
| `api/priority-fee.js` | `getPriorityFeeEstimate` proxy |
| `lib/proxy-utils.js` | Shared CORS + rate-limit helpers |
| `package.json` | Minimal Vercel config |
| `.env.example` | Environment variables template |
| `.gitignore` | Ignore rules |
| `vercel.json` | API function config + cache headers |

### Deployment

1. **Set Vercel environment variables:**
   ```bash
   ALCHEMY_SOLANA_KEY=<your_alchemy_solana_key>
   HELIUS_API_KEY=<your_helius_api_key>
   ALLOWED_ORIGINS=https://neon-crypto-wallet.vercel.app,http://localhost:3000
   RATE_LIMIT_BURST=60
   RATE_LIMIT_REFILL_RATE=20
   ```

2. **Redeploy:**
   ```bash
   vercel deploy --prod
   ```

3. **Verify the proxy is live:**
   ```bash
   curl -sS https://neon-crypto-wallet.vercel.app/api/rpc -X POST \
     -H "Content-Type: application/json" \
     -H "Origin: https://neon-crypto-wallet.vercel.app" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   ```
   Should return: `{"jsonrpc":"2.0","result":"ok","id":1}`

   From another origin:
   ```bash
   curl -sS https://neon-crypto-wallet.vercel.app/api/rpc -X POST \
     -H "Content-Type: application/json" \
     -H "Origin: https://attacker.com" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   ```
   Should return: `403 {"error":"origin not allowed"}`

### Rotating the API Keys

Once keys land in chat transcripts or logs, rotate them:

**Alchemy:**
1. Log in to [console.alchemy.com](https://console.alchemy.com)
2. Select the Solana app → **Edit** → rotate the key
3. Copy the new key, paste into Vercel **Settings → Environment Variables → `ALCHEMY_SOLANA_KEY`**
4. **Deployments → Redeploy** or `vercel deploy --prod`

**Helius:**
1. Log in to [dashboard.helius.dev](https://dashboard.helius.dev)
2. Select your app → **Regenerate API Key**
3. Copy the new key, paste into Vercel **Settings → Environment Variables → `HELIUS_API_KEY`**
4. **Deployments → Redeploy** or `vercel deploy --prod`

### Local Development

```bash
# Install dependencies
npm install

# Start local dev server with vercel functions
vercel dev

# Wallet available at http://localhost:3000
# API proxy available at http://localhost:3000/api/*
```

---

**Built by Joseph**
