import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Clock, 
  Calendar, 
  LogIn, 
  LogOut, 
  CheckCircle2, 
  Users, 
  Briefcase, 
  ShieldCheck, 
  UserCheck, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Search, 
  Filter, 
  X,
  FileSpreadsheet,
  Timer,
  FileDown,
  Printer,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Calculator,
  Receipt,
  Download
} from 'lucide-react';
import { AttendanceRecord, User, UserRole, StoreSettings } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { sound } from '../utils/audio';

interface AttendanceViewProps {
  currentUser: User;
  users: User[];
  attendances: AttendanceRecord[];
  storeSettings?: StoreSettings;
  onCheckIn: (userId: string, notes?: string) => void;
  onCheckOut: (attendanceId: string, notes?: string) => void;
  onAddManualAttendance: (record: Omit<AttendanceRecord, 'id'>) => void;
  onDeleteAttendance: (attendanceId: string) => void;
}

interface EmployeePayrollRecap {
  user: User;
  totalShifts: number;
  totalMinutesWorked: number;
  regularMinutes: number;
  overtimeMinutes: number;
  regularHoursDec: number;
  overtimeHoursDec: number;
  estimatedOvertimePay: number;
  estimatedBasicPay: number;
  estimatedTotalPay: number;
  shiftRecords: AttendanceRecord[];
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  currentUser,
  users,
  attendances,
  storeSettings,
  onCheckIn,
  onCheckOut,
  onAddManualAttendance,
  onDeleteAttendance,
}) => {
  const [activeTab, setActiveTab] = useState<'TERMINAL' | 'PAYROLL_REPORT'>('TERMINAL');
  const [currentLiveTime, setCurrentLiveTime] = useState(new Date());
  const [checkInNotes, setCheckInNotes] = useState('');
  const [checkOutNotes, setCheckOutNotes] = useState('');

  // Daily log filter state
  const pad = (n: number) => String(n).padStart(2, '0');
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(getTodayStr());
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Payroll Report states
  const [payrollPeriod, setPayrollPeriod] = useState<'THIS_WEEK' | 'LAST_WEEK' | 'THIS_MONTH' | 'ALL'>('THIS_WEEK');
  const [overtimeHourlyRate, setOvertimeHourlyRate] = useState<number>(20000); // Rp 20.000 / jam lembur
  const [basicHourlyRate, setBasicHourlyRate] = useState<number>(15000); // Rp 15.000 / jam standar
  const [dailyStandardHours, setDailyStandardHours] = useState<number>(8); // 8 jam standard shift
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  // Manual Attendance Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualUserId, setManualUserId] = useState(users[0]?.id || '');
  const [manualDate, setManualDate] = useState(getTodayStr());
  const [manualCheckInTime, setManualCheckInTime] = useState('08:00');
  const [manualCheckOutTime, setManualCheckOutTime] = useState('17:00');
  const [manualNotes, setManualNotes] = useState('');
  const [manualIsCompleted, setManualIsCompleted] = useState(true);

  // Live timer update
  useEffect(() => {
    const timer = setInterval(() => setCurrentLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = getTodayStr();

  // Find current user's active shift
  const activeShiftForCurrentUser = attendances.find(
    (att) => att.userId === currentUser.id && att.status === 'PRESENT'
  );

  // Helper formatting durations
  const formatDurationExact = (minutes?: number) => {
    if (!minutes && minutes !== 0) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} Menit`;
    return `${hours} Jam ${mins} Mnt`;
  };

  // Actions
  const handlePerformCheckIn = () => {
    sound.playSuccessChime();
    onCheckIn(currentUser.id, checkInNotes.trim() || undefined);
    setCheckInNotes('');
  };

  const handlePerformCheckOut = () => {
    if (!activeShiftForCurrentUser) return;
    sound.playSuccessChime();
    onCheckOut(activeShiftForCurrentUser.id, checkOutNotes.trim() || undefined);
    setCheckOutNotes('');
  };

  const handleSaveManualAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = users.find((u) => u.id === manualUserId);
    if (!targetUser) return;

    const checkInDateTimeStr = `${manualDate}T${manualCheckInTime}:00`;
    const checkInTimestamp = new Date(checkInDateTimeStr).getTime();

    let checkOutTimestamp: number | undefined = undefined;
    let durationMinutes: number | undefined = undefined;

    if (manualIsCompleted && manualCheckOutTime) {
      const checkOutDateTimeStr = `${manualDate}T${manualCheckOutTime}:00`;
      checkOutTimestamp = new Date(checkOutDateTimeStr).getTime();
      durationMinutes = Math.max(0, Math.round((checkOutTimestamp - checkInTimestamp) / 60000));
    }

    sound.playSuccessChime();
    onAddManualAttendance({
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      date: manualDate,
      checkInTime: `${manualCheckInTime}:00`,
      checkInTimestamp,
      checkOutTime: manualIsCompleted && manualCheckOutTime ? `${manualCheckOutTime}:00` : undefined,
      checkOutTimestamp,
      durationMinutes,
      notes: manualNotes.trim() || 'Absensi dimasukkan manual oleh Admin/Manager',
      status: manualIsCompleted ? 'COMPLETED' : 'PRESENT',
    });

    setIsManualModalOpen(false);
    setManualNotes('');
  };

  // Filter attendances for daily terminal
  const filteredAttendances = attendances.filter((att) => {
    if (dateFilter === 'today' && att.date !== todayStr) return false;
    if (dateFilter === 'yesterday') {
      const yesterday = new Date(Date.now() - 86400000);
      const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
      if (att.date !== yStr) return false;
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const weekAgoStr = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`;
      if (att.date < weekAgoStr) return false;
    }
    if (dateFilter === 'custom' && att.date !== customDate) return false;
    if (selectedUserFilter !== 'ALL' && att.userId !== selectedUserFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = att.userName.toLowerCase().includes(q);
      const matchNotes = att.notes?.toLowerCase().includes(q);
      if (!matchName && !matchNotes) return false;
    }
    return true;
  });

  // Calculate overview metrics for today
  const activeNowCount = attendances.filter((a) => a.status === 'PRESENT').length;
  const todayAttendances = attendances.filter((a) => a.date === todayStr);
  const completedTodayCount = todayAttendances.filter((a) => a.status === 'COMPLETED').length;
  const uniqueTodayEmployees = new Set(todayAttendances.map((a) => a.userId)).size;
  const canManageAttendance = currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER';

  // =========================================================================
  // PAYROLL RECAP COMPUTATIONS (Weekly / Monthly Overtime & Hours Engine)
  // =========================================================================
  const { payrollPeriodLabel, payrollRecapList, totalStoreWorkHours, totalStoreOvertimeHours, totalStoreOvertimePay, totalStorePayroll } = useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    let periodName = 'Minggu Ini';

    if (payrollPeriod === 'THIS_WEEK') {
      // Monday to Sunday of current week
      const day = now.getDay();
      const diffToMonday = now.getDate() - (day === 0 ? 6 : day - 1);
      startDate = new Date(now.setDate(diffToMonday));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      periodName = `Minggu Ini (${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })})`;
    } else if (payrollPeriod === 'LAST_WEEK') {
      const day = now.getDay();
      const diffToLastMonday = now.getDate() - (day === 0 ? 6 : day - 1) - 7;
      startDate = new Date(now.setDate(diffToLastMonday));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      periodName = `Minggu Lalu (${startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })})`;
    } else if (payrollPeriod === 'THIS_MONTH') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      periodName = `Bulan Ini (${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})`;
    } else {
      startDate = new Date(2020, 0, 1);
      endDate = new Date(2030, 11, 31);
      periodName = 'Semua Periode Tercatat';
    }

    const startYMD = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
    const endYMD = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;

    // Filter attendances in period
    const inPeriodAttendances = attendances.filter((att) => {
      return att.date >= startYMD && att.date <= endYMD;
    });

    const dailyStandardMinutes = dailyStandardHours * 60; // e.g. 480 minutes (8 hours)

    // Aggregate by user
    const list: EmployeePayrollRecap[] = users.map((u) => {
      const userAtts = inPeriodAttendances.filter((att) => att.userId === u.id);
      let totalMins = 0;
      let regularMins = 0;
      let overtimeMins = 0;

      userAtts.forEach((att) => {
        const duration = att.durationMinutes || (att.status === 'PRESENT' ? Math.round((Date.now() - att.checkInTimestamp) / 60000) : 0);
        totalMins += duration;

        if (duration > dailyStandardMinutes) {
          regularMins += dailyStandardMinutes;
          overtimeMins += (duration - dailyStandardMinutes);
        } else {
          regularMins += duration;
        }
      });

      const regularHoursDec = Math.round((regularMins / 60) * 10) / 10;
      const overtimeHoursDec = Math.round((overtimeMins / 60) * 10) / 10;
      const estimatedOvertimePay = Math.round(overtimeHoursDec * overtimeHourlyRate);
      const estimatedBasicPay = Math.round(regularHoursDec * basicHourlyRate);
      const estimatedTotalPay = estimatedBasicPay + estimatedOvertimePay;

      return {
        user: u,
        totalShifts: userAtts.length,
        totalMinutesWorked: totalMins,
        regularMinutes: regularMins,
        overtimeMinutes: overtimeMins,
        regularHoursDec,
        overtimeHoursDec,
        estimatedOvertimePay,
        estimatedBasicPay,
        estimatedTotalPay,
        shiftRecords: userAtts.sort((a, b) => b.checkInTimestamp - a.checkInTimestamp),
      };
    });

    // Summary calculations
    const totalStoreWorkMinutes = list.reduce((sum, item) => sum + item.totalMinutesWorked, 0);
    const totalStoreOvertimeMinutes = list.reduce((sum, item) => sum + item.overtimeMinutes, 0);
    const storeHours = Math.round((totalStoreWorkMinutes / 60) * 10) / 10;
    const storeOtHours = Math.round((totalStoreOvertimeMinutes / 60) * 10) / 10;
    const totalOtPay = list.reduce((sum, item) => sum + item.estimatedOvertimePay, 0);
    const totalPayroll = list.reduce((sum, item) => sum + item.estimatedTotalPay, 0);

    return {
      payrollPeriodLabel: periodName,
      payrollRecapList: list.sort((a, b) => b.totalMinutesWorked - a.totalMinutesWorked),
      totalStoreWorkHours: storeHours,
      totalStoreOvertimeHours: storeOtHours,
      totalStoreOvertimePay: totalOtPay,
      totalStorePayroll: totalPayroll,
    };
  }, [attendances, users, payrollPeriod, dailyStandardHours, overtimeHourlyRate, basicHourlyRate]);

  // =========================================================================
  // EXPORT TO PDF (jsPDF + autoTable for Payroll Archiving)
  // =========================================================================
  const handleExportPayrollPdf = () => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'landscape' });
    const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
    const storeAddress = storeSettings?.storeAddress || '';
    const storePhone = storeSettings?.storePhone || '';
    const dateFormatted = new Date().toLocaleDateString('id-ID', { dateStyle: 'full' });

    // Document Header
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // slate 900
    doc.text(`LAPORAN REKAPITULASI ABSENSI & LEMBUR KARYAWAN (PAYROLL)`, 14, 15);

    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate 500
    const locationStr = [storeTitle, storeAddress, storePhone ? `Telp: ${storePhone}` : ''].filter(Boolean).join(' • ');
    doc.text(locationStr, 14, 21);

    doc.text(
      `Periode: ${payrollPeriodLabel} | Standar Jam Harian: ${dailyStandardHours} Jam | Upah Pokok: ${formatRupiah(basicHourlyRate)}/jam | Upah Lembur: ${formatRupiah(overtimeHourlyRate)}/jam | Tanggal Cetak: ${dateFormatted}`,
      14,
      26
    );

    // Table Data Mapping
    const tableData = payrollRecapList.map((item, idx) => {
      const { user, totalShifts, totalMinutesWorked, regularHoursDec, overtimeHoursDec, estimatedOvertimePay, estimatedTotalPay } = item;
      const totalHours = Math.round((totalMinutesWorked / 60) * 10) / 10;
      return [
        (idx + 1).toString(),
        user.name,
        user.role,
        `${totalShifts} Hari`,
        `${totalHours} Jam (${formatDurationExact(totalMinutesWorked)})`,
        `${regularHoursDec} Jam`,
        `${overtimeHoursDec} Jam`,
        formatRupiah(estimatedOvertimePay),
        formatRupiah(estimatedTotalPay),
      ];
    });

    autoTable(doc, {
      startY: 31,
      head: [
        [
          'No',
          'Nama Karyawan',
          'Role / Jabatan',
          'Kehadiran Shift',
          'Total Durasi Kerja',
          'Jam Reguler',
          'Jam Lembur',
          'Estimasi Uang Lembur',
          'Total Estimasi Gaji',
        ],
      ],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 100;

    // Totals summary in PDF
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Total Toko: ${totalStoreWorkHours} Jam Kerja | Total Lembur: ${totalStoreOvertimeHours} Jam | Total Uang Lembur: ${formatRupiah(totalStoreOvertimePay)} | Total Beban Gaji: ${formatRupiah(totalStorePayroll)}`,
      14,
      finalY + 8
    );

    // Signature blocks for HR / Owner
    const signY = finalY + 22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Disiapkan Oleh (Kasir / Petugas):', 40, signY, { align: 'center' });
    doc.text('Disetujui Oleh (Store Manager / Owner):', 240, signY, { align: 'center' });

    doc.text('( ' + currentUser.name + ' )', 40, signY + 16, { align: 'center' });
    doc.text('( ........................................ )', 240, signY + 16, { align: 'center' });

    const filename = `laporan-absensi-payroll-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  // Export Single Employee Slip PDF
  const handleExportSingleEmployeeSlipPdf = (item: EmployeePayrollRecap) => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'portrait' });
    const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
    const storeAddress = storeSettings?.storeAddress || '';
    const dateFormatted = new Date().toLocaleDateString('id-ID', { dateStyle: 'full' });

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`SLIP REKAPITULASI KEHADIRAN & LEMBUR KARYAWAN`, 14, 15);

    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${storeTitle} ${storeAddress ? '• ' + storeAddress : ''}`, 14, 21);
    doc.text(`Periode: ${payrollPeriodLabel} | Tanggal Cetak: ${dateFormatted}`, 14, 26);

    // Employee Meta Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 31, 182, 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Nama Pegawai: ${item.user.name}`, 18, 38);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Jabatan / Role: ${item.user.role}`, 18, 44);
    doc.text(`Total Kehadiran: ${item.totalShifts} Hari Kerja | Total Jam: ${Math.round((item.totalMinutesWorked / 60) * 10) / 10} Jam`, 18, 50);

    doc.setFont('helvetica', 'bold');
    doc.text(`Jam Reguler: ${item.regularHoursDec} Jam | Jam Lembur: ${item.overtimeHoursDec} Jam`, 110, 44);
    doc.text(`Estimasi Kompensasi Lembur: ${formatRupiah(item.estimatedOvertimePay)}`, 110, 50);

    // Daily Shifts Table
    const shiftsTableData = item.shiftRecords.map((att, idx) => {
      const durMins = att.durationMinutes || 0;
      const isOt = durMins > dailyStandardHours * 60;
      const otMinutes = isOt ? durMins - dailyStandardHours * 60 : 0;

      return [
        (idx + 1).toString(),
        att.date,
        att.checkInTime || '-',
        att.checkOutTime || (att.status === 'PRESENT' ? 'Aktif' : '-'),
        formatDurationExact(durMins),
        otMinutes > 0 ? `+${formatDurationExact(otMinutes)}` : '-',
        att.notes || '-',
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [
        ['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Durasi Kerja', 'Lembur', 'Catatan Shift'],
      ],
      body: shiftsTableData,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        fontSize: 8,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    doc.setFontSize(8);
    doc.text('Diterima Oleh Karyawan,', 40, finalY + 16, { align: 'center' });
    doc.text('Diverifikasi Manajer,', 160, finalY + 16, { align: 'center' });

    doc.text(`( ${item.user.name} )`, 40, finalY + 30, { align: 'center' });
    doc.text('( ................................. )', 160, finalY + 30, { align: 'center' });

    const filename = `slip-absensi-${item.user.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        
        {/* Top Header & Live Clock */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-600/20 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-900">
                Absensi &amp; Rekap Lembur Payroll Karyawan
              </h2>
              <p className="text-xs text-slate-500">
                Catat jam kerja harian, hitung jam lembur otomatis, dan cetak laporan PDF untuk penggajian.
              </p>
            </div>
          </div>

          {/* Subtab Toggle Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start md:self-center">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setActiveTab('TERMINAL');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'TERMINAL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 text-sky-600" />
              <span>Terminal &amp; Catatan Kehadiran</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setActiveTab('PAYROLL_REPORT');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'PAYROLL_REPORT'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
              <span>Laporan Absensi &amp; Rekap Lembur</span>
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* TAB 1: TERMINAL CHECK-IN & LOG HARIAN                              */}
        {/* =================================================================== */}
        {activeTab === 'TERMINAL' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* HERO CARD: Current User's Check-in / Check-out Terminal */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 md:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl ${currentUser.avatarColor} text-white flex items-center justify-center text-lg font-black shadow-lg`}>
                      {currentUser.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base md:text-lg font-extrabold text-white">
                          {currentUser.name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white/20 text-white backdrop-blur-xs">
                          {currentUser.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Terminal Absensi Mandiri Pegawai Kasir
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canManageAttendance && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setIsManualModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-colors border border-white/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Input Absensi Manual</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Check In / Out Status Action Box */}
                <div className="mt-5 p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-300 font-semibold">Status Shift Saat Ini:</div>
                    <div className="text-lg font-bold flex items-center gap-2 mt-0.5">
                      {activeShiftForCurrentUser ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                          <span className="text-emerald-400">Sedang Aktif Bekerja</span>
                          <span className="text-xs font-normal text-slate-300 font-mono">
                            (Sejak {activeShiftForCurrentUser.checkInTime})
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                          <span className="text-slate-300">Belum Check-In / Di Luar Shift</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {activeShiftForCurrentUser ? (
                      <button
                        type="button"
                        onClick={handlePerformCheckOut}
                        className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Check-Out Shift Pulang</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePerformCheckIn}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Check-In Shift Masuk</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Aktif Bekerja Saat Ini</div>
                <div className="text-xl font-black text-emerald-600 font-mono mt-1">{activeNowCount} Kasir</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Sedang bertugas</div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Shift Selesai Hari Ini</div>
                <div className="text-xl font-black text-slate-900 font-mono mt-1">{completedTodayCount} Shift</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Telah check-out</div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Staf Masuk</div>
                <div className="text-xl font-black text-sky-700 font-mono mt-1">{uniqueTodayEmployees} Orang</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Dari {users.length} akun terdaftar</div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rekap Payroll</div>
                <button
                  type="button"
                  onClick={() => setActiveTab('PAYROLL_REPORT')}
                  className="mt-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <span>Buka Rekap Lembur &rarr;</span>
                </button>
                <div className="text-[10px] text-slate-500 mt-0.5">Perhitungan jam lembur &amp; PDF</div>
              </div>
            </div>

            {/* Attendance Filter Bar */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama karyawan atau catatan shift..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto shrink-0">
                {[
                  { id: 'today', label: 'Hari Ini' },
                  { id: 'yesterday', label: 'Kemarin' },
                  { id: 'week', label: '7 Hari Terakhir' },
                  { id: 'all', label: 'Semua Riwayat' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      sound.playTap();
                      setDateFilter(t.id as any);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      dateFilter === t.id
                        ? 'bg-sky-600 text-white font-bold shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Attendance List Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Nama Pegawai &amp; Role</th>
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Jam Masuk</th>
                      <th className="py-3 px-4">Jam Pulang</th>
                      <th className="py-3 px-4">Durasi Shift</th>
                      <th className="py-3 px-4">Status &amp; Lembur</th>
                      <th className="py-3 px-4">Catatan</th>
                      {canManageAttendance && <th className="py-3 px-4 text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAttendances.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                          Tidak ada catatan absensi pada periode atau filter ini.
                        </td>
                      </tr>
                    ) : (
                      filteredAttendances.map((att) => {
                        const durMins = att.durationMinutes || (att.status === 'PRESENT' ? Math.round((Date.now() - att.checkInTimestamp) / 60000) : 0);
                        const isOt = durMins > dailyStandardHours * 60;
                        const otMins = isOt ? durMins - dailyStandardHours * 60 : 0;

                        return (
                          <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{att.userName}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{att.userRole}</div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-700">{att.date}</td>
                            <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">{att.checkInTime}</td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                              {att.checkOutTime || (att.status === 'PRESENT' ? <span className="text-amber-600 animate-pulse">Sedang Aktif</span> : '-')}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold">
                              {formatDurationExact(durMins)}
                            </td>
                            <td className="py-3.5 px-4">
                              {isOt ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                  <span>Lembur +{formatDurationExact(otMins)}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                                  <span>Shift Normal</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-500 max-w-xs truncate">
                              {att.notes || '-'}
                            </td>
                            {canManageAttendance && (
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Hapus catatan absensi ${att.userName} pada tanggal ${att.date}?`)) {
                                      onDeleteAttendance(att.id);
                                    }
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                                  title="Hapus Absensi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: LAPORAN ABSENSI & REKAP LEMBUR PAYROLL                       */}
        {/* =================================================================== */}
        {activeTab === 'PAYROLL_REPORT' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Control Bar: Period Selection & Rates Configuration */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Periode Rekap:</span>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    {[
                      { id: 'THIS_WEEK', label: 'Minggu Ini' },
                      { id: 'LAST_WEEK', label: 'Minggu Lalu' },
                      { id: 'THIS_MONTH', label: 'Bulan Ini' },
                      { id: 'ALL', label: 'Semua' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          sound.playTap();
                          setPayrollPeriod(p.id as any);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          payrollPeriod === p.id
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-indigo-900 font-semibold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{payrollPeriodLabel}</span>
                </div>
              </div>

              {/* Overtime & Hourly Settings */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                  <span className="text-slate-500 font-bold">Standar Jam/Hari:</span>
                  <input
                    type="number"
                    value={dailyStandardHours}
                    onChange={(e) => setDailyStandardHours(Math.max(1, parseInt(e.target.value) || 8))}
                    className="w-12 p-1 bg-white border border-slate-300 rounded text-center font-bold font-mono focus:outline-none"
                  />
                  <span className="text-slate-400">Jam</span>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                  <span className="text-slate-500 font-bold">Tarif Lembur:</span>
                  <input
                    type="number"
                    value={overtimeHourlyRate}
                    onChange={(e) => setOvertimeHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-24 p-1 bg-white border border-slate-300 rounded text-right font-bold font-mono focus:outline-none"
                  />
                  <span className="text-slate-400">/jam</span>
                </div>

                {/* PDF Export Button */}
                <button
                  type="button"
                  onClick={handleExportPayrollPdf}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                  title="Ekspor Rekapitulasi Absensi & Lembur ke Dokumen PDF Digital (jsPDF)"
                >
                  <FileDown className="w-3.5 h-3.5 text-sky-400" />
                  <span>Ekspor PDF Payroll</span>
                </button>
              </div>
            </div>

            {/* 4 KPI Summary Cards for Payroll */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Jam Kerja Tim</div>
                <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1">
                  {totalStoreWorkHours} <span className="text-xs font-normal text-slate-500">Jam</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Akumulasi seluruh karyawan</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5" />
                  <span>Total Jam Lembur</span>
                </div>
                <div className="text-xl md:text-2xl font-black text-indigo-700 font-mono mt-1">
                  {totalStoreOvertimeHours} <span className="text-xs font-normal text-slate-500">Jam</span>
                </div>
                <div className="text-[10px] text-indigo-600/80 mt-0.5">Melebihi {dailyStandardHours} jam/hari</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estimasi Biaya Lembur</div>
                <div className="text-xl md:text-2xl font-black text-amber-600 font-mono mt-1">
                  {formatRupiah(totalStoreOvertimePay)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">@ {formatRupiah(overtimeHourlyRate)}/jam lembur</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Beban Gaji/Honor</div>
                <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1">
                  {formatRupiah(totalStorePayroll)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Gaji pokok + uang lembur</div>
              </div>
            </div>

            {/* Payroll Table Breakdown per Employee */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-sky-400" />
                    <span>Rekapitulasi Jam Kerja &amp; Lembur per Karyawan</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Data di bawah dihitung otomatis dari log check-in dan check-out shift pada periode terpilih.
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono font-bold">
                  {payrollRecapList.length} Karyawan
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {payrollRecapList.map((item, idx) => {
                  const { user, totalShifts, totalMinutesWorked, regularHoursDec, overtimeHoursDec, estimatedOvertimePay, estimatedTotalPay, shiftRecords } = item;
                  const isExpanded = expandedEmployeeId === user.id;
                  const totalHoursDec = Math.round((totalMinutesWorked / 60) * 10) / 10;

                  return (
                    <div key={user.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl ${user.avatarColor || 'bg-sky-600'} text-white flex items-center justify-center font-bold text-sm shrink-0`}>
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{user.name}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {user.role}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 font-mono">
                              <span>{totalShifts} Hari Masuk</span>
                              <span>·</span>
                              <span>Total: {totalHoursDec} Jam ({formatDurationExact(totalMinutesWorked)})</span>
                            </div>
                          </div>
                        </div>

                        {/* Breakdown Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Jam Reguler</span>
                            <span className="font-bold font-mono text-slate-800">{regularHoursDec} Jam</span>
                          </div>

                          <div>
                            <span className="text-[10px] text-indigo-600 uppercase font-bold block">Jam Lembur</span>
                            <span className={`font-bold font-mono ${overtimeHoursDec > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
                              {overtimeHoursDec > 0 ? `+${overtimeHoursDec} Jam` : '0 Jam'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Uang Lembur</span>
                            <span className="font-bold font-mono text-amber-700">{formatRupiah(estimatedOvertimePay)}</span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Gaji Est.</span>
                            <span className="font-black font-mono text-emerald-700">{formatRupiah(estimatedTotalPay)}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => handleExportSingleEmployeeSlipPdf(item)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
                            title="Cetak Slip Rekap Kehadiran Pegawai Ini (.PDF)"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-600" />
                            <span>Slip Absensi</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setExpandedEmployeeId(isExpanded ? null : user.id);
                            }}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title={isExpanded ? 'Tutup Rincian Shift' : 'Lihat Rincian Shift Harian'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Daily Shift Log for this Employee */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2 animate-in fade-in duration-100">
                          <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Rincian Shift Harian ({shiftRecords.length} Kehadiran):</span>
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                                <tr>
                                  <th className="py-2 px-3">Tanggal</th>
                                  <th className="py-2 px-3">Masuk</th>
                                  <th className="py-2 px-3">Pulang</th>
                                  <th className="py-2 px-3">Total Durasi</th>
                                  <th className="py-2 px-3">Reguler</th>
                                  <th className="py-2 px-3">Lembur</th>
                                  <th className="py-2 px-3">Catatan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {shiftRecords.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="py-3 text-center text-slate-400">
                                      Tidak ada absensi pada periode ini.
                                    </td>
                                  </tr>
                                ) : (
                                  shiftRecords.map((s) => {
                                    const dur = s.durationMinutes || 0;
                                    const ot = dur > dailyStandardHours * 60 ? dur - dailyStandardHours * 60 : 0;
                                    const reg = dur - ot;

                                    return (
                                      <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{s.date}</td>
                                        <td className="py-2 px-3 font-mono text-emerald-700">{s.checkInTime}</td>
                                        <td className="py-2 px-3 font-mono text-slate-700">{s.checkOutTime || 'Aktif'}</td>
                                        <td className="py-2 px-3 font-mono font-bold">{formatDurationExact(dur)}</td>
                                        <td className="py-2 px-3 font-mono text-slate-600">{formatDurationExact(reg)}</td>
                                        <td className="py-2 px-3 font-mono">
                                          {ot > 0 ? (
                                            <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                              +{formatDurationExact(ot)}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">-</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-slate-500 max-w-xs truncate">{s.notes || '-'}</td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Input Absensi Manual */}
        {isManualModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Input Absensi Manual</h3>
                    <p className="text-xs text-slate-500">Khusus Admin &amp; Store Manager</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsManualModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveManualAttendance} className="py-4 space-y-3.5 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Pilih Karyawan</label>
                  <select
                    value={manualUserId}
                    onChange={(e) => setManualUserId(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:outline-none focus:border-indigo-500"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Absensi</label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Jam Masuk (Check-in)</label>
                    <input
                      type="time"
                      required
                      value={manualCheckInTime}
                      onChange={(e) => setManualCheckInTime(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Jam Pulang (Check-out)</label>
                    <input
                      type="time"
                      disabled={!manualIsCompleted}
                      value={manualCheckOutTime}
                      onChange={(e) => setManualCheckOutTime(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={manualIsCompleted}
                    onChange={(e) => setManualIsCompleted(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Shift sudah selesai (tandai sebagai COMPLETED)
                  </span>
                </label>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Catatan</label>
                  <input
                    type="text"
                    placeholder="Misal: Lupa check-in via tablet, hadir tepat waktu"
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    Simpan Absensi
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
