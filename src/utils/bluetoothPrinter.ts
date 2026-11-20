import { Transaction, StoreSettings } from '../types/pos';
import { formatRupiah, formatDateTime } from './formatters';

export type PaperSize = '58mm' | '80mm';
export type PrinterConnectionType = 'BLUETOOTH' | 'USB';

export interface BluetoothPrinterState {
  isConnected: boolean;
  deviceName?: string;
  isPrinting: boolean;
  error?: string;
}

// Common Bluetooth Serial / Thermal Printer GATT Service & Characteristic UUIDs
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / Common BLE Serial
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Posiflex / Common thermal
];

/**
 * Parses custom 2-line Receipt Footer into clean non-empty lines (max 2 lines)
 */
export function parseReceiptFooterLines(footer?: string): string[] {
  const raw = (footer || '').trim();
  if (!raw) {
    return ['Terima kasih atas kunjungan Anda', 'Barang yang dibeli tidak dapat ditukar'];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
}

/**
 * Encodes text to ESC/POS binary format for thermal receipt printers
 */
export function generateEscPosBytes(
  transaction: Transaction,
  storeSettings: StoreSettings,
  paperSize: PaperSize = '58mm'
): Uint8Array {
  const maxChars = paperSize === '58mm' ? 32 : 48;
  const divider = '-'.repeat(maxChars);
  const doubleDivider = '='.repeat(maxChars);

  const encoder = new TextEncoder();
  const chunks: number[] = [];

  // Helper to push raw bytes
  const push = (...bytes: number[]) => {
    chunks.push(...bytes);
  };

  // Helper to push text
  const pushText = (text: string) => {
    const bytes = encoder.encode(text);
    for (let i = 0; i < bytes.length; i++) {
      chunks.push(bytes[i]);
    }
  };

  // Helper to push a line with newline
  const pushLine = (text: string = '') => {
    pushText(text + '\n');
  };

  // Format two columns: left-aligned text and right-aligned text
  const formatTwoCols = (left: string, right: string, maxLen: number = maxChars): string => {
    const spaceCount = Math.max(1, maxLen - left.length - right.length);
    return left + ' '.repeat(spaceCount) + right;
  };

  // ESC/POS Commands
  const ESC = 0x1b;
  const GS = 0x1d;

  // 1. Initialize printer
  push(ESC, 0x40);

  // 2. Center Align Header
  push(ESC, 0x61, 0x01); // Align center

  // Store Name (Bold + Double Height)
  push(ESC, 0x45, 0x01); // Bold ON
  push(ESC, 0x21, 0x10); // Double height
  pushLine(storeSettings.storeName.toUpperCase());
  push(ESC, 0x21, 0x00); // Standard size
  push(ESC, 0x45, 0x00); // Bold OFF

  if (storeSettings.storeAddress) {
    pushLine(storeSettings.storeAddress);
  }
  if (storeSettings.storePhone) {
    pushLine(`Telp: ${storeSettings.storePhone}`);
  }
  if (storeSettings.storeHeaderReceipt) {
    pushLine(storeSettings.storeHeaderReceipt);
  }

  // Divider
  pushLine(divider);

  // 3. Left Align - Transaction Metadata
  push(ESC, 0x61, 0x00); // Align left
  pushLine(formatTwoCols('No. Nota:', transaction.invoiceNumber));
  pushLine(formatTwoCols('Waktu:', formatDateTime(transaction.timestamp)));
  pushLine(formatTwoCols('Kasir:', transaction.cashierName));
  if (transaction.customerName) {
    pushLine(formatTwoCols('Pelanggan:', transaction.customerName));
  }

  // Divider
  pushLine(divider);

  // 4. Items List
  let totalWithdrawalNominal = 0;
  let totalWithdrawalAdminFee = 0;
  let hasWithdrawalItem = false;

  // Helper to print label + value safely within thermal line width
  const pushTwoColsSafe = (leftLabel: string, rightValue: string, bold: boolean = false) => {
    if (bold) push(ESC, 0x45, 0x01);
    if (leftLabel.length + rightValue.length + 1 <= maxChars) {
      pushLine(formatTwoCols(leftLabel, rightValue));
    } else {
      pushLine(leftLabel);
      pushLine(formatTwoCols('', rightValue));
    }
    if (bold) push(ESC, 0x45, 0x00);
  };

  transaction.items.forEach((item) => {
    const isCashWithdrawalItem =
      Boolean(item.isCashWithdrawal) ||
      (Boolean(item.isQuickSale) && /tarik\s*tunai/i.test(item.productName || ''));
    const qty = Math.max(1, item.quantity || 1);
    const hasCustomBreakdown = isCashWithdrawalItem || (item.adminFee || 0) > 0;

    if (hasCustomBreakdown) {
      const principalPerUnit =
        item.principalAmount !== undefined
          ? Math.max(0, item.principalAmount)
          : isCashWithdrawalItem
          ? Math.max(0, item.costPrice !== undefined ? item.costPrice : item.unitPrice - (item.adminFee || 0))
          : Math.max(0, item.unitPrice - (item.adminFee || 0));
      const adminFeePerUnit =
        item.adminFee !== undefined
          ? Math.max(0, item.adminFee)
          : Math.max(0, item.unitPrice - principalPerUnit);

      const lineNominalTotal = qty * principalPerUnit;
      const lineAdminTotal = qty * adminFeePerUnit;

      if (isCashWithdrawalItem) {
        hasWithdrawalItem = true;
        totalWithdrawalNominal += lineNominalTotal;
      }
      totalWithdrawalAdminFee += lineAdminTotal;

      // Primary item row: 'Tarik Tunai' (or product name) with nominal tarik
      const primaryTitle = isCashWithdrawalItem
        ? item.selectedVariant
          ? `Tarik Tunai (${item.selectedVariant})`
          : 'Tarik Tunai'
        : item.selectedVariant
        ? `${item.productName} (${item.selectedVariant})`
        : item.productName;
      pushLine(primaryTitle);

      const primaryQtyDetail = `  ${qty} ${item.unitName} x ${formatRupiah(principalPerUnit)}`;
      pushTwoColsSafe(primaryQtyDetail, formatRupiah(lineNominalTotal));

      // Separate line for Biaya Admin
      const adminQtyDetail = `  Biaya Admin${qty > 1 ? ` (${qty}x)` : ''}`;
      pushTwoColsSafe(adminQtyDetail, formatRupiah(lineAdminTotal));
    } else {
      // Standard catalog / service product row
      const displayName = item.selectedVariant ? `${item.productName} (${item.selectedVariant})` : item.productName;
      pushLine(displayName);

      const leftDetail = `  ${item.quantity} ${item.unitName} x ${formatRupiah(item.unitPrice)}`;
      const rightTotal = formatRupiah(item.totalAmount);
      pushTwoColsSafe(leftDetail, rightTotal);
    }
  });

  // Divider
  pushLine(divider);

  // 5. Financial Summary
  if (hasWithdrawalItem && totalWithdrawalNominal > 0) {
    pushTwoColsSafe('Total Nominal Tarik:', formatRupiah(totalWithdrawalNominal), true);
  }

  if (totalWithdrawalAdminFee > 0) {
    pushTwoColsSafe('Biaya Admin:', formatRupiah(totalWithdrawalAdminFee));
  }

  pushTwoColsSafe('Subtotal:', formatRupiah(transaction.subtotal));

  if (transaction.pointsDiscountAmount > 0) {
    pushTwoColsSafe(`Diskon Poin (${transaction.pointsUsed} pts):`, `-${formatRupiah(transaction.pointsDiscountAmount)}`);
  }
  if (transaction.discount > 0) {
    pushTwoColsSafe('Diskon Tambahan:', `-${formatRupiah(transaction.discount)}`);
  }

  // Total (Bold)
  pushTwoColsSafe('TOTAL AKHIR:', formatRupiah(transaction.finalAmount), true);

  // Divider
  pushLine(doubleDivider);

  // Payment Details
  pushLine(formatTwoCols('Metode Pembayaran:', transaction.paymentMethod.replace('_', ' ')));

  if (transaction.paymentMethod === 'CASH') {
    pushLine(formatTwoCols('Bayar Tunai:', formatRupiah(transaction.cashPaid || transaction.finalAmount)));
    pushLine(formatTwoCols('Kembalian:', formatRupiah(transaction.cashChange || 0)));
  } else if (transaction.paymentMethod === 'PIUTANG') {
    push(ESC, 0x45, 0x01); // Bold ON
    pushLine(formatTwoCols('Status Piutang:', 'BELUM LUNAS'));
    if (transaction.dueDate) {
      pushLine(formatTwoCols('Jatuh Tempo:', transaction.dueDate));
    }
    push(ESC, 0x45, 0x00); // Bold OFF
  }

  if (transaction.pointsEarned > 0) {
    pushLine(formatTwoCols('Poin Diperoleh:', `+${transaction.pointsEarned} Pts`));
  }

  // Divider
  pushLine(divider);

  // 6. Footer (Center Align - up to 2 custom lines)
  push(ESC, 0x61, 0x01); // Align center
  const footerLines = parseReceiptFooterLines(storeSettings.storeFooterReceipt);
  footerLines.forEach((line) => {
    pushLine(line);
  });

  // Paper Feed (5 blank lines for tear bar clearance)
  push(ESC, 0x64, 0x05); // Feed 5 lines

  // Cut Paper (GS V 0) when supported / enabled (typically 80mm or auto-cut enabled)
  if ((storeSettings.printerAutoCut ?? (paperSize === '80mm')) && paperSize === '80mm') {
    push(GS, 0x56, 0x42, 0x00);
  } else if (storeSettings.printerAutoCut === true && paperSize === '58mm') {
    push(GS, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(chunks);
}

/**
 * Error thrown when browser iframe Permissions-Policy blocks Web Bluetooth / WebUSB access
 */
export class PrinterPolicyError extends Error {
  public readonly isPolicyBlocked = true;
  public readonly feature: 'bluetooth' | 'usb';

  constructor(feature: 'bluetooth' | 'usb', message?: string) {
    super(
      message ||
        (feature === 'bluetooth'
          ? 'Akses langsung Web Bluetooth dibatasi oleh kebijakan iframe/preview browser. Buka aplikasi di tab browser penuh untuk pairing Bluetooth langsung, atau gunakan RawBT / Driver Sistem.'
          : 'Akses langsung WebUSB dibatasi oleh kebijakan iframe/preview browser. Buka aplikasi di tab browser penuh untuk akses WebUSB langsung, atau cetak via Driver USB Sistem.')
    );
    this.name = 'PrinterPolicyError';
    this.feature = feature;
  }
}

export function isPrinterPolicyError(err: unknown): boolean {
  if (!err) return false;
  if ((err as any).isPolicyBlocked === true || (err as any).name === 'PrinterPolicyError') {
    return true;
  }
  const msg = String((err as any)?.message || err).toLowerCase();
  const name = String((err as any)?.name || '').toLowerCase();
  return (
    name === 'securityerror' ||
    msg.includes('permissions policy') ||
    msg.includes('feature policy') ||
    msg.includes('disallowed by permissions')
  );
}

export function isInsideRestrictedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Checks if the Web Bluetooth API is supported in current browser/tablet
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Checks whether Web Bluetooth is allowed by the current Permissions-Policy (e.g. iframe allow attribute)
 */
export function isBluetoothAllowedByPolicy(): boolean {
  if (!isWebBluetoothSupported()) return false;
  if (typeof document !== 'undefined') {
    const policy = (document as any).permissionsPolicy || (document as any).featurePolicy;
    if (policy && typeof policy.allowsFeature === 'function') {
      try {
        return Boolean(policy.allowsFeature('bluetooth'));
      } catch {
        // Fallback if policy API throws
      }
    }
  }
  return true;
}

/**
 * Checks whether WebUSB is allowed by the current Permissions-Policy
 */
export function isUsbAllowedByPolicy(): boolean {
  if (!isWebUsbSupported()) return false;
  if (typeof document !== 'undefined') {
    const policy = (document as any).permissionsPolicy || (document as any).featurePolicy;
    if (policy && typeof policy.allowsFeature === 'function') {
      try {
        return Boolean(policy.allowsFeature('usb'));
      } catch {
        // Fallback if policy API throws
      }
    }
  }
  return true;
}

// Track active Bluetooth connection state in memory
let activeBluetoothDevice: any = null;
let activeCharacteristic: any = null;

/**
 * Discovers a writable GATT characteristic from a connected Bluetooth GATT server
 */
async function findWritableCharacteristic(server: any): Promise<any> {
  let writeChar: any = null;

  for (const serviceUuid of PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          writeChar = char;
          break;
        }
      }
      if (writeChar) break;
    } catch {
      // Continue checking next service
    }
  }

  // If standard UUIDs failed, try discovering any writable characteristic
  if (!writeChar) {
    try {
      const services = await server.getPrimaryServices();
      for (const s of services) {
        const chars = await s.getCharacteristics();
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            break;
          }
        }
        if (writeChar) break;
      }
    } catch (err: any) {
      console.warn('Fallback GATT discovery error:', err);
    }
  }

  return writeChar;
}

