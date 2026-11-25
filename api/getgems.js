/**
 * Getgems cNFT bulk-minter proxy.
 * The authorization token stays server-side in Vercel environment variables.
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
  if (!token) throw new Error('Server is missing GETGEMS_API_TOKEN. Add your cNFT authorization token in Vercel.');
  const response = await fetch(API_BASE + path, {
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
  if (!response.ok || data?.success === false) {
    const message = data?.errors?.map((e) => e.message).filter(Boolean).join('; ')
      || data?.message || 'Getgems returned HTTP ' + response.status;
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

  if (!process.env.GETGEMS_API_TOKEN) return sendError(res, 503, 'Getgems cNFT API is not configured on the server');
  const dashboardKey = process.env.GETGEMS_DASHBOARD_KEY;
  if (!dashboardKey) return sendError(res, 503, 'Server is missing GETGEMS_DASHBOARD_KEY');
  const suppliedKey = String(req.headers['x-dashboard-key'] || '');
  const expected = Buffer.from(dashboardKey);
  const supplied = Buffer.from(suppliedKey);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return sendError(res, 401, 'Dashboard access key is incorrect');
  }

  const collection = COLLECTION;
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{40,50}$/.test(collection)) {
    return sendError(res, 500, 'Configured collection address is invalid');
  }

  try {
    const action = req.body?.action;

    if (action === 'balance') {
      return res.status(200).json(await callGetgems('/minting/' + encodeURIComponent(collection) + '/wallet-balance'));
    }

    if (action === 'cnft-upload-init') {
      const fileName = String(req.body?.fileName || '');
      if (!/^[A-Za-z0-9]{1,80}\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
        return sendError(res, 400, 'Use a simple JPG, PNG, GIF or WebP filename');
      }
      const result = await callGetgems(
        '/cnft/create-upload/' + encodeURIComponent(collection) + '/' + encodeURIComponent(fileName),
        'POST'
      );
      return res.status(200).json(result);
    }

    if (action === 'cnft-upload') {
      const uploadUrl = String(req.body?.uploadUrl || '');
      const fields = req.body?.fields;
      const fileName = String(req.body?.fileName || '');
      const fileType = String(req.body?.fileType || '');
      const fileBase64 = String(req.body?.fileBase64 || '');
      let host = '';
      try { host = new URL(uploadUrl).hostname; } catch { /* rejected below */ }
      if (!/^https:\/\//i.test(uploadUrl) ||
          !(host.endsWith('.amazonaws.com') || host.endsWith('.getgems.io'))) {
        return sendError(res, 400, 'Upload URL is not a Getgems storage URL');
      }
      if (!Array.isArray(fields) || fields.length < 1 || fields.length > 30 ||
          fields.some((f) => !f || typeof f.name !== 'string' || typeof f.value !== 'string')) {
        return sendError(res, 400, 'Upload form fields are invalid');
      }
      if (!/^[A-Za-z0-9]{1,80}\.(jpg|jpeg|png|gif|webp)$/i.test(fileName) ||
          !/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(fileType) ||
          !/^[A-Za-z0-9+/=]+$/.test(fileBase64) || fileBase64.length > 4200000) {
        return sendError(res, 400, 'Upload file payload is invalid or too large');
      }
      const form = new FormData();
      for (const f of fields) form.append(f.name, f.value);
      const bytes = Buffer.from(fileBase64, 'base64');
      form.append('file', new Blob([bytes], { type: fileType }), fileName);
      const up = await fetch(uploadUrl, { method: 'POST', body: form });
      const text = await up.text().catch(() => '');
      if (!up.ok) {
        return sendError(res, 502, 'Storage upload failed (HTTP ' + up.status + '). ' + text.slice(0, 500));
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'cnft-open') {
      const result = await callGetgems('/cnft/' + encodeURIComponent(collection) + '/open-minting', 'POST');
      return res.status(200).json(result);
    }

    if (action === 'cnft-add') {
      const items = req.body?.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
        return sendError(res, 400, 'Provide between 1 and 100 cNFT items');
      }
      const seen = new Set();
      const cleanItems = [];
      for (const item of items) {
        const index = Number(item?.index);
        const ownerAddress = String(item?.ownerAddress || '');
        const name = String(item?.name || '').trim();
        const description = String(item?.description || '').trim();
        const image = String(item?.image || '');
        if (!Number.isSafeInteger(index) || index < 0 || seen.has(index) ||
            !/^(EQ|UQ)[A-Za-z0-9_-]{40,50}$/.test(ownerAddress) ||
            !name || name.length > 200 || description.length > 1000 ||
            !/^https:\/\//i.test(image)) {
          return sendError(res, 400, 'One or more cNFT entries have invalid or duplicate indexes/metadata');
        }
        seen.add(index);
        cleanItems.push({ index, ownerAddress, name, description, image });
      }
      const result = await callGetgems(
        '/cnft/' + encodeURIComponent(collection) + '/add-nft',
        'POST',
        { items: cleanItems }
      );
      return res.status(200).json(result);
    }

    if (action === 'cnft-repair-csv') {
      const entries = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 25) : [];
      const skip = new Set(Array.isArray(req.body?.skipIndexes) ? req.body.skipIndexes.map(Number) : []);
      if (!entries.length) return sendError(res, 400, 'No CSV entries supplied');
      let addressByIndex = null;
      const fixed = [], failed = [];
      let okCount = 0, skippedCount = 0;
      for (const entry of entries) {
        const index = Number(entry?.index);
        const label = Number.isSafeInteger(index) ? index : -1;
        if (label >= 0 && skip.has(label)) { skippedCount++; continue; }
        try {
          let image = typeof entry?.image === 'string' ? entry.image : '';
          const contentUrl = typeof entry?.contentUrl === 'string' ? entry.contentUrl : '';
          if (!image) {
            let host = '';
            try { host = new URL(contentUrl).hostname; } catch { /* rejected below */ }
            if (!/^https:\/\//i.test(contentUrl) || !(host === 's.getgems.io' || host.endsWith('.getgems.io'))) {
              throw new Error('Content URL is not a Getgems URL');
            }
            const metaRes = await fetch(contentUrl);
            if (!metaRes.ok) throw new Error('Metadata fetch returned HTTP ' + metaRes.status);
            const meta = await metaRes.json().catch(() => ({}));
            image = meta?.image || '';
          }
          const parts = String(image).split('/');
          const doubled = parts.length > 2 && parts[parts.length - 1] !== '' && parts[parts.length - 1] === parts[parts.length - 2];
          if (!doubled) { okCount++; continue; }
          const corrected = parts.slice(0, -1).join('/');
          const check = await fetch(corrected, { method: 'GET' });
          if (!check.ok) throw new Error('Corrected image URL returned HTTP ' + check.status);
          if (check.body) check.body.cancel().catch(() => {});
          let address = typeof entry?.address === 'string' ? entry.address : '';
          if (!address) {
            if (!addressByIndex) {
              addressByIndex = new Map();
              let after = '';
              for (let pg = 0; pg < 5; pg++) {
                const data = await callGetgems('/nft/collection/items/' + encodeURIComponent(collection) + (after ? '?after=' + encodeURIComponent(after) : ''));
                for (const it of data?.response?.items || []) addressByIndex.set(it.index, it.address);
                after = data?.response?.cursor || '';
                if (!after) break;
              }
            }
            address = addressByIndex.get(label) || '';
          }
          if (!/^(EQ|UQ)[A-Za-z0-9_-]{40,50}$/.test(address)) throw new Error('NFT address not found for this index');
          const res2 = await callGetgems('/minting/' + encodeURIComponent(collection) + '/update/' + encodeURIComponent(address), 'POST', { update: { image: corrected } });
          fixed.push({ index: label, status: res2?.response?.status || 'submitted' });
        } catch (e) {
          failed.push({ index: label, error: e.message });
        }
      }
      return res.status(200).json({ success: true, fixed, okCount, skippedCount, failed });
    }

    return sendError(res, 400, 'Unknown action');
  } catch (error) {
    console.error('[Getgems cNFT proxy]', error.message);
    return sendError(res, error.status || 502, error.message || 'Getgems request failed');
  }
}
