import { Transaction, StoreSettings } from '../types/pos';
import { formatRupiah, formatDateTime } from './formatters';

export type PaperSize = '58mm' | '80mm';

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
  transaction.items.forEach((item) => {
    // Product Name (can wrap if long)
    pushLine(item.productName);

    // Details: "  2 PCS x Rp 15.000" and total "Rp 30.000"
    const leftDetail = `  ${item.quantity} ${item.unitName} x ${formatRupiah(item.unitPrice)}`;
    const rightTotal = formatRupiah(item.totalAmount);
    pushLine(formatTwoCols(leftDetail, rightTotal));
  });

  // Divider
  pushLine(divider);

  // 5. Financial Summary
  pushLine(formatTwoCols('Subtotal:', formatRupiah(transaction.subtotal)));

  if (transaction.pointsDiscountAmount > 0) {
    pushLine(formatTwoCols(`Diskon Poin (${transaction.pointsUsed} pts):`, `-${formatRupiah(transaction.pointsDiscountAmount)}`));
  }
  if (transaction.discount > 0) {
    pushLine(formatTwoCols('Diskon Tambahan:', `-${formatRupiah(transaction.discount)}`));
  }

  // Total (Bold)
  push(ESC, 0x45, 0x01); // Bold ON
  pushLine(formatTwoCols('TOTAL AKHIR:', formatRupiah(transaction.finalAmount)));
  push(ESC, 0x45, 0x00); // Bold OFF

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

  // 6. Footer (Center Align)
  push(ESC, 0x61, 0x01); // Align center
  pushLine(storeSettings.storeFooterReceipt || 'Terima kasih atas kunjungan Anda');
  pushLine('Barang yang dibeli tidak dapat ditukar');

  // Paper Feed (5 blank lines for tear bar clearance)
  push(ESC, 0x64, 0x05); // Feed 5 lines

  // Cut Paper (GS V 0) for 80mm printers
  if (paperSize === '80mm') {
    push(GS, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(chunks);
}

/**
 * Checks if the Web Bluetooth API is supported in current browser/tablet
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

// Track active Bluetooth connection state in memory
let activeBluetoothDevice: any = null;
let activeCharacteristic: any = null;

/**
 * Connects directly to a Bluetooth thermal printer via Web Bluetooth API
 */
export async function connectBluetoothDevice(): Promise<{ name: string }> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth tidak didukung pada browser ini. Gunakan Google Chrome di Android atau tombol Cetak Struk (System Print).');
  }

  const nav = navigator as any;

  // Request Bluetooth Device
  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });

  if (!device.gatt) {
    throw new Error('Perangkat Bluetooth tidak memiliki GATT server.');
  }

  const server = await device.gatt.connect();

  // Try finding writable characteristic across common services
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

  if (!writeChar) {
    throw new Error('Tidak ditemukan karakteristik cetak pada printer Bluetooth yang dipilih.');
  }

  activeBluetoothDevice = device;
  activeCharacteristic = writeChar;

  return { name: device.name || 'Printer Bluetooth' };
}

/**
 * Sends ESC/POS byte commands in chunks to the connected Bluetooth thermal printer
 */
export async function printDirectBluetooth(
  transaction: Transaction,
  storeSettings: StoreSettings,
  paperSize: PaperSize = '58mm'
): Promise<void> {
  if (!activeCharacteristic || !activeBluetoothDevice?.gatt?.connected) {
    await connectBluetoothDevice();
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