/**
 * Attempts to silently reconnect to a previously permitted saved Bluetooth printer
 * via navigator.bluetooth.getDevices() without triggering a browser pairing dialog.
 */
export async function reconnectSavedBluetoothDevice(
  preferredDeviceName?: string
): Promise<{ name: string } | null> {
  if (!isWebBluetoothSupported() || !isBluetoothAllowedByPolicy()) {
    return null;
  }

  const nav = navigator as any;
  if (!nav.bluetooth || typeof nav.bluetooth.getDevices !== 'function') {
    return null;
  }

  try {
    const devices: any[] = await nav.bluetooth.getDevices();
    if (!Array.isArray(devices) || devices.length === 0) {
      return null;
    }

    const normalizedPref = (preferredDeviceName || '').trim().toLowerCase();
    const sortedDevices = [...devices].sort((a, b) => {
      if (!normalizedPref) return 0;
      const aName = String(a?.name || '').toLowerCase();
      const bName = String(b?.name || '').toLowerCase();
      const aExact = aName === normalizedPref ? 2 : aName.includes(normalizedPref) ? 1 : 0;
      const bExact = bName === normalizedPref ? 2 : bName.includes(normalizedPref) ? 1 : 0;
      return bExact - aExact;
    });

    for (const device of sortedDevices) {
      if (!device?.gatt) continue;
      if (normalizedPref) {
        const devName = String(device?.name || '').toLowerCase();
        if (!devName || (!devName.includes(normalizedPref) && !normalizedPref.includes(devName))) {
          // Only try non-matching devices if there was no match at all? Better to skip if user explicitly saved another printer name, unless only 1 permitted device exists.
          if (sortedDevices.length > 1) continue;
        }
      }

      try {
        const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
        const writeChar = await findWritableCharacteristic(server);
        if (writeChar) {
          activeBluetoothDevice = device;
          activeCharacteristic = writeChar;
          return { name: device.name || preferredDeviceName || 'Printer Bluetooth' };
        }
      } catch {
        // Device unreachable / powered off; continue checking next saved device
      }
    }
  } catch (err) {
    if (isPrinterPolicyError(err)) {
      throw new PrinterPolicyError('bluetooth');
    }
  }

  return null;
}

