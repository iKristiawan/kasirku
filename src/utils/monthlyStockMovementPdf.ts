import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Product,
  RestockOrder,
  StockOpnameRecord,
  StoreSettings,
  Transaction,
} from '../types/pos';
import { formatDateTime, formatNumber, formatRupiah } from './formatters';
import { getItemFifoCogs } from './fifoUtils';
import { getLocalDateKey } from './adminLowStockAlert';

const MONTH_NAMES_FULL_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export interface MonthlyStockMovementProductRow {
  productId: string;
  barcode: string;
  productName: string;
  category: string;
  baseUnit: string;
  costPrice: number;
  stockInUnits: number;
  stockInValue: number;
  poCount: number;
  stockOutUnits: number;
  stockOutCogs: number;
  stockOutRevenue: number;
  salesTxCount: number;
  opnameAdjustmentUnits: number;
  opnamePositiveUnits: number;
  opnameNegativeUnits: number;
  opnameAdjustmentValue: number;
  opnameCount: number;
  netMovementUnits: number;
  estimatedOpeningStock: number;
  currentEndingStock: number;
  endingStockValuation: number;
  hasMovement: boolean;
}

export interface MonthlyCategoryMovementSummary {
  category: string;
  skuCount: number;
  stockInUnits: number;
  stockOutUnits: number;
  opnameAdjustmentUnits: number;
  netMovementUnits: number;
  endingStockValuation: number;
}

export interface MonthlyStockMovementSummaryData {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  isCurrentCalendarMonth: boolean;
  totalSkuCount: number;
  activeMovedSkuCount: number;
  totalStockInUnits: number;
  totalStockInValue: number;
  totalCompletedPoCount: number;
  totalStockOutUnits: number;
  totalStockOutCogs: number;
  totalStockOutRevenue: number;
  totalSalesTxCount: number;
  totalOpnameSessionCount: number;
  totalOpnamePositiveUnits: number;
  totalOpnameNegativeUnits: number;
  totalOpnameNetUnits: number;
  totalOpnameNetValue: number;
  totalNetMovementUnits: number;
  totalEndingValuation: number;
  rows: MonthlyStockMovementProductRow[];
  categorySummary: MonthlyCategoryMovementSummary[];
  monthOpnames: StockOpnameRecord[];
}

export function formatMonthKeyLabel(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [yStr, mStr] = monthKey.split('-');
  const mIdx = parseInt(mStr, 10) - 1;
  return `${MONTH_NAMES_FULL_ID[mIdx] || mStr} ${yStr}`;
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(parseInt(yStr, 10) || 2026, (parseInt(mStr, 10) || 1) - 1 + deltaMonths, 1);
  return getCurrentMonthKey(d);
}

