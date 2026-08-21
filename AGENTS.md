# AGENTS.md — AI Agent Guidance for imx91-rgb-controller

> **Repository:** `Max97k/imx91-rgb-controller`  
> **Default Branch:** `main`  
> **Primary Technology Stack:** Node.js (ESM), `@project-chip/matter-node.js` 0.8.0, Linux SPI (`/dev/spidev`), Winston 3.19.0, Jest 30.4.2, ESLint 10.7.0  
> **Visibility:** Public  

---

## 1. Project Overview & Architecture

### 1.1 Purpose & Mission
`imx91-rgb-controller` is an embedded smart home lighting controller running on the NXP FRDM i.MX 91S Linux development board. It bridges smart home ecosystems (Apple Home, Google Home, Home Assistant) to physical addressable RGBW LED strips (such as WS2814) using the Matter IoT standard (`@project-chip/matter-node.js`), while simultaneously providing a high-performance local web dashboard, REST API, and Server-Sent Events (SSE) stream for real-time browser control and system telemetry monitoring.

### 1.2 System Architecture & Component Diagram
The system is built as a pure Node.js ES Module service organized into modular layers:

```
+------------------------------------------------------------------------------------+
|                         imx91-rgb-controller Service                               |
+-----------------------------------------+------------------------------------------+
                                          |
        +---------------------------------+----------------------------------+
        |                                                                    |
        v                                                                    v
+-------------------------------+                                  +-------------------+
|     Native HTTP / SSE Server  |                                  |   Matter Server   |
|     (index.js - Port 3000)    |                                  | (matterSetup.js - |
| - Serves public/index.html    |                                  |   Port 5540)      |
| - REST API: /api/state,       |                                  | - ExtendedColor   |
|   /health                     |                                  |   LightDevice     |
| - SSE Stream: /events         |                                  | - OnOff, Level,   |
| - System Monitor:             |                                  |   Color Clusters  |
|   /proc/meminfo, /proc/uptime |                                  | - QR Pairing Code |
+---------------+---------------+                                  +---------+---------+
                |                                                            |
                +----------------------------+-------------------------------+
                                             |
                                             v
                             +-------------------------------+
                             |    In-Memory State Manager    |
                             |      (stateManager.js)        |
                             +---------------+---------------+
                                             |
                                             v
                             +-------------------------------+
                             |    Color Conversion Utils     |
                             |      (colorUtils.js)          |
                             | - HSV to RGB                  |
                             | - RGB to RGBW White Extract   |
                             +---------------+---------------+
                                             |
                                             v
                             +-------------------------------+
                             |    Hardware SPI Controller    |
                             |     (spiController.js)        |
                             | - /dev/spidev0.0 Linux SPI    |
                             | - WS2814 High-Speed Signaling |
                             +---------------+---------------+
                                             |
                                             v
                             +-------------------------------+
                             |   Physical WS2814 RGBW LEDs   |
                             | (External 5V/12V Power & GND) |
                             +-------------------------------+
```

### 1.3 Key File & Directory Map
| Path | Purpose / Description |
|---|---|
| `index.js` | Main application entrypoint. Boots HTTP server (port 3000), serves web UI, handles SSE clients, polls system telemetry (`/proc/meminfo`), and coordinates service startup. |
| `matterSetup.js` | Matter smart home protocol stack. Configures `MatterServer`, creates `CommissioningServer` (port 5540, deviceType `0x010d`), binds cluster listeners, and generates QR pairing codes. |
| `spiController.js` | Hardware Linux SPI interface (`SpiController`). Controls WS2814 LED strips via `/dev/spidev` and manages hardware fallback when running off-board. |
| `colorUtils.js` | Color space algorithms: HSV to RGB conversion and RGB to RGBW white-extraction calculation. |
| `colorUtils.test.js` | Jest test suite validating color transform boundary conditions and algorithmic precision. |
| `stateManager.js` | In-memory light state store (`onOff`, `brightness`, `hue`, `saturation`, `rgbw`) and SSE client broadcast subscriber manager. |
| `logger.js` | Winston logging infrastructure with formatted console and `app.log` file appenders. |
| `public/index.html` | Single-page browser dashboard displaying real-time LED status, interactive color picker, system memory/uptime, and Matter QR pairing code. |
| `eslint.config.js` | Modern ESLint Flat Configuration defining code quality and style rules. |
| `package.json` | Project dependencies, npm scripts, and `"type": "module"` configuration. |