/**
 * Connects directly to a Bluetooth thermal printer via Web Bluetooth API
 */
export async function connectBluetoothDevice(): Promise<{ name: string }> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth tidak didukung pada browser ini. Gunakan Google Chrome di Android/Desktop atau cetak via RawBT / Driver Sistem.');
  }

  if (!isBluetoothAllowedByPolicy()) {
    throw new PrinterPolicyError('bluetooth');
  }

  const nav = navigator as any;

  // Request Bluetooth Device (catch Permissions-Policy SecurityError gracefully)
  let device: any;
  try {
    device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });
  } catch (err: any) {
    if (isPrinterPolicyError(err)) {
      throw new PrinterPolicyError('bluetooth');
    }
    throw err;
  }

  if (!device.gatt) {
    throw new Error('Perangkat Bluetooth tidak memiliki GATT server.');
  }

  const server = await device.gatt.connect();
  const writeChar = await findWritableCharacteristic(server);

  if (!writeChar) {
    throw new Error('Tidak ditemukan karakteristik cetak pada printer Bluetooth yang dipilih.');
  }

  activeBluetoothDevice = device;
  activeCharacteristic = writeChar;

  return { name: device.name || 'Printer Bluetooth' };
}

/**
 * Sends ESC/POS byte commands in chunks to the connected Bluetooth thermal printer.
 * Automatically attempts silent reconnection to the saved Bluetooth printer before prompting.
 */
