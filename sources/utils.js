const https = require('https');
const http = require('http');

async function checkRobotsAllowed(baseUrl, targetPath = '/') {
  try {
    const origin = new URL(baseUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const res = await httpGet(robotsUrl, { timeout: 3000 });
    if (res.status === 200 && typeof res.data === 'string') {
      const lines = res.data.split('\n');
      let currentUserAgentApplies = false;
      for (let line of lines) {
        line = line.trim();
        if (line.toLowerCase().startsWith('user-agent:')) {
          const agent = line.substring(11).trim();
          currentUserAgentApplies = (agent === '*' || agent.toLowerCase().includes('scribbi'));
        } else if (currentUserAgentApplies && line.toLowerCase().startsWith('disallow:')) {
          const path = line.substring(9).trim();
          if (path === '/' && targetPath === '/') return false;
          if (path.length > 1 && targetPath.startsWith(path)) return false;
        }
      }
    }
  } catch (e) {
    // If robots.txt fails or times out, proceed politely
  }
  return true;
}

const lastRequestTimes = {};

async function rateLimit(domain) {
  const now = Date.now();
  const last = lastRequestTimes[domain] || 0;
  const elapsed = now - last;
  if (elapsed < 1000) {
    await new Promise(r => setTimeout(r, 1000 - elapsed));
  }
  lastRequestTimes[domain] = Date.now();
}

function httpGet(urlStr, options = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const timeout = options.timeout || 8000;

      const req = client.get(urlStr, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScribbiBot/1.0 (+https://scribbi.app)',
          ...(options.headers || {})
        },
        timeout
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          fetchWithRedirect(nextUrl, options, (options.redirectCount || 0) + 1).then(resolve);
        } else {
          let chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const contentType = res.headers['content-type'] || '';
            let data = buffer;
            if (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) {
              data = buffer.toString('utf8');
            }
            resolve({ status: res.statusCode, headers: res.headers, contentType, data, url: urlStr });
          });
        }
      });

      req.on('error', err => resolve({ status: 0, error: err.message, url: urlStr }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'Timeout', url: urlStr }); });
    } catch (e) {
      resolve({ status: 0, error: e.message, url: urlStr });
    }
  });
}

async function fetchWithRedirect(urlStr, options = {}, redirectCount = 0) {
  if (redirectCount > 5) return { status: 0, error: 'Too many redirects', url: urlStr };
  options.redirectCount = redirectCount;
  return httpGet(urlStr, options);
}

async function verifyPdfUrl(urlStr) {
  try {
    const domain = new URL(urlStr).hostname;
    await rateLimit(domain);
    const res = await httpGet(urlStr, { timeout: 5000 });
    if (res.status === 200) {
      const ct = (res.contentType || '').toLowerCase();
      if (ct.includes('pdf') || urlStr.toLowerCase().endsWith('.pdf')) {
        return true;
      }
    }
  } catch (e) {
    // Ignore verification failure
  }
  return false;
}

module.exports = {
  checkRobotsAllowed,
  rateLimit,
  httpGet,
  verifyPdfUrl
};
