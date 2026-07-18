// ─────────────────────────────────────────────
// Shared device state
// ─────────────────────────────────────────────
const state = {
  power: false,
  brightness: 254,
  hue: 0,
  saturation: 0,
  colorRgb: { r: 255, g: 255, b: 255 },
  matterPaired: false,
  matterQrCode: null, // set after Matter starts
  matterManualCode: null,
  startTime: Date.now(),
};

// ─────────────────────────────────────────────
// SSE broadcast
// ─────────────────────────────────────────────
const sseClients = new Set();
function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

function stateSnapshot() {
  return {
    power: state.power,
    brightness: state.brightness,
    hue: state.hue,
    saturation: state.saturation,
    colorRgb: state.colorRgb,
    matterPaired: state.matterPaired,
    matterQrCode: state.matterQrCode,
    matterManualCode: state.matterManualCode,
    appUptimeSec: Math.floor((Date.now() - state.startTime) / 1000),
  };
}

export { state, sseClients, broadcast, stateSnapshot };
