/**
 * Getgems bulk minter proxy.
 * The API token stays in Vercel environment variables and is never sent to the browser.
 * Supported actions are deliberately allowlisted; this is not a general-purpose proxy.
 */
import { timingSafeEqual } from 'node:crypto';
import { rateLimitMiddleware, corsMiddleware } from '../lib/proxy-utils.js';

const API_BASE = 'https://api.getgems.io/public-api';
const COLLECTION = process.env.GETGEMS_COLLECTION_ADDRESS || 'EQCdaSZaJfcfeNCdalKIsnjU7t2LLM9TTQriuOZWbHmbffNN';

function sendError(res, status, message, details) {
  return res.status(status).json({ success: false, error: message, ...(details ? { details } : {}) });
}

async function callGetgems(path, method = 'GET', body) {
  const token = process.env.GETGEMS_API_TOKEN;
  if (!token) throw new Error('Server is missing GETGEMS_API_TOKEN. Add it in Vercel Environment Variables.');
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: token,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 500) }; }
  if (!response.ok) {
    const message = data?.errors?.map((e) => e.message).filter(Boolean).join('; ')
      || data?.message || `Getgems returned HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw error;
  }
  return data;
}

export default async function handler(req, res) {
  corsMiddleware(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, X-Dashboard-Key');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const origin = req.headers.origin;
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin && allowedOrigin !== '*' && origin && origin !== allowedOrigin) {
    return sendError(res, 403, 'Origin not allowed');
  }

  const limited = rateLimitMiddleware(req);
  if (limited) return sendError(res, 429, limited);

  if (req.method !== 'POST') return sendError(res, 405, 'Use POST');
  if (!process.env.GETGEMS_API_TOKEN) return sendError(res, 503, 'Getgems API is not configured on the server');
  const dashboardKey = process.env.GETGEMS_DASHBOARD_KEY;
  if (!dashboardKey) return sendError(res, 503, 'Server is missing GETGEMS_DASHBOARD_KEY. Configure a dashboard access key in Vercel.');
  const suppliedKey = String(req.headers['x-dashboard-key'] || '');
  const expected = Buffer.from(dashboardKey);
  const supplied = Buffer.from(suppliedKey);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return sendError(res, 401, 'Dashboard access key is incorrect');
  }

  const body = req.body || {};
  const action = body.action;
  const collection = COLLECTION;
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{40,50}$/.test(collection)) {
    return sendError(res, 500, 'Configured collection address is invalid');
  }

  try {
    if (action === 'balance') {
      return res.status(200).json(await callGetgems(`/minting/${encodeURIComponent(collection)}/wallet-balance`));
    }

    if (action === 'upload-init') {
      const fileName = String(body.fileName || '');
      if (!/^[A-Za-z0-9]{1,80}\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
        return sendError(res, 400, 'Use a simple JPG, PNG, GIF or WebP filename');
      }
      const result = await callGetgems(
        `/minting/create-upload/${encodeURIComponent(collection)}/${encodeURIComponent(fileName)}`,
        'POST'
      );
      return res.status(200).json(result);
    }

    if (action === 'mint-v2') {
      const items = body.items;
      if (!Array.isArray(items) || items.length < 2 || items.length > 100) {
        return sendError(res, 400, 'Batch must contain between 2 and 100 NFTs');
      }
      const cleanItems = [];
      for (const item of items) {
        const requestId = String(item?.requestId || '');
        const name = String(item?.name || '').trim();
        const description = String(item?.description || '').trim();
        const image = String(item?.image || '');
        const ownerAddress = String(item?.ownerAddress || '');
        if (!requestId || requestId.length > 100 || !name || name.length > 200 ||
            description.length > 1000 || !/^https:\/\//i.test(image) ||
            !/^(EQ|UQ)[A-Za-z0-9_-]{40,50}$/.test(ownerAddress)) {
          return sendError(res, 400, 'One or more NFT entries have invalid metadata');
        }
        cleanItems.push({ requestId, ownerAddress, name, description, image });
      }
      const uniqueIds = new Set(cleanItems.map((x) => x.requestId));
      if (uniqueIds.size !== cleanItems.length) return sendError(res, 400, 'Every NFT needs a unique request ID');

      const result = await callGetgems(
        `/v2/minting/${encodeURIComponent(collection)}/batch`,
        'POST',
        { items: cleanItems }
      );
      return res.status(200).json(result);
    }

    if (action === 'batch-status') {
      const requestIds = body.requestIds;
      if (!Array.isArray(requestIds) || requestIds.length < 1 || requestIds.length > 100 ||
          requestIds.some((id) => typeof id !== 'string' || !id || id.length > 100)) {
        return sendError(res, 400, 'Provide between 1 and 100 valid request IDs');
      }
      const result = await callGetgems(
        `/v2/minting/${encodeURIComponent(collection)}/batch-status`,
        'POST',
        { requestIds }
      );
      return res.status(200).json(result);
    }

    return sendError(res, 400, 'Unknown action');
  } catch (error) {
    console.error('[Getgems proxy]', error.message);
    return sendError(res, error.status || 502, error.message || 'Getgems request failed');
  }
}
