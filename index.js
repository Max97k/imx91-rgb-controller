import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// matter.js v0.8 — confirmed working import paths
import { MatterServer }         from '@project-chip/matter-node.js';
import { StorageBackendMemory } from '@project-chip/matter-node.js/storage';
import { StorageManager }       from '@project-chip/matter.js/storage';
import { CommissioningServer }  from '@project-chip/matter.js';
import { ExtendedColorLightDevice } from '@project-chip/matter-node.js/device';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────
// Shared device state
// ─────────────────────────────────────────────
const state = {
  power:        false,
  brightness:   254,
  hue:          0,
  saturation:   0,
  colorRgb:     { r: 255, g: 255, b: 255 },
  matterPaired: false,
  matterQrCode: null,          // set after Matter starts
  matterManualCode: null,
  startTime:    Date.now(),
};

// ─────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────
function hsvToRgb(hDeg, s, v) {
  hDeg = hDeg % 360;
  const c = v * s, x = c * (1 - Math.abs((hDeg / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if      (hDeg < 60)  { r = c; g = x; }
  else if (hDeg < 120) { r = x; g = c; }
  else if (hDeg < 180) { g = c; b = x; }
  else if (hDeg < 240) { g = x; b = c; }
  else if (hDeg < 300) { r = x; b = c; }
  else                  { r = c; b = x; }
  return { r: Math.round((r+m)*255), g: Math.round((g+m)*255), b: Math.round((b+m)*255) };
}

function refreshColor() {
  const h = (state.hue / 254) * 360;
  const s = state.saturation / 254;
  const v = state.power ? state.brightness / 254 : 0;
  state.colorRgb = hsvToRgb(h, s, v);
}

// ─────────────────────────────────────────────
// SSE broadcast
// ─────────────────────────────────────────────
const sseClients = new Set();
function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch (_) { sseClients.delete(res); }
  }
}

// ─────────────────────────────────────────────
// Matter v0.8 setup
// ─────────────────────────────────────────────
async function setupMatter() {
  console.log('[Matter] Initializing...');

  // In-memory storage (no file system needed)
  const storageManager = new StorageManager(new StorageBackendMemory());
  await storageManager.initialize();

  const matterServer = new MatterServer(storageManager);

  // Create an Extended Color Light device
  const lightDevice = new ExtendedColorLightDevice();

  // Listen for ON/OFF changes
  lightDevice.addOnOffListener(value => {
    state.power = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Power → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  // Listen for Brightness changes
  lightDevice.addCurrentLevelListener(value => {
    state.brightness = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Brightness → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  // Listen for Hue changes
  lightDevice.addCurrentHueListener(value => {
    state.hue = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Hue → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  // Listen for Saturation changes
  lightDevice.addCurrentSaturationListener(value => {
    state.saturation = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Saturation → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  const commissioningServer = new CommissioningServer({
    port: 5540,
    deviceName: 'iMX91S RGB Light',
    deviceType: 0x010D,           // Extended Color Light
    passcode:   20202021,
    discriminator: 3840,
    basicInformation: {
      vendorName: 'NXP',
      vendorId:   0xFFF1, // test vendor
      productName: 'FRDM i.MX 91S RGB Light',
      productId:  0x8000,
      nodeLabel: 'RGB LED Light',
      serialNumber: 'IMX91-RGB-001',
    },
  });

  commissioningServer.addDevice(lightDevice);
  matterServer.addCommissioningServer(commissioningServer);

  await matterServer.start();

  // Get QR code
  const pairingInfo = commissioningServer.getPairingCode();
  state.matterQrCode    = pairingInfo.qrPairingCode;
  state.matterManualCode = pairingInfo.manualPairingCode;

  const qrUrl = `https://project-chip.github.io/connectedhomeip/qrcode.html?data=${encodeURIComponent(state.matterQrCode)}`;

  console.log('[Matter] ✓ Ready for pairing!');
  console.log('[Matter] QR code data :', state.matterQrCode);
  console.log('[Matter] Manual code  :', state.matterManualCode);
  console.log('[Matter] QR code URL  :', qrUrl);

  // Broadcast QR code to any connected dashboard clients
  broadcast({ type: 'qr', qrCode: state.matterQrCode, manualCode: state.matterManualCode, qrUrl });
}

// ─────────────────────────────────────────────
// GPIO / PWM output  (wire up when LED is connected)
// ─────────────────────────────────────────────
function applyGpio() {
  const { r, g, b } = state.colorRgb;
  console.log(`[GPIO] RGB → (${r}, ${g}, ${b})`);
  // TODO: write to /sys/class/pwm/pwmchip0/pwm0/duty_cycle etc.
}

// ─────────────────────────────────────────────
// System stats
// ─────────────────────────────────────────────
async function getSystemStats() {
  try {
    const mem   = await readFile('/proc/meminfo', 'utf8');
    const total = parseInt(mem.match(/MemTotal:\s+(\d+)/)[1]);
    const avail = parseInt(mem.match(/MemAvailable:\s+(\d+)/)[1]);
    const up    = parseFloat((await readFile('/proc/uptime', 'utf8')).split(' ')[0]);
    const days  = Math.floor(up/86400), hrs = Math.floor((up%86400)/3600), mins = Math.floor((up%3600)/60);
    return { memTotalMb: Math.round(total/1024), memUsedMb: Math.round((total-avail)/1024), memFreeMb: Math.round(avail/1024), uptimeStr: `${days}d ${hrs}h ${mins}m` };
  } catch (_) { return { memTotalMb:0, memUsedMb:0, memFreeMb:0, uptimeStr:'N/A' }; }
}

function stateSnapshot() {
  return {
    power: state.power, brightness: state.brightness,
    hue: state.hue, saturation: state.saturation,
    colorRgb: state.colorRgb, matterPaired: state.matterPaired,
    matterQrCode: state.matterQrCode, matterManualCode: state.matterManualCode,
    appUptimeSec: Math.floor((Date.now() - state.startTime) / 1000),
  };
}

// ─────────────────────────────────────────────
// HTTP / SSE server
// ─────────────────────────────────────────────
const WEB_PORT = 3000;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (pathname === '/') {
    try {
      const html = await readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (_) { res.writeHead(500); res.end('Dashboard error'); }

  } else if (pathname === '/events') {
    res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*' });
    sseClients.add(res);
    const stats = await getSystemStats();
    res.write(`data: ${JSON.stringify({ type:'init', ...stateSnapshot(), system: stats })}\n\n`);
    req.on('close', () => sseClients.delete(res));

  } else if (pathname === '/api/state') {
    const stats = await getSystemStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...stateSnapshot(), system: stats }));

  } else { res.writeHead(404); res.end('Not found'); }
});

// Broadcast system stats every 5 seconds
setInterval(async () => {
  const stats = await getSystemStats();
  broadcast({ type:'stats', system: stats, appUptimeSec: Math.floor((Date.now()-state.startTime)/1000) });
}, 5000);

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
server.listen(WEB_PORT, '0.0.0.0', async () => {
  console.log('=========================================');
  console.log('  NXP i.MX 91S RGB LED Matter Controller');
  console.log('=========================================');
  console.log(`📊 Dashboard  : http://192.168.1.201:${WEB_PORT}`);
  console.log(`🔧 API state  : http://192.168.1.201:${WEB_PORT}/api/state`);

  try {
    await setupMatter();
  } catch (err) {
    console.error('[Matter] Failed to start:', err.message);
    console.log('[Matter] Running in web-only mode (no Matter pairing).');
  }
});
