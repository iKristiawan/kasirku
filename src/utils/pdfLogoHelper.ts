import jsPDF from 'jspdf';
import { StoreSettings } from '../types/pos';

export interface PdfLogoAsset {
  pngDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Normalizes SVG data URIs (`data:image/svg+xml;utf8,<svg ...>`) so browsers
 * decode characters like `#`, `%`, or newlines cleanly inside an HTMLImageElement.
 */
export function normalizeLogoDataUrl(rawSrc: string): string {
  const trimmed = (rawSrc || '').trim();
  if (!trimmed) return '';

  if (/^data:image\/svg\+xml/i.test(trimmed)) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx !== -1) {
      const header = trimmed.slice(0, commaIdx);
      const body = trimmed.slice(commaIdx + 1);
      if (/;base64/i.test(header)) {
        return trimmed;
      }
      let decoded = body;
      try {
        if (/%[0-9A-Fa-f]{2}/.test(body)) {
          decoded = decodeURIComponent(body);
        }
      } catch {
        decoded = body;
      }
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(decoded)}`;
    }
  }

  return trimmed;
}

const cachedRasterizedLogos = new Map<string, PdfLogoAsset | null>();

/**
 * Converts a store logo (SVG data URL, PNG/JPEG base64, or remote image URL)
 * into a crisp PNG data URL compatible with jsPDF.addImage().
 * Never throws; returns null on Node/SSR or if image loading fails/times out.
 */
export async function resolvePdfLogoAsset(
  storeLogo?: string,
  timeoutMs = 1800
): Promise<PdfLogoAsset | null> {
  const raw = (storeLogo || '').trim();
  if (!raw || typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }

  if (cachedRasterizedLogos.has(raw)) {
    return cachedRasterizedLogos.get(raw) ?? null;
  }

  const normalizedSrc = normalizeLogoDataUrl(raw);
  if (!normalizedSrc) return null;

  const asset = await new Promise<PdfLogoAsset | null>((resolve) => {
    let settled = false;
    const finish = (result: PdfLogoAsset | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const img = new Image();
    if (!normalizedSrc.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const natW = Math.max(1, img.naturalWidth || 160);
        const natH = Math.max(1, img.naturalHeight || 50);
        const scale = Math.min(360 / natW, 140 / natH, 3);
        const canvasW = Math.max(1, Math.round(natW * Math.max(1, scale)));
        const canvasH = Math.max(1, Math.round(natH * Math.max(1, scale)));

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.drawImage(img, 0, 0, canvasW, canvasH);

        const pngDataUrl = canvas.toDataURL('image/png');
        finish({
          pngDataUrl,
          naturalWidth: natW,
          naturalHeight: natH,
        });
      } catch {
        finish(null);
      }
    };

    img.onerror = () => finish(null);
    img.src = normalizedSrc;
  });

  if (cachedRasterizedLogos.size > 20) {
    cachedRasterizedLogos.clear();
  }
  cachedRasterizedLogos.set(raw, asset);
  return asset;
}

export interface DrawPdfHeaderOptions {
  doc: jsPDF;
  title: string;
  subtitle?: string;
  contactLine?: string;
  rightTopText?: string;
  rightBottomText?: string;
  storeSettings?: StoreSettings;
  preloadedLogo?: PdfLogoAsset | null;
  bannerColor?: [number, number, number];
  accentStripeColor?: [number, number, number];
  bannerHeight?: number;
}

/**
 * Draws a crisp, print-ready store header banner with the Store Logo card on the left,
 * title & store identity beside it, and right-aligned print metadata.
 */
export async function drawPdfStoreHeader(options: DrawPdfHeaderOptions): Promise<{
  bannerHeight: number;
  logoAsset: PdfLogoAsset | null;
}> {
  const {
    doc,
    title,
    subtitle,
    contactLine,
    rightTopText,
    rightBottomText,
    storeSettings,
    preloadedLogo,
    bannerColor = [15, 23, 42],
    accentStripeColor = [2, 132, 199],
    bannerHeight = 28,
  } = options;

  const pageWidth = doc.internal.pageSize.getWidth();
  const logoAsset =
    preloadedLogo !== undefined
      ? preloadedLogo
      : await resolvePdfLogoAsset(storeSettings?.storeLogo);

  // Header background band
  doc.setFillColor(bannerColor[0], bannerColor[1], bannerColor[2]);
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  // Subtle bottom accent rule
  doc.setFillColor(accentStripeColor[0], accentStripeColor[1], accentStripeColor[2]);
  doc.rect(0, bannerHeight - 1.2, pageWidth, 1.2, 'F');

  let textStartX = 14;

  if (logoAsset) {
    const boxX = 12;
    const boxY = 3.8;
    const boxW = 32;
    const boxH = Math.max(12, bannerHeight - 9);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(boxX, boxY, boxW, boxH, 1.8, 1.8, 'FD');

    const padX = 1.8;
    const padY = 1.4;
    const availW = boxW - padX * 2;
    const availH = boxH - padY * 2;
    const ratio = logoAsset.naturalWidth / Math.max(1, logoAsset.naturalHeight);

    let drawW = availW;
    let drawH = drawW / ratio;
    if (drawH > availH) {
      drawH = availH;
      drawW = drawH * ratio;
    }

    const imgX = boxX + (boxW - drawW) / 2;
    const imgY = boxY + (boxH - drawH) / 2;
    try {
      doc.addImage(logoAsset.pngDataUrl, 'PNG', imgX, imgY, drawW, drawH, undefined, 'FAST');
    } catch {
      // Safe fallback if jsPDF rejects image payload
    }

    textStartX = boxX + boxW + 4.5;
  } else {
    const rawName = (storeSettings?.storeName || subtitle || title || 'KK').trim();
    const words = rawName.split(/\s+/).filter(Boolean);
    const initials =
      words.length >= 2
        ? `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase()
        : rawName.slice(0, 2).toUpperCase();

