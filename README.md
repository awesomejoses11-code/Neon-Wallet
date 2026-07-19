# Neon Wallet

A premium, multi-chain, non-custodial crypto wallet — TON, Solana, and EVM (Ethereum, Base, Arbitrum, Polygon, BSC) — built as three single-file HTML/JavaScript apps with no build step, deployed on Vercel as an installable PWA.

**Live wallets:**
| Chain | Path | Entry file |
|---|---|---|
| TON | `/wallet.html` | `wallet.html` |
| Solana (SVM) | `/svm` | `svm.html` |
| EVM | `/evm` | `evm.html` |

`index.html` is the landing page linking out to all three.

## Why this exists

Most "multi-chain wallets" are thin wrappers around one SDK with everything else bolted on. Neon Wallet is the opposite: each chain gets its own dedicated, deeply-integrated single-file app — sharing a visual language (deep blue background, gold/cyan neon accents, glassmorphism) and a common backend proxy, but each built around what that chain actually needs (STON.fi on TON, Jupiter-style routing on Solana, Sushi + multi-chain Alchemy on EVM).

No React, no bundler, no `npm install` to run it — open the HTML file, or deploy it as-is.

## Features

### TON (`wallet.html`)
- Create or import a wallet — 12/24-word BIP39 seed, or raw private key (base58 / JSON byte array)
- Auto-detects wallet contract version (V3R2 / V4R2 / V5R1) so imported keys resolve to the *correct* address instead of defaulting to one version
- WebAuthn PRF biometric unlock (Face ID / Touch ID / device passkey) alongside password unlock
- Multi-wallet manager (switch between wallets, stored locally)
- Native STON.fi DEX integration for swaps (`StonApiClient` + `routerFactory`, not the old Omniston widget), with a fast, debounced token picker
- Send / receive TON and jettons, QR scanner for addresses, Tonviewer links on every transaction
- Cross-chain address preview: shows the equivalent Ethereum address for the same seed via ethers.js v6
- Percentage-based platform fee on sends, 75bps on swaps, routed to a configured fee address

### Solana (`svm.html`)
- Seed phrase or private key import, HD derivation with address preview
- SPL token support in Send, using manually-constructed `TransferChecked` instructions (no `@solana/spl-token` dependency)
- Phantom-style swap UI backed by Jupiter's token list
- Cumulative USD balance across SOL + SPL holdings
- RPC calls routed through the shared proxy (Alchemy → Helius → public fallback) with automatic failover via `Promise.allSettled`

### EVM (`evm.html`)
- Five chains out of the box: **Ethereum, Base, Arbitrum, Polygon, BSC** — plus a "Import Network" flow for any other EVM chain (custom RPC + chain ID), and "Import Token" for any ERC-20 on a supported chain
- Balances, send, and a Sushi-powered swap (`api.sushi.com/swap/v7/{chainId}`), all keyed dynamically off `chain.chainId` — new chains need no special-casing in the swap/send logic
- **Prices via CoinGecko**, resolved dynamically per chain through CoinGecko's `/asset_platforms` directory (chain ID → platform + native coin), rather than a hardcoded per-chain list — a custom-imported chain gets price support automatically the moment CoinGecko lists it
- **NFT gallery** via Alchemy's NFT API v3 (`getNFTsForOwner`), spam-filtered, proxied server-side
- Per-chain fallback native-price table used only if the live price API is unreachable (fee-sizing safety net, not a pricing source)
- Live per-endpoint RPC connection test in Settings

### Shared
- Installable PWA (`manifest.json` + `sw.js`) with home-screen shortcuts straight into each chain's wallet
- No server-side key custody, ever — all signing happens client-side; the backend only proxies reads (RPC calls, prices, NFT metadata)

## Backend (`/api`)

A minimal set of Vercel Node serverless functions exist purely to keep provider API keys off the client and add basic abuse protection — they hold no user data and never see a private key.

| File | Purpose |
|---|---|
| `api/rpc.js` | Generic JSON-RPC proxy. No `chain` query param → Solana path (Alchemy → Helius → public RPC). `?chain=ethereum\|base\|arbitrum\|polygon\|bsc` → forwards to the matching Alchemy subdomain, falling back to a public RPC per chain. Enforces a method allowlist on both paths (e.g. blocks `eth_sendRawTransaction`-adjacent abuse vectors, disallows unbounded `getProgramAccounts`-style calls). |
| `api/nft.js` | Forwards `GET /api/nft?chain=<key>&owner=<address>` to Alchemy's NFT API v3 for the matching chain. |
| `lib/proxy-utils.js` | Shared CORS headers + a lightweight in-memory per-IP rate limiter, imported by both functions above. |

**Required environment variables** (Vercel → Settings → Environment Variables):

| Variable | Used by | Notes |
|---|---|---|
| `ALCHEMY_API_KEY` | `api/rpc.js`, `api/nft.js` | One key, works across all 5 EVM chains |
| `ALCHEMY_SOLANA_KEY` | `api/rpc.js` | Solana RPC via Alchemy |
| `HELIUS_API_KEY` | `api/rpc.js` | Solana RPC fallback |
| `ALLOWED_ORIGIN` | `lib/proxy-utils.js` | Optional; defaults to `*` |

None of the frontend files need an env var — `evm.html`'s proxy calls are same-origin (`RPC_PROXY_BASE = ''`), so whatever domain this repo deploys to is automatically correct with no hardcoded URL to keep in sync.

## Tech stack

- **No framework, no bundler** — plain HTML/CSS/JS per wallet, styled with Tailwind (CDN) and a shared neon/glassmorphism design system
- **Chain SDKs (loaded via ESM CDN, no local `node_modules`):** `@ton/ton` (TON), `@solana/web3.js` (Solana), `ethers.js` v6 (EVM)
- **DEX integration:** STON.fi (TON), Jupiter token lists (Solana), Sushi (`api.sushi.com`) for EVM swaps and — previously — pricing
- **Pricing:** CoinGecko public API (EVM)
- **NFTs:** Alchemy NFT API v3 (EVM)
- **Backend:** Vercel Node serverless functions, no database, no build step
- **Deployment:** Vercel (static files + `/api` functions)

## Local development

There's no build step. To preview a wallet:

```bash
npx http-server .
# or
python -m http.server 8000
```

Then open `http://localhost:8000/evm.html` (or `wallet.html` / `svm.html`). The `/api` routes only run under Vercel — use `vercel dev` if you need to test the proxy locally, with the environment variables above set in a `.env.local` file.

## Deployment

1. Push to GitHub, import the repo in Vercel
2. Set the environment variables listed above
3. Deploy — `vercel.json` handles PWA cache headers for `sw.js` and `manifest.json`; everything else is served as static files

## Security notes

- Private keys and seed phrases never leave the browser — all signing is client-side
- The `/api` proxy only ever relays *reads* (RPC queries, price lookups, NFT metadata) using server-held API keys; it has no ability to sign or move funds
- Rate limiting is per-IP and in-memory (resets on cold start) — a basic abuse deterrent, not a hard global cap
- No analytics, no third-party trackers

## Roadmap

- [ ] Push notifications for incoming/outgoing transactions (webhook-based via Alchemy Notify / Helius / TonAPI, in progress)
- [ ] NFT support on TON and Solana wallets
- [ ] Transaction history views with richer filtering

## License

CC0 1.0 Universal — see `LICENSE`.

---

Built by Joseph.
