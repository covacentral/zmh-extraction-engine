'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAnalyticsData } from '../../../actions/getAnalytics';

export default function DashboardClient({ commerceId, businessName, themeHex }: { commerceId: string, businessName: string, themeHex: string }) {
    const [days, setDays] = useState<number>(30);
    const [loading, setLoading] = useState<boolean>(true);
    const [statsList, setStatsList] = useState<any[]>([]);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        getAnalyticsData(commerceId, days).then(data => {
            if (isMounted) {
                setStatsList(data);
                setLoading(false);
            }
        });
        return () => { isMounted = false; };
    }, [commerceId, days]);

    const formatCurrency = (val: number) => `$${(val || 0).toLocaleString('es-CO')}`;

    const aggregates = useMemo(() => {
        let totalSales = 0;
        let totalOrders = 0;
        let salesByAsesor: Record<string, number> = {};
        let salesByArea: Record<string, number> = {};
        let salesByBrand: Record<string, number> = {};
        let topProducts: Record<string, { qty: number, revenue: number }> = {};

        statsList.forEach(day => {
            totalSales += (day.totalSales || 0);
            totalOrders += (day.totalOrders || 0);
            
            if (day.salesByAsesor) {
                Object.entries(day.salesByAsesor).forEach(([k, v]) => {
                    salesByAsesor[k] = (salesByAsesor[k] || 0) + (v as number);
                });
            }
            if (day.salesByArea) {
                Object.entries(day.salesByArea).forEach(([k, v]) => {
                    salesByArea[k] = (salesByArea[k] || 0) + (v as number);
                });
            }
            if (day.salesByBrand) {
                Object.entries(day.salesByBrand).forEach(([k, v]) => {
                    salesByBrand[k] = (salesByBrand[k] || 0) + (v as number);
                });
            }
            if (day.soldProducts) {
                Object.entries(day.soldProducts).forEach(([k, v]: any) => {
                    if (!topProducts[k]) topProducts[k] = { qty: 0, revenue: 0 };
                    topProducts[k].qty += (v.qty || 0);
                    topProducts[k].revenue += (v.revenue || 0);
                });
            }
        });

        const sortMap = (obj: Record<string, number>) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
        const sortProd = (obj: Record<string, {qty: number, revenue: number}>) => Object.entries(obj).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);

        return {
            totalSales,
            totalOrders,
            avgTicket: totalOrders > 0 ? totalSales / totalOrders : 0,
            asesores: sortMap(salesByAsesor),
            areas: sortMap(salesByArea),
            brands: sortMap(salesByBrand),
            products: sortProd(topProducts)
        };
    }, [statsList]);

    // Simple Bar Chart Component using Tailwind
    const BarChart = ({ data, title }: { data: [string, number][], title: string }) => {
        const maxVal = Math.max(...data.map(d => d[1]), 1);
        return (
            <div className="bg-[#111] border border-white/10 rounded-2xl p-5 mt-4">
                <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">{title}</h3>
                {data.length === 0 && <p className="text-white/30 text-sm">Sin datos</p>}
                <div className="flex flex-col gap-3">
                    {data.map(([label, val], idx) => {
                        const pct = Math.max((val / maxVal) * 100, 2); // At least 2% to show the bar
                        return (
                            <div key={idx} className="flex flex-col gap-1">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-white truncate pr-2">{label}</span>
                                    <span style={{ color: themeHex }}>{formatCurrency(val)}</span>
                                </div>
                                <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%`, backgroundColor: themeHex }}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-20">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white mb-1">Métricas</h1>
                <p className="text-white/50 text-sm">{businessName}</p>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                {[
                    { label: 'Hoy', d: 0 },
                    { label: 'Últimos 7 días', d: 7 },
                    { label: 'Últimos 30 días', d: 30 },
                    { label: 'Este Año', d: 365 }
                ].map(opt => (
                    <button 
                        key={opt.d}
                        onClick={() => setDays(opt.d)}
                        className={`shrink-0 px-5 py-2 rounded-xl text-xs font-bold transition-all ${days === opt.d ? 'bg-white text-black shadow-md' : 'bg-[#111] text-white/50 border border-white/10 hover:text-white hover:bg-white/5'}`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="h-40 flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 text-white/30 border-4 border-current border-t-white rounded-full"></div>
                </div>
            ) : (
                <div className="opacity-100 transition-opacity duration-500">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                        <div className="bg-[#111] border border-white/10 p-4 rounded-2xl flex flex-col justify-center">
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest block mb-1">Ingresos Brutos</span>
                            <span className="text-xl sm:text-2xl font-bold text-white" style={{ color: themeHex }}>{formatCurrency(aggregates.totalSales)}</span>
                        </div>
                        <div className="bg-[#111] border border-white/10 p-4 rounded-2xl flex flex-col justify-center">
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest block mb-1">Pedidos Procesados</span>
                            <span className="text-xl sm:text-2xl font-bold text-white">{aggregates.totalOrders}</span>
                        </div>
                        <div className="bg-[#111] border border-white/10 p-4 rounded-2xl flex flex-col justify-center col-span-2 md:col-span-1">
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest block mb-1">Ticket Promedio</span>
                            <span className="text-xl sm:text-2xl font-bold text-white">{formatCurrency(aggregates.avgTicket)}</span>
                        </div>
                    </div>

                    {/* Main Charts */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <BarChart title="Rendimiento por Asesor" data={aggregates.asesores} />
                        <BarChart title="Facturación por Área" data={aggregates.areas} />
                    </div>

                    <div className="mt-4">
                        <BarChart title="Ventas por Marca" data={aggregates.brands} />
                    </div>

                    {/* Top Products Table */}
                    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 mt-4 overflow-hidden">
                        <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">Top 10 Productos Estrella</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-white/10 text-white/40 uppercase text-[10px] tracking-wider">
                                        <th className="pb-3 font-bold w-1/2">Producto</th>
                                        <th className="pb-3 font-bold">Unidades</th>
                                        <th className="pb-3 font-bold text-right">Ingresos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aggregates.products.map(([name, stats], idx) => (
                                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-3 pr-2 text-white/90 font-medium truncate max-w-[150px] sm:max-w-[300px]">{name}</td>
                                            <td className="py-3 text-white/70">{stats.qty}x</td>
                                            <td className="py-3 text-right font-bold text-white">{formatCurrency(stats.revenue)}</td>
                                        </tr>
                                    ))}
                                    {aggregates.products.length === 0 && (
                                        <tr><td colSpan={3} className="py-4 text-center text-white/30 text-xs">Aún no hay ventas registradas en este periodo.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
