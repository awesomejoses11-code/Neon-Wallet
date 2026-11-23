/**
 * Server-side Getgems cNFT image upload proxy.
 * The browser sends raw image bytes to this function; this function obtains
 * Getgems upload credentials and forwards the image to Getgems storage.
 */
import { timingSafeEqual } from 'node:crypto';
import { rateLimitMiddleware, corsMiddleware } from '../lib/proxy-utils.js';

export const config = { api: { bodyParser: false } };

const API_BASE = 'https://api.getgems.io/public-api';
const COLLECTION = process.env.GETGEMS_COLLECTION_ADDRESS || 'EQCdaSZaJfcfeNCdalKIsnjU7t2LLM9TTQriuOZWbHmbffNN';
const MAX_BYTES = 4 * 1024 * 1024;

function sendError(res, status, message, details) {
  return res.status(status).json({ success: false, error: message, ...(details ? { details } : {}) });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      const error = new Error('Image is larger than 4 MB. Please resize it and try again.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  corsMiddleware(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dashboard-Key, X-File-Name, X-File-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendError(res, 405, 'Use POST');

  const origin = req.headers.origin;
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin && allowedOrigin !== '*' && origin && origin !== allowedOrigin) {
    return sendError(res, 403, 'Origin not allowed');
  }
  const limited = rateLimitMiddleware(req);
  if (limited) return sendError(res, 429, limited);

  const token = process.env.GETGEMS_API_TOKEN;
  const dashboardKey = process.env.GETGEMS_DASHBOARD_KEY;
  if (!token) return sendError(res, 503, 'Server is missing GETGEMS_API_TOKEN');
  if (!dashboardKey) return sendError(res, 503, 'Server is missing GETGEMS_DASHBOARD_KEY');
  const expected = Buffer.from(dashboardKey);
  const supplied = Buffer.from(String(req.headers['x-dashboard-key'] || ''));
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return sendError(res, 401, 'Dashboard access key is incorrect');
  }

  const filename = String(req.headers['x-file-name'] || '');
  const contentType = String(req.headers['x-file-type'] || 'application/octet-stream');
  if (!/^[A-Za-z0-9]{1,80}\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    return sendError(res, 400, 'Invalid image filename');
  }
  if (!/^image\/(jpeg|png|gif|webp)$/i.test(contentType)) {
    return sendError(res, 400, 'Unsupported image type');
  }

  try {
    const image = await readBody(req);
    if (!image.length) return sendError(res, 400, 'The uploaded image is empty');

    const initResponse = await fetch(API_BASE + '/cnft/create-upload/' + encodeURIComponent(COLLECTION) + '/' + encodeURIComponent(filename), {
      method: 'POST',
      headers: { Authorization: token, Accept: 'application/json' },
    });
    const initText = await initResponse.text();
    let init;
    try { init = initText ? JSON.parse(initText) : {}; } catch { init = { message: initText.slice(0, 500) }; }
    if (!initResponse.ok || init?.success === false) {
      return sendError(res, 502, init?.message || 'Getgems could not prepare image storage credentials', init);
    }

    const cfg = init?.response;
    if (!cfg?.uploadUrl || !Array.isArray(cfg.formFields) || !cfg.urlPrefix) {
      return sendError(res, 502, 'Getgems returned incomplete upload credentials', init);
    }

    const form = new FormData();
    for (const field of cfg.formFields) {
      if (field && typeof field.name === 'string' && typeof field.value === 'string') {
        form.append(field.name, field.value);
      }
    }
    // Follow Getgems' published cNFT upload example: submit only the
    // returned formFields plus the file. Do not synthesize an S3 key.
    form.append('file', new Blob([image], { type: contentType }), filename);

    const storageResponse = await fetch(cfg.uploadUrl, { method: 'POST', body: form });
    const storageText = await storageResponse.text().catch(() => '');
    if (!storageResponse.ok) {
      return sendError(res, 502, 'Getgems storage rejected ' + filename + ' (HTTP ' + storageResponse.status + ').', storageText.slice(0, 500));
    }

    // Getgems' cNFT example uses urlPrefix as the complete image URL.
    return res.status(200).json({ success: true, response: { imageUrl: cfg.urlPrefix } });
  } catch (error) {
    console.error('[Getgems image upload proxy]', error.message);
    return sendError(res, error.status || 502, error.message || 'Image upload failed');
  }
}
