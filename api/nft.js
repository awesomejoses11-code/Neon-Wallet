/**
 * NFT proxy — forwards to Alchemy NFT API v3's getNFTsForOwner for the
 * requested EVM chain, so the Alchemy key never reaches the browser.
 * Called by evm.html as: GET /api/nft?chain=<key>&owner=<address>
 */

import { rateLimitMiddleware, corsMiddleware } from '../lib/proxy-utils.js';

const NFT_ALCHEMY_SUBDOMAIN = {
  ethereum: 'eth-mainnet',
  base: 'base-mainnet',
  arbitrum: 'arb-mainnet',
  polygon: 'polygon-mainnet',
};

export default async (req, res) => {
  corsMiddleware(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rateLimitError = rateLimitMiddleware(req);
  if (rateLimitError) return res.status(429).json({ error: rateLimitError });

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chain, owner } = req.query;
  const subdomain = NFT_ALCHEMY_SUBDOMAIN[chain];
  if (!subdomain) return res.status(400).json({ error: `Unknown chain "${chain}"` });
  if (!owner) return res.status(400).json({ error: 'Missing owner address' });
  if (!process.env.ALCHEMY_API_KEY) {
    return res.status(503).json({ error: 'NFT lookups are not configured (missing ALCHEMY_API_KEY)' });
  }

  const url = new URL(`https://${subdomain}.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}/getNFTsForOwner`);
  url.searchParams.set('owner', owner);
  url.searchParams.set('withMetadata', 'true');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('excludeFilters[]', 'SPAM');

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(502).json({ error: `Alchemy NFT API responded ${response.status}`, details: text.slice(0, 300) });
    }
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Alchemy NFT API', details: err.message });
  }
};
