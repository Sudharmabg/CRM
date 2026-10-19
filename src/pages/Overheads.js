import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, parseISO } from 'date-fns';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const PARTNER_SALARY = 'Partner Salary';
const LABOUR_SALARY = 'Labour Salary';

const FIXED_CATEGORIES = [
  'Godown Rent',
  'Labour Room Rent',
  'Water Bill',
  'Electricity Bill',
  'Wi-Fi',
  'Miscellaneous',
  'Compliance Fees',
  'Partners Conveyance & Food',
  'Other Office Expenses',
  // Suggested extras
  'Vehicle Fuel & Maintenance',
  'Mobile Recharge',
  'Software Subscriptions',
  'Insurance',
  'Repairs & Maintenance',
  'Packing & Consumables',
];

const TABS = [
  { id: 'fixed', label: 'Fixed Expenses' },
  { id: 'partner', label: 'Partner Salaries' },
  { id: 'labour', label: 'Labour Salaries' },
];

const labelCls = 'text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]';
const inputCls = 'w-full px-4 py-3 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 font-bold text-sm shadow-inner outline-none';

const Overheads = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('fixed');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: FIXED_CATEGORIES[0], person: '', amount: '', expense_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.from('overheads').select('*').order('expense_date', { ascending: false });
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
    const ch = supabase.channel('overheads_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overheads' }, fetchRows)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchRows]);

  const monthRows = useMemo(() => rows.filter(r => r.month === month), [rows, month]);

  const tabRows = useMemo(() => monthRows.filter(r =>
    tab === 'partner' ? r.category === PARTNER_SALARY
      : tab === 'labour' ? r.category === LABOUR_SALARY
        : r.category !== PARTNER_SALARY && r.category !== LABOUR_SALARY
  ), [monthRows, tab]);

  const tabTotal = tabRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthTotal = monthRows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const byCategory = useMemo(() => {
    const m = {};
    tabRows.forEach(r => { m[r.category] = (m[r.category] || 0) + Number(r.amount || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [tabRows]);

  const shiftMonth = (delta) => setMonth(format(addMonths(parseISO(`${month}-01`), delta), 'yyyy-MM'));

  const openAdd = () => {
    const isSalary = tab !== 'fixed';
    setForm({
      category: tab === 'partner' ? PARTNER_SALARY : tab === 'labour' ? LABOUR_SALARY : FIXED_CATEGORIES[0],
      person: '',
      amount: '',
      expense_date: month === format(new Date(), 'yyyy-MM') ? format(new Date(), 'yyyy-MM-dd') : `${month}-01`,
      notes: '',
      isSalary,
    });
    setIsAdding(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('overheads').insert([{
        category: form.category,
        person: form.person.trim() || null,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        month: form.expense_date.slice(0, 7),
        notes: form.notes,
      }]);
      if (error) throw error;
      setMonth(form.expense_date.slice(0, 7));
      setIsAdding(false);
      fetchRows();
    } catch (err) {
      console.error('Error saving overhead:', err);
      alert('Could not save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete this ${r.category} entry of ${fmt(r.amount)}?`)) return;
    const { error } = await supabase.from('overheads').delete().eq('id', r.id);
    if (error) alert('Could not delete: ' + error.message);
    else fetchRows();
  };

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500">Loading Overheads...</div>;

  const isSalaryTab = tab !== 'fixed';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Overheads</h2>
          <p className="text-gray-500 text-sm mt-0.5">Fixed expenses and monthly salaries</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl">
            <button onClick={() => shiftMonth(-1)} className="p-2.5 text-gray-500 hover:text-blue-600"><ChevronLeft size={18} /></button>
            <span className="px-2 text-sm font-bold text-gray-800 min-w-[110px] text-center">{format(parseISO(`${month}-01`), 'MMMM yyyy')}</span>
            <button onClick={() => shiftMonth(1)} className="p-2.5 text-gray-500 hover:text-blue-600"><ChevronRight size={18} /></button>
          </div>
          <button onClick={openAdd} className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-bold shadow-lg shadow-blue-100">
            <Plus size={18} /><span>Add Entry</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest">This tab</div>
          <div className="text-xl font-black text-gray-900 mt-1">{fmt(tabTotal)}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Total overheads this month</div>
          <div className="text-xl font-black text-orange-600 mt-1">{fmt(monthTotal)}</div>
        </div>
      </div>

      <div className="flex border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-3 font-bold text-sm relative ${tab === t.id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.label}
            {tab === t.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full" />}
          </button>
        ))}
      </div>

      {byCategory.length > 0 && !isSalaryTab && (
        <div className="flex flex-wrap gap-2">
          {byCategory.map(([cat, amt]) => (
            <span key={cat} className="text-xs font-bold bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-gray-700">{cat}: {fmt(amt)}</span>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Date', isSalaryTab ? 'Name' : 'Category', 'Amount', 'Notes', ''].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabRows.map(r => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">{format(parseISO(r.expense_date), 'dd MMM yyyy')}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">
                  {isSalaryTab ? r.person || '—' : <>{r.category}{r.person ? <span className="text-gray-400 font-normal"> · {r.person}</span> : null}</>}
                </td>
                <td className="px-4 py-3 font-bold text-gray-900">{fmt(r.amount)}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[260px] truncate">{r.notes}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(r)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg" title="Delete"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tabRows.length === 0 && <div className="p-16 text-center text-gray-400 text-sm italic">No entries for this month.</div>}
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsAdding(false)} />
          <div className="relative w-full md:max-w-md bg-white shadow-2xl flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-gray-900">{isSalaryTab ? 'Add Salary' : 'Add Expense'}</h3>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              {!isSalaryTab && (
                <div>
                  <label className={labelCls}>Category</label>
                  <select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {FIXED_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>{isSalaryTab ? (tab === 'partner' ? 'Partner Name' : 'Labour Name') : 'Paid To / Reference (optional)'}</label>
                <input required={isSalaryTab} className={inputCls} value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Amount</label>
                  <input required type="number" min="0" className={inputCls} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input required type="date" className={inputCls} value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={`${inputCls} min-h-[80px] font-medium`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <button type="submit" disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 disabled:opacity-70">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Overheads;
