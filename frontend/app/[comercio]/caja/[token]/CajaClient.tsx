'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { dbClient } from '../../../../lib/firebaseClient';
import { Printer, Search, CheckCircle2, Clock, Check, Receipt, AlertTriangle } from 'lucide-react';

export default function CajaClient({ commerceId, businessName, themeHex, scope }: any) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Audio ref for notifications
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  }, []);

  useEffect(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(dbClient, `comercios/${commerceId}/pedidos`),
      where('createdAt', '>=', startOfToday.toISOString())
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newTickets: any[] = [];
      snapshot.forEach(docSnap => {
        newTickets.push({ id: docSnap.id, ...docSnap.data() });
      });
      
      newTickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setTickets(prev => {
        if (!isInitializing) {
            const prevIds = new Set(prev.map(t => t.id));
            const arrivedTickets = newTickets.filter(t => !prevIds.has(t.id) && !t.printed);
            if (arrivedTickets.length > 0) {
               const toPrint = arrivedTickets[arrivedTickets.length - 1]; // Oldest of the new ones
               handleAutoPrint(toPrint);
            }
        }
        return newTickets;
      });
      setIsInitializing(false);
    }, (err) => {
        console.error("Firebase Snapshot Error", err);
    });

    return () => unsubscribe();
  }, [commerceId, isInitializing]);
  
  const printTicket = (ticket: any) => {
    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (!printWindow) {
      alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para esta página.');
      return;
    }

    const itemsHtml = (ticket.cart || []).map((item: any) => `
      <tr>
        <td style="padding:4px 0;vertical-align:top;font-weight:bold;white-space:nowrap;">${item.qty}x</td>
        <td style="padding:4px 6px;vertical-align:top;">
          ${item.name || ''}
          ${item.variationName ? `<br><span style="font-size:10px;color:#666;">${item.variationName}</span>` : ''}
          ${item.reference ? `<br><span style="font-size:10px;color:#999;">REF: ${item.reference}</span>` : ''}
        </td>
        <td style="padding:4px 0;vertical-align:top;text-align:right;font-weight:bold;white-space:nowrap;">$${((item.price||0)*(item.qty||1)).toLocaleString('es-CO')}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ticket #${ticket.facCode}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            width: 72mm;
            padding: 6mm;
            color: #000;
            background: #fff;
          }
          .center { text-align: center; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .bold { font-weight: bold; }
          .small { font-size: 10px; color: #555; }
          table { width: 100%; border-collapse: collapse; }
          .total-row { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
          .footer { margin-top: 12px; text-align: center; font-size: 10px; color: #777; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size:15px;text-transform:uppercase;">${businessName}</div>
          <div class="small">Ticket #${ticket.facCode}</div>
          <div class="small">${new Date(ticket.createdAt).toLocaleString('es-CO')}</div>
        </div>
        <div class="divider"></div>
        <div class="bold">Cliente: ${ticket.name || 'N/A'}</div>
        <div>Tel: ${ticket.phone || 'N/A'}</div>
        ${ticket.asesorName ? `<div class="small">Asesor: ${ticket.asesorName}</div>` : ''}
        <div class="divider"></div>
        <table>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="divider"></div>
        <div class="total-row">
          <span>TOTAL</span>
          <span>$${(ticket.total||0).toLocaleString('es-CO')}</span>
        </div>
        <div class="footer">¡Gracias por su compra!</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const handleAutoPrint = (ticket: any) => {
     setActiveTicket(ticket);
     if (audioRef.current) {
         audioRef.current.play().catch(e => console.log('Audio autoplay blocked', e));
     }
     setTimeout(() => {
        printTicket(ticket);
     }, 800);
  };
  
  const markAsPrinted = async (id: string) => {
      try {
          const docRef = doc(dbClient, `comercios/${commerceId}/pedidos`, id);
          await updateDoc(docRef, { printed: true, printedAt: new Date().toISOString() });
          if (activeTicket?.id === id) setActiveTicket(null);
      } catch (e) {
          console.error("Failed to mark printed", e);
      }
  };

  const filteredTickets = useMemo(() => {
      if (!searchQuery) return tickets;
      const q = searchQuery.toLowerCase();
      return tickets.filter(t => 
          (t.name || '').toLowerCase().includes(q) ||
          (t.phone || '').toLowerCase().includes(q) ||
          (t.facCode || '').toLowerCase().includes(q) ||
          (t.cart || []).some((item: any) => 
              (item.name || '').toLowerCase().includes(q) ||
              (item.reference || '').toLowerCase().includes(q)
          )
      );
  }, [tickets, searchQuery]);

  const pendingTickets = filteredTickets.filter(t => !t.printed);
  const printedTickets = filteredTickets.filter(t => t.printed);

  const renderTicketList = (list: any[], title: string, icon: React.ReactNode, isPending: boolean) => (
      <div className="mb-8">
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
              {icon} {title} ({list.length})
          </h3>
          <div className="flex flex-col gap-3">
              {list.map(t => (
                  <div key={t.id} onClick={() => setActiveTicket(t)} className={`p-4 rounded-xl border transition-all cursor-pointer ${activeTicket?.id === t.id ? 'bg-[var(--theme)]/10 border-[var(--theme)]/50 shadow-[0_0_15px_var(--theme)]' : isPending ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      <div className="flex justify-between items-start mb-2">
                          <span className={`font-black text-lg ${isPending ? 'text-red-400' : 'text-white'}`}>#{t.facCode}</span>
                          <span className="text-xs font-mono text-white/40">{new Date(t.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-sm text-white/80 font-medium">{t.name || 'Cliente sin nombre'}</div>
                      <div className="flex justify-between items-end mt-3">
                          <span className="text-xs text-white/40">{t.cart?.length || 0} items</span>
                          <span className="font-bold text-[var(--theme)]">${(t.total || 0).toLocaleString('es-CO')}</span>
                      </div>
                  </div>
              ))}
              {list.length === 0 && <div className="text-white/20 text-sm italic p-4 text-center border border-dashed border-white/10 rounded-xl">No hay tickets aquí</div>}
          </div>
      </div>
  );

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
            body * { visibility: hidden; }
            #print-section, #print-section * { visibility: visible; }
            #print-section { position: absolute; left: 0; top: 0; width: 80mm; margin: 0; padding: 10px; color: black !important; background: white !important; font-family: monospace; }
            .no-print { display: none !important; }
        }
      `}} />

      {/* ZONA B: Lateral Izquierdo (Cola y Buscador) */}
      <div className="w-full lg:w-[400px] bg-zinc-950 border-r border-white/10 flex flex-col h-[50vh] lg:h-screen shrink-0 no-print">
          <div className="p-6 border-b border-white/10 bg-black/50">
              <h1 className="text-2xl font-black text-white mb-1">Caja POS</h1>
              <p className="text-white/50 text-xs mb-6">{businessName} • {new Date().toLocaleDateString('es-CO', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              
              <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input 
                      type="text" 
                      placeholder="Buscar ticket, nombre, REF..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--theme)] transition-colors placeholder:text-white/30"
                  />
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {renderTicketList(pendingTickets, 'Por Imprimir', <AlertTriangle className="w-4 h-4 text-red-400" />, true)}
              {renderTicketList(printedTickets, 'Histórico de Hoy', <CheckCircle2 className="w-4 h-4 text-white/40" />, false)}
          </div>
      </div>

      {/* ZONA A: Panel Principal (Comanda Activa) */}
      <div className="flex-1 bg-[#050505] flex items-center justify-center p-6 lg:p-12 h-[50vh] lg:h-screen overflow-y-auto relative no-print">
          {!activeTicket ? (
              <div className="text-center text-white/20 flex flex-col items-center">
                  <Receipt className="w-24 h-24 mb-4 opacity-20" />
                  <h2 className="text-2xl font-bold">Sin Comanda Seleccionada</h2>
                  <p className="text-sm mt-2">Selecciona un ticket de la lista o espera a que llegue uno nuevo.</p>
              </div>
          ) : (
              <div className="w-full max-w-[400px] flex flex-col items-center relative">
                  {/* Actions Bar */}
                  <div className="w-full flex justify-between gap-4 mb-6">
                      <button onClick={() => printTicket(activeTicket)} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all">
                          <Printer className="w-5 h-5" /> Imprimir
                      </button>
                      <button onClick={() => markAsPrinted(activeTicket.id)} className={`flex-1 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all ${activeTicket.printed ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'bg-[var(--theme)] text-black hover:scale-105 shadow-[0_0_20px_var(--theme)]'}`}>
                          <Check className="w-5 h-5" /> {activeTicket.printed ? 'Ya Impreso' : 'Marcar Impreso'}
                      </button>
                  </div>

                  {/* Visual 80mm Ticket Preview */}
                  <div id="print-section" className="bg-white text-black p-6 w-full max-w-[320px] shadow-2xl rounded-sm">
                      <div className="text-center mb-6">
                          <h2 className="text-xl font-black uppercase">{businessName}</h2>
                          <p className="text-xs text-gray-500">Ticket #{activeTicket.facCode}</p>
                          <p className="text-xs text-gray-500">{new Date(activeTicket.createdAt).toLocaleString('es-CO')}</p>
                      </div>
                      
                      <div className="border-t border-b border-dashed border-gray-400 py-3 mb-4">
                          <p className="text-sm font-bold">Cliente: {activeTicket.name || 'N/A'}</p>
                          <p className="text-sm font-bold">Tel: {activeTicket.phone || 'N/A'}</p>
                          {activeTicket.asesorName && <p className="text-xs mt-1">Atendido por: {activeTicket.asesorName}</p>}
                      </div>
                      
                      <table className="w-full text-sm mb-6">
                          <thead>
                              <tr className="border-b border-gray-300">
                                  <th className="text-left pb-1">CANT</th>
                                  <th className="text-left pb-1">ITEM</th>
                                  <th className="text-right pb-1">TOTAL</th>
                              </tr>
                          </thead>
                          <tbody>
                              {activeTicket.cart?.map((item: any, idx: number) => (
                                  <tr key={idx}>
                                      <td className="py-2 align-top font-bold">{item.qty}x</td>
                                      <td className="py-2 align-top">
                                          <div>{item.name}</div>
                                          {item.variationName && <div className="text-xs text-gray-500">{item.variationName}</div>}
                                          {item.reference && <div className="text-xs text-gray-400">REF: {item.reference}</div>}
                                      </td>
                                      <td className="py-2 align-top text-right font-bold">${((item.price || 0) * (item.qty || 1)).toLocaleString('es-CO')}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                      
                      <div className="border-t border-black pt-2 flex justify-between items-end">
                          <span className="text-sm font-bold">TOTAL</span>
                          <span className="text-xl font-black">${(activeTicket.total || 0).toLocaleString('es-CO')}</span>
                      </div>
                      
                      <div className="text-center text-xs text-gray-500 mt-8">
                          ¡Gracias por su compra!
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
