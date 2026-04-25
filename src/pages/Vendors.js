import React, { useState, useEffect, useMemo } from 'react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getFilteredRowModel, 
  getSortedRowModel,
  flexRender 
} from '@tanstack/react-table';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  X,
  Phone,
  IndianRupee,
  Users,
  CalendarDays,
  Wallet,
  TrendingDown,
  ExternalLink,
  History,
  CreditCard
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const InlineEdit = ({ value, onSave, type = 'text', className = "" }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  if (isEditing) {
    return (
      <input
        autoFocus
        type={type}
        className={`w-full p-1 border rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none ${className}`}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          if (currentValue !== value) onSave(currentValue);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setIsEditing(false);
            if (currentValue !== value) onSave(currentValue);
          }
        }}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      className="cursor-pointer hover:bg-blue-50/60 p-1 rounded transition-colors group"
    >
      <span className={`truncate ${className || 'text-gray-900 font-medium'}`}>{value || <span className="text-gray-300 italic text-xs font-normal">Empty</span>}</span>
    </div>
  );
};

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [isReviewingNew, setIsReviewingNew] = useState(false);
  const navigate = useNavigate();
  
  // Drawer states
  const [activeTab, setActiveTab] = useState('Overview');
  const getInitialIST = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (330 * 60000));
    return ist.toISOString().slice(0, 10);
  };

  const [newPayment, setNewPayment] = useState({ amount: '', payment_method: 'Upi', type: 'debit', notes: '', transaction_date: getInitialIST() });
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [newVendor, setNewVendor] = useState({
    name: '',
    customer_id: '',
    phone: '',
    credit_limit: 0,
    notes: ''
  });

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('vendors_changes_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_transactions' }, fetchAll)
      .subscribe();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsAddingVendor(false);
        setSelectedVendor(null);
        setIsReviewingNew(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fetchAll = async () => {
    const [vendorsRes, customersRes, txRes] = await Promise.all([
      supabase.from('vendors').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name').order('name', { ascending: true }),
      supabase.from('vendor_transactions').select('*').order('transaction_date', { ascending: false }),
    ]);

    if (!vendorsRes.error) setVendors(vendorsRes.data);
    if (!customersRes.error) setCustomers(customersRes.data);
    if (!txRes.error) setAllTransactions(txRes.data);
    setLoading(false);
  };

  const vendorTotals = useMemo(() => {
    const map = {};
    allTransactions.forEach(t => {
      if (!map[t.vendor_id]) map[t.vendor_id] = { paid: 0, credit: 0 };
      if (t.type === 'debit') map[t.vendor_id].paid += Number(t.amount);
      else map[t.vendor_id].credit += Number(t.amount);
    });
    return map;
  }, [allTransactions]);

  const customerMap = useMemo(() => {
    const m = {};
    customers.forEach(c => (m[c.id] = c.name));
    return m;
  }, [customers]);

  const selectedVendorTransactions = useMemo(() => {
    if (!selectedVendor) return [];
    return allTransactions.filter(t => t.vendor_id === selectedVendor.id);
  }, [selectedVendor, allTransactions]);

  const handleUpdateField = async (vendorId, field, newValue, itemName) => {
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ [field]: newValue })
        .eq('id', vendorId);

      if (error) throw error;
      setSuccessMessage(`Updated ${field} for ${itemName}`);
      fetchAll();
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (error) {
      console.error('Error updating vendor field:', error);
    }
  };

  const handleAddVendor = async (e) => {
    if (e) e.preventDefault();
    try {
      const payload = {
        name: newVendor.name,
        phone: newVendor.phone,
        credit_limit: Number(newVendor.credit_limit),
        notes: newVendor.notes,
      };
      if (newVendor.customer_id) payload.customer_id = newVendor.customer_id;

      const { error } = await supabase.from('vendors').insert([payload]);
      if (error) throw error;

      setSuccessMessage(`Vendor "${newVendor.name}" added successfully.`);
      setIsAddingVendor(false);
      setIsReviewingNew(false);
      setNewVendor({ name: '', customer_id: '', phone: '', credit_limit: 0, notes: '' });
      fetchAll();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      console.error('Error adding vendor:', error);
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('vendor_transactions')
        .insert([{ 
          ...newPayment, 
          vendor_id: selectedVendor.id,
          amount: Number(newPayment.amount)
        }]);
      if (error) throw error;
      setNewPayment({ amount: '', payment_method: 'Upi', type: 'debit', notes: '', transaction_date: new Date().toISOString().slice(0, 10) });
      setShowPaymentForm(false);
      setSuccessMessage('Payment history updated');
      fetchAll();
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><Users size={15} /><span>Vendor Name</span></div>,
      cell: ({ row, getValue }) => (
        <InlineEdit 
          value={getValue()} 
          onSave={(val) => handleUpdateField(row.original.id, 'name', val, row.original.name)} 
          className="font-semibold text-gray-900"
        />
      )
    },
    {
      accessorKey: 'customer_id',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><CalendarDays size={15} /><span>Event / Customer</span></div>,
      cell: ({ row, getValue }) => (
        <select
          value={getValue() || ''}
          onChange={e => handleUpdateField(row.original.id, 'customer_id', e.target.value || null, row.original.name)}
          className="text-xs text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white min-w-[140px]"
        >
          <option value="">— Unassigned —</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )
    },
    {
      accessorKey: 'phone',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><Phone size={15} /><span>Phone</span></div>,
      cell: ({ row, getValue }) => (
        <InlineEdit 
          value={getValue()} 
          onSave={(val) => handleUpdateField(row.original.id, 'phone', val, row.original.name)} 
          className="text-gray-700"
        />
      )
    },
    {
      accessorKey: 'credit_limit',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><IndianRupee size={15} /><span>Credit Limit</span></div>,
      cell: ({ row, getValue }) => (
        <button 
          onClick={() => {
            const newVal = prompt("Enter new credit limit:", getValue());
            if (newVal !== null) handleUpdateField(row.original.id, 'credit_limit', Number(newVal), row.original.name);
          }}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
        >
          {fmt(getValue())}
        </button>
      )
    },
    {
      id: 'total_paid',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><Wallet size={15} /><span>Total Paid</span></div>,
      cell: ({ row }) => {
        const paid = vendorTotals[row.original.id]?.paid || 0;
        return <span className="font-medium text-gray-900">{fmt(paid)}</span>;
      }
    },
    {
      id: 'balance',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><TrendingDown size={15} /><span>Balance Due</span></div>,
      cell: ({ row }) => {
        const limit = Number(row.original.credit_limit || 0);
        const paid  = vendorTotals[row.original.id]?.paid || 0;
        const bal   = limit - paid;
        return (
          <span className={`font-bold ${bal > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
            {fmt(bal)}
          </span>
        );
      }
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <button
          onClick={() => {
            setSelectedVendor(row.original);
            setActiveTab('Overview');
          }}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-all group"
          title="View Details"
        >
          <ExternalLink size={18} className="transform group-hover:scale-110 transition-transform" />
        </button>
      )
    }
  ], [vendors, vendorTotals, customers, handleUpdateField]);

  const table = useReactTable({
    data: vendors,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500">Loading Vendors...</div>;

  const linkedCustomerName = newVendor.customer_id ? customerMap[newVendor.customer_id] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vendors</h2>
          <p className="text-gray-500 text-sm mt-0.5">Manage supplier relations and payouts</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => navigate('/customers')}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all text-[11px] sm:text-sm font-bold shadow-sm whitespace-nowrap"
          >
            <Users size={18} className="text-blue-600" />
            <span>Manage Customers</span>
          </button>
          <button
            onClick={() => setIsAddingVendor(true)}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 sm:px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-[11px] sm:text-sm font-bold shadow-lg shadow-blue-100 whitespace-nowrap"
          >
            <Plus size={18} />
            <span>Add Vendor</span>
          </button>
        </div>
      </div>

      {/* Success Messages */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <span className="font-medium text-sm">{successMessage}</span>
          <button onClick={() => setSuccessMessage('')}><X size={16} /></button>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search vendors..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 text-sm"
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th key={h.id} className="px-5 py-4 text-xs font-semibold text-gray-600 whitespace-nowrap">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-5 py-3.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {vendors.length === 0 && (
            <div className="p-16 text-center text-gray-400 text-sm italic">No vendors found. Add your first vendor to start tracking.</div>
          )}
        </div>
      </div>

      {/* Add Vendor Drawer */}
      {isAddingVendor && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsAddingVendor(false)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-100">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 leading-tight">Add New Vendor</h3>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">Register Partner</p>
                </div>
              </div>
              <button onClick={() => setIsAddingVendor(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <form onSubmit={e => { e.preventDefault(); setIsReviewingNew(true); }} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Vendor Name</label>
                  <input 
                    required
                    type="text"
                    placeholder="e.g. Wedding Florals Inc."
                    className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                    value={newVendor.name}
                    onChange={e => setNewVendor({...newVendor, name: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Linked Event / Customer</label>
                  <select
                    className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm appearance-none bg-white"
                    value={newVendor.customer_id}
                    onChange={e => setNewVendor({...newVendor, customer_id: e.target.value})}
                  >
                    <option value="">— Select Customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        required
                        type="tel"
                        placeholder="9876543210"
                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                        value={newVendor.phone}
                        onChange={e => setNewVendor({...newVendor, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Credit Limit</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600" size={16} />
                      <input 
                        type="number"
                        placeholder="0"
                        className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-black text-gray-900 shadow-inner outline-none transition-all text-sm"
                        value={newVendor.credit_limit}
                        onChange={e => setNewVendor({...newVendor, credit_limit: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Internal Notes</label>
                  <textarea 
                    placeholder="General terms, services, bank details..."
                    className="w-full p-5 bg-gray-50 border-0 rounded-3xl focus:ring-2 focus:ring-blue-100 font-medium text-gray-800 shadow-inner outline-none min-h-[120px] transition-all text-sm"
                    value={newVendor.notes}
                    onChange={e => setNewVendor({...newVendor, notes: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-4 flex flex-col space-y-3">
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all transform active:scale-[0.98]"
                >
                  Review & Save Vendor
                </button>
                <button 
                  type="button"
                  onClick={() => setIsAddingVendor(false)}
                  className="w-full py-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all"
                >
                  Cancel Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {isReviewingNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 bg-gray-50 border-b">
              <h3 className="text-lg font-bold text-gray-900">Final Confirmation</h3>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-y-2.5">
                <span className="text-gray-500">Name</span>
                <span className="font-bold text-gray-900">{newVendor.name}</span>
                <span className="text-gray-500">Event</span>
                <span className="font-medium text-gray-900">{linkedCustomerName || 'Unassigned'}</span>
                <span className="text-gray-500">Phone</span>
                <span className="text-gray-900">{newVendor.phone}</span>
                <span className="text-gray-500">Credit Limit</span>
                <span className="font-bold text-blue-600">{fmt(newVendor.credit_limit)}</span>
              </div>
              <div className="pt-3 space-y-2">
                <button onClick={handleAddVendor} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors">Confirm & Insert</button>
                <button onClick={() => setIsReviewingNew(false)} className="w-full py-3 bg-white text-gray-600 border rounded-xl hover:bg-gray-50 transition-colors font-medium">Wait, Edit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Detail Drawer */}
      {selectedVendor && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedVendor(null)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-5 md:p-6 border-b flex justify-between items-center bg-white shadow-sm shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center font-bold text-white text-lg shadow-lg shrink-0" style={{ background: '#1a3a2a' }}>
                  {selectedVendor.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base md:text-lg font-bold text-gray-900 leading-tight truncate">{selectedVendor.name}</h3>
                  <div className="flex items-center space-x-2 mt-0.5 overflow-hidden">
                    <span className="text-[8px] md:text-[9px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded uppercase font-black tracking-wider">Vendor</span>
                    {selectedVendor.customer_id && (
                       <span className="text-[8px] md:text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded uppercase font-black tracking-wider truncate max-w-[120px]">Event: {customerMap[selectedVendor.customer_id]}</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedVendor(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
            </div>

            {/* Stats row */}
            <div className="px-4 md:px-6 py-4 grid grid-cols-3 gap-2 md:gap-3 border-b bg-gray-50/30 shrink-0">
               <div className="p-2 md:p-3 bg-white rounded-xl border border-gray-100">
                  <div className="text-[8px] md:text-[9px] uppercase font-bold text-gray-400 tracking-tighter">Limit</div>
                  <div className="text-xs md:text-sm font-black text-gray-900">{fmt(selectedVendor.credit_limit)}</div>
               </div>
               <div className="p-2 md:p-3 bg-white rounded-xl border border-gray-100">
                  <div className="text-[8px] md:text-[9px] uppercase font-bold text-gray-400 tracking-tighter">Paid</div>
                  <div className="text-xs md:text-sm font-black text-blue-600">{fmt(vendorTotals[selectedVendor.id]?.paid || 0)}</div>
               </div>
               <div className="p-2 md:p-3 bg-white rounded-xl border border-gray-100">
                  <div className="text-[8px] md:text-[9px] uppercase font-bold text-gray-400 tracking-tighter">Due</div>
                  <div className="text-xs md:text-sm font-black text-orange-600">
                    {fmt((selectedVendor.credit_limit || 0) - (vendorTotals[selectedVendor.id]?.paid || 0))}
                  </div>
               </div>
            </div>

            {/* Tabs */}
            <div className="flex px-6 border-b">
              {['Overview', 'Payments'].map(tab => (
                <button 
                  key={tab}
                  onClick={() => { setActiveTab(tab); setShowPaymentForm(false); }}
                  className={`px-4 py-3 font-bold text-sm transition-colors relative ${
                    activeTab === tab ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab}
                  {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full" />}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'Overview' && (
                <div className="space-y-6">
                  <div className="flex items-center space-x-2 text-gray-600 p-3 bg-gray-50 rounded-xl">
                    <Phone size={16} /> <span>{selectedVendor.phone}</span>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 block mb-2 uppercase tracking-wider">Internal Notes</label>
                    <textarea 
                      className="w-full text-sm text-gray-800 bg-gray-50 p-4 rounded-xl border-0 focus:ring-2 focus:ring-blue-100 min-h-[200px]"
                      placeholder="Enter details like bank info, service terms, etc..."
                      defaultValue={selectedVendor.notes}
                      onBlur={(e) => handleUpdateField(selectedVendor.id, 'notes', e.target.value, selectedVendor.name)}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'Payments' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Payout History</h4>
                    <button 
                      onClick={() => setShowPaymentForm(!showPaymentForm)}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all flex items-center space-x-1"
                    >
                      <Plus size={14} /> <span>Add Payment</span>
                    </button>
                  </div>

                  {showPaymentForm && (
                    <form onSubmit={handleAddPayment} className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3 animate-in slide-in-from-top-2">
                       <div className="grid grid-cols-2 gap-3">
                          <input 
                            required 
                            type="number"
                            placeholder="Amount (₹)" 
                            className="w-full p-2.5 text-sm rounded-lg border-gray-200 focus:ring-2 focus:ring-blue-200 focus:border-transparent outline-none font-bold"
                            value={newPayment.amount}
                            onChange={e => setNewPayment({...newPayment, amount: e.target.value})}
                          />
                          <select 
                             className="w-full p-2.5 text-sm rounded-lg border-gray-200 focus:ring-2 focus:ring-blue-200 outline-none bg-white font-medium"
                             value={newPayment.payment_method}
                             onChange={e => setNewPayment({...newPayment, payment_method: e.target.value})}
                          >
                             <option value="Upi">UPI</option>
                             <option value="Cash">Cash</option>
                             <option value="Bank Transfer">Bank Transfer</option>
                             <option value="Cheque">Cheque</option>
                          </select>
                       </div>
                       <input 
                         type="date"
                         className="w-full p-2.5 text-sm rounded-lg border-gray-200 focus:ring-2 focus:ring-blue-200 outline-none"
                         value={newPayment.transaction_date}
                         onChange={e => setNewPayment({...newPayment, transaction_date: e.target.value})}
                       />
                       <textarea 
                         placeholder="Reference / Notes..." 
                         className="w-full p-2.5 text-sm rounded-lg border-gray-200 focus:ring-2 focus:ring-blue-200 outline-none min-h-[60px]"
                         value={newPayment.notes}
                         onChange={e => setNewPayment({...newPayment, notes: e.target.value})}
                       />
                       <div className="flex justify-end space-x-2 pt-1">
                          <button type="button" onClick={() => setShowPaymentForm(false)} className="px-3 py-1.5 text-xs text-gray-500 font-medium">Cancel</button>
                          <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold">Save History</button>
                       </div>
                    </form>
                  )}

                  <div className="space-y-2.5">
                    {selectedVendorTransactions.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-gray-300">
                         <History size={48} className="mb-2 opacity-20" />
                         <p className="text-sm italic">No payouts recorded yet</p>
                      </div>
                    ) : (
                      selectedVendorTransactions.map(t => (
                        <div key={t.id} className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm flex justify-between items-center group hover:border-blue-100 transition-colors">
                          <div className="space-y-1">
                             <div className="flex items-center space-x-2">
                                <span className="font-bold text-gray-900">{fmt(t.amount)}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${t.type === 'debit' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                   {t.type === 'debit' ? 'Paid' : 'Invoiced'}
                                </span>
                             </div>
                             <div className="flex items-center space-x-2 text-[11px] text-gray-400 font-medium">
                                <CreditCard size={12} />
                                <span>{t.payment_method}</span>
                                <span>•</span>
                                <span>{new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(parseISO(t.transaction_date))}</span>
                             </div>
                             {t.notes && <p className="text-xs text-gray-500 mt-1">{t.notes}</p>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;
