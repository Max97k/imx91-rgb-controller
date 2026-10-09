English | [繁體中文](README_zh.md)

# NXP i.MX 91S Matter RGB/RGBW LED Controller

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-NXP%20FRDM%20i.MX%2091S-red.svg)](https://www.nxp.com)
[![Matter](https://img.shields.io/badge/Matter%20v1.2-Project%20CHIP-brightgreen.svg)](https://csa-iot.org)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518.x%20ESM-green.svg)](https://nodejs.org)
[![Testing](https://img.shields.io/badge/Tests-Jest-orange.svg)](colorUtils.test.js)

An industrial-grade Matter (Project CHIP) smart lighting controller implemented on the **NXP FRDM i.MX 91S** application processor. The system hosts a Matter commissioning and operational server controlling addressable RGB/RGBW LED strips (such as WS2814/WS2812B), coupled with an embedded diagnostic web dashboard featuring Server-Sent Events (SSE) telemetry and dynamic pairing QR codes.

---

## Table of Contents

- [Technical Overview](#technical-overview)
  - [Engineering Challenges & Solutions](#engineering-challenges--solutions)
- [System Architecture](#system-architecture)
- [Hardware Specifications & Pinout](#hardware-specifications--pinout)
  - [Level Shifting & Power Distribution](#level-shifting--power-distribution)
- [Directory Structure](#directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Target Setup](#installation--target-setup)
  - [Running the Controller](#running-the-controller)
  - [Matter Commissioning Workflow](#matter-commissioning-workflow)
- [API & Telemetry Interface](#api--telemetry-interface)
- [Testing & Code Quality](#testing--code-quality)
- [Trademarks & Legal Disclaimers](#trademarks--legal-disclaimers)

---

## Technical Overview

The NXP FRDM i.MX 91S development board hosts an Arm® Cortex®-A55 core designed for secure, low-power edge IoT computation. This project leverages `@project-chip/matter-node.js` to expose a standard **Extended Color Light** device (Device Type `0x010d`) over IPv6/Thread/Wi-Fi to smart home ecosystems including Apple HomeKit, Google Home, Samsung SmartThings, and the CLI `chip-tool`.

### Engineering Challenges & Solutions

1. **Non-Real-Time OS Jitter vs. Microsecond Timing Requirements**:
   - *Challenge*: Addressable LEDs such as the WS2814 RGBW protocol use single-wire Non-Return-to-Zero (NZR) encoding running at 800 kHz ($\pm 150\,\text{ns}$ tolerance). Standard Linux user-space GPIO manipulation (`sysfs` or `libgpiod`) suffers from kernel task preemption and scheduler latency, inducing visible flicker or latch resets.
   - *Solution*: Software maps each WS2814 bit to high-speed SPI MOSI byte patterns over Linux `/dev/spidevX.Y`. DMA-backed hardware SPI serialization offloads timing generation from user space to the dedicated hardware peripheral.
2. **Logic Level Voltage Incompatibility**:
   - *Challenge*: The i.MX 91S expansion header outputs 3.3V/1.8V CMOS logic levels, whereas WS2814 DIN inputs require a minimum high-level voltage $V_{IH} \ge 0.7 \times V_{DD} \approx 3.5\,\text{V}$ when operating on a 5V rail.
   - *Solution*: A 74AHCT125 high-speed CMOS bus buffer powered at 5V performs deterministic level conversion with sub-10ns propagation delay.
3. **State Convergence & Multiprotocol Telemetry**:
   - *Challenge*: Simultaneous state mutations from physical Matter fabrics (e.g. mobile app commission controllers) and local HTTP REST dashboards can cause race conditions.
   - *Solution*: A centralized, reactive state manager (`stateManager.js`) provides single-source-of-truth updates with broadcast SSE push events and Winston structured logging.

---

## System Architecture

```
                                  +---------------------------------------------+
                                  |            Ecosystem Controllers            |
                                  |  (Google Home / Apple HomeKit / chip-tool)  |
                                  +----------------------+----------------------+
                                                         |
                                                Matter Protocol (UDP/IPv6)
                                                         |
+--------------------------------------------------------v--------------------------------------------------------+
| NXP FRDM i.MX 91S Application Processor (Linux)                                                                 |
|                                                                                                                 |
|   +--------------------------+    Event Bus    +------------------------+    HTTP/SSE    +--------------------+  |
|   |   Matter Server Engine   |<--------------->|  Central State Manager |<-------------->| Web Dashboard (UI) |  |
|   |  ExtendedColorLight      |                 |  (stateManager.js)     |     :3000      | (public/index.html)|  |
|   +--------------------------+                 +-----------+------------+                +--------------------+  |
|                                                            |                                                    |
|                                                  HSV-to-RGBW Conversion                                         |
|                                                            |                                                    |
|                                                +-----------v------------+                                       |
|                                                |   SPI Output Driver    |                                       |
|                                                |  (spiController.js)    |                                       |
|                                                +-----------+------------+                                       |
+------------------------------------------------------------|----------------------------------------------------+
                                                             | MOSI (3.3V)
                                                             v
                                                +-------------------------+
                                                |  74AHCT125 Level Shifter|
                                                +------------+------------+
                                                             | DIN (5.0V, 800 kHz)
                                                             v
                                                +-------------------------+
                                                | 240x WS2814 RGBW LEDs   |
                                                +-------------------------+
```

---

## Hardware Specifications & Pinout

| Parameter | Specification | Details |
| :--- | :--- | :--- |
| **Processor** | NXP i.MX 91 | 1× Arm® Cortex®-A55 @ up to 1.4 GHz |
| **Target Board** | FRDM-IMX91S | Development evaluation board |
| **Operating System** | Embedded Linux | Yocto Project / Debian BSP |
| **Target Actuator** | WS2814 RGBW | 240-LED addressable strip (800 kHz NZR) |
| **Network Interface** | Ethernet / Wi-Fi | IPv6 native multicast support (mDNS / DNS-SD) |
| **Matter Transport** | UDP Port 5540 | Commissioning & Node.js Server |
| **Web Dashboard** | TCP Port 3000 | Static HTML5 + SSE stream + REST API |

### Wiring & Level Shifting

| FRDM i.MX 91S Pin | Pin Function | Direction | Level Shifter Pin (74AHCT125) | Strip / External |
| :--- | :--- | :--- | :--- | :--- |
| **GND** | Digital Ground | -- | Pin 7 (GND), Pin 1 (/1OE) | LED Strip GND & PSU Common GND |
| **3.3V** | I/O Reference | Output | Pin 14 ($V_{CC}$ via 5V rail) | Level shifter $V_{CC}$ tied to external 5V |
| **SPI_MOSI** | Data Out | Output | Pin 2 (1A) | Level shifter input |
| -- | Level Shifter 1Y | Output | Pin 3 (1Y) | LED Strip DIN (5V logic) |
| -- | External PSU (+5V) | Power | Pin 14 ($V_{CC}$) | LED Strip +5V Rail |

> [!CAUTION]
> **Power Supply Sizing**: A 240-LED WS2814 strip can consume up to $14.4\,\text{A}$ at 5V when driven at full white ($R=G=B=W=255$). Never power the LED strip directly from the FRDM-IMX91S 5V header pin. Power the strip from an external regulated power supply and connect all grounds (EVB GND, PSU GND, Strip GND) together.

---

## Directory Structure

```
imx91-rgb-controller/
├── public/
│   └── index.html           # Embedded web dashboard with SSE client and Matter QR generator
├── colorUtils.js            # HSV to RGBW colorspace conversion algorithms
├── colorUtils.test.js       # Jest unit test suite for colorspace maths
├── eslint.config.js         # ESLint configuration
├── index.js                 # Application entry point, HTTP server, and orchestration
├── logger.js                # Winston structured logging subsystem
├── matterSetup.js           # Matter node setup (ExtendedColorLight, endpoints, storage)
├── spiController.js         # Hardware SPI controller abstraction for WS2814 NZR
├── stateManager.js          # Centralized reactive state store and SSE broadcaster
├── package.json             # NPM package manifest and dependencies
├── PLAN.md                  # Hardware timing roadmap and validation milestones
├── README.md                # English technical documentation
└── README_zh.md             # Traditional Chinese technical documentation
```

---

## Getting Started

### Prerequisites

- NXP FRDM i.MX 91S board with Linux BSP booted and network access configured.
- Host machine with Node.js $\ge 18.x$ and `ssh` / `scp` access to the board.
- Root filesystem expanded on target board:
  ```bash
  resize2fs /dev/mmcblk0p2
  ```

### Installation & Target Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Max97k/imx91-rgb-controller.git
   cd imx91-rgb-controller
   ```

2. **Deploy to Target Board**:
   ```bash
   # From host development machine
   scp -r . root@<target-ip>:/home/root/imx91-rgb-controller
   ```

3. **Install Dependencies on Target**:
   ```bash
   ssh root@<target-ip>
   cd /home/root/imx91-rgb-controller
   npm install --omit=dev
   ```

### Running the Controller

Launch the application directly:

```bash
node index.js
```

Or configure systemd to start the daemon on boot (`/etc/systemd/system/matter-rgb.service`):

```ini
[Unit]
Description=i.MX 91S Matter RGB Controller
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/root/imx91-rgb-controller
ExecStart=/usr/bin/node index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Matter Commissioning Workflow

1. Open your browser and navigate to `http://<target-ip>:3000`.
2. Locate the commissioning QR code and manual pairing code:
   - **Passcode**: `20202021`
   - **Discriminator**: `3840`
   - **Port**: `5540`
   - **Device Type**: `0x010d` (Extended Color Light)
3. Using `chip-tool`:
   ```bash
   # Commission via IP
   chip-tool pairing onnetwork 1 20202021

   # Toggle state
   chip-tool onoff toggle 1 1

   # Adjust Hue & Saturation
   chip-tool colorcontrol move-to-hue-and-saturation 180 254 10 0 0 1 1
   ```

---

## API & Telemetry Interface

The embedded HTTP server on port 3000 provides endpoints for web integration and telemetry:

| Endpoint | Method | Description | Content-Type |
| :--- | :--- | :--- | :--- |
| `/` | `GET` | Serves dashboard UI (`public/index.html`) | `text/html` |
| `/api/state` | `GET` | Returns current power, brightness, hue, saturation | `application/json` |
| `/api/control` | `POST` | Updates state via JSON payload `{"power":true,"brightness":200}` | `application/json` |
| `/api/stats` | `GET` | Target system telemetry (`/proc/meminfo`, `/proc/uptime`) | `application/json` |
| `/api/stream` | `GET` | Real-time Server-Sent Events (SSE) telemetry stream | `text/event-stream` |

---

## Testing & Code Quality

The repository includes unit tests covering colorspace conversion logic and ESLint rules:

```bash
# Run unit test suite
npm test

# Run ESLint validation
npm run lint

# Format codebase
npm run format
```

---

## Trademarks & Legal Disclaimers

- **NXP®**, **i.MX®**, and the NXP logo are registered trademarks of NXP B.V.
- **Arm®** and **Cortex®** are registered trademarks of Arm Limited (or its subsidiaries) in the US and/or elsewhere.
- **Matter™** and the Matter logo are trademarks of the Connectivity Standards Alliance (CSA).
- All other product or service names are the property of their respective owners. This project is open-source and not officially affiliated with NXP B.V. or the Connectivity Standards Alliance.
