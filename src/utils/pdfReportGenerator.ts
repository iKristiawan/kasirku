import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, Product, StoreSettings, Transaction } from '../types/pos';
import { formatDateOnly, formatDateTime, formatNumber, formatRupiah, formatWhatsAppUrl } from './formatters';
import { getItemFifoCogs } from './fifoUtils';
import { addStandardPdfFooters, buildStoreContactLine, drawPdfStoreHeader } from './pdfLogoHelper';

/**
 * Returns local calendar date key in YYYY-MM-DD format (avoids UTC timezone shifts).
 */
export function getLocalDateKey(timestamp: number | string | Date): string {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DailyPaymentBreakdownRow {
  method: string;
  count: number;
  totalAmount: number;
  sharePercent: number;
}

export interface DailyProductProfitRow {
  productId: string;
  productName: string;
  category: string;
  baseUnit: string;
  unitsSold: number;
  totalRevenue: number;
  totalFifoCogs: number;
  grossProfit: number;
  marginPercent: number;
}

export interface DailyProfitLossReportData {
  dateKey: string;
  formattedDate: string;
  transactionCount: number;
  totalItemsQty: number;
  grossSubtotal: number;
  totalTransactionDiscount: number;
  totalMembershipDiscount: number;
  totalPointsDiscount: number;
  totalAllDiscounts: number;
  totalNetRevenue: number;
  totalFifoCogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  avgProfitPerTx: number;
  totalPointsEarned: number;
  paymentBreakdown: DailyPaymentBreakdownRow[];
  productBreakdown: DailyProductProfitRow[];
  transactions: Array<Transaction & { fifoCogs: number; grossProfit: number }>;
}

function buildProductMap(products: Product[] = []): Map<string, Product> {
  const map = new Map<string, Product>();
  products.forEach((p) => map.set(p.id, p));
  return map;
}

function resolveCustomerName(tx: Transaction, customers: Customer[] = []): string {
  if (tx.customerId) {
    const found = customers.find((c) => c.id === tx.customerId);
    if (found) return found.name;
  }
  return tx.customerName || 'Pelanggan Umum';
}

function addPdfPageFooters(doc: jsPDF, footerNote: string) {
  addStandardPdfFooters(doc, footerNote);
}

export function computeDailyProfitLossData(
  allTransactions: Transaction[],
  targetDateKey: string,
  products: Product[] = []
): DailyProfitLossReportData {
  const productMap = buildProductMap(products);
  const dayTxs = allTransactions
    .filter((tx) => getLocalDateKey(tx.timestamp) === targetDateKey)
    .sort((a, b) => a.timestamp - b.timestamp);

  let totalItemsQty = 0;
  let grossSubtotal = 0;
  let totalTransactionDiscount = 0;
  let totalMembershipDiscount = 0;
  let totalPointsDiscount = 0;
  let totalNetRevenue = 0;
  let totalFifoCogs = 0;
  let totalPointsEarned = 0;

  const paymentMap = new Map<string, { count: number; totalAmount: number }>();
  const productProfitMap = new Map<string, DailyProductProfitRow>();

  const enrichedTransactions = dayTxs.map((tx) => {
    let txCogs = 0;
    grossSubtotal += tx.subtotal || 0;
    totalTransactionDiscount += tx.discount || 0;
    totalMembershipDiscount += tx.membershipDiscountAmount || 0;
    totalPointsDiscount += tx.pointsDiscountAmount || 0;
    totalNetRevenue += tx.finalAmount || 0;
    totalPointsEarned += tx.pointsEarned || 0;

    const methodKey = (tx.paymentMethod || 'CASH').replace(/_/g, ' ');
    const payEntry = paymentMap.get(methodKey) || { count: 0, totalAmount: 0 };
    payEntry.count += 1;
    payEntry.totalAmount += tx.finalAmount || 0;
    paymentMap.set(methodKey, payEntry);

    (tx.items || []).forEach((item) => {
      const prod = productMap.get(item.productId);
      const itemCogs = getItemFifoCogs(item, prod);
      const unitsSold = (item.quantity || 0) * (item.conversionFactor || 1);
      const itemRev = item.totalAmount || 0;

      txCogs += itemCogs;
      totalFifoCogs += itemCogs;
      totalItemsQty += item.quantity || 0;

      const existingProd = productProfitMap.get(item.productId) || {
        productId: item.productId,
        productName: item.productName || prod?.name || 'Produk',
        category: prod?.category || (item.isService ? 'Jasa' : 'Umum'),
        baseUnit: prod?.baseUnit || item.unitName || 'PCS',
        unitsSold: 0,
        totalRevenue: 0,
        totalFifoCogs: 0,
        grossProfit: 0,
        marginPercent: 0,
      };

      existingProd.unitsSold += unitsSold;
      existingProd.totalRevenue += itemRev;
      existingProd.totalFifoCogs += itemCogs;
      productProfitMap.set(item.productId, existingProd);
    });

    return {
      ...tx,
      fifoCogs: txCogs,
      grossProfit: (tx.finalAmount || 0) - txCogs,
    };
  });

  const totalAllDiscounts = totalTransactionDiscount + totalMembershipDiscount + totalPointsDiscount;
  const grossProfit = totalNetRevenue - totalFifoCogs;
  const grossMarginPercent = totalNetRevenue > 0 ? (grossProfit / totalNetRevenue) * 100 : 0;
  const avgProfitPerTx = dayTxs.length > 0 ? grossProfit / dayTxs.length : 0;

  const paymentBreakdown: DailyPaymentBreakdownRow[] = Array.from(paymentMap.entries())
    .map(([method, val]) => ({
      method,
      count: val.count,
      totalAmount: val.totalAmount,
      sharePercent: totalNetRevenue > 0 ? (val.totalAmount / totalNetRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const productBreakdown: DailyProductProfitRow[] = Array.from(productProfitMap.values())
    .map((p) => {
      const profit = p.totalRevenue - p.totalFifoCogs;
      const marginPercent = p.totalRevenue > 0 ? (profit / p.totalRevenue) * 100 : 0;
      return {
        ...p,
        grossProfit: profit,
        marginPercent,
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  const parsedDate = new Date(`${targetDateKey}T00:00:00`);
  const formattedDate = !isNaN(parsedDate.getTime()) ? formatDateOnly(parsedDate.getTime()) : targetDateKey;

  return {
    dateKey: targetDateKey,
    formattedDate,
    transactionCount: dayTxs.length,
    totalItemsQty,
    grossSubtotal,
    totalTransactionDiscount,
    totalMembershipDiscount,
    totalPointsDiscount,
    totalAllDiscounts,
    totalNetRevenue,
    totalFifoCogs,
    grossProfit,
    grossMarginPercent,
    avgProfitPerTx,
    totalPointsEarned,
    paymentBreakdown,
    productBreakdown,
    transactions: enrichedTransactions,
  };
}

export async function generateSelectedTransactionsPdf(
  selectedTransactions: Transaction[],
  storeSettings?: StoreSettings,
  products: Product[] = [],
  customers: Customer[] = [],
  options?: {
    titleLabel?: string;
    filterSubtitle?: string;
    includeItemDetails?: boolean;
  }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const productMap = buildProductMap(products);
  const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
  const contactLine = buildStoreContactLine(storeSettings);
  const printedAt = formatDateTime(Date.now());

  let totalRevenue = 0;
  let totalFifoCogs = 0;
  let totalDiscounts = 0;

  const enrichedRows = selectedTransactions.map((tx) => {
    const txCogs = (tx.items || []).reduce((sum, item) => {
      const prod = productMap.get(item.productId);
      return sum + getItemFifoCogs(item, prod);
    }, 0);
    const txDiscount = (tx.discount || 0) + (tx.membershipDiscountAmount || 0) + (tx.pointsDiscountAmount || 0);
    const txProfit = (tx.finalAmount || 0) - txCogs;

    totalRevenue += tx.finalAmount || 0;
    totalFifoCogs += txCogs;
    totalDiscounts += txDiscount;

    return {
      tx,
      txCogs,
      txDiscount,
      txProfit,
      customerLabel: resolveCustomerName(tx, customers),
    };
  });

  const totalGrossProfit = totalRevenue - totalFifoCogs;
  const marginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  const { bannerHeight } = await drawPdfStoreHeader({
    doc,
    title: options?.titleLabel || 'LAPORAN TRANSAKSI PENJUALAN',
    subtitle: storeTitle.toUpperCase(),
    contactLine,
    rightTopText: `Dicetak: ${printedAt}`,
    rightBottomText: options?.filterSubtitle,
    storeSettings,
    bannerColor: [15, 23, 42],
    accentStripeColor: [2, 132, 199],
    bannerHeight: 28,
  });

  // KPI Summary Strip
  const kpiY = bannerHeight + 4;
  const kpiWidth = 52;
  const kpiGap = 3.5;
  const kpis = [
    { label: 'Total Transaksi', value: `${selectedTransactions.length} Nota`, bg: [241, 245, 249], txt: [15, 23, 42] },
    { label: 'Total Omzet', value: formatRupiah(totalRevenue), bg: [240, 249, 255], txt: [3, 105, 161] },
    { label: 'Total HPP (FIFO)', value: formatRupiah(totalFifoCogs), bg: [248, 250, 252], txt: [51, 65, 85] },
    { label: 'Laba Kotor (FIFO)', value: `${formatRupiah(totalGrossProfit)} (${marginPercent.toFixed(1)}%)`, bg: [236, 253, 245], txt: [4, 120, 87] },
    { label: 'Total Diskon & Poin', value: formatRupiah(totalDiscounts), bg: [255, 247, 237], txt: [194, 65, 12] },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (kpiWidth + kpiGap);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, kpiWidth, 15, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, kpiY + 5.5);
    doc.setFontSize(9.5);
    doc.setTextColor(kpi.txt[0], kpi.txt[1], kpi.txt[2]);
    doc.text(kpi.value, x + 3, kpiY + 11.5);
  });

  // Main Transactions Table
  const tableBody = enrichedRows.map(({ tx, txCogs, txDiscount, txProfit, customerLabel }, idx) => [
    String(idx + 1),
    tx.invoiceNumber,
    formatDateTime(tx.timestamp),
    tx.cashierName.split(' ')[0],
    customerLabel,
    (tx.paymentMethod || 'CASH').replace(/_/g, ' '),
    `${tx.items.length} item`,
    formatRupiah(tx.subtotal),
    txDiscount > 0 ? `-${formatRupiah(txDiscount)}` : '-',
    formatRupiah(tx.finalAmount),
    formatRupiah(txCogs),
    formatRupiah(txProfit),
  ]);

  autoTable(doc, {
    startY: 50,
    head: [[
      'No',
      'No. Invoice',
      'Waktu',
      'Kasir',
      'Pelanggan',
      'Metode',
      'Item',
      'Subtotal',
      'Diskon/Poin',
      'Omzet Akhir',
      'HPP FIFO',
      'Laba Kotor',
    ]],
    body: tableBody,
    foot: [[
      '',
      'TOTAL',
      '',
      '',
      '',
      `${selectedTransactions.length} Nota`,
      '',
      formatRupiah(selectedTransactions.reduce((s, t) => s + (t.subtotal || 0), 0)),
      totalDiscounts > 0 ? `-${formatRupiah(totalDiscounts)}` : '-',
      formatRupiah(totalRevenue),
      formatRupiah(totalFifoCogs),
      formatRupiah(totalGrossProfit),
    ]],
    theme: 'grid',
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7.3,
      cellPadding: 2,
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      6: { halign: 'center' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' },
      10: { halign: 'right' },
      11: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  // Optional Itemized Breakdown
  if (options?.includeItemDetails && selectedTransactions.length > 0) {
    const itemRows: string[][] = [];
    selectedTransactions.forEach((tx) => {
      (tx.items || []).forEach((item) => {
        const prod = productMap.get(item.productId);
        const itemCogs = getItemFifoCogs(item, prod);
        const itemProfit = (item.totalAmount || 0) - itemCogs;
        const variantLabel = item.selectedVariant ? ` (${item.selectedVariant})` : '';
        itemRows.push([
          tx.invoiceNumber,
          `${item.productName}${variantLabel}`,
          `${formatNumber(item.quantity)} ${item.unitName || 'PCS'}`,
          formatRupiah(item.unitPrice),
          formatRupiah(item.totalAmount),
          formatRupiah(itemCogs),
          formatRupiah(itemProfit),
        ]);
      });
    });

    const lastY = (doc as any).lastAutoTable?.finalY || 120;
    const startItemsY = lastY > 165 ? (doc.addPage(), 18) : lastY + 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Rincian Item & Laba Kotor FIFO per Transaksi', 14, startItemsY);

    autoTable(doc, {
      startY: startItemsY + 3,
      head: [['No. Invoice', 'Produk / Layanan', 'Qty & Satuan', 'Harga Satuan', 'Subtotal', 'HPP FIFO', 'Laba Item']],
      body: itemRows,
      theme: 'striped',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7.2,
        cellPadding: 1.8,
      },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
      },
    });
  }

  addPdfPageFooters(
    doc,
    `Arsip Digital ${storeTitle} • Perhitungan HPP menggunakan metode FIFO`
  );

  const cleanStore = storeTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  const todayStr = getLocalDateKey(Date.now());
  const filename = `Laporan_Transaksi_${cleanStore}_${todayStr}.pdf`;

  return {
    doc,
    filename,
    summary: {
      count: selectedTransactions.length,
      totalRevenue,
      totalFifoCogs,
      totalGrossProfit,
      totalDiscounts,
      marginPercent,
    },
  };
}

export async function generateDailyProfitLossPdf(
  allTransactions: Transaction[],
  targetDateKey: string,
  storeSettings?: StoreSettings,
  products: Product[] = [],
  customers: Customer[] = []
) {
  const dailyData = computeDailyProfitLossData(allTransactions, targetDateKey, products);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
  const contactStr = buildStoreContactLine(storeSettings);
  const printedAt = formatDateTime(Date.now());

  const { bannerHeight } = await drawPdfStoreHeader({
    doc,
    title: 'RINGKASAN LABA RUGI HARIAN (FIFO)',
    subtitle: `${storeTitle} · Tanggal: ${dailyData.formattedDate}`,
    contactLine: contactStr,
    rightTopText: `Dicetak: ${printedAt}`,
    rightBottomText: `${dailyData.transactionCount} Transaksi`,
    storeSettings,
    bannerColor: [6, 95, 70],
    accentStripeColor: [16, 185, 129],
    bannerHeight: 30,
  });

  // Section 1: Ikhtisar Laba Rugi Harian
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. Ikhtisar Laba Rugi Harian', 14, bannerHeight + 7);

  const pnlRows: Array<[string, string]> = [
    ['Jumlah Transaksi Diproses', `${formatNumber(dailyData.transactionCount)} Nota (${formatNumber(dailyData.totalItemsQty)} item)`],
    ['Pendapatan Kotor (Subtotal Belanja)', formatRupiah(dailyData.grossSubtotal)],
    ['Diskon Transaksi Manual', dailyData.totalTransactionDiscount > 0 ? `-${formatRupiah(dailyData.totalTransactionDiscount)}` : 'Rp 0'],
    ['Diskon Membership', dailyData.totalMembershipDiscount > 0 ? `-${formatRupiah(dailyData.totalMembershipDiscount)}` : 'Rp 0'],
    ['Potongan Tukar Poin Member', dailyData.totalPointsDiscount > 0 ? `-${formatRupiah(dailyData.totalPointsDiscount)}` : 'Rp 0'],
    ['Total Penjualan Bersih (Omzet)', formatRupiah(dailyData.totalNetRevenue)],
    ['Total Harga Pokok Penjualan (HPP FIFO)', `-${formatRupiah(dailyData.totalFifoCogs)}`],
    ['LABA KOTOR HARIAN (Omzet - HPP FIFO)', formatRupiah(dailyData.grossProfit)],
    ['Margin Laba Kotor (%)', `${dailyData.grossMarginPercent.toFixed(1)}%`],
    ['Rata-rata Laba per Transaksi', formatRupiah(Math.round(dailyData.avgProfitPerTx))],
    ['Total Poin Loyalty Diberikan', `+${formatNumber(dailyData.totalPointsEarned)} Poin`],
  ];

  autoTable(doc, {
    startY: 41,
    head: [['Komponen Keuangan', 'Nilai']],
    body: pnlRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 8.3,
      cellPadding: 2.3,
    },
    columnStyles: {
      0: { cellWidth: 118 },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.row.index === 5) {
          data.cell.styles.fillColor = [240, 249, 255];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [3, 105, 161];
        } else if (data.row.index === 7) {
          data.cell.styles.fillColor = [236, 253, 245];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = dailyData.grossProfit >= 0 ? [4, 120, 87] : [190, 18, 60];
        }
      }
    },
  });

  // Section 2: Rincian Metode Pembayaran
  let nextY = ((doc as any).lastAutoTable?.finalY || 120) + 8;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. Komposisi Metode Pembayaran', 14, nextY);

  autoTable(doc, {
    startY: nextY + 3,
    head: [['Metode Pembayaran', 'Jumlah Nota', 'Total Omzet', 'Kontribusi']],
    body:
      dailyData.paymentBreakdown.length > 0
        ? dailyData.paymentBreakdown.map((p) => [
            p.method,
            `${p.count} Nota`,
            formatRupiah(p.totalAmount),
            `${p.sharePercent.toFixed(1)}%`,
          ])
        : [['Belum ada transaksi pada tanggal ini', '-', 'Rp 0', '0.0%']],
    theme: 'striped',
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'right' },
    },
  });

  // Section 3: Laba Kotor per Produk (FIFO)
  nextY = ((doc as any).lastAutoTable?.finalY || 160) + 8;
  if (nextY > 235) {
    doc.addPage();
    nextY = 18;
  }

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('3. Laba Kotor per Produk (Metode FIFO)', 14, nextY);

  autoTable(doc, {
    startY: nextY + 3,
    head: [['No', 'Nama Produk / Jasa', 'Terjual', 'Omzet', 'HPP FIFO', 'Laba Kotor', 'Margin']],
    body:
      dailyData.productBreakdown.length > 0
        ? dailyData.productBreakdown.map((p, i) => [
            String(i + 1),
            p.productName,
            `${formatNumber(p.unitsSold)} ${p.baseUnit}`,
            formatRupiah(p.totalRevenue),
            formatRupiah(p.totalFifoCogs),
            formatRupiah(p.grossProfit),
            `${p.marginPercent.toFixed(1)}%`,
          ])
        : [['-', 'Belum ada produk terjual', '-', 'Rp 0', 'Rp 0', 'Rp 0', '0.0%']],
    theme: 'grid',
    headStyles: {
      fillColor: [5, 150, 105],
      textColor: 255,
      fontSize: 7.8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7.6,
      cellPadding: 1.9,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
      6: { halign: 'right' },
    },
  });

  // Section 4: Daftar Transaksi Harian
  if (dailyData.transactions.length > 0) {
    nextY = ((doc as any).lastAutoTable?.finalY || 200) + 8;
    if (nextY > 240) {
      doc.addPage();
      nextY = 18;
    }

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('4. Daftar Transaksi Harian', 14, nextY);

    autoTable(doc, {
      startY: nextY + 3,
      head: [['No', 'No. Invoice', 'Jam', 'Pelanggan', 'Metode', 'Omzet', 'HPP FIFO', 'Laba Kotor']],
      body: dailyData.transactions.map((tx, idx) => [
        String(idx + 1),
        tx.invoiceNumber,
        new Date(tx.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }),
        resolveCustomerName(tx, customers),
        (tx.paymentMethod || 'CASH').replace(/_/g, ' '),
        formatRupiah(tx.finalAmount),
        formatRupiah(tx.fifoCogs),
        formatRupiah(tx.grossProfit),
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7.3,
        cellPadding: 1.8,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        2: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
      },
    });
  }

  addPdfPageFooters(
    doc,
    `Ringkasan Laba Rugi Harian ${storeTitle} • Tanggal ${dailyData.formattedDate}`
  );

  const cleanStore = storeTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Laba_Rugi_Harian_${cleanStore}_${targetDateKey}.pdf`;

  return {
    doc,
    filename,
    dailyData,
  };
}

export async function generateSingleTransactionPdf(
  tx: Transaction,
  storeSettings?: StoreSettings,
  products: Product[] = [],
  customers: Customer[] = []
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const productMap = buildProductMap(products);
  const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
  const contact = buildStoreContactLine(storeSettings);
  const customerName = resolveCustomerName(tx, customers);

  const { bannerHeight } = await drawPdfStoreHeader({
    doc,
    title: 'BUKTI TRANSAKSI / INVOICE DIGITAL',
    subtitle: storeTitle.toUpperCase(),
    contactLine: contact,
    rightTopText: tx.invoiceNumber,
    rightBottomText: formatDateTime(tx.timestamp),
    storeSettings,
    bannerColor: [15, 23, 42],
    accentStripeColor: [2, 132, 199],
    bannerHeight: 28,
  });

  // Metadata Box
  const metaY = bannerHeight + 8;
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`No. Invoice : ${tx.invoiceNumber}`, 14, metaY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Waktu       : ${formatDateTime(tx.timestamp)}`, 14, metaY + 5.5);
  doc.text(`Kasir       : ${tx.cashierName}`, 14, metaY + 11);
  doc.text(`Pelanggan   : ${customerName}`, 120, metaY);
  doc.text(`Metode      : ${(tx.paymentMethod || 'CASH').replace(/_/g, ' ')}`, 120, metaY + 5.5);
  doc.text(`Status      : ${tx.paymentStatus}`, 120, metaY + 11);

  // Items table
  const itemRows = (tx.items || []).map((item, idx) => {
    const prod = productMap.get(item.productId);
    const variant = item.selectedVariant ? ` (${item.selectedVariant})` : '';
    const itemTag = item.isService ? '[Jasa] ' : '';
    return [
      String(idx + 1),
      `${itemTag}${item.productName}${variant}`,
      `${formatNumber(item.quantity)} ${item.unitName || prod?.baseUnit || 'PCS'}`,
      formatRupiah(item.unitPrice),
      formatRupiah(item.totalAmount),
    ];
  });

  autoTable(doc, {
    startY: 56,
    head: [['No', 'Produk / Layanan', 'Qty & Satuan', 'Harga Satuan', 'Subtotal']],
    body: itemRows,
    theme: 'grid',
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: 255,
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 8.3,
      cellPadding: 2.3,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const afterTableY = ((doc as any).lastAutoTable?.finalY || 100) + 6;
  const totalsRows: Array<[string, string]> = [['Subtotal', formatRupiah(tx.subtotal)]];
  if (tx.discount > 0) totalsRows.push(['Diskon Transaksi', `-${formatRupiah(tx.discount)}`]);
  if (tx.membershipDiscountAmount && tx.membershipDiscountAmount > 0) {
    totalsRows.push(['Diskon Member', `-${formatRupiah(tx.membershipDiscountAmount)}`]);
  }
  if (tx.pointsDiscountAmount > 0) {
    totalsRows.push([`Tukar Poin (${tx.pointsUsed || 0} Pts)`, `-${formatRupiah(tx.pointsDiscountAmount)}`]);
  }
  totalsRows.push(['TOTAL PEMBAYARAN', formatRupiah(tx.finalAmount)]);

  autoTable(doc, {
    startY: afterTableY,
    margin: { left: 105 },
    body: totalsRows,
    theme: 'plain',
    styles: {
      fontSize: 8.8,
      cellPadding: 1.8,
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === totalsRows.length - 1) {
        data.cell.styles.fillColor = [240, 249, 255];
        data.cell.styles.textColor = [3, 105, 161];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 9.5;
      }
    },
  });

  addPdfPageFooters(
    doc,
    storeSettings?.storeFooterReceipt || `Terima kasih telah berbelanja di ${storeTitle}`
  );

  const safeInv = tx.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Invoice_${safeInv}.pdf`;

  return { doc, filename };
}

export function buildTransactionsWaSummary(
  selectedTransactions: Transaction[],
  storeSettings?: StoreSettings,
  products: Product[] = [],
  reportLabel?: string
): string {
  const storeName = storeSettings?.storeName || 'KasirKu Tablet POS';
  const productMap = buildProductMap(products);

  let totalRevenue = 0;
  let totalFifoCogs = 0;
  selectedTransactions.forEach((tx) => {
    totalRevenue += tx.finalAmount || 0;
    (tx.items || []).forEach((item) => {
      totalFifoCogs += getItemFifoCogs(item, productMap.get(item.productId));
    });
  });

  const grossProfit = totalRevenue - totalFifoCogs;
  const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const previewInvoices = selectedTransactions
    .slice(0, 8)
    .map((tx) => `• ${tx.invoiceNumber} — ${formatRupiah(tx.finalAmount)} (${(tx.paymentMethod || 'CASH').replace(/_/g, ' ')})`)
    .join('\n');
  const moreCount = selectedTransactions.length > 8 ? `\n...dan ${selectedTransactions.length - 8} transaksi lainnya (lihat lampiran PDF).` : '';

  return (
    `📊 *LAPORAN TRANSAKSI PENJUALAN*\n` +
    `*${storeName}*\n` +
    (reportLabel ? `Kategori/Filter: ${reportLabel}\n` : '') +
    `--------------------------------\n` +
    `Total Transaksi : *${selectedTransactions.length} Nota*\n` +
    `Total Omzet     : *${formatRupiah(totalRevenue)}*\n` +
    `HPP (FIFO)      : ${formatRupiah(totalFifoCogs)}\n` +
    `Laba Kotor FIFO : *${formatRupiah(grossProfit)}* (${margin.toFixed(1)}%)\n` +
    `--------------------------------\n` +
    `🧾 *Daftar Nota:*\n${previewInvoices}${moreCount}\n\n` +
    `📎 _Dokumen PDF lengkap terlampir._`
  );
}

export function buildDailyProfitLossWaSummary(
  dailyData: DailyProfitLossReportData,
  storeSettings?: StoreSettings
): string {
  const storeName = storeSettings?.storeName || 'KasirKu Tablet POS';
  const paymentLines =
    dailyData.paymentBreakdown.length > 0
      ? dailyData.paymentBreakdown
          .map((p) => `• ${p.method}: ${p.count} nota (${formatRupiah(p.totalAmount)})`)
          .join('\n')
      : '• Tidak ada transaksi';

  const topProductsLines =
    dailyData.productBreakdown.length > 0
      ? dailyData.productBreakdown
          .slice(0, 5)
          .map(
            (p, idx) =>
              `${idx + 1}. ${p.productName} (${formatNumber(p.unitsSold)} ${p.baseUnit}) → Laba *${formatRupiah(p.grossProfit)}*`
          )
          .join('\n')
      : '• Belum ada produk terjual';

  return (
    `📈 *RINGKASAN LABA RUGI HARIAN (FIFO)*\n` +
    `*${storeName}*\n` +
    `Tanggal: *${dailyData.formattedDate}*\n` +
    `--------------------------------\n` +
    `Jumlah Transaksi : *${dailyData.transactionCount} Nota*\n` +
    `Subtotal Kotor   : ${formatRupiah(dailyData.grossSubtotal)}\n` +
    `Diskon & Poin    : -${formatRupiah(dailyData.totalAllDiscounts)}\n` +
    `Penjualan Bersih : *${formatRupiah(dailyData.totalNetRevenue)}*\n` +
    `HPP Metode FIFO  : -${formatRupiah(dailyData.totalFifoCogs)}\n` +
    `💰 *LABA KOTOR   : ${formatRupiah(dailyData.grossProfit)}* (${dailyData.grossMarginPercent.toFixed(1)}%)\n` +
    `--------------------------------\n` +
    `💳 *Metode Bayar:*\n${paymentLines}\n\n` +
    `🏆 *Top Produk Penyumbang Laba:*\n${topProductsLines}\n\n` +
    `📎 _Laporan PDF lengkap terlampir._`
  );
}

export function buildWhatsAppShareHref(rawPhone: string, message: string): string {
  const trimmed = rawPhone.trim();
  if (trimmed) {
    return formatWhatsAppUrl(trimmed, message);
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}
