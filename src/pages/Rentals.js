import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Search, Trash2, Printer, FileText, Truck, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => (d ? format(parseISO(d), 'dd MMM yyyy') : '—');
const today = () => new Date().toISOString().slice(0, 10);

const emptyItem = () => ({ particulars: '', qty: 1, rate: '' });
const emptyForm = () => ({
  customer_name: '',
  phone: '',
  address: '',
  pickup_date: today(),
  return_date: '',
  labour_charges: '',
  transport_charges: '',
  notes: '',
  items: [emptyItem()],
});

const itemsTotal = (items) => (items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.rate || 0), 0);
const grandTotal = (r) => itemsTotal(r.rental_items || r.items) + Number(r.labour_charges || 0) + Number(r.transport_charges || 0);

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Builds a printable invoice in a new window (user can "Save as PDF" from the print dialog).
const printInvoice = (rental) => {
  const items = rental.rental_items || [];
  const rows = items.map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(i.particulars)}</td>
      <td class="r">${Number(i.qty)}</td>
      <td class="r">${fmt(i.rate)}</td>
      <td class="r">${fmt(Number(i.qty) * Number(i.rate))}</td>
    </tr>`).join('');
  const sub = itemsTotal(items);
  const labour = Number(rental.labour_charges || 0);
  const transport = Number(rental.transport_charges || 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(rental.invoice_no || '')}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:13px}
    h1{margin:0;font-size:22px;color:#1a3a2a} .muted{color:#666}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #1a3a2a;padding-bottom:12px;margin-bottom:18px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left}
    th{background:#f3f4f6} .r{text-align:right} .tot td{border:none;padding:4px 8px} .grand td{font-weight:bold;font-size:15px;border-top:2px solid #111}
  </style></head><body>
    <div class="top">
      <div><h1>Third Element Productions</h1><div class="muted">Rental Invoice</div></div>
      <div class="r"><div><b>Invoice #:</b> ${escapeHtml(rental.invoice_no || '—')}</div><div><b>Date:</b> ${fmtDate(today())}</div></div>
    </div>
    <div class="grid">
      <div><b>Billed To</b><br>${escapeHtml(rental.customer_name)}<br>${escapeHtml(rental.phone)}<br>${escapeHtml(rental.address)}</div>
      <div><b>Pick-up:</b> ${fmtDate(rental.pickup_date)}<br><b>Return:</b> ${fmtDate(rental.return_date)}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Particulars</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="tot" style="width:300px;margin-left:auto;margin-top:12px">
      <tr><td>Items Total</td><td class="r">${fmt(sub)}</td></tr>
      <tr><td>Labour</td><td class="r">${fmt(labour)}</td></tr>
      <tr><td>Transport</td><td class="r">${fmt(transport)}</td></tr>
      <tr class="grand"><td>Grand Total</td><td class="r">${fmt(sub + labour + transport)}</td></tr>
    </table>
    ${rental.notes ? `<p class="muted"><b>Notes:</b> ${escapeHtml(rental.notes)}</p>` : ''}
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) {
    alert('Please allow pop-ups to print the invoice');
    return;
  }
  w.document.write(html);
  w.document.close();
};

const labelCls = 'text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]';
const inputCls = 'w-full px-4 py-3 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 font-bold text-sm shadow-inner outline-none';

const Rentals = () => {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fetchRentals = useCallback(async () => {
    const { data, error } = await supabase
      .from('rentals')
      .select('*, rental_items(*)')
      .order('pickup_date', { ascending: false });
    if (!error) setRentals(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRentals();
    const ch = supabase.channel('rentals_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, fetchRentals)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_items' }, fetchRentals)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchRentals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rentals;
    return rentals.filter(r => [r.customer_name, r.phone, r.address, r.invoice_no].some(v => (v || '').toLowerCase().includes(q)));
  }, [rentals, search]);

  const setItem = (idx, patch) => setForm(f => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  const handleSave = async (e) => {
    e.preventDefault();
    const items = form.items.filter(i => i.particulars.trim());
    if (items.length === 0) {
      alert('Add at least one item');
      return;
    }
    if (form.return_date && form.return_date < form.pickup_date) {
      alert('Return date cannot be before pick-up date');
      return;
    }
    setSaving(true);
    try {
      const invoiceNo = `RN-${format(new Date(), 'yyMMdd')}-${String(Date.now()).slice(-4)}`;
      const { data: rental, error } = await supabase.from('rentals').insert([{
        customer_name: form.customer_name,
        phone: form.phone,
        address: form.address,
        pickup_date: form.pickup_date || null,
        return_date: form.return_date || null,
        labour_charges: Number(form.labour_charges || 0),
        transport_charges: Number(form.transport_charges || 0),
        notes: form.notes,
        invoice_no: invoiceNo,
      }]).select('id').single();
      if (error) throw error;

      const { error: itemErr } = await supabase.from('rental_items').insert(
        items.map(i => ({ rental_id: rental.id, particulars: i.particulars, qty: Number(i.qty || 0), rate: Number(i.rate || 0) }))
      );
      if (itemErr) {
        await supabase.from('rentals').delete().eq('id', rental.id);
        throw itemErr;
      }

      setIsAdding(false);
      setForm(emptyForm());
      setMessage(`Rental ${invoiceNo} saved`);
      fetchRentals();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error saving rental:', err);
      alert('Could not save rental: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete rental ${r.invoice_no || ''} for ${r.customer_name}?`)) return;
    const { error } = await supabase.from('rentals').delete().eq('id', r.id);
    if (error) alert('Could not delete rental: ' + error.message);
    else fetchRentals();
  };

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500">Loading Rentals...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Rentals</h2>
          <p className="text-gray-500 text-sm mt-0.5">Track rented items, pick-up / return and generate invoices</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-bold shadow-lg shadow-blue-100"
        >
          <Plus size={18} /><span>New Rental</span>
        </button>
      </div>

      {message && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex justify-between items-center text-sm font-medium">
          <span>{message}</span><button onClick={() => setMessage('')}><X size={16} /></button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          placeholder="Search by name, phone, address or invoice..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 text-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Invoice', 'Customer', 'Phone', 'Rental Address', 'Pick-up', 'Return', 'Items', 'Labour', 'Transport', 'Total', ''].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.invoice_no}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{r.customer_name}</td>
                <td className="px-4 py-3 text-gray-700">{r.phone}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate" title={r.address}>{r.address}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.pickup_date)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.return_date)}</td>
                <td className="px-4 py-3 text-gray-700">{(r.rental_items || []).length}</td>
                <td className="px-4 py-3">{fmt(r.labour_charges)}</td>
                <td className="px-4 py-3">{fmt(r.transport_charges)}</td>
                <td className="px-4 py-3 font-bold text-gray-900">{fmt(grandTotal(r))}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <button onClick={() => printInvoice(r)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg" title="Generate invoice"><Printer size={16} /></button>
                    <button onClick={() => handleDelete(r)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-16 text-center text-gray-400 text-sm italic">No rentals found.</div>}
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsAdding(false)} />
          <div className="relative w-full md:max-w-xl bg-white shadow-2xl flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center"><FileText size={22} /></div>
                <h3 className="text-xl font-extrabold text-gray-900">New Rental</h3>
              </div>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} /></button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Customer Name</label>
                  <input required className={inputCls} value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input required type="tel" className={inputCls} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Rental Address</label>
                <textarea required className={`${inputCls} min-h-[70px]`} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date of Pick-up</label>
                  <input required type="date" className={inputCls} value={form.pickup_date} onChange={e => setForm({ ...form, pickup_date: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Date of Return</label>
                  <input type="date" className={inputCls} value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className={labelCls + ' mb-0'}>Particulars</label>
                  <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} className="text-xs font-bold text-blue-600 flex items-center space-x-1"><Plus size={14} /><span>Add row</span></button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input placeholder="Item" className="col-span-5 px-3 py-2.5 bg-gray-50 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100" value={it.particulars} onChange={e => setItem(idx, { particulars: e.target.value })} />
                      <input type="number" min="0" placeholder="Qty" className="col-span-2 px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100" value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} />
                      <input type="number" min="0" placeholder="Rate" className="col-span-2 px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100" value={it.rate} onChange={e => setItem(idx, { rate: e.target.value })} />
                      <div className="col-span-2 text-right text-xs font-bold text-gray-700">{fmt(Number(it.qty || 0) * Number(it.rate || 0))}</div>
                      <button type="button" disabled={form.items.length === 1} onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="col-span-1 text-gray-300 hover:text-red-500 disabled:opacity-30"><X size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}><Users size={11} className="inline mr-1" />Labours</label>
                  <input type="number" min="0" className={inputCls} value={form.labour_charges} onChange={e => setForm({ ...form, labour_charges: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}><Truck size={11} className="inline mr-1" />Transport</label>
                  <input type="number" min="0" className={inputCls} value={form.transport_charges} onChange={e => setForm({ ...form, transport_charges: e.target.value })} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={`${inputCls} min-h-[60px] font-medium`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-xs font-black uppercase tracking-widest text-gray-400">Grand Total</span>
                <span className="text-lg font-black text-gray-900">{fmt(grandTotal(form))}</span>
              </div>

              <button type="submit" disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 disabled:opacity-70">
                {saving ? 'Saving...' : 'Save Rental'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Rentals;
