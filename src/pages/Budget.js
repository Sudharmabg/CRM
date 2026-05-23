import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import {
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Wallet,
  IndianRupee,
  Users,
  Store,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  Plus
} from 'lucide-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const ProfitBadge = ({ value }) => {
  const isProfit = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${isProfit ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
      {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {fmt(Math.abs(value))}
    </span>
  );
};

const InlineEdit = ({ value, onSave, type = 'text', forceEdit = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const ref = useRef(null);
  useEffect(() => setCurrent(value), [value]);
  useEffect(() => {
    if (forceEdit) {
      setIsEditing(true);
      setTimeout(() => { if (ref.current) ref.current.focus(); }, 0);
    }
  }, [forceEdit]);

  if (isEditing) {
    return (
      <input
        ref={ref}
        autoFocus
        type={type}
        className="w-full p-1 border rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none"
        value={current}
        onChange={e => setCurrent(e.target.value)}
        onBlur={() => { setIsEditing(false); if (current !== value) onSave(current); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditing(false); if (current !== value) onSave(current); } }}
      />
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className="cursor-pointer hover:bg-blue-50/60 p-1 rounded transition-colors">
      <span className="truncate text-gray-900 font-medium">{value || <span className="text-gray-300 italic text-xs font-normal">—</span>}</span>
    </div>
  );
};

const Budget = () => {
  const [customers, setCustomers] = useState([]);
  const [vendorMap, setVendorMap] = useState({});         // vendorId -> customerId
  const [transactions, setTransactions] = useState([]);   // all vendor_transactions
  const [customerPayments, setCustomerPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [lineItems, setLineItems] = useState([]); // line items for expanded customer
  const [newLineItem, setNewLineItem] = useState({ category: '', expected: '', actual: '', notes: '' });
  const [editingCell, setEditingCell] = useState({ id: null, field: null });
  const addCategoryRef = useRef(null);

  const fetchAll = useCallback(async () => {
    const [custRes, vendRes, txRes, cpRes] = await Promise.all([
      supabase.from('customers').select('id, name, budget, event_date, event_type, venue, status').order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, name, customer_id, credit_limit'),
      supabase.from('vendor_transactions').select('*').eq('type', 'debit'),
      supabase.from('customer_payments').select('customer_id, amount'),
    ]);

    if (!custRes.error) setCustomers(custRes.data || []);
    if (!txRes.error) setTransactions(txRes.data || []);
    if (!cpRes.error) setCustomerPayments(cpRes.data || []);

    if (!vendRes.error) {
      const map = {};
      (vendRes.data || []).forEach(v => { map[v.id] = { customerId: v.customer_id, name: v.name, creditLimit: v.credit_limit }; });
      setVendorMap(map);
    }
    setLoading(false);
  }, []);

  const fetchLineItems = async (customerId) => {
    if (!customerId) return setLineItems([]);
    try {
      const { data, error } = await supabase.from('budget_line_items').select('id, category, expected_amount, actual_amount, notes, created_at').eq('customer_id', customerId).order('created_at', { ascending: true });
      if (!error) setLineItems(data || []);
      else setLineItems([]);
    } catch (err) {
      setLineItems([]);
    }
  };

  const handleAddLineItem = async (e, customerId) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!customerId) return;
    const payload = {
      customer_id: customerId,
      category: newLineItem.category,
      expected_amount: Number(newLineItem.expected) || 0,
      actual_amount: Number(newLineItem.actual) || 0,
      notes: newLineItem.notes || ''
    };
    try {
      const { data, error } = await supabase.from('budget_line_items').insert([payload]).select();
      if (!error && data) setLineItems(prev => [...prev, data[0]]);
      else setLineItems(prev => [...prev, { id: Date.now(), ...payload }]);
      setNewLineItem({ category: '', expected: '', actual: '', notes: '' });
    } catch (err) {
      setLineItems(prev => [...prev, { id: Date.now(), ...payload }]);
    }
  };

  const handleUpdateLineItem = async (id, field, value) => {
    try {
      const update = { [field]: field === 'category' || field === 'notes' ? value : Number(value) };
      const { error } = await supabase.from('budget_line_items').update(update).eq('id', id);
      if (error) throw error;
      setLineItems(prev => prev.map(li => li.id === id ? { ...li, ...update } : li));
    } catch (err) {
      setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: (field==='category'||field==='notes')?value:Number(value)||0 } : li));
    }
  };

  const handleDeleteLineItem = async (id) => {
    try {
      const { error } = await supabase.from('budget_line_items').delete().eq('id', id);
      if (!error) setLineItems(prev => prev.filter(li => li.id !== id));
      else setLineItems(prev => prev.filter(li => li.id !== id));
    } catch (err) {
      setLineItems(prev => prev.filter(li => li.id !== id));
    }
  };

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (activeTab === 'Line Items' && expandedId) fetchLineItems(expandedId);
  }, [activeTab, expandedId]);

  // Per-customer computed data
  const budgetData = useMemo(() => {
    return customers.map(c => {
      const allocated = Number(c.budget || 0);

      // Revenue: sum of customer payments
      const revenue = customerPayments
        .filter(p => p.customer_id === c.id)
        .reduce((s, p) => s + Number(p.amount), 0);

      // Expenses: vendor debit transactions for vendors linked to this customer
      const linkedVendorIds = Object.entries(vendorMap)
        .filter(([, v]) => v.customerId === c.id)
        .map(([id]) => id);

      const vendorSpends = transactions
        .filter(t => linkedVendorIds.includes(t.vendor_id))
        .map(t => ({
          ...t,
          vendorName: vendorMap[t.vendor_id]?.name || 'Unknown Vendor',
        }));

      const totalSpent = vendorSpends.reduce((s, t) => s + Number(t.amount), 0);
      const remaining = allocated - totalSpent;
      const profit = revenue - totalSpent;
      const utilization = allocated > 0 ? Math.min((totalSpent / allocated) * 100, 100) : 0;

      return { ...c, allocated, revenue, totalSpent, remaining, profit, utilization, vendorSpends };
    });
  }, [customers, customerPayments, vendorMap, transactions]);

  const filtered = useMemo(() =>
    budgetData.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [budgetData, search]
  );

  // Summary totals
  const totals = useMemo(() => ({
    allocated: budgetData.reduce((s, c) => s + c.allocated, 0),
    revenue: budgetData.reduce((s, c) => s + c.revenue, 0),
    spent: budgetData.reduce((s, c) => s + c.totalSpent, 0),
    profit: budgetData.reduce((s, c) => s + c.profit, 0),
  }), [budgetData]);

  const exportExcel = async (customer) => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summary = [
      ['Field', 'Value'],
      ['Customer', customer.name],
      ['Event Date', customer.event_date || 'N/A'],
      ['Venue', customer.venue || 'N/A'],
      ['Status', customer.status],
      [],
      ['Allocated Budget', customer.allocated],
      ['Total Revenue Received', customer.revenue],
      ['Total Vendor Expenses', customer.totalSpent],
      ['Remaining Budget', customer.remaining],
      ['Net Profit / Loss', customer.profit],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

    // Expenses sheet
    const expRows = [['Vendor', 'Amount', 'Method', 'Date', 'Notes']];
    customer.vendorSpends.forEach(t => {
      expRows.push([t.vendorName, Number(t.amount), t.payment_method, t.transaction_date, t.notes || '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Vendor Expenses');

    // (Line Items sheet removed)
    // Line Items sheet (if any)
    try {
      const { data: lineItems, error: liErr } = await supabase.from('budget_line_items').select('category, expected_amount, actual_amount, notes').eq('customer_id', customer.id).order('created_at');
      if (!liErr && lineItems && lineItems.length > 0) {
        const liRows = [['Category','Expected','Actual','Variance','Notes']];
        lineItems.forEach(li => {
          const expected = Number(li.expected_amount || 0);
          const actual = Number(li.actual_amount || 0);
          liRows.push([li.category || '', expected, actual, expected - actual, li.notes || '']);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(liRows), 'Line Items');
      }
    } catch (err) {
      // ignore absence of table
    }

    XLSX.writeFile(wb, `Budget_${customer.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const exportAllExcel = () => {
    const wb = XLSX.utils.book_new();

    const overview = [['Customer', 'Event Date', 'Status', 'Allocated Budget', 'Revenue Received', 'Total Spent', 'Remaining', 'Net P&L']];
    budgetData.forEach(c => {
      overview.push([c.name, c.event_date || '', c.status, c.allocated, c.revenue, c.totalSpent, c.remaining, c.profit]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), 'All Events');

    XLSX.writeFile(wb, `Budget_All_Events.xlsx`);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Budget Tracker</h2>
          <p className="text-gray-500 text-sm mt-0.5">Per-event financials with vendor expense auto-mapping</p>
        </div>
        <button
          onClick={exportAllExcel}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95 whitespace-nowrap"
        >
          <Download size={14} />
          Export All
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Total Allocated', value: totals.allocated, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Revenue Received', value: totals.revenue, icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Spent', value: totals.spent, icon: Store, color: 'text-orange-500', bg: 'bg-orange-50' },
          { label: 'Net P&L', value: totals.profit, icon: totals.profit >= 0 ? TrendingUp : TrendingDown, color: totals.profit >= 0 ? 'text-emerald-600' : 'text-red-500', bg: totals.profit >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className="bg-white p-4 md:p-5 rounded-[1.5rem] border border-gray-100 shadow-sm">
            <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
              <s.icon size={18} className={s.color} />
            </div>
            <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em]">{s.label}</p>
            <p className={`text-lg md:text-xl font-black mt-0.5 ${s.label === 'Net P&L' ? (totals.profit >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gray-900'}`}>
              {fmt(s.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search by customer name..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-300 text-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Event Budget Cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="py-16 text-center text-gray-300 border-2 border-dashed border-gray-100 rounded-[2rem]">
            <Users size={40} className="mx-auto opacity-20 mb-3" />
            <p className="text-xs font-bold uppercase tracking-widest">No events found</p>
          </div>
        )}

        {filtered.map(c => {
          const isExpanded = expandedId === c.id;
          const isOver = c.totalSpent > c.allocated && c.allocated > 0;

          return (
            <div key={c.id} className="bg-white border border-gray-100 rounded-[1.5rem] shadow-sm overflow-hidden">
              {/* Card Header */}
              <div
                className="p-4 md:p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-base shrink-0" style={{ background: '#1a3a2a' }}>
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-gray-900 text-sm truncate">{c.name}</h3>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          c.status === 'Confirmed' ? 'bg-blue-600 text-white' :
                          c.status === 'Completed' ? 'bg-emerald-600 text-white' :
                          c.status === 'Cancelled' ? 'bg-gray-200 text-gray-500' :
                          'bg-amber-100 text-amber-700'
                        }`}>{c.status}</span>
                        {isOver && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider bg-red-100 text-red-600 flex items-center gap-1">
                            <AlertCircle size={8} /> Over Budget
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                        {c.event_date ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(c.event_date)) : 'No date'} {c.venue ? `• ${c.venue}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <ProfitBadge value={c.profit} />
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-gray-400">
                    <span>Spent: {fmt(c.totalSpent)}</span>
                    <span>Budget: {fmt(c.allocated)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : c.utilization > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${c.utilization}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className={isOver ? 'text-red-500' : 'text-gray-400'}>{c.utilization.toFixed(0)}% utilized</span>
                    <span className="text-gray-400">Revenue: {fmt(c.revenue)}</span>
                  </div>
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 md:p-5 space-y-5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex gap-2 border-b pb-3">
                    {['Overview','Planning','Vendor Expenses'].map(tab => (
                      <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider ${activeTab===tab? 'text-blue-600':'text-gray-400'}`}>
                        {tab}
                      </button>
                    ))}
                  </div>
                  {activeTab === 'Overview' && (
                    <>
                      {/* Financial Summary Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Allocated Budget', value: c.allocated, color: 'text-gray-900' },
                          { label: 'Revenue Received', value: c.revenue, color: 'text-emerald-600' },
                          { label: 'Total Spent', value: c.totalSpent, color: 'text-orange-500' },
                          { label: 'Net P&L', value: c.profit, color: c.profit >= 0 ? 'text-emerald-600' : 'text-red-500' },
                        ].map(item => (
                          <div key={item.label} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider">{item.label}</p>
                            <p className={`text-sm font-black mt-0.5 ${item.color}`}>{fmt(item.value)}</p>
                          </div>
                        ))}
                      </div>

                      {/* P&L Visual */}
                      <div className={`flex items-center gap-3 p-3 rounded-xl border ${c.profit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                        {c.profit >= 0
                          ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                          : <AlertCircle size={18} className="text-red-500 shrink-0" />
                        }
                        <p className={`text-xs font-bold ${c.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {c.profit >= 0
                            ? `This event is profitable by ${fmt(c.profit)} (Revenue − Expenses)`
                            : `This event is at a loss of ${fmt(Math.abs(c.profit))} (Expenses exceed Revenue)`
                          }
                        </p>
                      </div>
                    </>
                  )}

                  {activeTab === 'Vendor Expenses' && (
                    <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Vendor Expenses (Auto-mapped)</h4>
                      <button
                        onClick={() => exportExcel(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-all shadow-sm"
                      >
                        <Download size={11} /> Export Excel
                      </button>
                    </div>

                    {c.vendorSpends.length === 0 ? (
                      <div className="py-8 text-center text-gray-300 border border-dashed border-gray-100 rounded-xl">
                        <Store size={28} className="mx-auto opacity-20 mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">No vendor payments recorded</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Desktop table */}
                        <div className="hidden sm:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Vendor</th>
                                <th className="text-left py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Amount</th>
                                <th className="text-left py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Method</th>
                                <th className="text-left py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Date</th>
                                <th className="text-left py-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.vendorSpends.map(t => (
                                <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                                  <td className="py-2.5 px-3 font-bold text-gray-900">{t.vendorName}</td>
                                  <td className="py-2.5 px-3 font-black text-orange-600">{fmt(t.amount)}</td>
                                  <td className="py-2.5 px-3 text-gray-500 text-xs">{t.payment_method}</td>
                                  <td className="py-2.5 px-3 text-gray-500 text-xs">
                                    {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(t.transaction_date))}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-400 text-xs italic">{t.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="sm:hidden space-y-2">
                          {c.vendorSpends.map(t => (
                            <div key={t.id} className="flex justify-between items-start p-3 bg-gray-50 rounded-xl border border-gray-100">
                              <div>
                                <p className="font-bold text-gray-900 text-sm">{t.vendorName}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{t.payment_method} • {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(t.transaction_date))}</p>
                                {t.notes && <p className="text-[10px] text-gray-400 italic mt-0.5">{t.notes}</p>}
                              </div>
                              <span className="font-black text-orange-600 text-sm shrink-0 ml-2">{fmt(t.amount)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Total row */}
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100 px-3">
                          <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Total Expenses</span>
                          <span className="font-black text-orange-600">{fmt(c.totalSpent)}</span>
                        </div>
                      </div>
                    )}
                    </div>
                  )}
                  {activeTab === 'Line Items' && (
                    <div className="space-y-4">
                      <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Planned Expenses</p>
                            <p className="text-lg font-extrabold text-gray-900">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((lineItems||[]).reduce((s, r) => s + Number(r.expected_amount || 0), 0))}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400 font-bold">Suggested Quote (includes 20% margin)</p>
                            <p className="text-lg font-extrabold text-blue-600">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(((lineItems||[]).reduce((s, r) => s + Number(r.expected_amount || 0), 0) * 1.2) || 0)}</p>
                          </div>
                        </div>
                        {c && Number(c.budget || 0) < ((lineItems||[]).reduce((s, r) => s + Number(r.expected_amount || 0), 0) * 1.2) && (
                          <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg font-bold text-sm">
                            <AlertCircle size={16} /> Customer budget is below suggested quote
                          </div>
                        )}
                      </div>

                      <div className="bg-white border border-gray-100 rounded-2xl p-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                                <th className="pb-3">Category</th>
                                <th className="pb-3">Expected (₹)</th>
                                <th className="pb-3">Actual (₹)</th>
                                <th className="pb-3">Variance</th>
                                <th className="pb-3">Notes</th>
                                <th className="pb-3">Actions <button type="button" onClick={() => { if (addCategoryRef && addCategoryRef.current) addCategoryRef.current.focus(); }} className="ml-2 text-gray-400"><Plus size={12} /></button></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(lineItems||[]).map(li => {
                                const expected = Number(li.expected_amount || 0);
                                const actual = Number(li.actual_amount || 0);
                                const variance = expected - actual;
                                return (
                                  <tr key={li.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                                    <td className="py-3">
                                      <InlineEdit value={li.category} onSave={(v) => { handleUpdateLineItem(li.id, 'category', v); setEditingCell({ id: null, field: null }); }} forceEdit={editingCell.id === li.id && editingCell.field === 'category'} />
                                    </td>
                                    <td className="py-3">
                                      <InlineEdit value={expected} onSave={(v) => { handleUpdateLineItem(li.id, 'expected_amount', Number(v) || 0); setEditingCell({ id: null, field: null }); }} type="number" forceEdit={editingCell.id === li.id && editingCell.field === 'expected_amount'} />
                                    </td>
                                    <td className="py-3">
                                      <InlineEdit value={actual} onSave={(v) => { handleUpdateLineItem(li.id, 'actual_amount', Number(v) || 0); setEditingCell({ id: null, field: null }); }} type="number" forceEdit={editingCell.id === li.id && editingCell.field === 'actual_amount'} />
                                    </td>
                                    <td className={`py-3 font-black ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(variance)}</td>
                                    <td className="py-3 max-w-[240px]"><InlineEdit value={li.notes} onSave={(v) => { handleUpdateLineItem(li.id, 'notes', v); setEditingCell({ id: null, field: null }); }} forceEdit={editingCell.id === li.id && editingCell.field === 'notes'} /></td>
                                    <td className="py-3">
                                      <div className="flex items-center space-x-2">
                                        <button type="button" onClick={() => setEditingCell({ id: li.id, field: 'category' })} className="text-gray-600 hover:text-blue-600">
                                          <Edit2 size={16} />
                                        </button>
                                        <button type="button" onClick={() => handleDeleteLineItem(li.id)} className="text-red-600 hover:text-red-700">
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <form onSubmit={(e) => handleAddLineItem(e, c.id)} className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                          <input ref={addCategoryRef} required placeholder="Category" className="px-3 py-2 rounded-lg border border-gray-100" value={newLineItem.category} onChange={e => setNewLineItem({...newLineItem, category: e.target.value})} />
                          <input required placeholder="Expected" type="number" className="px-3 py-2 rounded-lg border border-gray-100" value={newLineItem.expected} onChange={e => setNewLineItem({...newLineItem, expected: e.target.value})} />
                          <input placeholder="Actual" type="number" className="px-3 py-2 rounded-lg border border-gray-100" value={newLineItem.actual} onChange={e => setNewLineItem({...newLineItem, actual: e.target.value})} />
                          <input placeholder="Notes" className="px-3 py-2 rounded-lg border border-gray-100" value={newLineItem.notes} onChange={e => setNewLineItem({...newLineItem, notes: e.target.value})} />
                          <div className="text-right">
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">Add Row</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Budget;
