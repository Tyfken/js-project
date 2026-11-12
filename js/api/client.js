export class ApiError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

const cache = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new ApiError('http', `HTTP ${res.status}`, res.status);
    try {
      return await res.json();
    } catch {
      throw new ApiError('parse', 'Response was not valid JSON');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.name === 'AbortError' ? 'timeout' : 'network', error.message);
  } finally {
    clearTimeout(timer);
  }
}

export function fetchJSON(url, { retries = 2, timeout = 10000, useCache = true } = {}) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request(url, timeout);
      } catch (error) {
        const retryable = ['network', 'timeout'].includes(error.kind) || (error.kind === 'http' && error.status >= 500);
        if (!retryable || attempt >= retries) throw error;
        await sleep(400 * 2 ** attempt);
      }
    }
  };
  if (!useCache) return run();
  if (!cache.has(url)) {
    cache.set(url, run().catch((error) => {
      cache.delete(url);
      throw error;
    }));
  }
  return cache.get(url);
}
