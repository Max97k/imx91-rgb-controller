[English](README.md) | 繁體中文

# NXP i.MX 91S Matter 智慧 RGB/RGBW LED 控制器

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-NXP%20FRDM%20i.MX%2091S-red.svg)](https://www.nxp.com)
[![Matter](https://img.shields.io/badge/Matter%20v1.2-Project%20CHIP-brightgreen.svg)](https://csa-iot.org)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518.x%20ESM-green.svg)](https://nodejs.org)
[![Testing](https://img.shields.io/badge/Tests-Jest-orange.svg)](colorUtils.test.js)

本專案基於 **NXP FRDM i.MX 91S** 邊緣處理器平台，實現工業級 Matter (Project CHIP) 智慧照明控制系統。系統內部建立完整 Matter Commissioning 與 Operational Server，驅動 WS2814/WS2812B 等數位定址 RGB/RGBW LED 燈條，並整合內嵌式 Web 即時監控儀表板，支援伺服器發送事件 (Server-Sent Events, SSE) 遙測與動態配對 QR Code 生成。

---

## 目錄

- [技術架構與概述](#技術架構與概述)
  - [嵌入式工程挑戰與解決方案](#嵌入式工程挑戰與解決方案)
- [系統架構圖](#系統架構圖)
- [硬體規格與接腳配置](#硬體規格與接腳配置)
  - [電平轉換與電源分配](#電平轉換與電源分配)
- [專案目錄結構](#專案目錄結構)
- [快速上手指南](#快速上手指南)
  - [環境需求](#環境需求)
  - [專案部署與開發板設定](#專案部署與開發板設定)
  - [啟動控制器](#啟動控制器)
  - [Matter 配對與控制流程](#matter-配對與控制流程)
- [API 與遙測介面](#api-與遙測介面)
- [單元測試與程式碼品質](#單元測試與程式碼品質)
- [商標與法律聲明](#商標與法律聲明)

---

## 技術架構與概述

NXP FRDM i.MX 91S 開發板搭載 Arm® Cortex®-A55 核心，專為安全、低功耗之邊緣物聯網裝置設計。本專案透過 `@project-chip/matter-node.js` 協定堆疊，向智慧家庭生態系統（包括 Apple HomeKit、Google Home、Samsung SmartThings 以及命令列 `chip-tool`）暴露標準的 **Extended Color Light** 裝置模型（裝置代碼 `0x010d`），支援基於 IPv6 / Thread / Wi-Fi 之底層網路通訊。

### 嵌入式工程挑戰與解決方案

1. **非即時作業系統抖動 (OS Jitter) 與微秒級時序要求**：
   - *工程挑戰*：WS2814 RGBW 等數位燈條採用單線非歸零碼 (NZR, Non-Return-to-Zero) 通訊協定，傳輸頻率達 800 kHz，位元週期僅 $1.25\,\mu\text{s}$，容許時序誤差小於 $\pm 150\,\text{ns}$。標準 Linux 用戶空間 GPIO (`sysfs` 或 `libgpiod`) 易受行程排程與核心岔斷搶佔影響，產生嚴重波形抖動，導致燈條顯色異常或強制重置。
   - *解決方案*：軟體層將 WS2814 位元組編碼映射為 Linux `/dev/spidevX.Y` 之高速 SPI MOSI 輸出序列。透過硬體 DMA 加速與硬體暫存器傳輸，將時序產生工作完全卸載 (Offload) 至晶片內部 SPI 控制器，徹底杜絕 Linux 行程排程造成的波形失真。
2. **邏輯電平相容性問題**：
   - *工程挑戰*：i.MX 91S 擴充排針輸出為 3.3V/1.8V CMOS 邏輯電平，而 WS2814 控制晶片在 5V 供電下要求高電位輸入門檻 $V_{IH} \ge 0.7 \times V_{DD} \approx 3.5\,\text{V}$。直接驅動易因臨界電壓不足產生誤觸發。
   - *解決方案*：電路中加入 74AHCT125 高速匯流排緩衝閘進行高速單向電平提升轉換，傳遞延遲低於 10 ns，確保訊號上升沿陡峭且符合規格。
3. **多通訊協定狀態同步與狀態收斂**：
   - *工程挑戰*：智慧家庭 Matter Fabric 與本機 HTTP Web 儀表板同時寫入時易衍生競態條件 (Race Condition)。
   - *解決方案*：建構集中式響應型狀態管理器 (`stateManager.js`) 作為單一真理來源 (Single Source of Truth)，藉由 SSE 推播與 Winston 結構化日誌完成即時多端狀態收斂。

---

## 系統架構圖

```
                                  +---------------------------------------------+
                                  |             智慧家庭生態系控制器             |
                                  |  (Google Home / Apple HomeKit / chip-tool)  |
                                  +----------------------+----------------------+
                                                         |
                                                Matter 通訊協定 (UDP/IPv6)
                                                         |
+--------------------------------------------------------v--------------------------------------------------------+
| NXP FRDM i.MX 91S 嵌入式應用處理器 (Linux)                                                                      |
|                                                                                                                 |
|   +--------------------------+    事件匯流排    +------------------------+    HTTP/SSE    +--------------------+  |
|   |    Matter 伺服器核心     |<--------------->|    集中式狀態管理器    |<-------------->| 網頁儀表板控制介面 |  |
|   |  ExtendedColorLight      |                 |  (stateManager.js)     |     :3000      | (public/index.html)|  |
|   +--------------------------+                 +-----------+------------+                +--------------------+  |
|                                                            |                                                    |
|                                                    HSV 至 RGBW 色彩轉換                                         |
|                                                            |                                                    |
|                                                +-----------v------------+                                       |
|                                                |   硬體 SPI 輸出驅動器  |                                       |
|                                                |  (spiController.js)    |                                       |
|                                                +-----------+------------+                                       |
+------------------------------------------------------------|----------------------------------------------------+
                                                             | MOSI (3.3V)
                                                             v
                                                +-------------------------+
                                                | 74AHCT125 高速電平轉換器|
                                                +------------+------------+
                                                             | DIN (5.0V, 800 kHz)
                                                             v
                                                +-------------------------+
                                                | 240顆 WS2814 RGBW LED   |
                                                +-------------------------+
```

---

## 硬體規格與接腳配置

| 項目 | 規格內容 | 備註說明 |
| :--- | :--- | :--- |
| **中央處理器** | NXP i.MX 91 | 1× Arm® Cortex®-A55 @ 高達 1.4 GHz |
| **目標開發板** | FRDM-IMX91S | 官方評估套件板 |
| **作業系統** | 嵌入式 Linux | Yocto Project / Debian BSP |
| **致動負載** | WS2814 RGBW | 240 顆燈珠數位定址燈條 (800 kHz NZR) |
| **網路介面** | 乙太網路 / Wi-Fi | 具備原生 IPv6 多播 (mDNS / DNS-SD) 支援 |
| **Matter 傳輸層** | UDP 埠 5540 | 配對與 Node.js 執行服務 |
| **Web 儀表板** | TCP 埠 3000 | 靜態 HTML5 + SSE 即時遙測資料流 + REST API |

### 接線與電平轉換

| FRDM i.MX 91S 接腳 | 接腳功能 | 訊號方向 | 電平轉換器 (74AHCT125) 接腳 | 燈條與外接電源接點 |
| :--- | :--- | :--- | :--- | :--- |
| **GND** | 數位接地 | -- | 接腳 7 (GND), 接腳 1 (/1OE) | 燈條 GND 與電源供應器共地 |
| **3.3V** | I/O 參考電壓 | 輸出 | 接腳 14 ($V_{CC}$ 接 5V 電源軌) | 轉換晶片 $V_{CC}$ 連接至外接 5V |
| **SPI_MOSI** | 資料輸出 | 輸出 | 接腳 2 (1A) | 轉換器輸入端 |
| -- | 緩衝輸出 1Y | 輸出 | 接腳 3 (1Y) | 燈條 DIN (5V 邏輯電平) |
| -- | 外接電源 (+5V) | 電源輸入 | 接腳 14 ($V_{CC}$) | 燈條 +5V 供電軌 |

> [!CAUTION]
> **外接電源容量安全要求**：240 顆 WS2814 LED 在全白全亮（$R=G=B=W=255$）狀態下電流消耗可高達 $14.4\,\text{A}$。嚴禁直接從 FRDM-IMX91S 開發板 5V 排針汲取燈條主電源！必須使用獨立大功率穩壓電源供應器，並將開發板接地端、電源供應器負極及燈條地線進行嚴格共地。

---

## 專案目錄結構

```
imx91-rgb-controller/
├── public/
│   └── index.html           # 內嵌式網頁儀表板（含 SSE 即時監控與動態配對 QR Code）
├── colorUtils.js            # HSV 轉 RGBW 演算法函式庫
├── colorUtils.test.js       # 色彩轉換演算法 Jest 單元測試
├── eslint.config.js         # ESLint 程式碼風格規範設定
├── index.js                 # 應用程式進入點、HTTP 伺服器與主排程
├── logger.js                # Winston 結構化日誌模組
├── matterSetup.js           # Matter 節點配置（ExtendedColorLight 裝置端點與儲存管理）
├── spiController.js         # WS2814 NZR 硬體 SPI 控制器抽象層
├── stateManager.js          # 集中式狀態庫與 SSE 廣播管理器
├── package.json             # NPM 套件資訊與相依性清單
├── PLAN.md                  # 硬體驅動與時序驗證藍圖
├── README.md                # 英文技術說明文件
└── README_zh.md             # 繁體中文技術說明文件
```

---

## 快速上手指南

### 環境需求

- NXP FRDM i.MX 91S 開發板，已燒錄 Linux BSP 並配置網路連線。
- 開發主機安裝 Node.js $\ge 18.x$ 並具備 `ssh` / `scp` 連線能力。
- 目標開發板根檔案系統擴展完成：
  ```bash
  resize2fs /dev/mmcblk0p2
  ```

### 專案部署與開發板設定

1. **複製專案庫**：
   ```bash
   git clone https://github.com/Max97k/imx91-rgb-controller.git
   cd imx91-rgb-controller
   ```

2. **部署至目標開發板**：
   ```bash
   # 從開發主機端執行
   scp -r . root@<開發板-IP>:/home/root/imx91-rgb-controller
   ```

3. **於目標板安裝相依套件**：
   ```bash
   ssh root@<開發板-IP>
   cd /home/root/imx91-rgb-controller
   npm install --omit=dev
   ```

### 啟動控制器

手動前台啟動：

```bash
node index.js
```

或設定 systemd 系統服務自動在開機時執行 (`/etc/systemd/system/matter-rgb.service`)：

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

### Matter 配對與控制流程

1. 使用瀏覽器連線至 `http://<開發板-IP>:3000` 開啟儀表板。
2. 畫面顯示 Matter 配對 QR Code 與手動配對碼：
   - **Passcode**: `20202021`
   - **Discriminator**: `3840`
   - **Port**: `5540`
   - **Device Type**: `0x010d` (Extended Color Light)
3. 使用 `chip-tool` 進行測試驗證：
   ```bash
   # 透過 IP 網路進行配對 (Commissioning)
   chip-tool pairing onnetwork 1 20202021

   # 切換開關狀態
   chip-tool onoff toggle 1 1

   # 調整色相 (Hue) 與飽和度 (Saturation)
   chip-tool colorcontrol move-to-hue-and-saturation 180 254 10 0 0 1 1
   ```

---

## API 與遙測介面

本機 HTTP 伺服器運行於埠號 3000，提供以下 REST 與遙測端點：

| 端點 (Endpoint) | HTTP 方法 | 功能說明 | 回應格式 |
| :--- | :--- | :--- | :--- |
| `/` | `GET` | 提供前端儀表板介面 (`public/index.html`) | `text/html` |
| `/api/state` | `GET` | 讀取目前電源、亮度、色相、飽和度與 RGB 數值 | `application/json` |
| `/api/control` | `POST` | 寫入控制參數，承載 JSON 如 `{"power":true,"brightness":200}` | `application/json` |
| `/api/stats` | `GET` | 讀取目標板系統遙測資訊 (`/proc/meminfo`, `/proc/uptime`) | `application/json` |
| `/api/stream` | `GET` | 伺服器發送事件 (SSE) 即時資料推播串流 | `text/event-stream` |

---

## 單元測試與程式碼品質

專案內建 Jest 測試色彩空間換算邏輯，並以 ESLint 規範程式碼風格：

```bash
# 執行單元測試
npm test

# 執行 ESLint 語法檢查
npm run lint

# 程式碼自動格式化
npm run format
```

---

## 商標與法律聲明

- **NXP®** 與 **i.MX®** 及相關標誌為 NXP B.V. 之註冊商標。
- **Arm®** 與 **Cortex®** 為 Arm Limited（或其子公司）在美國及／或其他地區之註冊商標。
- **Matter™** 及相關標章為 Connectivity Standards Alliance (CSA) 之商標。
- 本專案提及之所有其他商標與智慧財產權皆歸其法定所有權人所有。本專案為開放原始碼獨立開發專案，非由 NXP B.V. 或 CSA 官方贊助或直接維護。
