/**
 * Generic JSON-RPC proxy with method allowlist.
 * - No `chain` query param: Solana path (Alchemy → Helius → public fallback) —
 *   unchanged from before.
 * - `?chain=ethereum|base|arbitrum|polygon`: EVM path (Alchemy → public
 *   fallback per chain), used by evm.html.
 */

import { rateLimitMiddleware, corsMiddleware } from '../lib/proxy-utils.js';

const SOLANA_METHOD_ALLOWLIST = [
  'getBalance',
  'getLatestBlockhash',
  'sendTransaction',
  'simulateTransaction',
  'getSignatureStatuses',
  'getRecentPrioritizationFees',
  'getPriorityFeeEstimate',
];

const EVM_METHOD_ALLOWLIST = [
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getTransactionCount',
  'eth_sendRawTransaction',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
];

const SOLANA_PROVIDERS = [
  process.env.ALCHEMY_SOLANA_KEY ? `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_SOLANA_KEY}` : null,
  process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : null,
  'https://api.mainnet-beta.solana.com',
].filter(Boolean);

// Alchemy subdomain + a public fallback per EVM chain.
const EVM_CHAINS = {
  ethereum: { alchemySubdomain: 'eth-mainnet', publicFallback: 'https://ethereum-rpc.publicnode.com' },
  base: { alchemySubdomain: 'base-mainnet', publicFallback: 'https://mainnet.base.org' },
  arbitrum: { alchemySubdomain: 'arb-mainnet', publicFallback: 'https://arb1.arbitrum.io/rpc' },
  polygon: { alchemySubdomain: 'polygon-mainnet', publicFallback: 'https://polygon-rpc.com' },
  bsc: { alchemySubdomain: 'bnb-mainnet', publicFallback: 'https://bsc-dataseed.bnbchain.org' },
};

function evmProviders(chainKey) {
  const chain = EVM_CHAINS[chainKey];
  if (!chain) return [];
  return [
    process.env.ALCHEMY_API_KEY ? `https://${chain.alchemySubdomain}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : null,
    chain.publicFallback,
  ].filter(Boolean);
}

export default async (req, res) => {
  // CORS check (sets headers; never blocks)
  corsMiddleware(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Rate limit check
  const rateLimitError = rateLimitMiddleware(req);
  if (rateLimitError) return res.status(429).json({ error: rateLimitError });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chain } = req.query;
  const { method, params, jsonrpc, id } = req.body;
  const isEvm = !!chain;
  const allowlist = isEvm ? EVM_METHOD_ALLOWLIST : SOLANA_METHOD_ALLOWLIST;

  // Method allowlist
  if (!allowlist.includes(method)) {
    return res.status(403).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: `Method ${method} not allowed` },
      id,
    });
  }

  const providers = isEvm ? evmProviders(chain) : SOLANA_PROVIDERS;
  if (isEvm && providers.length === 0) {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32602, message: `Unknown chain "${chain}"` },
      id,
    });
  }

  // Try each provider
  for (const provider of providers) {
    try {
      const response = await fetch(provider, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc, method, params, id }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error(`[RPC] Provider ${provider} failed:`, err.message);
      continue;
    }
  }

  // All providers failed
  return res.status(503).json({
    jsonrpc: '2.0',
    error: { code: -32603, message: 'All RPC providers unavailable' },
    id,
  });
};
  
