import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

import { createClient } from 'redis';

const {
  GUFO_UPSTREAM = 'http://192.168.197.157:8080',
  GATEWAY_TOKEN = '',
  PORT = '8080',
  REDIS_URL = 'redis://redis:6379',
  MAX_QUEUE = '10',
  TASK_TIMEOUT_MS = '2700000',
  MAX_WAIT_MS = '3000000',
  JOB_TTL_SECONDS = '86400',
} = process.env;

const UPSTREAM = GUFO_UPSTREAM.replace(/\/+$/, '');
const QUEUE_KEY = 'gufo:queue';
const JOB_PREFIX = 'gufo:job:';
const ACTIVE_KEY = 'gufo:active';
const POLL_INTERVAL_MS = 5_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const MAX_QUEUE_SIZE = Number(MAX_QUEUE);
const TASK_TIMEOUT = Number(TASK_TIMEOUT_MS);
const MAX_WAIT = Number(MAX_WAIT_MS);
const JOB_TTL = Number(JOB_TTL_SECONDS);

const ALLOWED_SIZES = new Set(['512x512', '1344x768']);
const ALLOWED_MODELS = new Set([
  'minimax-h3',
  'minimax-h3-fast',
  'minimax-h3-aggressive',
  'minimax-h3-fullres',
]);

const redis = createClient({ url: REDIS_URL });
redis.on('error', (error) => log('error', { message: error.message }));

const metrics = {
  cancelled: 0,
  completed: 0,
  failed: 0,
  rejected: 0,
  upstreamErrors: 0,
};

const jobKey = (id) => `${JOB_PREFIX}${id}`;

function log(level, fields) {
  console.info(JSON.stringify({ level, service: 'gufo-gateway', ...fields }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthorized(req) {
  if (!GATEWAY_TOKEN) return true;

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;

  const provided = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(GATEWAY_TOKEN);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: { code, message, type: 'invalid_request_error' } });
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { status: 413 });
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('request body must be valid JSON'), { status: 400 });
  }
}

function normalizeSeconds(value) {
  const seconds = typeof value === 'string' ? Number(value) : value;

  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return undefined;
  if (seconds === 1 || (seconds >= 5 && seconds <= 14.375)) return seconds;

  return undefined;
}

function validateCreate(body) {
  if (!body || typeof body !== 'object') throw Object.assign(new Error('invalid body'), { status: 400 });

  const { model, prompt, size = '512x512', seconds, first_frame, last_frame } = body;

  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    throw Object.assign(new Error('unsupported video model'), { status: 400 });
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw Object.assign(new Error('prompt is required'), { status: 400 });
  }

  if (!ALLOWED_SIZES.has(size)) {
    throw Object.assign(new Error('size must be 512x512 or 1344x768'), { status: 400 });
  }

  const normalizedSeconds = normalizeSeconds(seconds);
  if (!normalizedSeconds) {
    throw Object.assign(new Error('seconds must be 1 or 5–14.375'), { status: 400 });
  }

  for (const [field, value] of [
    ['first_frame', first_frame],
    ['last_frame', last_frame],
  ]) {
    if (value !== undefined && (typeof value !== 'string' || !value.startsWith('data:image/'))) {
      throw Object.assign(new Error(`${field} must be a base64 image data URL`), { status: 400 });
    }
  }

  return {
    first_frame: first_frame || undefined,
    last_frame: last_frame || undefined,
    model,
    prompt,
    seconds: normalizedSeconds,
    size,
  };
}

async function getJob(id, client = redis) {
  const job = await client.hGetAll(jobKey(id));

  return Object.keys(job).length > 0 ? job : null;
}

async function queuePosition(id) {
  const ids = await redis.lRange(QUEUE_KEY, 0, -1);
  const index = ids.indexOf(id);

  return index === -1 ? 0 : index + 1;
}

async function failJob(id, error, client = redis) {
  metrics.failed += 1;
  await client.hSet(jobKey(id), {
    completedAt: String(Date.now()),
    error: error instanceof Error ? error.message : String(error),
    status: 'failed',
  });
  await client.expire(jobKey(id), JOB_TTL);
  log('error', { event: 'job_failed', id, message: error instanceof Error ? error.message : String(error) });
}