export async function printDirectBluetooth(
  transaction: Transaction,
  storeSettings: StoreSettings,
  paperSize: PaperSize = '58mm'
): Promise<void> {
  if (!activeCharacteristic || !activeBluetoothDevice?.gatt?.connected) {
    const reconnected = await reconnectSavedBluetoothDevice(storeSettings.printerDeviceName);
    if (!reconnected) {
      await connectBluetoothDevice();
    }
  }

  if (!activeCharacteristic) {
    throw new Error('Printer Bluetooth belum terhubung.');
  }

  const data = generateEscPosBytes(transaction, storeSettings, paperSize);

  // Send data in chunks of 64 bytes with 25ms delay to prevent buffer overflow on thermal microcontrollers
  const chunkSize = 64;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    if (activeCharacteristic.writeValueWithoutResponse) {
      await activeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await activeCharacteristic.writeValue(chunk);
    }
    // Small delay between packets
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Creates a RawBT / Bluetooth Print helper URI for instant mobile thermal printing
 */
export function openRawBtPrint(
  transaction: Transaction,
  storeSettings: StoreSettings,
  paperSize: PaperSize = '58mm'
): void {
  const bytes = generateEscPosBytes(transaction, storeSettings, paperSize);
  
  // Convert Uint8Array to binary string
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Open RawBT intent URL
  const rawBtUrl = `rawbt:data:application/octet-stream;base64,${base64}`;
  window.location.href = rawBtUrl;
}

/**
 * Checks if WebUSB API is supported in current browser/tablet
 */
export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

// Track active USB connection state in memory
let activeUsbDevice: any = null;
let activeUsbInterfaceNumber: number | null = null;
let activeUsbEndpointNumber: number | null = null;

/**
 * Connects directly to a USB thermal printer via WebUSB API
 */
export async function connectUsbDevice(): Promise<{ name: string; vendorId?: number; productId?: number }> {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB tidak didukung pada browser ini. Gunakan Google Chrome/Edge atau cetak via Driver USB Sistem.');
  }

  if (!isUsbAllowedByPolicy()) {
    throw new PrinterPolicyError('usb');
  }

  const nav = navigator as any;
  let device: any;
  try {
    device = await nav.usb.requestDevice({ filters: [] });
  } catch (err: any) {
    if (isPrinterPolicyError(err)) {
      throw new PrinterPolicyError('usb');
    }
    throw err;
  }

  await device.open();
  if (device.configuration === null && device.configurations?.length > 0) {
    await device.selectConfiguration(device.configurations[0].configurationValue);
  }

  let targetInterface: number | null = null;
  let targetEndpoint: number | null = null;

  const interfaces = device.configuration?.interfaces || [];
  // Prefer Printer Class (0x07), then fallback to any interface with bulk OUT endpoint
  const sortedInterfaces = [...interfaces].sort((a: any, b: any) => {
    const aClass = a.alternates?.[0]?.interfaceClass === 0x07 ? 0 : 1;
    const bClass = b.alternates?.[0]?.interfaceClass === 0x07 ? 0 : 1;
    return aClass - bClass;
  });

  for (const iface of sortedInterfaces) {
    for (const alt of iface.alternates || []) {
      const outEndpoint = (alt.endpoints || []).find(
        (ep: any) => ep.direction === 'out' && ep.type === 'bulk'
      ) || (alt.endpoints || []).find((ep: any) => ep.direction === 'out');

      if (outEndpoint) {
        targetInterface = iface.interfaceNumber;
        targetEndpoint = outEndpoint.endpointNumber;
        break;
      }
    }
    if (targetInterface !== null && targetEndpoint !== null) break;
  }

  if (targetInterface === null || targetEndpoint === null) {
    throw new Error('Endpoint cetak OUT tidak ditemukan pada perangkat USB yang dipilih.');
  }

  await device.claimInterface(targetInterface);

  activeUsbDevice = device;
  activeUsbInterfaceNumber = targetInterface;
  activeUsbEndpointNumber = targetEndpoint;

  const deviceName = device.productName || device.manufacturerName || `USB Printer (${device.vendorId}:${device.productId})`;
  return {
    name: deviceName,
    vendorId: device.vendorId,
    productId: device.productId,
  };
}

