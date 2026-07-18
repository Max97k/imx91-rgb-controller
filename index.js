import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import logger from './logger.js';
import { SpiController } from './spiController.js';
import { state, sseClients, broadcast, stateSnapshot } from './stateManager.js';
import { setupMatter } from './matterSetup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spiController = new SpiController();

// ─────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────
function hsvToRgb(hDeg, s, v) {
  hDeg = hDeg % 360;
  const c = v * s,
    x = c * (1 - Math.abs(((hDeg / 60) % 2) - 1)),
    m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (hDeg < 60) {
    r = c;
    g = x;
  } else if (hDeg < 120) {
    r = x;
    g = c;
  } else if (hDeg < 180) {
    g = c;
    b = x;
  } else if (hDeg < 240) {
    g = x;
    b = c;
  } else if (hDeg < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function refreshColor() {
  const h = (state.hue / 254) * 360;
  const s = state.saturation / 254;
  const v = state.power ? state.brightness / 254 : 0;
  state.colorRgb = hsvToRgb(h, s, v);
}

// ─────────────────────────────────────────────
// Offline Fallback Mode
// ─────────────────────────────────────────────
function triggerOfflineFallback() {
  logger.warn('[Fallback] Triggering offline alert pattern (Flashing Red)');
  let isRed = false;
  setInterval(() => {
    if (isRed) {
      logger.info('[GPIO] RGB → (0, 0, 0) - Offline Alert');
    } else {
      logger.info('[GPIO] RGB → (255, 0, 0) - Offline Alert');
    }
    isRed = !isRed;
  }, 1000);
}

// ─────────────────────────────────────────────
// GPIO / PWM output  (wire up when LED is connected)
// ─────────────────────────────────────────────
export function applyGpio() {
  const { r, g, b } = state.colorRgb;
  spiController.updateLeds(r, g, b, 0);
}

// ─────────────────────────────────────────────
// System stats
// ─────────────────────────────────────────────
async function getSystemStats() {
  try {
    const mem = await readFile('/proc/meminfo', 'utf8');
    const total = parseInt(mem.match(/MemTotal:\s+(\d+)/)[1]);
    const avail = parseInt(mem.match(/MemAvailable:\s+(\d+)/)[1]);
    const up = parseFloat(
      (await readFile('/proc/uptime', 'utf8')).split(' ')[0]
    );
    const days = Math.floor(up / 86400),
      hrs = Math.floor((up % 86400) / 3600),
      mins = Math.floor((up % 3600) / 60);
    return {
      memTotalMb: Math.round(total / 1024),
      memUsedMb: Math.round((total - avail) / 1024),
      memFreeMb: Math.round(avail / 1024),
      uptimeStr: `${days}d ${hrs}h ${mins}m`,
    };
  } catch (_) {
    return { memTotalMb: 0, memUsedMb: 0, memFreeMb: 0, uptimeStr: 'N/A' };
  }
}

// ─────────────────────────────────────────────
// HTTP / SSE server
// ─────────────────────────────────────────────
const WEB_PORT = 3000;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (pathname === '/') {
    try {
      const html = await readFile(
        path.join(__dirname, 'public', 'index.html'),
        'utf8'
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (_) {
      res.writeHead(500);
      res.end('Dashboard error');
    }
  } else if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    sseClients.add(res);
    const stats = await getSystemStats();
    res.write(
      `data: ${JSON.stringify({ type: 'init', ...stateSnapshot(), system: stats })}\n\n`
    );
    req.on('close', () => sseClients.delete(res));
  } else if (pathname === '/api/state') {
    const stats = await getSystemStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...stateSnapshot(), system: stats }));
  } else if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Broadcast system stats every 5 seconds
setInterval(async () => {
  const stats = await getSystemStats();
  broadcast({
    type: 'stats',
    system: stats,
    appUptimeSec: Math.floor((Date.now() - state.startTime) / 1000),
  });
}, 5000);

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
server.listen(WEB_PORT, '0.0.0.0', async () => {
  logger.info('=========================================');
  logger.info('  NXP i.MX 91S RGB LED Matter Controller');
  logger.info('=========================================');
  logger.info(`📊 Dashboard  : http://192.168.1.201:${WEB_PORT}`);
  logger.info(`🔧 API state  : http://192.168.1.201:${WEB_PORT}/api/state`);

  try {
    await setupMatter({
      state,
      refreshColor,
      applyGpio,
      broadcast,
      stateSnapshot,
    });
  } catch (err) {
    logger.error(`[Matter] Failed to start: ${err.message}`);
    logger.warn('[Matter] Running in web-only mode (no Matter pairing).');
    triggerOfflineFallback();
  }
});
