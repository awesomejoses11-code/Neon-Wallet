/**
 * Generic JSON-RPC proxy with method allowlist
 * Alchemy → Helius → public fallback
 */

import { rateLimitMiddleware, corsMiddleware } from '../lib/proxy-utils.js';

const METHOD_ALLOWLIST = [
  'getBalance',
  'getLatestBlockhash',
  'sendTransaction',
  'simulateTransaction',
  'getSignatureStatuses',
  'getRecentPrioritizationFees',
  'getPriorityFeeEstimate',
];

const PROVIDERS = [
  process.env.ALCHEMY_SOLANA_KEY ? `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_SOLANA_KEY}` : null,
  process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : null,
  'https://api.mainnet-beta.solana.com',
].filter(Boolean);

export default async (req, res) => {
  // CORS check
  const corsError = corsMiddleware(req, res);
  if (corsError) return res.status(403).json({ error: corsError });

  // Rate limit check
  const rateLimitError = rateLimitMiddleware(req);
  if (rateLimitError) return res.status(429).json({ error: rateLimitError });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { method, params, jsonrpc, id } = req.body;

  // Method allowlist
  if (!METHOD_ALLOWLIST.includes(method)) {
    return res.status(403).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: `Method ${method} not allowed` },
      id,
    });
  }

  // Try each provider
  for (const provider of PROVIDERS) {
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
