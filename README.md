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

**Built by Joseph** 