/**
 * Sends ESC/POS byte commands directly to a connected USB thermal printer via WebUSB
 */
export async function printDirectUsb(
  transaction: Transaction,
  storeSettings: StoreSettings,
  paperSize: PaperSize = '58mm'
): Promise<void> {
  if (!activeUsbDevice || !activeUsbDevice.opened || activeUsbEndpointNumber === null) {
    await connectUsbDevice();
  }

  if (!activeUsbDevice || activeUsbEndpointNumber === null) {
    throw new Error('Printer USB belum terhubung.');
  }

  if (activeUsbInterfaceNumber !== null) {
    try {
      await activeUsbDevice.claimInterface(activeUsbInterfaceNumber);
    } catch {
      // Interface may already be claimed
    }
  }

  const data = generateEscPosBytes(transaction, storeSettings, paperSize);
  await activeUsbDevice.transferOut(activeUsbEndpointNumber, data);
}

/**
 * Returns active Bluetooth and USB printer connection state in memory
 */
export function getPrinterConnectionInfo(): {
  bluetoothConnected: boolean;
  bluetoothDeviceName: string | null;
  usbConnected: boolean;
  usbDeviceName: string | null;
} {
  return {
    bluetoothConnected: Boolean(activeBluetoothDevice?.gatt?.connected && activeCharacteristic),
    bluetoothDeviceName: activeBluetoothDevice?.name || null,
    usbConnected: Boolean(activeUsbDevice?.opened && activeUsbEndpointNumber !== null),
    usbDeviceName: activeUsbDevice
      ? activeUsbDevice.productName || activeUsbDevice.manufacturerName || 'USB Thermal Printer'
      : null,
  };
}

