# NXP i.MX 91S RGB LED Matter Controller

This project transforms the **NXP FRDM i.MX 91S** development board into a Matter-compatible RGB LED controller, allowing seamless integration with smart home ecosystems like Google Home, Apple HomeKit, and CHIP Tool.

## Features Developed

- **Matter Commissioning Server**: Built using `@project-chip/matter-node.js` v0.8.1.
- **Extended Color Light Support**: Supports Power, Brightness, Hue, and Saturation clusters for full RGBW control.
- **Web Dashboard**: An embedded web server hosted on port `3000`. Features real-time state synchronization via SSE, system stats monitoring, and dynamic QR Code generation for easy Matter pairing.
- **Local Testing Workflow**: App can be tested locally using `matter-controller` and deployed seamlessly to the EVB.

## Setup

1. Expand the root partition on the EVB (`resize2fs`).
2. Deploy the app from your host to the EVB using SCP.
3. On the EVB, run `npm install` and start the server with `node index.js`.
4. Open the Web Dashboard at `http://<evb-ip>:3000` to view the pairing QR code.

## Current Status

- ✔️ Matter protocol communication successfully tested and verified.
- ✔️ Web Dashboard UI fully implemented and live-syncing.
- ⏳ Hardware GPIO/SPI implementation for WS2814 pending (See `PLAN.md`).
