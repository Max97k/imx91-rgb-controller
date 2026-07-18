import { MatterServer } from '@project-chip/matter-node.js';
import { StorageBackendMemory } from '@project-chip/matter-node.js/storage';
import { StorageManager } from '@project-chip/matter.js/storage';
import { CommissioningServer } from '@project-chip/matter.js';
import { ExtendedColorLightDevice } from '@project-chip/matter-node.js/device';

export async function setupMatter({
  state,
  refreshColor,
  applyGpio,
  broadcast,
  stateSnapshot,
}) {
  console.log('[Matter] Initializing...');

  const storageManager = new StorageManager(new StorageBackendMemory());
  await storageManager.initialize();

  const matterServer = new MatterServer(storageManager);

  const lightDevice = new ExtendedColorLightDevice();

  lightDevice.addOnOffListener((value) => {
    state.power = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Power → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  lightDevice.addCurrentLevelListener((value) => {
    state.brightness = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Brightness → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  lightDevice.addCurrentHueListener((value) => {
    state.hue = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Hue → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  lightDevice.addCurrentSaturationListener((value) => {
    state.saturation = value;
    refreshColor();
    applyGpio();
    console.log(`[Matter] Saturation → ${value}`);
    broadcast({ type: 'state', ...stateSnapshot() });
  });

  const commissioningServer = new CommissioningServer({
    port: 5540,
    deviceName: 'iMX91S RGB Light',
    deviceType: 0x010d,
    passcode: 20202021,
    discriminator: 3840,
    basicInformation: {
      vendorName: 'NXP',
      vendorId: 0xfff1,
      productName: 'FRDM i.MX 91S RGB Light',
      productId: 0x8000,
      nodeLabel: 'RGB LED Light',
      serialNumber: 'IMX91-RGB-001',
    },
  });

  commissioningServer.addDevice(lightDevice);
  matterServer.addCommissioningServer(commissioningServer);

  await matterServer.start();

  const pairingInfo = commissioningServer.getPairingCode();
  state.matterQrCode = pairingInfo.qrPairingCode;
  state.matterManualCode = pairingInfo.manualPairingCode;

  const qrUrl = `https://project-chip.github.io/connectedhomeip/qrcode.html?data=${encodeURIComponent(state.matterQrCode)}`;

  console.log('[Matter] ✓ Ready for pairing!');
  console.log('[Matter] QR code data :', state.matterQrCode);
  console.log('[Matter] Manual code  :', state.matterManualCode);
  console.log('[Matter] QR code URL  :', qrUrl);

  broadcast({
    type: 'qr',
    qrCode: state.matterQrCode,
    manualCode: state.matterManualCode,
    qrUrl,
  });
}