    const emblemX = 14;
    const emblemY = 4.4;
    const emblemSize = Math.max(15, bannerHeight - 10);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(emblemX, emblemY, emblemSize, emblemSize, 2.2, 2.2, 'FD');

    doc.setFillColor(accentStripeColor[0], accentStripeColor[1], accentStripeColor[2]);
    doc.roundedRect(emblemX + 1.4, emblemY + 1.4, emblemSize - 2.8, emblemSize - 2.8, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(initials || 'KK', emblemX + emblemSize / 2, emblemY + emblemSize / 2 + 1.4, {
      align: 'center',
    });

    textStartX = emblemX + emblemSize + 4.5;
  }

  // Right-aligned metadata
  const rightMaxWidth = pageWidth >= 260 ? 96 : 68;
  const rightEdgeX = pageWidth - 14;

  if (rightTopText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(226, 232, 240);
    doc.text(rightTopText, rightEdgeX, 9.5, { align: 'right', maxWidth: rightMaxWidth });
  }
  if (rightBottomText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(186, 230, 253);
    doc.text(rightBottomText, rightEdgeX, 15.2, { align: 'right', maxWidth: rightMaxWidth });
  }

  // Left-aligned title, store subtitle, contact
  const hasRightBlock = Boolean(rightTopText || rightBottomText);
  const leftMaxWidth = hasRightBlock
    ? pageWidth - textStartX - rightMaxWidth - 18
    : pageWidth - textStartX - 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(pageWidth >= 260 ? 13.5 : 12.2);
  doc.setTextColor(255, 255, 255);
  doc.text(title, textStartX, 10, { maxWidth: Math.max(60, leftMaxWidth) });

  if (subtitle) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(186, 230, 253);
    doc.text(subtitle, textStartX, 16.2, { maxWidth: Math.max(60, leftMaxWidth + 24) });
  }

  if (contactLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(203, 213, 225);
    doc.text(contactLine, textStartX, 21.8, { maxWidth: pageWidth - textStartX - 14 });
  }

  return { bannerHeight, logoAsset };
}

/**
 * Adds consistent page footers across every page of a jsPDF document.
 */
export function addStandardPdfFooters(doc: jsPDF, leftFooterText: string) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const lines = (leftFooterText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(100, 116, 139);
    if (lines.length > 1) {
      doc.text(lines[0], 14, pageHeight - 9.2);
      doc.text(lines[1], 14, pageHeight - 5.5);
    } else if (lines.length === 1) {
      doc.text(lines[0], 14, pageHeight - 7.5);
    }

    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - 14, pageHeight - 7.5, { align: 'right' });
  }
}

export function buildStoreContactLine(storeSettings?: StoreSettings): string {
  if (!storeSettings) return '';
  return [
    storeSettings.storeAddress,
    storeSettings.storePhone ? `Telp/WA: ${storeSettings.storePhone}` : '',
  ]
    .filter(Boolean)
    .join('  •  ');
}