/**
 * Creates a realistic dummy receipt transaction for printer connection & paper-width Test Print verification
 */
export function createDummyTestTransaction(storeSettings: StoreSettings): Transaction {
  const now = Date.now();
  const modeLabel = (storeSettings.printerConnectionType || 'BLUETOOTH').toUpperCase();
  const paperLabel = storeSettings.printerPaperWidth || '58mm';

  return {
    id: `tx_test_${now}`,
    invoiceNumber: `TEST/${modeLabel}/${paperLabel}`,
    timestamp: now,
    cashierId: 'test_admin',
    cashierName: 'Admin (Test Print)',
    cashierRole: 'ADMIN',
    customerName: 'Pelanggan Uji Coba',
    customerCategory: 'MEMBER',
    membershipDiscountPercent: 0,
    membershipDiscountAmount: 0,
    subtotal: 41500,
    discount: 0,
    pointsUsed: 0,
    pointsDiscountAmount: 0,
    pointsEarned: 4,
    finalAmount: 41500,
    paymentMethod: 'CASH',
    paymentStatus: 'LUNAS',
    cashPaid: 50000,
    cashChange: 8500,
    items: [
      {
        productId: 'test_prod_1',
        productName: 'Contoh Produk A (Test)',
        unitName: 'PCS',
        conversionFactor: 1,
        quantity: 1,
        unitPrice: 38000,
        costPrice: 34000,
        totalAmount: 38000,
      },
      {
        productId: 'test_prod_2',
        productName: 'Contoh Produk B (Test)',
        unitName: 'BKS',
        conversionFactor: 1,
        quantity: 1,
        unitPrice: 3500,
        costPrice: 2900,
        totalAmount: 3500,
      },
    ],
  };
}