export function computeMonthlyStockMovementData(params: {
  monthKey: string;
  products: Product[];
  purchases: RestockOrder[];
  transactions: Transaction[];
  stockOpnames: StockOpnameRecord[];
  categoryFilter?: string;
}): MonthlyStockMovementSummaryData {
  const {
    monthKey,
    products = [],
    purchases = [],
    transactions = [],
    stockOpnames = [],
    categoryFilter = 'SEMUA',
  } = params;

  const physicalProducts = products.filter((p) => {
    if ((p.productType || 'BARANG') === 'JASA') return false;
    if (categoryFilter && categoryFilter !== 'SEMUA' && p.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const productMap = new Map<string, Product>();
  physicalProducts.forEach((p) => productMap.set(p.id, p));

  const rowMap = new Map<string, MonthlyStockMovementProductRow>();
  physicalProducts.forEach((p) => {
    rowMap.set(p.id, {
      productId: p.id,
      barcode: p.sku || p.barcode || '-',
      productName: p.name,
      category: p.category || 'Umum',
      baseUnit: p.baseUnit || 'PCS',
      costPrice: p.costPrice || 0,
      stockInUnits: 0,
      stockInValue: 0,
      poCount: 0,
      stockOutUnits: 0,
      stockOutCogs: 0,
      stockOutRevenue: 0,
      salesTxCount: 0,
      opnameAdjustmentUnits: 0,
      opnamePositiveUnits: 0,
      opnameNegativeUnits: 0,
      opnameAdjustmentValue: 0,
      opnameCount: 0,
      netMovementUnits: 0,
      estimatedOpeningStock: p.stockInBaseUnit,
      currentEndingStock: p.stockInBaseUnit,
      endingStockValuation: (p.stockInBaseUnit || 0) * (p.costPrice || 0),
      hasMovement: false,
    });
  });

  const monthPurchases = purchases.filter((po) => {
    if (po.status !== 'SELESAI') return false;
    const dateKey =
      po.date && /^\d{4}-\d{2}/.test(po.date)
        ? po.date.slice(0, 7)
        : po.createdAt
        ? getLocalDateKey(new Date(po.createdAt)).slice(0, 7)
        : '';
    return dateKey === monthKey;
  });

  monthPurchases.forEach((po) => {
    const seenProductsInPo = new Set<string>();
    (po.items || []).forEach((item) => {
      const row = rowMap.get(item.productId);
      if (!row) return;
      const units = (item.quantity || 0) * (item.conversionFactor || 1);
      const val =
        typeof item.total === 'number' && item.total > 0
          ? item.total
          : (item.quantity || 0) * (item.costPrice || 0);
      row.stockInUnits += units;
      row.stockInValue += val;
      if (!seenProductsInPo.has(item.productId)) {
        row.poCount += 1;
        seenProductsInPo.add(item.productId);
      }
    });
  });

  const monthTransactions = transactions.filter((tx) => {
    const dateKey = getLocalDateKey(new Date(tx.timestamp)).slice(0, 7);
    return dateKey === monthKey;
  });

  monthTransactions.forEach((tx) => {
    const seenProductsInTx = new Set<string>();
    (tx.items || []).forEach((item) => {
      if (item.isService || item.isQuickSale) return;
      const row = rowMap.get(item.productId);
      if (!row) return;
      const prod = productMap.get(item.productId);
      const units = (item.quantity || 0) * (item.conversionFactor || 1);
      const cogs = getItemFifoCogs(item, prod);

      row.stockOutUnits += units;
      row.stockOutCogs += cogs;
      row.stockOutRevenue += item.totalAmount || 0;
      if (!seenProductsInTx.has(item.productId)) {
        row.salesTxCount += 1;
        seenProductsInTx.add(item.productId);
      }
    });
  });

  const monthOpnames = stockOpnames
    .filter((op) => {
      const dateKey =
        op.date && /^\d{4}-\d{2}/.test(op.date)
          ? op.date.slice(0, 7)
          : getLocalDateKey(new Date(op.timestamp)).slice(0, 7);
      return dateKey === monthKey;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  monthOpnames.forEach((op) => {
    const seenProductsInOp = new Set<string>();
    (op.items || []).forEach((item) => {
      const row = rowMap.get(item.productId);
      if (!row) return;
      const diff = item.difference || 0;
      const diffVal = item.differenceValue || diff * (row.costPrice || item.costPrice || 0);
      row.opnameAdjustmentUnits += diff;
      if (diff > 0) row.opnamePositiveUnits += diff;
      if (diff < 0) row.opnameNegativeUnits += Math.abs(diff);
      row.opnameAdjustmentValue += diffVal;
      if (!seenProductsInOp.has(item.productId)) {
        row.opnameCount += 1;
        seenProductsInOp.add(item.productId);
      }
    });
  });

  let totalStockInUnits = 0;
  let totalStockInValue = 0;
  let totalStockOutUnits = 0;
  let totalStockOutCogs = 0;
  let totalStockOutRevenue = 0;
  let totalOpnamePositiveUnits = 0;
  let totalOpnameNegativeUnits = 0;
  let totalOpnameNetUnits = 0;
  let totalOpnameNetValue = 0;
  let totalNetMovementUnits = 0;
  let totalEndingValuation = 0;
  let activeMovedSkuCount = 0;

  const categoryMap = new Map<string, MonthlyCategoryMovementSummary>();

  const rows: MonthlyStockMovementProductRow[] = Array.from(rowMap.values())
    .map((row) => {
      const net = row.stockInUnits - row.stockOutUnits + row.opnameAdjustmentUnits;
      const hasMovement =
        row.stockInUnits !== 0 ||
        row.stockOutUnits !== 0 ||
        row.opnameAdjustmentUnits !== 0 ||
        row.opnameCount > 0;
      const estimatedOpening = Math.max(0, row.currentEndingStock - net);

      const finalRow: MonthlyStockMovementProductRow = {
        ...row,
        netMovementUnits: net,
        estimatedOpeningStock: estimatedOpening,
        hasMovement,
      };

      if (hasMovement) activeMovedSkuCount += 1;
      totalStockInUnits += finalRow.stockInUnits;
      totalStockInValue += finalRow.stockInValue;
      totalStockOutUnits += finalRow.stockOutUnits;
      totalStockOutCogs += finalRow.stockOutCogs;
      totalStockOutRevenue += finalRow.stockOutRevenue;
      totalOpnamePositiveUnits += finalRow.opnamePositiveUnits;
      totalOpnameNegativeUnits += finalRow.opnameNegativeUnits;
      totalOpnameNetUnits += finalRow.opnameAdjustmentUnits;
      totalOpnameNetValue += finalRow.opnameAdjustmentValue;
      totalNetMovementUnits += finalRow.netMovementUnits;
      totalEndingValuation += finalRow.endingStockValuation;

      const catEntry = categoryMap.get(finalRow.category) || {
        category: finalRow.category,
        skuCount: 0,
        stockInUnits: 0,
        stockOutUnits: 0,
        opnameAdjustmentUnits: 0,
        netMovementUnits: 0,
        endingStockValuation: 0,
      };
      catEntry.skuCount += 1;
      catEntry.stockInUnits += finalRow.stockInUnits;
      catEntry.stockOutUnits += finalRow.stockOutUnits;
      catEntry.opnameAdjustmentUnits += finalRow.opnameAdjustmentUnits;
      catEntry.netMovementUnits += finalRow.netMovementUnits;
      catEntry.endingStockValuation += finalRow.endingStockValuation;
      categoryMap.set(finalRow.category, catEntry);

      return finalRow;
    })
    .sort((a, b) => {
      const activityA = a.stockInUnits + a.stockOutUnits + Math.abs(a.opnameAdjustmentUnits);
      const activityB = b.stockInUnits + b.stockOutUnits + Math.abs(b.opnameAdjustmentUnits);
      if (activityB !== activityA) return activityB - activityA;
      return a.productName.localeCompare(b.productName);
    });

  const categorySummary = Array.from(categoryMap.values()).sort(
    (a, b) =>
      b.stockInUnits +
      b.stockOutUnits -
      (a.stockInUnits + a.stockOutUnits)
  );

  return {
    monthKey,
    monthLabel: formatMonthKeyLabel(monthKey),
    isCurrentCalendarMonth: monthKey === getCurrentMonthKey(),
    totalSkuCount: rows.length,
    activeMovedSkuCount,
    totalStockInUnits,
    totalStockInValue,
    totalCompletedPoCount: monthPurchases.length,
    totalStockOutUnits,
    totalStockOutCogs,
    totalStockOutRevenue,
    totalSalesTxCount: monthTransactions.length,
    totalOpnameSessionCount: monthOpnames.length,
    totalOpnamePositiveUnits,
    totalOpnameNegativeUnits,
    totalOpnameNetUnits,
    totalOpnameNetValue,
    totalNetMovementUnits,
    totalEndingValuation,
    rows,
    categorySummary,
    monthOpnames,
  };
}

export function generateMonthlyStockMovementPdf(params: {
  data: MonthlyStockMovementSummaryData;
  storeSettings?: StoreSettings;
  auditorName?: string;
  categoryFilter?: string;
  onlyWithMovement?: boolean;
}): { doc: jsPDF; filename: string } {
  const {
    data,
    storeSettings,
    auditorName = 'Admin Gudang',
    categoryFilter = 'SEMUA',
    onlyWithMovement = false,
  } = params;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
  const storeAddress = storeSettings?.storeAddress || '';
  const storePhone = storeSettings?.storePhone || '';
  const printedAt = formatDateTime(Date.now());

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`LAPORAN AUDIT PERGERAKAN STOK BULANAN`, 14, 11);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(186, 230, 253);
  doc.text(
    `${storeTitle.toUpperCase()}${storeAddress ? ' • ' + storeAddress : ''}${storePhone ? ' • Telp: ' + storePhone : ''}`,
    14,
    17
  );

  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `Periode Audit: ${data.monthLabel} (${data.monthKey})  |  Filter Kategori: ${categoryFilter}  |  Dicetak: ${printedAt} oleh ${auditorName}`,
    14,
    22.5
  );

  // KPI Audit Summary Grid Table
  const opnameSign = data.totalOpnameNetUnits > 0 ? '+' : '';
  const opnameValSign = data.totalOpnameNetValue > 0 ? '+' : '';
  const netSign = data.totalNetMovementUnits > 0 ? '+' : '';

  autoTable(doc, {
    startY: 30,
    head: [
      [
        'TOTAL STOK MASUK (PO SELESAI)',
        'TOTAL STOK KELUAR (PENJUALAN)',
        'PENYESUAIAN STOCK OPNAME',
        'NETTO PERGERAKAN & VALUASI AKHIR',
      ],
    ],
    body: [
      [
        `+${formatNumber(data.totalStockInUnits)} Unit\n(${formatNumber(data.totalCompletedPoCount)} PO • Nilai ${formatRupiah(data.totalStockInValue)})`,
        `-${formatNumber(data.totalStockOutUnits)} Unit\n(${formatNumber(data.totalSalesTxCount)} Nota • HPP ${formatRupiah(data.totalStockOutCogs)})`,
        `${opnameSign}${formatNumber(data.totalOpnameNetUnits)} Unit (${opnameValSign}${formatRupiah(data.totalOpnameNetValue)})\n(+${formatNumber(data.totalOpnamePositiveUnits)} / -${formatNumber(data.totalOpnameNegativeUnits)} • ${data.totalOpnameSessionCount} Sesi)`,
        `Netto: ${netSign}${formatNumber(data.totalNetMovementUnits)} Unit\nValuasi Saat Ini: ${formatRupiah(data.totalEndingValuation)}`,
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 2.5,
    },
    styles: {
      fontSize: 8.5,
      fontStyle: 'bold',
      textColor: [15, 23, 42],
      cellPadding: 3,
    },
  });

  // Table 1: Detailed SKU Movement Table
  const displayRows = onlyWithMovement ? data.rows.filter((r) => r.hasMovement) : data.rows;
  const rowsToRender = displayRows.length > 0 ? displayRows : data.rows;

  const afterKpiY = ((doc as any).lastAutoTable?.finalY || 50) + 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(
    `1. Rincian Pergerakan Stok Per Produk (${formatNumber(rowsToRender.length)} SKU)`,
    14,
    afterKpiY
  );

  const skuTableBody = rowsToRender.map((r, idx) => {
    const opPrefix = r.opnameAdjustmentUnits > 0 ? '+' : '';
    const netPrefix = r.netMovementUnits > 0 ? '+' : '';
    return [
      String(idx + 1),
      r.barcode,
      r.productName,
      r.category,
      r.stockInUnits > 0 ? `+${formatNumber(r.stockInUnits)}` : '0',
      r.stockOutUnits > 0 ? `-${formatNumber(r.stockOutUnits)}` : '0',
      `${opPrefix}${formatNumber(r.opnameAdjustmentUnits)}`,
      `${netPrefix}${formatNumber(r.netMovementUnits)}`,
      `${formatNumber(r.currentEndingStock)} ${r.baseUnit}`,
      formatRupiah(r.opnameAdjustmentValue),
      formatRupiah(r.endingStockValuation),
    ];
  });

  // Grand total row
  skuTableBody.push([
    '',
    '',
    'TOTAL KESELURUHAN',
    `${formatNumber(rowsToRender.length)} SKU`,
    `+${formatNumber(rowsToRender.reduce((s, r) => s + r.stockInUnits, 0))}`,
    `-${formatNumber(rowsToRender.reduce((s, r) => s + r.stockOutUnits, 0))}`,
    `${opnameSign}${formatNumber(rowsToRender.reduce((s, r) => s + r.opnameAdjustmentUnits, 0))}`,
    `${netSign}${formatNumber(rowsToRender.reduce((s, r) => s + r.netMovementUnits, 0))}`,
    '-',
    formatRupiah(rowsToRender.reduce((s, r) => s + r.opnameAdjustmentValue, 0)),
    formatRupiah(rowsToRender.reduce((s, r) => s + r.endingStockValuation, 0)),
  ]);

  autoTable(doc, {
    startY: afterKpiY + 3,
    head: [
      [
        'No',
        'SKU/Barcode',
        'Nama Produk',
        'Kategori',
        'Masuk (+)',
        'Keluar (-)',
        'Opname (+/-)',
        'Netto Bln',
        'Stok Kini',
        'Nilai Opname',
        'Valuasi Stok',
      ],
    ],
    body: skuTableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontSize: 7.8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7.4,
      cellPadding: 2,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 24 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        if (hookData.row.index === skuTableBody.length - 1) {
          hookData.cell.styles.fillColor = [226, 232, 240];
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.textColor = [15, 23, 42];
        } else {
          const colIdx = hookData.column.index;
          const rawText = String(hookData.cell.raw || '');
          if (colIdx === 4 && rawText.startsWith('+')) {
            hookData.cell.styles.textColor = [5, 150, 105];
            hookData.cell.styles.fontStyle = 'bold';
          }
          if (colIdx === 5 && rawText.startsWith('-')) {
            hookData.cell.styles.textColor = [2, 132, 199];
          }
          if (colIdx === 6 && rawText !== '0') {
            hookData.cell.styles.textColor = rawText.startsWith('-')
              ? [190, 18, 60]
              : [5, 150, 105];
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
  });

  // Table 2: Category Summary Table
  if (data.categorySummary.length > 0) {
    const afterSkuY = ((doc as any).lastAutoTable?.finalY || 90) + 7;
    const catStartY = afterSkuY > pageHeight - 40 ? (() => { doc.addPage(); return 16; })() : afterSkuY;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('2. Rekapitulasi Pergerakan Stok Per Kategori', 14, catStartY);

    autoTable(doc, {
      startY: catStartY + 3,
      head: [
        [
          'Kategori',
          'Jumlah SKU',
          'Total Masuk (+)',
          'Total Keluar (-)',
          'Penyesuaian Opname',
          'Netto Pergerakan',
          'Valuasi Stok Akhir',
        ],
      ],
      body: data.categorySummary.map((cat) => [
        cat.category,
        `${formatNumber(cat.skuCount)} SKU`,
        `+${formatNumber(cat.stockInUnits)}`,
        `-${formatNumber(cat.stockOutUnits)}`,
        `${cat.opnameAdjustmentUnits > 0 ? '+' : ''}${formatNumber(cat.opnameAdjustmentUnits)}`,
        `${cat.netMovementUnits > 0 ? '+' : ''}${formatNumber(cat.netMovementUnits)}`,
        formatRupiah(cat.endingStockValuation),
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7.8,
        cellPadding: 2.2,
      },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // Table 3: Monthly Opname Sessions Audit Log
  if (data.monthOpnames.length > 0) {
    const afterCatY = ((doc as any).lastAutoTable?.finalY || 120) + 7;
    const opStartY = afterCatY > pageHeight - 42 ? (() => { doc.addPage(); return 16; })() : afterCatY;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('3. Daftar Sesi Stock Opname Periode Ini', 14, opStartY);

    autoTable(doc, {
      startY: opStartY + 3,
      head: [
        [
          'No. Sesi Opname',
          'Tanggal',
          'Auditor',
          'Alasan / Jenis Audit',
          'SKU Dihitung',
          'Item Selisih',
          'Selisih Nilai (Rp)',
        ],
      ],
      body: data.monthOpnames.map((op) => [
        op.sessionNumber,
        op.date,
        `${op.auditorName} (${op.auditorRole})`,
        op.generalReason,
        `${formatNumber(op.totalItemsAudited)} SKU`,
        `${formatNumber(op.totalDiscrepancies)} Item`,
        `${op.totalDifferenceValue > 0 ? '+' : ''}${formatRupiah(op.totalDifferenceValue)}`,
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [13, 148, 136],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: { fontSize: 7.8, cellPadding: 2.2 },
    });
  }

  // Signature Block for Audit Accountability
  const afterAllY = ((doc as any).lastAutoTable?.finalY || 140) + 10;
  const sigY = afterAllY > pageHeight - 36 ? (() => { doc.addPage(); return 20; })() : afterAllY;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('Disiapkan Oleh (Admin Gudang / Kasir),', 22, sigY);
  doc.text('Diperiksa & Disahkan Oleh (Pemilik / Manager),', pageWidth - 88, sigY);

  doc.line(22, sigY + 18, 76, sigY + 18);
  doc.line(pageWidth - 88, sigY + 18, pageWidth - 22, sigY + 18);
  doc.setFont('helvetica', 'bold');
  doc.text(`( ${auditorName} )`, 22, sigY + 23);
  doc.text(`( Pimpinan ${storeTitle} )`, pageWidth - 88, sigY + 23);

  // Page Footers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${storeTitle} — Dokumen Audit Pergerakan Stok Bulanan (${data.monthLabel})`,
      14,
      pageHeight - 6
    );
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - 14, pageHeight - 6, {
      align: 'right',
    });
  }

  const safeCat = categoryFilter === 'SEMUA' ? 'Semua' : categoryFilter.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Audit-Pergerakan-Stok-${data.monthKey}-${safeCat}.pdf`;
  doc.save(filename);
  return { doc, filename };
}
