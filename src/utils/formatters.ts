export function formatRupiah(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(val: number): string {
  if (isNaN(val) || val === null || val === undefined) return '0';
  return new Intl.NumberFormat('id-ID').format(val);
}

export function formatDateTime(timestamp: number | string): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateOnly(timestamp: number | string): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Normalizes an Indonesian phone number and creates a direct WhatsApp API URL
 */
export function formatWhatsAppUrl(rawPhone: string, message: string): string {
  let cleaned = rawPhone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  } else if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  return `https://api.whatsapp.com/send?phone=${cleaned}&text=${encodeURIComponent(message)}`;
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV/${year}${month}${day}/${rand}`;
}

export function generatePONumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(100 + Math.random() * 900);
  return `PO/${year}${month}/${rand}`;
}
