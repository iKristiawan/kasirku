import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxCalculationMode,
  TaxConfig,
  TaxRecord,
  Transaction,
} from '../types/pos';
import { formatDateOnly, formatNumber, formatRupiah } from './formatters';
import {
  computeAnnualTaxBuckets,
  computeTxTaxableBreakdown,
  CorporateTax31EResult,
  MONTH_NAMES_ID,
  REGIME_LABELS,
  TAX_ADJUSTMENT_REASON_LABELS,
  TAX_ADJUSTMENT_TARGET_LABELS,
} from './taxUtils';

export interface MonthlyTaxPdfResult {
  filename: string;
  periodKey: string;
  periodLabel: string;
  txCount: number;
}

export const exportMonthlyTaxPdfReport = (params: {
  transactions: Transaction[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  storeSettings: StoreSettings;
  taxConfig: TaxConfig;
  year: number;
  monthIndex: number;
  preparedBy: string;
  taxAdjustments?: TaxAdjustment[];
}): MonthlyTaxPdfResult => {
  const {
    transactions,
    purchases,
    taxRecords,
    storeSettings,
    taxConfig,
    year,
    monthIndex,
    preparedBy,
    taxAdjustments = [],
  } = params;

  const periodKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const periodLabel = `${MONTH_NAMES_ID[monthIndex]} ${year}`;
  const dueMonthIdx = (monthIndex + 1) % 12;
  const dueYear = monthIndex === 11 ? year + 1 : year;
  const dueDateDisplay = `${String(taxConfig.monthlyDueDay ?? 15).padStart(2, '0')} ${MONTH_NAMES_ID[dueMonthIdx]} ${dueYear}`;

  const annual = computeAnnualTaxBuckets({
    transactions,
    purchases,
    taxRecords,
    taxConfig,
    year,
    taxAdjustments,
  });
  const monthStats = annual.buckets[monthIndex];
  const monthRecords = taxRecords
    .filter((r) => r.periodMonth === periodKey)
    .sort((a, b) => b.timestamp - a.timestamp);
  const monthActiveAdjustments = taxAdjustments
    .filter((a) => a.periodMonth === periodKey && a.status === 'ACTIVE')
    .sort((a, b) => b.timestamp - a.timestamp);

  const excludeWithdrawal = taxConfig.excludeCashWithdrawalPrincipal !== false;
  const pphEnabled = Boolean(taxConfig.enablePphFinalUmkm) && taxConfig.taxpayerStatus !== 'NON_PAJAK';
  const pphRate = Math.max(0, Number(taxConfig.pphFinalRatePercent ?? 0.5));
  const ppnEnabled = Boolean(taxConfig.enablePpn) && taxConfig.taxpayerStatus !== 'NON_PAJAK';
  const ppnRate = Math.max(0, Number(taxConfig.ppnRatePercent ?? 11));
  const ppnMode: TaxCalculationMode = taxConfig.ppnMode || 'INCLUSIVE';
  const pb1Enabled = Boolean(taxConfig.enablePb1) && taxConfig.taxpayerStatus !== 'NON_PAJAK';
  const pb1Rate = Math.max(0, Number(taxConfig.pb1RatePercent ?? 10));

  const pphTaxableRatio =
    monthStats.taxableTurnover > 0
      ? Math.min(1, Math.max(0, monthStats.pphTaxableSlice / monthStats.taxableTurnover))
      : 0;

  // Daily breakdown for the period
  const dailyMap = new Map<
    string,
    { dateMs: number; dateStr: string; txCount: number; gross: number; taxable: number }
  >();
  transactions.forEach((tx) => {
    const d = new Date(tx.timestamp);
    if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return;
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const bd = computeTxTaxableBreakdown(tx, excludeWithdrawal);
    const existing = dailyMap.get(dateKey) || {
      dateMs: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime(),
      dateStr: formatDateOnly(tx.timestamp),
      txCount: 0,
      gross: 0,
      taxable: 0,
    };
    existing.txCount += 1;
    existing.gross += bd.rawGross;
    existing.taxable += bd.netTaxable;
    dailyMap.set(dateKey, existing);
  });

  const dailyRows = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, row]) => {
      const dPpn = ppnEnabled
        ? ppnMode === 'INCLUSIVE'
          ? Math.round(row.taxable - row.taxable / (1 + ppnRate / 100))
          : Math.round(row.taxable * (ppnRate / 100))
        : 0;
      const dPph = pphEnabled
        ? Math.round(row.taxable * pphTaxableRatio * (pphRate / 100))
        : 0;
      return [
        row.dateStr,
        formatNumber(row.txCount),
        formatRupiah(row.gross),
        formatRupiah(row.taxable),
        formatRupiah(dPpn),
        formatRupiah(dPph),
      ];
    });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Official Report Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(14, 12, pageWidth - 28, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN PAJAK BULANAN & ARSIP PELAPORAN', 18, 21);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${storeSettings.storeName} · Masa Pajak: ${periodLabel} (${periodKey})`, 18, 27);
  doc.text(
    `Dicetak: ${new Date().toLocaleString('id-ID')} · Batas Setor/Lapor: ${dueDateDisplay}`,
    18,
    32
  );

  // Taxpayer Metadata Box
  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 40,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 42 },
      1: { cellWidth: 50 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 38 },
      3: { cellWidth: 'auto' },
    },
    body: [
      [
        'Nama Wajib Pajak',
        taxConfig.taxpayerName || storeSettings.storeName,
        'NPWP / NITKU',
        taxConfig.npwp || '-',
      ],
      [
        'Status Wajib Pajak',
        REGIME_LABELS[taxConfig.taxpayerStatus],
        'Masa Pajak',
        `${periodLabel} (${periodKey})`,
      ],
      [
        'Alamat Usaha',
        storeSettings.storeAddress || '-',
        'Jatuh Tempo',
        dueDateDisplay,
      ],
    ],
  });

  // Section 1: Tax Base Reconciliation
  const afterMetaY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : 68;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('I. Rekonsiliasi Peredaran Bruto & Dasar Pengenaan Pajak (DPP)', 14, afterMetaY);

  autoTable(doc, {
    startY: afterMetaY + 2.5,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 2.3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    head: [['Keterangan Komponen Omzet', 'Nominal / Jumlah']],
    body: [
      [`Penjualan Bruto POS (${formatNumber(monthStats.txCount)} transaksi)`, formatRupiah(monthStats.rawGrossSales)],
      ['Dikurangi: Retur Penjualan', `-${formatRupiah(monthStats.returnedSales)}`],
      [
        'Dikurangi: Pokok Uang Tarik Tunai (Non-Omzet)',
        `-${formatRupiah(monthStats.excludedWithdrawalPrincipal)}`,
      ],
      ['Peredaran Bruto / Omzet Kena Pajak (DPP)', formatRupiah(monthStats.taxableTurnover)],
      ...(monthStats.dppAdjustmentNet !== 0
        ? [
            [
              'Termasuk Adjustment / Koreksi DPP Netto',
              `${monthStats.dppAdjustmentNet >= 0 ? '+' : '-'}${formatRupiah(
                Math.abs(monthStats.dppAdjustmentNet)
              )}`,
            ],
          ]
        : []),
      ['Total Pembelian / PO Selesai Masa Ini', formatRupiah(monthStats.purchaseTotalCompleted)],
      ['Akumulasi Omzet Berjalan Tahun Ini (YTD)', formatRupiah(monthStats.cumulativeTurnoverAfterMonth)],
    ],
  });

  // Section 2: Tax Liability Breakdown
  const afterReconY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : 120;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('II. Rincian Kewajiban Pajak Bulanan (PPN, PPh Final & PB1)', 14, afterReconY);

  const remainingDue = Math.max(0, monthStats.totalEstimatedTax - monthStats.recordedPaidTax);

  autoTable(doc, {
    startY: afterReconY + 2.5,
    theme: 'grid',
    styles: { fontSize: 8.2, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'center' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' },
    },
    head: [['Jenis Pajak', 'Status', 'DPP / Dasar', 'Tarif', 'Terutang', 'Keterangan']],
    body: [
      [
        'PPh Final UMKM (PP 55/2022)',
        pphEnabled ? 'Aktif' : 'Non-Aktif',
        formatRupiah(monthStats.pphTaxableSlice),
        `${pphRate}%`,
        formatRupiah(monthStats.pphFinalDue),
        monthStats.pphTaxableSlice === 0 && pphEnabled
          ? 'Bebas (YTD <= 500 Jt)'
          : 'Kewajiban PPh',
      ],
      [
        `PPN (${ppnMode === 'INCLUSIVE' ? 'Inklusif' : 'Eksklusif'})`,
        ppnEnabled ? 'Aktif' : 'Non-Aktif',
        formatRupiah(monthStats.ppnDpp),
        `${ppnRate}%`,
        formatRupiah(monthStats.ppnNetPayable),
        ppnEnabled || monthStats.ppnOutputAdjustmentNet !== 0 || monthStats.ppnInputAdjustmentNet !== 0
          ? monthStats.ppnOverpaymentAmount > 0
            ? `Lebih Bayar ${formatRupiah(monthStats.ppnOverpaymentAmount)} (Keluaran ${formatRupiah(
                monthStats.ppnOutput
              )} - Masukan ${formatRupiah(monthStats.ppnInputEstimate)})`
            : `Keluaran ${formatRupiah(monthStats.ppnOutput)} - Masukan ${formatRupiah(
                monthStats.ppnInputEstimate
              )}`
          : 'Non-PKP',
      ],
      [
        'Pajak Daerah / PB1',
        pb1Enabled ? 'Aktif' : 'Non-Aktif',
        formatRupiah(pb1Enabled ? monthStats.taxableTurnover : 0),
        `${pb1Rate}%`,
        formatRupiah(monthStats.pb1Due),
        pb1Enabled ? 'Pajak Daerah' : '-',
      ],
    ],
    foot: [
      [
        'TOTAL ESTIMASI PAJAK',
        '-',
        formatRupiah(monthStats.taxableTurnover),
        '-',
        formatRupiah(monthStats.totalEstimatedTax),
        `Disetor: ${formatRupiah(monthStats.recordedPaidTax)} | Sisa: ${formatRupiah(remainingDue)}`,
      ],
    ],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
  });

  // Section 3: Recorded Billing & NTPN
  const afterTaxY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : 175;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('III. Arsip Bukti Setoran, Kode Billing & NTPN', 14, afterTaxY);

  autoTable(doc, {
    startY: afterTaxY + 2.5,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    head: [['Jenis Pajak', 'Status', 'Tgl Setor', 'Nominal Disetor', 'ID Billing', 'NTPN']],
    body:
      monthRecords.length > 0
        ? monthRecords.map((rec) => [
            rec.taxTypeLabel,
            rec.status === 'SUDAH_SETOR' ? 'Sudah Setor' : 'Belum Setor',
            rec.paidDate || '-',
            formatRupiah(rec.paidAmount || rec.taxAmountDue),
            rec.billingCode || '-',
            rec.ntpnCode || '-',
          ])
        : [['Belum ada bukti setoran / NTPN tercatat untuk masa pajak ini', '-', '-', '-', '-', '-']],
  });

  // Section 4: Daily Summary Ledger (starts cleanly or flows)
  const afterRecordsY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : 215;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`IV. Rincian Peredaran Bruto Harian (${periodLabel})`, 14, afterRecordsY);

  autoTable(doc, {
    startY: afterRecordsY + 2.5,
    theme: 'grid',
    styles: { fontSize: 7.8, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    head: [['Tanggal', 'Trx', 'Bruto POS', 'Omzet Kena Pajak', 'Est. PPN', 'Est. PPh Final']],
    body:
      dailyRows.length > 0
        ? dailyRows
        : [['Tidak ada transaksi penjualan tercatat pada masa pajak ini', '0', 'Rp 0', 'Rp 0', 'Rp 0', 'Rp 0']],
  });

  // Section 5: Active Tax Adjustments (if any)
  if (monthActiveAdjustments.length > 0) {
    let afterDailyY = ((doc as any).lastAutoTable?.finalY || 225) + 6;
    if (afterDailyY > 240) {
      doc.addPage();
      afterDailyY = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`V. Penyesuaian / Adjustment Pajak & Koreksi Faktur (${periodLabel})`, 14, afterDailyY);

    autoTable(doc, {
      startY: afterDailyY + 2.5,
      theme: 'striped',
      styles: { fontSize: 7.8, cellPadding: 1.9 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right', fontStyle: 'bold' },
      },
      head: [['No. Adj / Ref', 'Alasan Koreksi', 'Komponen Pajak', 'Delta DPP', 'Delta Pajak', 'Catatan']],
      body: monthActiveAdjustments.map((adj) => [
        `${adj.adjustmentNumber}${adj.referenceInvoiceNumber ? `\n(${adj.referenceInvoiceNumber})` : ''}`,
        TAX_ADJUSTMENT_REASON_LABELS[adj.reasonType],
        TAX_ADJUSTMENT_TARGET_LABELS[adj.affectedTaxType],
        `${adj.dppDelta >= 0 ? '+' : '-'}${formatRupiah(Math.abs(adj.dppDelta))}`,
        `${adj.taxDelta >= 0 ? '+' : '-'}${formatRupiah(Math.abs(adj.taxDelta))}`,
        adj.notes,
      ]),
    });
  }

  // Signature Block for Archiving / Printing
  let sigY = ((doc as any).lastAutoTable?.finalY || 240) + 10;
  if (sigY > 260) {
    doc.addPage();
    sigY = 22;
  }
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('Disiapkan Oleh (Staf Keuangan / Admin),', 18, sigY);
  doc.text('Mengetahui (Pimpinan / Wajib Pajak),', pageWidth - 78, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(preparedBy || 'Admin Keuangan', 18, sigY + 18);
  doc.text(taxConfig.taxpayerName || storeSettings.storeName, pageWidth - 78, sigY + 18);

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Arsip Laporan Pajak ${storeSettings.storeName} · Masa ${periodLabel}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(
      `Halaman ${p} dari ${pageCount}`,
      pageWidth - 36,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const filename = `Laporan_Pajak_Bulanan_${periodKey}.pdf`;
  doc.save(filename);

  return {
    filename,
    periodKey,
    periodLabel,
    txCount: monthStats.txCount,
  };
};

export const exportCorporateTax31EPdf = (params: {
  storeSettings: StoreSettings;
  taxConfig: TaxConfig;
  year: number;
  sourceLabel: string;
  preparedBy: string;
  result: CorporateTax31EResult;
}): string => {
  const { storeSettings, taxConfig, year, sourceLabel, preparedBy, result } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(14, 12, pageWidth - 28, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12.5);
  doc.setFont('helvetica', 'bold');
  doc.text('KERTAS KERJA PPH BADAN & FASILITAS PASAL 31E UU PPH', 18, 21);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${storeSettings.storeName} · Tahun Pajak: ${year} · Sumber: ${sourceLabel}`, 18, 27);
  doc.text(
    `Dicetak: ${new Date().toLocaleString('id-ID')} · Batas Lapor SPT 1771: 30 April ${year + 1}`,
    18,
    32
  );

  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 40,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 42 },
      1: { cellWidth: 52 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 36 },
      3: { cellWidth: 'auto' },
    },
    body: [
      ['Nama Badan / Wajib Pajak', taxConfig.taxpayerName || storeSettings.storeName, 'NPWP / NITKU', taxConfig.npwp || '-'],
      ['Status Profil Pajak', REGIME_LABELS[taxConfig.taxpayerStatus], 'Tahun Pajak', String(year)],
      ['Klasifikasi Pasal 31E', result.bracketLabel, 'Tarif Umum', `${result.generalRatePercent}% (Fasilitas ${result.facilityRatePercent}%)`],
    ],
  });

  const y1 = ((doc as any).lastAutoTable?.finalY || 68) + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('I. Rekonsiliasi Laporan Laba Rugi Komersial ke Penghasilan Kena Pajak (PKP)', 14, y1);

  autoTable(doc, {
    startY: y1 + 2.5,
    theme: 'striped',
    styles: { fontSize: 8.3, cellPadding: 2.1 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 58 } },
    head: [['Komponen Pembukuan & Fiskal', 'Nominal (Rp)', 'Catatan']],
    body: [
      ['Peredaran Bruto / Omzet Setahun', formatRupiah(result.grossTurnover), 'Omzet bersih usaha'],
      ['Harga Pokok Penjualan (HPP / COGS)', `-${formatRupiah(result.cogsAmount)}`, 'Biaya pokok barang terjual'],
      ['Laba Kotor Usaha', formatRupiah(result.grossProfit), 'Omzet - HPP'],
      ['Pendapatan Usaha Lainnya', formatRupiah(result.otherBusinessIncome), 'Non-final'],
      ['Biaya Operasional Usaha (Deductible)', `-${formatRupiah(result.operatingExpenses)}`, 'Pasal 6 UU PPh'],
      ['Laba (Rugi) Bersih Komersial', formatRupiah(result.commercialNetProfit), `Net Margin: ${result.netMarginPercent}%`],
      [
        'Koreksi Fiskal Netto (+ / -)',
        `${result.fiscalAdjustmentNet >= 0 ? '+' : '-'}${formatRupiah(Math.abs(result.fiscalAdjustmentNet))}`,
        'Penyesuaian fiskal Pasal 6 & 9',
      ],
      ['Laba (Rugi) Fiskal Tahun Berjalan', formatRupiah(result.fiscalNetProfit), 'Komersial + Koreksi Fiskal'],
      ['Kompensasi Kerugian Fiskal', `-${formatRupiah(result.lossCompensation)}`, 'Pasal 6 ayat (2) UU PPh'],
      [
        'Penghasilan Kena Pajak (PKP) Dibulatkan',
        formatRupiah(result.taxableIncomePkp),
        'Pasal 17 ayat (4) dibulatkan ribuan',
      ],
    ],
  });

  const y2 = ((doc as any).lastAutoTable?.finalY || 135) + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('II. Perhitungan PPh Badan Terutang (Pasal 17 & Fasilitas Pasal 31E)', 14, y2);

  autoTable(doc, {
    startY: y2 + 2.5,
    theme: 'grid',
    styles: { fontSize: 8.3, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'center' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
    head: [['Lapisan Pengenaan Pajak', 'PKP / Dasar (Rp)', 'Tarif', 'PPh Terutang (Rp)']],
    body: [
      [
        `Bagian PKP Fasilitas Pasal 31E (${(result.facilityShareRatio * 100).toFixed(2)}%)`,
        formatRupiah(result.facilityTaxableIncome),
        `${result.facilityRatePercent}%`,
        formatRupiah(result.pphFacilityDue),
      ],
      [
        'Bagian PKP Non-Fasilitas (Tarif Umum)',
        formatRupiah(result.nonFacilityTaxableIncome),
        `${result.generalRatePercent}%`,
        formatRupiah(result.pphNonFacilityDue),
      ],
    ],
    foot: [
      [
        'TOTAL PPH BADAN TERUTANG SETAHUN',
        formatRupiah(result.taxableIncomePkp),
        `${result.effectiveTaxRateOnPkp}% (Efektif)`,
        formatRupiah(result.totalPphBadanDue),
      ],
    ],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
  });

  const y3 = ((doc as any).lastAutoTable?.finalY || 190) + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('III. Perbandingan Tarif Normal vs Pasal 31E, Kredit Pajak & PPh 25/29', 14, y3);

  autoTable(doc, {
    startY: y3 + 2.5,
    theme: 'striped',
    styles: { fontSize: 8.3, cellPadding: 2.1 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 64 } },
    head: [['Parameter Perbandingan & Rekonsiliasi', 'Nominal (Rp)', 'Keterangan']],
    body: [
      [
        `PPh Badan Dengan Fasilitas 31E (${result.facilityRatePercent}% / Proporsional)`,
        formatRupiah(result.withFacility31EDue),
        result.applyPasal31EFacility ? 'Opsi Aktif' : 'Simulasi Perbandingan',
      ],
      [
        `PPh Badan Tarif Normal Pasal 17 (${result.generalRatePercent}%)`,
        formatRupiah(result.normalRatePphBadanDue),
        `Angsuran PPh 25: ${formatRupiah(result.normalRateMonthlyPph25)}/bln`,
      ],
      [
        'Penghematan Pajak dari Fasilitas Pasal 31E',
        formatRupiah(result.potentialSavings31E),
        `Hemat ${result.potentialSavingsPercent}% vs Tarif Normal`,
      ],
      [
        'Kredit Pajak (Angsuran PPh 25 / 22 / 23)',
        formatRupiah(result.taxCreditsPaid),
        'Sudah disetor tahun berjalan',
      ],
      [
        result.pph28aOverpayment > 0 ? 'PPh Pasal 28A (Lebih Bayar)' : 'PPh Pasal 29 (Kurang Bayar)',
        formatRupiah(result.pph28aOverpayment > 0 ? result.pph28aOverpayment : result.pph29Underpayment),
        'Selisih SPT Tahunan Badan',
      ],
      [
        'Estimasi Angsuran PPh Pasal 25 / Bulan',
        formatRupiah(result.estimatedMonthlyPph25),
        'Total PPh Terutang / 12 bulan',
      ],
    ],
  });

  let sigY = ((doc as any).lastAutoTable?.finalY || 245) + 10;
  if (sigY > 260) {
    doc.addPage();
    sigY = 22;
  }
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('Disiapkan Oleh (Keuangan / Admin),', 18, sigY);
  doc.text('Mengetahui (Direktur / Pimpinan),', pageWidth - 78, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(preparedBy || 'Admin Keuangan', 18, sigY + 18);
  doc.text(taxConfig.taxpayerName || storeSettings.storeName, pageWidth - 78, sigY + 18);

  const filename = `Laporan_PPh_Badan_31E_${year}.pdf`;
  doc.save(filename);
  return filename;
};