async function submitToGufo(job) {
  const body = {
    first_frame: job.first_frame || undefined,
    last_frame: job.last_frame || undefined,
    model: job.model,
    prompt: job.prompt,
    seconds: Number(job.seconds),
    size: job.size,
  };

  const retryDelays = [1_000, 4_000, 10_000];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const response = await fetch(`${UPSTREAM}/v1/videos`, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (response.ok) {
      const data = await response.json();
      if (!data?.id) throw new Error('gufo returned no video id');
      return data.id;
    }

    if (response.status === 429 || response.status === 503) {
      metrics.upstreamErrors += 1;

      if (attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]);
        continue;
      }
    }

    const text = await response.text();
    throw new Error(`gufo create failed: ${response.status} ${text}`);
  }

  throw new Error('gufo create failed: retries exhausted');
}

async function pollGufo(jobId, gufoId) {
  const deadline = Date.now() + TASK_TIMEOUT;

  while (Date.now() < deadline) {
    const response = await fetch(`${UPSTREAM}/v1/videos/${encodeURIComponent(gufoId)}`);

    if (response.status === 404) {
      throw new Error('gufo video task not found or expired');
    }

    if (!response.ok) {
      metrics.upstreamErrors += 1;
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const data = await response.json();

    if (data.status === 'completed') {
      metrics.completed += 1;
      await workerRedis.hSet(jobKey(jobId), {
        completedAt: String(Date.now()),
        gufoId,
        status: 'completed',
      });
      await workerRedis.expire(jobKey(jobId), JOB_TTL);
      log('info', { event: 'job_completed', id: jobId });
      return;
    }

    if (data.status === 'failed') {
      throw new Error(data.error?.message || 'gufo generation failed');
    }

    await sleep(POLL_INTERVAL_MS);
  }

  await cancelUpstream(gufoId);
  throw new Error('gufo generation timed out');
}

async function cancelUpstream(gufoId) {
  try {
    await fetch(`${UPSTREAM}/v1/videos/${encodeURIComponent(gufoId)}`, { method: 'DELETE' });
  } catch (error) {
    log('warn', { event: 'upstream_cancel_failed', message: error.message });
  }
}

async function worker() {
  while (true) {
    const popped = await workerRedis.blPop(QUEUE_KEY, 5);
    if (!popped) continue;

    const id = popped.element;
    const job = await getJob(id, workerRedis);
    if (!job || job.status !== 'queued') continue;

    if (Date.now() - Number(job.createdAt) > MAX_WAIT) {
      await failJob(id, new Error('queue wait exceeded MAX_WAIT_MS'), workerRedis);
      continue;
    }

    await workerRedis.set(ACTIVE_KEY, id, { EX: Math.ceil(MAX_WAIT / 1000) });

    await workerRedis.hSet(jobKey(id), {
      startedAt: String(Date.now()),
      status: 'in_progress',
    });

    try {
      const gufoId = await submitToGufo(job);
      await workerRedis.hSet(jobKey(id), { gufoId, status: 'in_progress' });
      await pollGufo(id, gufoId);
    } catch (error) {
      await failJob(id, error, workerRedis);
    } finally {
      await workerRedis.del(ACTIVE_KEY);
    }
  }
}

async function handleCreate(req, res) {
  const inFlight = (await redis.lLen(QUEUE_KEY)) + (await redis.exists(ACTIVE_KEY));

  if (inFlight >= MAX_QUEUE_SIZE) {
    metrics.rejected += 1;
    return sendError(res, 429, 'gufo queue is full, please retry later', 'queue_full');
  }

  let body;
  try {
    body = validateCreate(await readJsonBody(req));
  } catch (error) {
    return sendError(res, error.status || 400, error.message, 'invalid_video_request');
  }

  const id = `gufo-${randomUUID()}`;
  const now = Date.now();

  await redis.hSet(jobKey(id), {
    createdAt: String(now),
    id,
    model: body.model,
    prompt: body.prompt,
    seconds: String(body.seconds),
    size: body.size,
    status: 'queued',
    ...(body.first_frame ? { first_frame: body.first_frame } : {}),
    ...(body.last_frame ? { last_frame: body.last_frame } : {}),
  });

  await redis.rPush(QUEUE_KEY, id);
  log('info', { event: 'job_queued', id, model: body.model, size: body.size, seconds: body.seconds });

  sendJson(res, 200, {
    id,
    queue_position: await queuePosition(id),
    status: 'queued',
  });
}

async function handleStatus(req, res, id) {
  const job = await getJob(id);

  if (!job) {
    return sendError(res, 404, 'video task not found', 'not_found');
  }

  if (job.status === 'queued') {
    return sendJson(res, 200, {
      id,
      queue_position: await queuePosition(id),
      status: 'queued',
    });
  }

  if (job.status === 'completed') {
    // Do not return `url`: the LobeHub OpenAI-compatible poller builds
    // `${baseURL}/videos/${id}/content`, which keeps the gateway origin.
    return sendJson(res, 200, { id, status: 'completed' });
  }

  if (job.status === 'cancelled') {
    return sendJson(res, 200, { error: { message: 'video generation cancelled' }, id, status: 'failed' });
  }

  if (job.status === 'failed') {
    return sendJson(res, 200, {
      error: { message: job.error || 'video generation failed' },
      id,
      status: 'failed',
    });
  }

  sendJson(res, 200, { id, status: 'in_progress' });
}

async function handleContent(req, res, id) {
  const job = await getJob(id);

  if (!job || job.status !== 'completed' || !job.gufoId) {
    return sendError(res, 409, 'video content is not ready', 'content_not_ready');
  }

  const upstream = await fetch(`${UPSTREAM}/v1/videos/${encodeURIComponent(job.gufoId)}/content`, {
    headers: req.headers.range ? { Range: req.headers.range } : {},
  });

  if (!upstream.ok) {
    metrics.upstreamErrors += 1;
    return sendError(res, upstream.status === 404 ? 404 : 502, 'failed to fetch video content', 'upstream_error');
  }

  res.statusCode = upstream.status;

  for (const header of ['accept-ranges', 'content-length', 'content-range', 'content-type']) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }

  if (!upstream.body) {
    res.end();
    return;
  }

  for await (const chunk of upstream.body) {
    res.write(chunk);
  }

  res.end();
}

