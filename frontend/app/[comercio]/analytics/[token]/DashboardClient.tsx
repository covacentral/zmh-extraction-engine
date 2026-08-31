'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAnalyticsData } from '../../../actions/getAnalytics';

export default function DashboardClient({ commerceId, authToken = '', businessName, themeHex }: { commerceId: string, authToken?: string, businessName: string, themeHex: string }) {
    const [days, setDays] = useState<number>(30);
    const [loading, setLoading] = useState<boolean>(true);
    const [statsList, setStatsList] = useState<any[]>([]);

    // Advanced Filters
    const [filterAsesor, setFilterAsesor] = useState<string>('ALL');
    const [filterModo, setFilterModo] = useState<string>('ALL');
    
    // Pagination and Search
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 10;

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        getAnalyticsData(commerceId, authToken, days).then(data => {
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
        let ordersByAsesor: Record<string, number> = {};
        let salesByArea: Record<string, number> = {};
        let salesByBrand: Record<string, number> = {};
        let topProducts: Record<string, { qty: number, revenue: number }> = {};

        // To populate dropdown options
        let allAsesores = new Set<string>();

        statsList.forEach(day => {
            // Recolectar nombres de asesores disponibles para el dropdown
            if (day.salesByAsesor) {
                Object.keys(day.salesByAsesor).forEach(a => allAsesores.add(a));
            }

            // Si hay filtros, sumamos de las dimensiones cruzadas. Si no, tomamos los root totals.
            if (filterAsesor === 'ALL' && filterModo === 'ALL') {
                totalSales += (day.totalSales || 0);
                totalOrders += (day.totalOrders || 0);
            } else if (filterAsesor !== 'ALL') {
                totalSales += (day.salesByAsesor?.[filterAsesor] || 0);
                totalOrders += (day.ordersByAsesor?.[filterAsesor] || 0);
            } else if (filterModo !== 'ALL') {
                totalSales += (day.salesByModo?.[filterModo] || 0);
                totalOrders += (day.ordersByModo?.[filterModo] || 0);
            }

            // Siempre extraemos los demas basandonos en el filtro si es aplicable. 
            // Para mantenerlo simple: las graficas de Asesores solo se muestran si NO hay un asesor filtrado.
            if (day.salesByAsesor) {
                Object.entries(day.salesByAsesor).forEach(([k, v]) => {
                    salesByAsesor[k] = (salesByAsesor[k] || 0) + (v as number);
                    ordersByAsesor[k] = (ordersByAsesor[k] || 0) + (day.ordersByAsesor?.[k] || 0);
                });
            }
            if (day.salesByArea) {
                Object.entries(day.salesByArea).forEach(([k, v]) => {
                    salesByArea[k] = (salesByArea[k] || 0) + (v as number);
                });
            }

            // Products Dimension (OLAP)
            if (day.soldProducts) {
                Object.entries(day.soldProducts).forEach(([k, v]: any) => {
                    let qty = 0;
                    let rev = 0;

                    if (filterAsesor !== 'ALL') {
                        if (v.byAsesor && v.byAsesor[filterAsesor]) {
                            qty = v.byAsesor[filterAsesor].qty || 0;
                            rev = v.byAsesor[filterAsesor].revenue || 0;
                        }
                    } else if (filterModo !== 'ALL') {
                        if (v.byModo && v.byModo[filterModo]) {
                            qty = v.byModo[filterModo].qty || 0;
                            rev = v.byModo[filterModo].revenue || 0;
                        }
                    } else {
                        qty = v.qty || 0;
                        rev = v.revenue || 0;
                    }

                    if (qty > 0) {
                        if (!topProducts[k]) topProducts[k] = { qty: 0, revenue: 0 };
                        topProducts[k].qty += qty;
                        topProducts[k].revenue += rev;
                    }
                });
            }
        });

        // Search Product Filtering
        let filteredProducts = Object.entries(topProducts);
        if (searchQuery.trim() !== '') {
            filteredProducts = filteredProducts.filter(([name]) => name.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        const sortMap = (obj: Record<string, number>) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
        const sortProd = (arr: [string, {qty: number, revenue: number}][]) => arr.sort((a, b) => b[1].revenue - a[1].revenue);

        // Agrupar Asesores con su Ticket Promedio
        const asesoresDetailed = Object.keys(salesByAsesor).map(name => ({
            name,
            revenue: salesByAsesor[name],
            orders: ordersByAsesor[name] || 1,
            avgTicket: salesByAsesor[name] / (ordersByAsesor[name] || 1)
        })).sort((a, b) => b.revenue - a.revenue);

        return {
            totalSales,
            totalOrders,
            avgTicket: totalOrders > 0 ? totalSales / totalOrders : 0,
            asesoresOptions: Array.from(allAsesores).sort(),
            asesoresDetailed,
            areas: sortMap(salesByArea),
            allProducts: sortProd(filteredProducts)
        };
    }, [statsList, filterAsesor, filterModo, searchQuery]);

    // Pagination logic
    const totalPages = Math.ceil(aggregates.allProducts.length / itemsPerPage);
    const paginatedProducts = aggregates.allProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Si cambian los filtros, resetear pagina
    useEffect(() => { setCurrentPage(1); }, [filterAsesor, filterModo, searchQuery]);

    const BarChart = ({ data, title }: { data: [string, number][], title: string }) => {
        const maxVal = Math.max(...data.map(d => d[1]), 1);
        return (
            <div className="bg-[#111] border border-white/10 rounded-2xl p-5 mt-4">
                <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">{title}</h3>
                {data.length === 0 && <p className="text-white/30 text-sm">Sin datos en este filtro</p>}
                <div className="flex flex-col gap-3">
                    {data.map(([label, val], idx) => {
                        const pct = Math.max((val / maxVal) * 100, 2);
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
                <h1 className="text-2xl font-bold text-white mb-1">Métricas Analíticas</h1>
                <p className="text-white/50 text-sm">{businessName}</p>
            </div>

            {/* Global Date Filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
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

            {/* Advanced Filters */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1 block">Asesor / Entidad</label>
                    <select 
                        value={filterAsesor} 
                        onChange={(e) => { setFilterAsesor(e.target.value); setFilterModo('ALL'); }}
                        className="w-full bg-[#111] border border-white/10 text-white rounded-xl p-3 text-sm focus:outline-none focus:border-white/30"
                    >
                        <option value="ALL">Todos los Asesores</option>
                        {aggregates.asesoresOptions.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1 block">Modalidad Web</label>
                    <select 
                        value={filterModo} 
                        onChange={(e) => { setFilterModo(e.target.value); setFilterAsesor('ALL'); }}
                        className="w-full bg-[#111] border border-white/10 text-white rounded-xl p-3 text-sm focus:outline-none focus:border-white/30"
                    >
                        <option value="ALL">Ambas</option>
                        <option value="Mayorista">Solo Mayoristas</option>
                        <option value="Minorista">Solo Minoristas</option>
                    </select>
                </div>
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

                    {/* Asesores Detailed Table */}
                    {filterAsesor === 'ALL' && filterModo === 'ALL' && (
                        <div className="bg-[#111] border border-white/10 rounded-2xl p-5 mt-4 overflow-hidden mb-6">
                            <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">Rendimiento por Asesor (Pedidos vs Ingresos)</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-white/10 text-white/40 uppercase text-[10px] tracking-wider">
                                            <th className="pb-3 font-bold">Entidad</th>
                                            <th className="pb-3 font-bold text-center">Pedidos</th>
                                            <th className="pb-3 font-bold text-center">Ticket Promedio</th>
                                            <th className="pb-3 font-bold text-right">Ingresos</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {aggregates.asesoresDetailed.map((a, idx) => (
                                            <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="py-3 pr-2 text-white/90 font-medium">{a.name}</td>
                                                <td className="py-3 text-white/70 text-center">{a.orders}x</td>
                                                <td className="py-3 text-white/70 text-center">{formatCurrency(a.avgTicket)}</td>
                                                <td className="py-3 text-right font-bold text-white" style={{ color: themeHex }}>{formatCurrency(a.revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Top Products Table with Search and Pagination */}
                    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 mt-4 overflow-hidden">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
                            <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest">Desglose de Inventario Vendido</h3>
                            <input 
                                type="text"
                                placeholder="Buscar producto o marca..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                            />
                        </div>
                        
                        <div className="overflow-x-auto min-h-[300px]">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-white/10 text-white/40 uppercase text-[10px] tracking-wider">
                                        <th className="pb-3 font-bold w-1/2">Producto (Referencia)</th>
                                        <th className="pb-3 font-bold text-center">Unidades</th>
                                        <th className="pb-3 font-bold text-right">Ingresos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedProducts.map(([name, stats], idx) => (
                                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-3 pr-2 text-white/90 font-medium truncate max-w-[200px] sm:max-w-[400px]">{name}</td>
                                            <td className="py-3 text-white/70 text-center">{stats.qty}x</td>
                                            <td className="py-3 text-right font-bold text-white">{formatCurrency(stats.revenue)}</td>
                                        </tr>
                                    ))}
                                    {paginatedProducts.length === 0 && (
                                        <tr><td colSpan={3} className="py-8 text-center text-white/30 text-xs">No se encontraron productos para los filtros actuales.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 text-xs font-bold disabled:opacity-30 hover:bg-white/10 transition-colors"
                                >
                                    Anterior
                                </button>
                                <span className="text-white/50 text-xs">Página {currentPage} de {totalPages}</span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 text-xs font-bold disabled:opacity-30 hover:bg-white/10 transition-colors"
                                >
                                    Siguiente
                                </button>
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}
