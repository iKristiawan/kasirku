import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  PieChart as PieIcon, 
  Layers, 
  Sparkles,
  ArrowUpRight,
  CreditCard,
  Clock,
  Flame,
  Users,
  AlertCircle
} from 'lucide-react';
import { Transaction, Product } from '../types/pos';
import { formatRupiah, formatNumber, formatDateOnly } from '../utils/formatters';
import { sound } from '../utils/audio';

interface SalesChartViewProps {
  transactions: Transaction[];
  products: Product[];
}

export const SalesChartView: React.FC<SalesChartViewProps> = ({
  transactions,
  products,
}) => {
  const [viewMode, setViewMode] = useState<'DAILY' | 'WEEKLY' | 'PAYMENT_METHODS' | 'HOURLY_PEAK'>('DAILY');
  const [chartType, setChartType] = useState<'AREA' | 'BAR'>('AREA');
  const [dayRange, setDayRange] = useState<number>(7); // 7, 14, 30 days
  const [hourlyMetric, setHourlyMetric] = useState<'TX_COUNT' | 'REVENUE'>('TX_COUNT');
  const d3SvgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredHour, setHoveredHour] = useState<{ label: string; txCount: number; revenue: number } | null>(null);

  // Product map for COGS calculation
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Compute Daily Aggregated Data
  const dailyData = useMemo(() => {
    const now = new Date();
    const result: {
      dateKey: string;
      label: string;
      fullDate: string;
      revenue: number;
      cogs: number;
      profit: number;
      txCount: number;
    }[] = [];

    // Pre-populate days in the chosen range so even days with 0 sales appear cleanly
    for (let i = dayRange - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
      const fullDate = d.toLocaleDateString('id-ID', { dateStyle: 'full' });

      result.push({
        dateKey,
        label: dayLabel,
        fullDate,
        revenue: 0,
        cogs: 0,
        profit: 0,
        txCount: 0,
      });
    }

    const map = new Map(result.map((item) => [item.dateKey, item]));

    transactions.forEach((tx) => {
      const txDateKey = new Date(tx.timestamp).toISOString().split('T')[0];
      const existing = map.get(txDateKey);
      if (existing) {
        existing.revenue += tx.finalAmount;
        existing.txCount += 1;

        let txCOGS = 0;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const itemCost = item.costPrice ?? (prod?.costPrice || 0);
          txCOGS += item.quantity * item.conversionFactor * itemCost;
        });

        existing.cogs += txCOGS;
        existing.profit = existing.revenue - existing.cogs;
      }
    });

    return result;
  }, [transactions, dayRange, productMap]);

  // Compute Weekly Aggregated Data (Last 4 Weeks)
  const weeklyData = useMemo(() => {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const weeks = [
      { id: 'w4', label: '3 Minggu Lalu', start: now - 4 * oneWeekMs, end: now - 3 * oneWeekMs, revenue: 0, cogs: 0, profit: 0, txCount: 0 },
      { id: 'w3', label: '2 Minggu Lalu', start: now - 3 * oneWeekMs, end: now - 2 * oneWeekMs, revenue: 0, cogs: 0, profit: 0, txCount: 0 },
      { id: 'w2', label: 'Minggu Lalu', start: now - 2 * oneWeekMs, end: now - oneWeekMs, revenue: 0, cogs: 0, profit: 0, txCount: 0 },
      { id: 'w1', label: 'Minggu Ini', start: now - oneWeekMs, end: now, revenue: 0, cogs: 0, profit: 0, txCount: 0 },
    ];

    transactions.forEach((tx) => {
      const targetWeek = weeks.find((w) => tx.timestamp >= w.start && tx.timestamp <= w.end);
      if (targetWeek) {
        targetWeek.revenue += tx.finalAmount;
        targetWeek.txCount += 1;

        let txCOGS = 0;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const itemCost = item.costPrice ?? (prod?.costPrice || 0);
          txCOGS += item.quantity * item.conversionFactor * itemCost;
        });

        targetWeek.cogs += txCOGS;
        targetWeek.profit = targetWeek.revenue - targetWeek.cogs;
      }
    });

    return weeks;
  }, [transactions, productMap]);

  // Compute Payment Method Breakdown
  const paymentMethodData = useMemo(() => {
    const methods: Record<string, { label: string; count: number; total: number; color: string }> = {
      CASH: { label: 'Tunai (Cash)', count: 0, total: 0, color: '#10b981' },
      QRIS_BCA: { label: 'QRIS BCA', count: 0, total: 0, color: '#0284c7' },
      EDC_BCA: { label: 'EDC BCA', count: 0, total: 0, color: '#6366f1' },
      TRANSFER_BCA: { label: 'Transfer BCA', count: 0, total: 0, color: '#3b82f6' },
      PIUTANG: { label: 'Piutang (Tempo)', count: 0, total: 0, color: '#f59e0b' },
    };

    transactions.forEach((tx) => {
      if (methods[tx.paymentMethod]) {
        methods[tx.paymentMethod].count += 1;
        methods[tx.paymentMethod].total += tx.finalAmount;
      }
    });

    return Object.entries(methods)
      .map(([key, val]) => ({
        key,
        name: val.label,
        value: val.total,
        count: val.count,
        color: val.color,
      }))
      .filter((item) => item.value > 0);
  }, [transactions]);

  // Insights / Highest day calculation
  const highestDay = useMemo(() => {
    if (dailyData.length === 0) return null;
    let max = dailyData[0];
    dailyData.forEach((d) => {
      if (d.revenue > max.revenue) max = d;
    });
    return max.revenue > 0 ? max : null;
  }, [dailyData]);

  const totalPeriodRevenue = useMemo(() => {
    return dailyData.reduce((acc, d) => acc + d.revenue, 0);
  }, [dailyData]);

  const averageDailyRevenue = dailyData.length > 0 ? totalPeriodRevenue / dailyData.length : 0;

  // Custom Tooltip for Charts
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[200px]">
          <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 mb-2">
            {payload[0]?.payload?.fullDate || label}
          </div>
          <div className="space-y-1.5 font-mono">
            {payload.map((entry: any, index: number) => (
              <div key={`item-${index}`} className="flex justify-between items-center text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{entry.name}:</span>
                </span>
                <span className="font-bold tabular-nums" style={{ color: entry.color }}>
                  {formatRupiah(entry.value)}
                </span>
              </div>
            ))}
            {payload[0]?.payload?.txCount !== undefined && (
              <div className="pt-1.5 mt-1.5 border-t border-slate-800 flex justify-between text-slate-400 text-[10px]">
                <span>Total Transaksi:</span>
                <span className="font-bold text-white">
                  {payload[0].payload.txCount} Nota
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Hourly distribution data (00:00 - 23:00)
  const hourlyData = useMemo(() => {
    const list = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, '0')}:00`,
      txCount: 0,
      revenue: 0,
    }));

    transactions.forEach((tx) => {
      const h = new Date(tx.timestamp).getHours();
      if (h >= 0 && h < 24) {
        list[h].txCount += 1;
        list[h].revenue += tx.finalAmount;
      }
    });

    const maxTx = Math.max(1, ...list.map((h) => h.txCount));
    const maxRev = Math.max(1, ...list.map((h) => h.revenue));

    return {
      hours: list.map((h) => ({
        ...h,
        isPeak: h.txCount === maxTx && maxTx > 0,
        isHighTraffic: h.txCount >= Math.max(2, maxTx * 0.7),
      })),
      maxTx,
      maxRev,
      busiestHour: list.reduce((prev, curr) => (curr.txCount > prev.txCount ? curr : prev), list[0]),
    };
  }, [transactions]);

  // D3.js Chart Renderer Effect
  useEffect(() => {
    if (viewMode !== 'HOURLY_PEAK' || !d3SvgRef.current) return;

    const svg = d3.select(d3SvgRef.current);
    svg.selectAll('*').remove();

    const container = d3SvgRef.current.parentElement;
    const width = container ? container.clientWidth : 700;
    const height = 280;
    const margin = { top: 25, right: 25, bottom: 40, left: 60 };
    const innerWidth = Math.max(200, width - margin.left - margin.right);
    const innerHeight = Math.max(100, height - margin.top - margin.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const data = hourlyData.hours;
    const valueKey = hourlyMetric === 'TX_COUNT' ? 'txCount' : 'revenue';
    const maxValue = d3.max(data, (d) => d[valueKey]) || 1;

    // Scales
    const xScale = d3
      .scaleBand()
      .domain(data.map((d) => d.label))
      .range([0, innerWidth])
      .padding(0.25);

    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue * 1.25])
      .range([innerHeight, 0])
      .nice();

    // Defs & Gradients
    const defs = svg.append('defs');
    const areaGradient = defs
      .append('linearGradient')
      .attr('id', 'd3-hourly-area-gradient')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1');

    areaGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.45);
    areaGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.02);

    const barGradient = defs
      .append('linearGradient')
      .attr('id', 'd3-hourly-bar-gradient')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1');

    barGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b');
    barGradient.append('stop').attr('offset', '100%').attr('stop-color', '#d97706');

    // Horizontal grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').attr('stroke', '#f1f5f9').attr('stroke-dasharray', '3,3'));

    // Area Generator
    const area = d3
      .area<any>()
      .x((d) => (xScale(d.label) || 0) + xScale.bandwidth() / 2)
      .y0(innerHeight)
      .y1((d) => yScale(d[valueKey]))
      .curve(d3.curveMonotoneX);

    // Line Generator
    const line = d3
      .line<any>()
      .x((d) => (xScale(d.label) || 0) + xScale.bandwidth() / 2)
      .y((d) => yScale(d[valueKey]))
      .curve(d3.curveMonotoneX);

    // Append Area
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#d3-hourly-area-gradient)')
      .attr('d', area);

    // Append Line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#d97706')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    // Append Interactive Bars
    g.selectAll('.hourly-bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'hourly-bar')
      .attr('x', (d) => xScale(d.label) || 0)
      .attr('y', (d) => yScale(d[valueKey]))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => Math.max(0, innerHeight - yScale(d[valueKey])))
      .attr('rx', 3)
      .attr('fill', (d) => (d.isPeak ? '#ea580c' : d.isHighTraffic ? 'url(#d3-hourly-bar-gradient)' : '#cbd5e1'))
      .attr('opacity', 0.85)
      .attr('cursor', 'pointer')
      .on('mouseenter', (event: MouseEvent, d) => {
        d3.select(event.currentTarget as SVGRectElement).attr('opacity', 1).attr('stroke', '#0f172a').attr('stroke-width', 1.5);
        setHoveredHour(d);
      })
      .on('mouseleave', (event: MouseEvent) => {
        d3.select(event.currentTarget as SVGRectElement).attr('opacity', 0.85).attr('stroke', 'none');
      });

    // Peak marker circle
    const peakItem = data.find((d) => d.isPeak);
    if (peakItem && peakItem[valueKey] > 0) {
      const cx = (xScale(peakItem.label) || 0) + xScale.bandwidth() / 2;
      const cy = yScale(peakItem[valueKey]);
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 5).attr('fill', '#ea580c').attr('stroke', '#ffffff').attr('stroke-width', 2);
    }

    // X-Axis
    const xAxis = d3
      .axisBottom(xScale)
      .tickValues(data.filter((_, i) => i % 2 === 0).map((d) => d.label));

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((g) => g.select('.domain').attr('stroke', '#cbd5e1'))
      .call((g) => g.selectAll('.tick text').attr('fill', '#64748b').attr('font-size', '10px').attr('font-family', 'monospace'));

    // Y-Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => (hourlyMetric === 'TX_COUNT' ? `${d}x` : formatRupiah(Number(d)).replace('Rp ', '')));

    g.append('g')
      .call(yAxis)
      .call((g) => g.select('.domain').attr('stroke', '#cbd5e1'))
      .call((g) => g.selectAll('.tick text').attr('fill', '#64748b').attr('font-size', '10px').attr('font-family', 'monospace'));

  }, [viewMode, hourlyMetric, hourlyData]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-4 md:p-6 space-y-5 select-none font-sans">
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Visualisasi Tren Pendapatan & Laba
              </h3>
              <p className="text-xs text-slate-500">
                Grafik performa omzet harian, mingguan, dan komposisi transaksi toko
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => {
                sound.playTap();
                setViewMode('DAILY');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'DAILY'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Harian
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setViewMode('WEEKLY');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'WEEKLY'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mingguan
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setViewMode('PAYMENT_METHODS');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'PAYMENT_METHODS'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Metode Bayar
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setViewMode('HOURLY_PEAK');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'HOURLY_PEAK'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              <span>Jam Sibuk (D3.js)</span>
            </button>
          </div>

          {/* Sub-controls for Daily Mode */}
          {viewMode === 'DAILY' && (
            <div className="flex items-center gap-1">
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => {
                    sound.playTap();
                    setDayRange(days);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors ${
                    dayRange === days
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {days}H
                </button>
              ))}

              <button
                onClick={() => {
                  sound.playTap();
                  setChartType(chartType === 'AREA' ? 'BAR' : 'AREA');
                }}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold ml-1"
                title={chartType === 'AREA' ? 'Ganti ke Grafik Batang' : 'Ganti ke Grafik Area'}
              >
                {chartType === 'AREA' ? (
                  <BarChart3 className="w-4 h-4 text-sky-600" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Highlight Strip for Visual Context */}
      {viewMode === 'DAILY' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Omzet ({dayRange} Hari)
            </span>
            <span className="text-base font-black text-slate-900 font-mono mt-0.5 block tabular-nums">
              {formatRupiah(totalPeriodRevenue)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Rata-rata Penjualan / Hari
            </span>
            <span className="text-base font-black text-sky-700 font-mono mt-0.5 block tabular-nums">
              {formatRupiah(averageDailyRevenue)}
            </span>
          </div>

          {highestDay && (
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200/80 col-span-2 md:col-span-1">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
                <span>Puncak Penjualan Tertinggi</span>
                <Sparkles className="w-3 h-3 text-emerald-600" />
              </span>
              <span className="text-base font-black text-emerald-700 font-mono mt-0.5 block tabular-nums">
                {formatRupiah(highestDay.revenue)}
              </span>
              <span className="text-[10px] text-emerald-800 block truncate">
                {highestDay.label} ({highestDay.txCount} transaksi)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Primary Chart Area */}
      <div className="w-full h-72 md:h-80">
        {viewMode === 'DAILY' && (
          chartType === 'AREA' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={(val) => `Rp ${(val / 1000).toLocaleString('id-ID')}k`} 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                  formatter={(value) => (
                    <span className="text-slate-700 font-bold">{value}</span>
                  )}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  name="Pendapatan (Omzet)" 
                  stroke="#0284c7" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  name="Laba Kotor" 
                  stroke="#10b981" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorProfit)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={(val) => `Rp ${(val / 1000).toLocaleString('id-ID')}k`} 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                  formatter={(value) => (
                    <span className="text-slate-700 font-bold">{value}</span>
                  )}
                />
                <Bar 
                  dataKey="revenue" 
                  name="Pendapatan (Omzet)" 
                  fill="#0284c7" 
                  radius={[6, 6, 0, 0]} 
                />
                <Bar 
                  dataKey="cogs" 
                  name="Modal (HPP)" 
                  fill="#f43f5e" 
                  radius={[6, 6, 0, 0]} 
                />
                <Bar 
                  dataKey="profit" 
                  name="Laba Kotor" 
                  fill="#10b981" 
                  radius={[6, 6, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          )
        )}

        {viewMode === 'WEEKLY' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={(val) => `Rp ${(val / 1000).toLocaleString('id-ID')}k`} 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomChartTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                formatter={(value) => (
                  <span className="text-slate-700 font-bold">{value}</span>
                )}
              />
              <Bar dataKey="revenue" name="Pendapatan Mingguan" fill="#0284c7" radius={[6, 6, 0, 0]} />
              <Bar dataKey="profit" name="Laba Mingguan" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {viewMode === 'PAYMENT_METHODS' && (
          <div className="h-full flex flex-col md:flex-row items-center justify-around gap-4">
            <div className="w-full md:w-1/2 h-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [formatRupiah(Number(value)), 'Total Volume']} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full md:w-1/2 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Volume Transaksi per Metode:
              </span>
              {paymentMethodData.map((m) => (
                <div
                  key={m.key}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="font-semibold text-slate-800">{m.name}</span>
                  </div>
                  <div className="text-right font-mono font-bold text-slate-900 tabular-nums">
                    {formatRupiah(m.value)} ({m.count}x)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* VIEW 4: D3.JS HOURLY SALES PEAK HOURS (JAM SIBUK TOKO)              */}
        {/* =================================================================== */}
        {viewMode === 'HOURLY_PEAK' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Top Toolbar for D3 Chart: Metric Switcher & Peak Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50/70 p-3 rounded-2xl border border-amber-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <Flame className="w-4 h-4 fill-slate-950" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Analisis Jam Sibuk Toko (Peak Hours)</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 text-[10px] font-black uppercase">
                      D3.js Powered
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Jam tersibuk toko: <strong className="text-amber-800">{hourlyData.busiestHour?.label}</strong> ({hourlyData.busiestHour?.txCount} transaksi · {formatRupiah(hourlyData.busiestHour?.revenue)})
                  </div>
                </div>
              </div>

              {/* Metric Toggle: Qty vs Omzet */}
              <div className="flex items-center gap-1 p-0.5 bg-white rounded-xl border border-amber-200 self-stretch sm:self-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setHourlyMetric('TX_COUNT');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    hourlyMetric === 'TX_COUNT'
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Traffic (Transaksi)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setHourlyMetric('REVENUE');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    hourlyMetric === 'REVENUE'
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Omzet (Rp)
                </button>
              </div>
            </div>

            {/* D3.js SVG Chart Canvas */}
            <div className="w-full relative bg-slate-50 rounded-2xl border border-slate-200 p-2 overflow-hidden">
              <svg
                ref={d3SvgRef}
                className="w-full h-[280px] overflow-visible"
              />

              {/* Interactive Hover HUD */}
              {hoveredHour && (
                <div className="absolute top-4 right-4 bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs space-y-1 font-mono animate-in fade-in z-10 border border-slate-700">
                  <div className="font-bold text-amber-400">Pukul {hoveredHour.label}</div>
                  <div className="text-[11px] text-slate-300">
                    Jumlah: <strong className="text-white">{hoveredHour.txCount} Nota Transaksi</strong>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Omzet: <strong className="text-emerald-400">{formatRupiah(hoveredHour.revenue)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Staffing Recommendation Footer for Cashier Team */}
            <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600 shrink-0" />
                <span>
                  <strong>Rekomendasi Staf Kasir:</strong> Siagakan 2 kasir aktif saat mendekati jam sibuk (pukul <strong>{hourlyData.busiestHour?.label}</strong>) untuk meminimalkan waktu tunggu antrian konsumen di meja kasir tablet.
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono shrink-0 hidden md:inline">
                24-Hour Cycle
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