async function handleCancel(req, res, id) {
  const job = await getJob(id);

  if (!job) {
    return sendError(res, 404, 'video task not found', 'not_found');
  }

  if (job.status === 'queued') {
    await redis.lRem(QUEUE_KEY, 0, id);
  } else if (job.status === 'in_progress' && job.gufoId) {
    await cancelUpstream(job.gufoId);
  }

  metrics.cancelled += 1;
  await redis.hSet(jobKey(id), { completedAt: String(Date.now()), status: 'cancelled' });
  await redis.expire(jobKey(id), JOB_TTL);

  sendJson(res, 200, { id, status: 'cancelled' });
}

function handleMetrics(res) {
  const lines = [
    '# HELP gufo_gateway_jobs_total Jobs by terminal state.',
    '# TYPE gufo_gateway_jobs_total counter',
    `gufo_gateway_jobs_total{status="completed"} ${metrics.completed}`,
    `gufo_gateway_jobs_total{status="failed"} ${metrics.failed}`,
    `gufo_gateway_jobs_total{status="cancelled"} ${metrics.cancelled}`,
    '# HELP gufo_gateway_rejected_total Requests rejected before enqueue.',
    '# TYPE gufo_gateway_rejected_total counter',
    `gufo_gateway_rejected_total ${metrics.rejected}`,
    '# HELP gufo_gateway_upstream_errors_total Upstream 429/503 and transport failures.',
    '# TYPE gufo_gateway_upstream_errors_total counter',
    `gufo_gateway_upstream_errors_total ${metrics.upstreamErrors}`,
  ];

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.end(lines.join('\n'));
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (path === '/health') {
    return sendJson(res, 200, { status: 'ok', upstream: UPSTREAM });
  }

  if (path === '/metrics') {
    return handleMetrics(res);
  }

  if (!isAuthorized(req)) {
    return sendError(res, 401, 'unauthorized', 'unauthorized');
  }

  if (path === '/v1/videos' && req.method === 'POST') {
    return handleCreate(req, res);
  }

  const match = path.match(/^\/v1\/videos\/([^/]+)(\/content)?$/);
  if (match) {
    const id = decodeURIComponent(match[1]);

    if (req.method === 'GET' && match[2]) return handleContent(req, res, id);
    if (req.method === 'GET') return handleStatus(req, res, id);
    if (req.method === 'DELETE') return handleCancel(req, res, id);
  }

  if (path.startsWith('/v1/videos')) {
    return sendError(res, 405, 'method not allowed', 'method_not_allowed');
  }

  sendError(res, 404, 'not found', 'not_found');
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    log('error', { event: 'request_failed', message: error.message });
    if (!res.headersSent) sendError(res, 500, 'internal gateway error', 'internal_error');
    else res.end();
  });
});

await redis.connect();
const workerRedis = redis.duplicate();
await workerRedis.connect();
log('info', { event: 'gateway_started', port: PORT, upstream: UPSTREAM, maxQueue: MAX_QUEUE_SIZE });

worker().catch((error) => {
  log('error', { event: 'worker_crashed', message: error.message });
  process.exit(1);
});

server.listen(Number(PORT), '0.0.0.0', () => {
  log('info', { event: 'http_listening', port: PORT });
});
