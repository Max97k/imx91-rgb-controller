export class SpiController {
  constructor() {
    console.log('[SpiController] Initialized for WS2814 SPI output');
  }

  updateLeds(r, g, b, w) {
    console.log(`[SpiController] RGBW → (${r}, ${g}, ${b}, ${w})`);
  }
}