---

## 2. Development, Build & Verification Commands

### 2.1 Prerequisites & Environment Setup
- **Runtime Environment:** Node.js 18+ (Node.js 20 or 22 LTS recommended), npm 9+.
- **Target Hardware:** NXP FRDM i.MX 91S development board running Linux with SPI peripheral enabled (`/dev/spidev0.0`).
- **Dependencies:** Install dependencies via npm:
  ```bash
  npm install
  ```

### 2.2 Run & Startup Commands
```bash
# Start the full controller service (Web Server + Matter + SPI)
npm start
# Equivalent to: node index.js
```

### 2.3 Verification, Testing & Linting Suite
```bash
# Run unit test suite with experimental VM modules for ESM
npm test
# Executes: node --experimental-vm-modules node_modules/jest/bin/jest.js

# Run ESLint static analysis (Flat config)
npm run lint

# Format codebase with Prettier
npm run format
```

### 2.4 Diagnostic Endpoints
Once started, the following HTTP endpoints can be probed for health and state verification:
- `http://localhost:3000/health`: Health status, uptime, and system memory.
- `http://localhost:3000/api/state`: Current lighting state (power, brightness, color, RGBW values).
- `http://localhost:3000/events`: Live Server-Sent Events stream.

---

## 3. Coding Standards & Conventions

### 3.1 Code Style & Idioms
- **ECMAScript Modules:** All JavaScript files must use native ES Modules (`import`/`export`). The repository is pinned with `"type": "module"` in `package.json`.
- **Asynchronous Architecture:** Use standard `async`/`await` patterns for I/O and protocol lifecycle operations.
- **Logging:** Use `logger.info()`, `logger.warn()`, `logger.error()` from `logger.js`. Avoid unmanaged `console.log` in production modules.

### 3.2 File & Module Organization
- Keep protocol layers strictly decoupled:
  - Hardware / I/O logic in `spiController.js`.
  - Matter protocol initialization and cluster event dispatching in `matterSetup.js`.
  - State persistence and SSE broadcasting in `stateManager.js`.
  - Math and color conversions in `colorUtils.js`.

### 3.3 State Management & Error Handling
- **Graceful Fallbacks:** If Matter fails to initialize (e.g. storage lock or network port conflict) or if Linux SPI device `/dev/spidev` is unavailable (e.g. running on developer workstation), the service must log a warning and degrade gracefully to web-only or simulation mode rather than crashing.
- **Atomic State Transitions:** All state mutations pass through `stateManager.setState()`, which synchronizes state to hardware SPI, Matter clusters, and active SSE browser clients.

---

## 4. Safety, Security & Resource Constraints

### 4.1 Hardware, Electrical & Power Safety
- **External Power Supply:** High-density WS2814 LED strips draw significant current (up to several amperes). **NEVER** power LED strips directly from the i.MX 91S board's 3.3V or 5V header pins. Always use an external regulated power supply with a shared common ground.
- **Logic Level Shifting:** The NXP i.MX 91S outputs 3.3V GPIO/SPI signals. WS2814/WS2812 ICs require 5V logic signaling. Use a high-speed level shifter (such as 74AHCT125) on the SPI MOSI line to prevent data corruption or flicker.

### 4.2 Network Ports & Commissioning Security
- **Port 3000 (TCP):** HTTP Web UI, REST API, and Server-Sent Events.
- **Port 5540 (UDP/TCP):** Matter Commissioning and operational traffic.
- **Commissioning Credentials:** Default pairing passcode is `20202021` with discriminator `3840`.

### 4.3 Git & Branch Workflow
- **Default Branch:** `main`. All PRs and commits target `main`.
- **Commit Formatting:** Follow conventional commit guidelines (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
