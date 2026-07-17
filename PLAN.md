# Next Phase Plan: Driving 240 WS2814 RGBW LEDs

## Background
The next objective is to physically drive a light bar containing **240 WS2814 RGBW LEDs** from the i.MX 91S. 
WS2814 is a 1-wire digital addressable LED (similar to NeoPixel/WS2812B) but with 4 channels (RGBW). It requires a strict 800 kHz single-wire digital protocol. It cannot be driven directly by standard Linux sysfs PWM due to real-time OS timing limitations.

## Hardware Setup Requirements
1. **Power Supply**: 
   - 240 LEDs will draw a massive amount of current (approximately 14.4A at 5V, or ~6A at 12V/24V depending on your specific strip).
   - **Action**: Procure an external high-power DC power supply. Do NOT power the strip directly from the EVB. Common ground must be established between the EVB and the power supply.
2. **Logic Level Shifting**:
   - i.MX 91S outputs 3.3V/1.8V logic, but the WS2814 expects 5V logic on its Data In (DIN) line.
   - **Action**: Add a high-speed level shifter (e.g., 74AHCT125) between the EVB GPIO/SPI pin and the LED strip.

## Software Control Strategy (Options)

### Plan A: Use Linux SPI (Preferred)
* **How it works**: Map the WS2814 800kHz bitstream to SPI bytes. Use `/dev/spidevX.X` on the i.MX 91S to push DMA-driven signals. This offloads the strict timing requirements to the hardware SPI controller, avoiding Linux OS jitter.
* **Tasks**:
  - [ ] Identify available hardware SPI pins (MOSI) on the FRDM i.MX 91S expansion header.
  - [ ] Configure the EVB device tree (DTS) to enable `/dev/spidev`.
  - [ ] Implement an SPI-to-NeoPixel bit-banging library in `index.js`.

### Plan B: External MCU Co-Processor
* **How it works**: Use a Raspberry Pi Pico, Arduino, or ESP32 as a middleman. The EVB sends simple "Color X" commands via UART, and the MCU handles the strict WS2814 timing natively.
* **Tasks**:
  - [ ] Write C/C++ firmware for the MCU using FastLED or Adafruit NeoPixel library.
  - [ ] Set up UART serial communication between EVB and MCU in `index.js`.

## Task List for Next Session
- [ ] Finalize whether to use Plan A (SPI) or Plan B (MCU).
- [ ] Prepare hardware (Level Shifter, Power Supply, and wiring).
- [ ] Connect the hardware and test a simple 10-LED segment before scaling up to 240.
- [ ] Map the `state.colorRgb` output in `applyGpio()` (in `index.js`) to the chosen hardware library.
