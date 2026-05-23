import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  MapPin,
  Calendar as CalendarIcon,
  IndianRupee,
  User,
  CreditCard,
  Store,
  Briefcase,
  Edit2,
  Trash2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const InlineEdit = ({ value, onSave, type = 'text' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  if (isEditing) {
    return (
      <input
        autoFocus
        type={type}
        className="w-full p-1 border rounded text-sm focus:ring-1 focus:ring-blue-400 outline-none"
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
      <span className="truncate text-gray-900 font-medium">{value || <span className="text-gray-300 italic text-xs font-normal">Empty</span>}</span>
    </div>
  );
};

const StatusCell = ({ value, row, onUpdate }) => {
  const status = value;

  const styles = {
    Lead:      { background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' },
    Proposal:  { background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' },
    Confirmed: { background: '#2563eb', color: '#ffffff', borderColor: '#1d4ed8' },
    Completed: { background: '#059669', color: '#ffffff', borderColor: '#047857' },
    Cancelled: { background: '#f3f4f6', color: '#9ca3af', borderColor: '#d1d5db' },
  };

  const s = styles[status] || styles.Lead;

  return (
    <select
      value={status}
      onChange={(e) => onUpdate(row.original.id, e.target.value, row.original)}
      style={s}
      className="text-[10px] font-bold px-3 py-1.5 rounded-lg border cursor-pointer outline-none focus:ring-2 focus:ring-blue-200 uppercase tracking-wider"
    >
      {['Lead', 'Proposal', 'Confirmed', 'Completed', 'Cancelled'].map(opt => (
        <option key={opt} value={opt} className="bg-white text-gray-900 font-bold">{opt}</option>
      ))}
    </select>
  );
};

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [isAddingVendorFromCustomer, setIsAddingVendorFromCustomer] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: '',
    customer_id: '',
    phone: '',
    credit_limit: '',
    notes: ''
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [promptModal, setPromptModal] = useState(null);
  const [allPayments, setAllPayments] = useState([]);
  const navigate = useNavigate();
  
  // New entry states for drawer
  const getInitialIST = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (330 * 60000));
    return ist.toISOString().slice(0, 16);
  };

  const [newMeeting, setNewMeeting] = useState({ notes: '', meeting_date: getInitialIST(), attended_by: '' });
  const [newPayment, setNewPayment] = useState({ amount: '', payment_method: 'Upi', status: 'Received', notes: '' });
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);

  const [activeTab, setActiveTab] = useState('Overview');
  const [customerMeetings, setCustomerMeetings] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
  const [customerVendors, setCustomerVendors] = useState([]);

  // New Customer State
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    event_date: '',
    event_type: '',
    venue: '',
    budget: '',
    status: 'Lead',
    lead_source: '',
    notes: ''
  });

  const fetchCustomers = useCallback(async () => {
    const [customersRes, paymentsRes] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('customer_payments').select('customer_id, amount')
    ]);

    if (customersRes.error) console.error('Error fetching customers:', customersRes.error);
    else setCustomers(customersRes.data);
    
    if (paymentsRes.error) console.error('Error fetching payments:', paymentsRes.error);
    else setAllPayments(paymentsRes.data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();

    // Set up real-time subscription
    const channel = supabase
      .channel('customers_changes_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers)
      .subscribe();

    // Global keyboard listeners
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedCustomer(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fetchCustomers]);

  const customerTotals = useMemo(() => {
    const map = {};
    allPayments.forEach(p => {
      if (!map[p.customer_id]) map[p.customer_id] = 0;
      map[p.customer_id] += Number(p.amount);
    });
    return map;
  }, [allPayments]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerDetails(selectedCustomer.id);
    }
  }, [selectedCustomer]);

  const fetchCustomerDetails = async (customerId) => {
    // Fetch Meetings
    const { data: meetings } = await supabase
      .from('meetings')
      .select('*')
      .eq('customer_id', customerId)
      .order('meeting_date', { ascending: false });
    
    setCustomerMeetings(meetings || []);

    // Fetch Payments
    const { data: payments } = await supabase
      .from('customer_payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: false });
    
    setCustomerPayments(payments || []);

    // Fetch Linked Vendors
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, name, phone, credit_limit')
      .eq('customer_id', customerId)
      .order('name', { ascending: true });
    
    setCustomerVendors(vendors || []);
  };


  const handleUpdateField = useCallback(async (customerId, field, newValue, itemName) => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ [field]: newValue })
        .eq('id', customerId);
      if (error) throw error;
      setSuccessMessage(`Updated ${field} for ${itemName}`);
      fetchCustomers();
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (error) {
      console.error(error);
    }
  }, [fetchCustomers]);


  const handleUpdateStatus = useCallback((customerId, newStatus, currentItem) => {
    if (currentItem.status === newStatus) return;
    handleUpdateField(customerId, 'status', newStatus, currentItem.name);
  }, [handleUpdateField]);

  const handleAddMeeting = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('meetings')
        .insert([{ 
          ...newMeeting, 
          customer_id: selectedCustomer.id,
          meeting_date: new Date(newMeeting.meeting_date).toISOString()
        }]);
      if (error) throw error;
      setNewMeeting({ notes: '', meeting_date: new Date().toISOString().slice(0, 16), attended_by: '' });
      setShowEntryForm(false);
      fetchCustomerDetails(selectedCustomer.id);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('customer_payments')
        .insert([{ 
          ...newPayment, 
          customer_id: selectedCustomer.id,
          amount: Number(newPayment.amount),
          payment_date: new Date().toISOString()
        }]);
      if (error) throw error;
      setNewPayment({ amount: '', payment_method: 'Upi', status: 'Received', notes: '' });
      setShowEntryForm(false);
      fetchCustomerDetails(selectedCustomer.id);
      fetchCustomers();
    } catch (error) {
      console.error(error);
    }
  };

  const confirmDelete = (title, message, action) => {
    setDeleteConfirmation({ title, message, onConfirm: action });
  };

  const confirmPrompt = (title, label, defaultValue, action) => {
    setPromptModal({ title, label, defaultValue, onSave: action });
  };

  const handleDeleteMeeting = async (id) => {
    confirmDelete('Meeting', 'Are you sure you want to delete this meeting? This cannot be undone.', async () => {
      await supabase.from('meetings').delete().eq('id', id);
      fetchCustomerDetails(selectedCustomer.id);
    });
  };

  const handleDeletePayment = async (id) => {
    confirmDelete('Payment', 'Are you sure you want to delete this payment record?', async () => {
      await supabase.from('customer_payments').delete().eq('id', id);
      fetchCustomerDetails(selectedCustomer.id);
      fetchCustomers();
    });
  };

  const handleUnlinkVendor = async (id) => {
    confirmDelete('Vendor', 'Are you sure you want to delete this vendor completely? This action cannot be undone.', async () => {
      await supabase.from('vendors').delete().eq('id', id);
      fetchCustomerDetails(selectedCustomer.id);
    });
  };


  const openAddVendorModal = (customerId = '') => {
    setNewVendor({
      name: '',
      customer_id: customerId,
      phone: '',
      credit_limit: '',
      notes: ''
    });
    setIsAddingVendorFromCustomer(true);
  };

  const handleAddVendor = async (e) => {
    if (e) e.preventDefault();
    try {
      const payload = {
        name: newVendor.name,
        phone: newVendor.phone.replace(/\D/g, '').slice(0, 10),
        credit_limit: Number(newVendor.credit_limit) || 0,
        notes: newVendor.notes,
      };
      const customerId = newVendor.customer_id || selectedCustomer?.id;
      if (customerId) payload.customer_id = customerId;

      const { error } = await supabase.from('vendors').insert([payload]);
      if (error) throw error;

      setSuccessMessage(`Vendor "${newVendor.name}" added successfully.`);
      setIsAddingVendorFromCustomer(false);
      setNewVendor({ name: '', customer_id: '', phone: '', credit_limit: '', notes: '' });
      if (selectedCustomer?.id) fetchCustomerDetails(selectedCustomer.id);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error adding vendor:', error);
      alert('Could not add vendor. Please check the form and try again.');
    }
  };

  const handleAddCustomer = async (e) => {
      e.preventDefault();
      // Validate phone number length
      if (newCustomer.phone.replace(/\D/g, '').length !== 10) {
        alert('Phone number must be exactly 10 digits');
        return;
      }
      try {
        const { error } = await supabase
          .from('customers')
          .insert([
            {
              ...newCustomer,
              phone: newCustomer.phone.replace(/\D/g, '').slice(0, 10),
              budget: Number(newCustomer.budget) || 0
            }
          ])
          .select();

      if (error) throw error;
      
      setSuccessMessage(`Customer ${newCustomer.name} added successfully!`);
      setIsAddDrawerOpen(false);
      setNewCustomer({
        name: '', phone: '', event_date: '', event_type: '',
        venue: '', budget: '', status: 'Lead', lead_source: '', notes: ''
      });
      fetchCustomers();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error adding customer:', error);
      alert('Error adding customer. Please try again.');
    }
  };

  const handleDeleteCustomer = useCallback(async (id, name) => {
    confirmDelete('Customer', `Are you sure you want to delete ${name}? This action cannot be undone.`, async () => {
      try {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        setSuccessMessage(`Deleted ${name}`);
        fetchCustomers();
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('Could not delete customer. They might have related records.');
      }
    });
  }, [fetchCustomers]);

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><User size={15} /><span>Name</span></div>,
      cell: ({ row, getValue }) => (
        <InlineEdit 
          value={getValue()} 
          onSave={(val) => handleUpdateField(row.original.id, 'name', val, row.original.name)} 
        />
      )
    },
    {
      accessorKey: 'phone',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><Phone size={15} /><span>Phone</span></div>,
      cell: ({ row, getValue }) => (
        <InlineEdit 
          value={getValue()} 
          onSave={(val) => {
            const sanitized = val.replace(/\\D/g, '').slice(0, 10);
            if (sanitized.length !== 10) {
              alert('Phone number must be exactly 10 digits');
              return;
            }
            handleUpdateField(row.original.id, 'phone', sanitized, row.original.name);
          }}
        />
      )
    },
    {
      accessorKey: 'event_date',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><CalendarIcon size={15} /><span>Date</span></div>,
      cell: ({ row, getValue }) => (
        <input 
          type="date"
          className="bg-transparent border-0 p-0 text-gray-900 focus:ring-0 cursor-pointer text-sm w-full font-medium"
          value={getValue() || ''}
          onChange={(e) => handleUpdateField(row.original.id, 'event_date', e.target.value, row.original.name)}
        />
      )
    },
    {
      accessorKey: 'venue',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><MapPin size={15} /><span>Venue</span></div>,
      cell: ({ row, getValue }) => (
        <InlineEdit 
          value={getValue()} 
          onSave={(val) => handleUpdateField(row.original.id, 'venue', val, row.original.name)}
        />
      )
    },
    {
      accessorKey: 'budget',
      header: () => <div className="flex items-center space-x-2 font-semibold text-emerald-900 leading-none"><IndianRupee size={15} /><span>Budget</span></div>,
      cell: ({ row, getValue }) => {
        const amount = Number(getValue() || 0);
        return (
          <button 
          onClick={() => {
            confirmPrompt("Edit Budget", "New budget:", amount, (val) => {
              if (val !== null && val !== "") {
                handleUpdateField(row.original.id, 'budget', Number(val), row.original.name);
              }
            });
          }}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
        >
            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)}
          </button>
        );
      }
    },
    {
      id: 'total_due',
      header: () => <div className="flex items-center space-x-2 font-semibold text-red-900 leading-none"><IndianRupee size={15} /><span>Total Due</span></div>,
      cell: ({ row }) => {
        const budget = Number(row.original.budget || 0);
        const paid = customerTotals[row.original.id] || 0;
        const due = budget - paid;
        return (
          <span className="font-bold text-red-600">
            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(due > 0 ? due : 0)}
          </span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row, getValue }) => <StatusCell value={getValue()} row={row} onUpdate={handleUpdateStatus} />
    },
    {
      id: 'actions',
      header: 'Action',
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => { setSelectedCustomer(row.original); setActiveTab('Overview'); }}
            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-all group shadow-sm bg-blue-50"
            title="Edit Details"
          >
            <Edit2 size={16} className="transform group-hover:scale-110 transition-transform" />
          </button>
          <button 
            onClick={() => handleDeleteCustomer(row.original.id, row.original.name)}
            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-all group shadow-sm bg-red-50"
            title="Delete Customer"
          >
            <Trash2 size={16} className="transform group-hover:scale-110 transition-transform" />
          </button>
        </div>
      )
    }
  ], [handleDeleteCustomer, handleUpdateField, handleUpdateStatus, customerTotals]);

  const table = useReactTable({
    data: customers,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500">Syncing customers...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
          <p className="text-gray-500 text-sm">Manage all leads, events, and linked vendors.</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => navigate('/vendors')}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all text-[11px] sm:text-sm font-bold shadow-sm whitespace-nowrap"
          >
            <Store size={18} className="text-emerald-600" />
            <span>Manage Vendors</span>
          </button>
          <button
            onClick={() => openAddVendorModal(selectedCustomer?.id || '')}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 sm:px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-[11px] sm:text-sm font-bold shadow-lg shadow-blue-100 whitespace-nowrap"
          >
            <Plus size={18} />
            <span>Add Vendor</span>
          </button>
          <button 
            onClick={() => setIsAddDrawerOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 sm:px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-[11px] sm:text-sm font-bold shadow-lg shadow-blue-100 whitespace-nowrap"
          >
            <Plus size={20} />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <span className="text-sm font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage('')}><X size={16} /></button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Search customers..."
          className="w-full pl-10 pr-4 py-3 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm shadow-sm"
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
        />
      </div>

      <div className="bg-white border border-gray-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-gray-50/50 border-b border-gray-50">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th key={h.id} className="px-6 py-5 font-extrabold text-gray-500 uppercase tracking-widest text-[10px]">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 md:p-6 border-b flex justify-between items-center bg-white shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg md:text-xl shadow-lg shadow-blue-100">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-extrabold text-gray-900 leading-tight">
                    <InlineEdit 
                      value={selectedCustomer.name} 
                      onSave={(val) => {
                        handleUpdateField(selectedCustomer.id, 'name', val, selectedCustomer.name);
                        setSelectedCustomer({...selectedCustomer, name: val});
                      }} 
                    />
                  </h3>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-[9px] md:text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{selectedCustomer.status}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <div className="p-3 md:p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="text-[9px] md:text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">Total Budget</div>
                  <div 
                    className="text-base md:text-lg font-black text-gray-900 leading-none cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => {
                      confirmPrompt("Edit Budget", "Enter new budget:", selectedCustomer.budget, (val) => {
                        if (val !== null && val !== "") {
                          handleUpdateField(selectedCustomer.id, 'budget', Number(val), selectedCustomer.name);
                          setSelectedCustomer({...selectedCustomer, budget: Number(val)});
                        }
                      });
                    }}
                  >
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(selectedCustomer.budget)}
                  </div>
                </div>
                <div className="p-3 md:p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                  <div className="text-[9px] md:text-[10px] uppercase font-bold text-emerald-600 tracking-widest mb-1">Paid Amount</div>
                  <div className="text-base md:text-lg font-black text-emerald-700 leading-none">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(customerPayments.reduce((s, p) => s + Number(p.amount), 0))}
                  </div>
                </div>
              </div>

                  <div className="space-y-4">
                 <div className="flex border-b border-gray-100 overflow-x-auto no-scrollbar">
                  {['Overview', 'Vendors', 'Meetings', 'Payments'].map(tab => (
                    <button 
                      key={tab}
                      onClick={() => { setActiveTab(tab); setShowEntryForm(false); }}
                      className={`px-4 py-3 font-extrabold text-[10px] md:text-xs uppercase tracking-widest transition-colors relative whitespace-nowrap ${
                        activeTab === tab ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {tab}
                      {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full" />}
                    </button>
                  ))}
                </div>
                
                <div className="min-h-[300px]">
                  {activeTab === 'Overview' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center space-x-3 text-gray-700 p-4 bg-gray-50 rounded-2xl border border-gray-100/50">
                          <Phone size={16} className="text-blue-500 shrink-0" />
                          <div className="flex-1 font-bold">
                             <InlineEdit 
                               value={selectedCustomer.phone}
                               onSave={(val) => {
                                 handleUpdateField(selectedCustomer.id, 'phone', val, selectedCustomer.name);
                                 setSelectedCustomer({...selectedCustomer, phone: val});
                               }}
                             />
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 text-gray-700 p-4 bg-gray-50 rounded-2xl border border-gray-100/50">
                          <CalendarIcon size={16} className="text-blue-500 shrink-0" />
                          <div className="flex-1 font-bold">
                            <input 
                              type="date"
                              className="bg-transparent border-0 p-0 text-gray-900 focus:ring-0 cursor-pointer text-sm w-full font-bold outline-none"
                              value={selectedCustomer.event_date || ''}
                              onChange={(e) => {
                                handleUpdateField(selectedCustomer.id, 'event_date', e.target.value, selectedCustomer.name);
                                setSelectedCustomer({...selectedCustomer, event_date: e.target.value});
                              }}
                            />
                          </div>
                        </div>
                        <div className="sm:col-span-2 flex items-center space-x-3 text-gray-700 p-4 bg-gray-50 rounded-2xl border border-gray-100/50">
                          <MapPin size={16} className="text-blue-500 shrink-0" />
                          <div className="flex-1 font-bold truncate">
                             <InlineEdit 
                               value={selectedCustomer.venue}
                               onSave={(val) => {
                                 handleUpdateField(selectedCustomer.id, 'venue', val, selectedCustomer.name);
                                 setSelectedCustomer({...selectedCustomer, venue: val});
                               }}
                             />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 block mb-2 uppercase tracking-[0.2em]">Internal Event Notes</label>
                        <textarea 
                          className="w-full text-sm text-gray-800 bg-gray-50 p-5 rounded-3xl border-0 focus:ring-2 focus:ring-blue-100 min-h-[150px] leading-relaxed shadow-inner"
                          defaultValue={selectedCustomer.notes}
                          placeholder="Special requests, themes, or event timelines..."
                          onBlur={(e) => handleUpdateField(selectedCustomer.id, 'notes', e.target.value, selectedCustomer.name)}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === 'Vendors' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1">
                      <div className="flex justify-between items-center px-1">
                        <h5 className="font-extrabold text-gray-900 text-sm tracking-tight">Linked Vendors</h5>
                        <button 
                          onClick={() => openAddVendorModal(selectedCustomer?.id || '')}
                          className="text-[10px] flex items-center space-x-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full font-bold hover:bg-blue-100 transition-colors uppercase tracking-wider"
                        >
                          <Plus size={12} /> <span>Link New Vendor</span>
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {customerVendors.length === 0 ? (
                          <div className="text-center py-16 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
                            <Store className="mx-auto mb-3 text-gray-200" size={40} />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No vendors linked yet</p>
                          </div>
                        ) : (
                          customerVendors.map(v => (
                            <div key={v.id} className="p-4 border border-gray-100 rounded-2xl bg-white shadow-sm flex flex-col sm:flex-row sm:justify-between sm:items-center group hover:border-blue-100 transition-all gap-3">
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                  <Briefcase size={16} />
                                </div>
                                <div>
                                  <div className="font-bold text-gray-900 text-sm group-hover:text-blue-600 transition-colors">{v.name}</div>
                                  <div className="text-[10px] text-gray-400 font-bold">{v.phone}</div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between sm:justify-end space-x-4">
                                <div className="text-left sm:text-right">
                                  <div className="text-xs font-black text-gray-900">
                                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v.credit_limit)}
                                  </div>
                                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Contract Value</span>
                                </div>
                                <button onClick={() => handleUnlinkVendor(v.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'Meetings' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1">
                      <div className="flex justify-between items-center px-1">
                        <h5 className="font-extrabold text-gray-900 text-sm tracking-tight">Interaction History</h5>
                        <button 
                          onClick={() => setShowEntryForm(!showEntryForm)}
                          className="text-[10px] flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full font-bold hover:bg-gray-200 transition-colors uppercase tracking-wider"
                        >
                          <Plus size={12} /> <span>Log Meeting</span>
                        </button>
                      </div>

                      {showEntryForm && (
                        <form onSubmit={handleAddMeeting} className="p-5 bg-blue-50/50 rounded-3xl border border-blue-100 space-y-4 animate-in slide-in-from-top-2">
                          <div className="grid grid-cols-2 gap-3">
                            <input required placeholder="Consultant Name" className="w-full p-3 text-sm rounded-xl border-gray-100 focus:ring-2 focus:ring-blue-100 font-bold outline-none" value={newMeeting.attended_by} onChange={e => setNewMeeting({...newMeeting, attended_by: e.target.value})} />
                            <input type="datetime-local" className="w-full p-3 text-sm rounded-xl border-gray-100 focus:ring-2 focus:ring-blue-100 font-bold outline-none" value={newMeeting.meeting_date} onChange={e => setNewMeeting({...newMeeting, meeting_date: e.target.value})} />
                          </div>
                          <textarea required placeholder="Items discussed & outcomes..." className="w-full p-3 text-sm rounded-xl border-gray-100 focus:ring-2 focus:ring-blue-100 min-h-[100px] outline-none" value={newMeeting.notes} onChange={e => setNewMeeting({...newMeeting, notes: e.target.value})} />
                          <div className="flex justify-end space-x-2">
                            <button type="button" onClick={() => setShowEntryForm(false)} className="px-4 py-2 text-xs font-bold text-gray-500">Cancel</button>
                            <button type="submit" className="px-5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md">Record Meeting</button>
                          </div>
                        </form>
                      )}

                      <div className="space-y-3">
                        {customerMeetings.map(m => (
                          <div key={m.id} className="p-5 border border-gray-50 bg-gray-50/30 rounded-[1.5rem] text-sm group hover:border-blue-100 hover:bg-white transition-all">
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-black text-gray-900">
                                  {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(parseISO(m.meeting_date))}
                                </span>
                                <span className="text-[10px] bg-white border border-gray-100 px-2.5 py-1 rounded-lg font-bold text-gray-400">{m.attended_by}</span>
                              </div>
                              <button onClick={() => handleDeleteMeeting(m.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <p className="text-gray-600 leading-relaxed indent-2 italic">"{m.notes}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'Payments' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1">
                      <div className="flex justify-between items-center px-1">
                        <h5 className="font-extrabold text-gray-900 text-sm tracking-tight">Accounts & Ledger</h5>
                        <button 
                          onClick={() => setShowEntryForm(!showEntryForm)}
                          className="text-[10px] flex items-center space-x-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full font-bold hover:bg-emerald-200 transition-colors uppercase tracking-wider"
                        >
                          <Plus size={12} /> <span>Record Payment</span>
                        </button>
                      </div>

                      {showEntryForm && (
                        <form onSubmit={handleAddPayment} className="p-5 bg-emerald-50/50 rounded-3xl border border-emerald-100 space-y-4 animate-in slide-in-from-top-2">
                          <div className="grid grid-cols-2 gap-3">
                             <div className="relative">
                               <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600" size={14} />
                               <input required type="number" placeholder="Amount" className="w-full pl-9 pr-4 py-3 text-sm rounded-xl border-emerald-100 focus:ring-2 focus:ring-emerald-100 font-black outline-none shadow-sm" value={newPayment.amount} onChange={e => setNewPayment({...newPayment, amount: e.target.value})} />
                             </div>
                             <select className="w-full p-3 text-sm rounded-xl border-emerald-100 focus:ring-2 focus:ring-emerald-100 font-extrabold outline-none bg-white" value={newPayment.payment_method} onChange={e => setNewPayment({...newPayment, payment_method: e.target.value})}>
                               <option value="Upi">UPI</option>
                               <option value="Cash">Cash</option>
                               <option value="Bank Transfer">Bank Transfer</option>
                               <option value="Cheque">Cheque</option>
                             </select>
                          </div>
                          <input placeholder="Short note (Receipt ID, Bank details...)" className="w-full p-3 text-sm rounded-xl border-emerald-100 focus:ring-2 focus:ring-emerald-100 outline-none" value={newPayment.notes} onChange={e => setNewPayment({...newPayment, notes: e.target.value})} />
                          <div className="flex justify-end space-x-2">
                            <button type="button" onClick={() => setShowEntryForm(false)} className="px-4 py-2 text-xs font-bold text-gray-500">Cancel</button>
                            <button type="submit" className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-md">Post Payment</button>
                          </div>
                        </form>
                      )}

                      <div className="space-y-3">
                        {customerPayments.map(p => (
                          <div key={p.id} className="p-5 border border-gray-100 bg-white rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between group hover:border-emerald-200 transition-all gap-4">
                             <div className="flex items-center space-x-4">
                                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                                   <CreditCard size={20} />
                                </div>
                                <div>
                                   <div className="text-lg font-black text-gray-900 tracking-tight flex items-center">
                                      <IndianRupee size={16} />{Number(p.amount).toLocaleString()}
                                   </div>
                                   <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                     {format(new Date(p.payment_date), 'dd MMM yyyy')} • {p.payment_method}
                                   </div>
                                </div>
                             </div>
                             <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto space-x-4">
                               <div className="text-left sm:text-right">
                                  <div className="text-[9px] font-black px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full tracking-widest">{p.status.toUpperCase()}</div>
                                  {p.notes && <div className="text-[10px] text-gray-400 mt-1 font-medium">{p.notes}</div>}
                               </div>
                               <button onClick={() => handleDeletePayment(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                 <Trash2 size={16} />
                               </button>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Drawer */}
      {isAddDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsAddDrawerOpen(false)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-100">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 leading-tight">Add New Customer</h3>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">Enter Lead Details</p>
                </div>
              </div>
              <button onClick={() => setIsAddDrawerOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleAddCustomer} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Customer Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      required
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                      value={newCustomer.name}
                      onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      required
                      type="tel"
                      maxLength={10}
                      placeholder="e.g. 9876543210"
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                      value={newCustomer.phone}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setNewCustomer({...newCustomer, phone: val});
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Event Date</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                      value={newCustomer.event_date}
                      onChange={e => setNewCustomer({...newCustomer, event_date: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Budget</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600" size={16} />
                      <input 
                        type="number"
                        placeholder="Total Budget"
                        className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-black text-gray-900 shadow-inner outline-none transition-all text-sm"
                        value={newCustomer.budget}
                        onChange={e => setNewCustomer({...newCustomer, budget: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Event Venue</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text"
                      placeholder="Hotel name or city..."
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                      value={newCustomer.venue}
                      onChange={e => setNewCustomer({...newCustomer, venue: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Internal Notes</label>
                  <textarea 
                    placeholder="Theme, special requirements, or lead source..."
                    className="w-full p-5 bg-gray-50 border-0 rounded-3xl focus:ring-2 focus:ring-blue-100 font-medium text-gray-800 shadow-inner outline-none min-h-[120px] transition-all text-sm"
                    value={newCustomer.notes}
                    onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-4 flex flex-col space-y-3">
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all transform active:scale-[0.98]"
                >
                  Create Customer Record
                </button>
                <button 
                  type="button"
                  onClick={() => setIsAddDrawerOpen(false)}
                  className="w-full py-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all"
                >
                  Discard Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inbuilt Delete Confirmation Modal */}
      {/* Inbuilt Add Vendor Modal from Customers */}
      {isAddingVendorFromCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsAddingVendorFromCustomer(false)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 leading-tight">Add New Vendor</h3>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">Register Partner</p>
                </div>
              </div>
              <button onClick={() => setIsAddingVendorFromCustomer(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddVendor} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Vendor Name</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Wedding Florals Inc."
                    className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                    value={newVendor.name}
                    onChange={e => setNewVendor({ ...newVendor, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Linked Event / Customer</label>
                  <select
                    className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm appearance-none"
                    value={newVendor.customer_id}
                    onChange={e => setNewVendor({ ...newVendor, customer_id: e.target.value })}
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
                        onChange={e => setNewVendor({ ...newVendor, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
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
                        onChange={e => setNewVendor({ ...newVendor, credit_limit: e.target.value })}
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
                    onChange={e => setNewVendor({ ...newVendor, notes: e.target.value })}
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
                  onClick={() => setIsAddingVendorFromCustomer(false)}
                  className="w-full py-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all"
                >
                  Cancel Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmation(null)}></div>
          <div className="relative bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-extrabold text-gray-900 mb-2">Delete {deleteConfirmation.title}?</h3>
            <p className="text-sm text-gray-500 mb-8 px-2">{deleteConfirmation.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirmation(null)}
                className="flex-1 py-3.5 bg-gray-50 text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                   deleteConfirmation.onConfirm();
                   setDeleteConfirmation(null);
                }}
                className="flex-1 py-3.5 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all active:scale-95"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inbuilt Prompt Modal */}
      {promptModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPromptModal(null)}></div>
          <div className="relative bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 animate-in zoom-in-95">
            <h3 className="text-xl font-extrabold text-gray-900 mb-4">{promptModal.title}</h3>
            <div className="mb-6">
              <label className="text-[10px] font-black text-gray-400 block mb-2 uppercase tracking-[0.2em]">{promptModal.label}</label>
              <input 
                autoFocus
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 shadow-inner outline-none transition-all text-sm"
                defaultValue={promptModal.defaultValue}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    promptModal.onSave(e.target.value);
                    setPromptModal(null);
                  }
                }}
                id="prompt-input"
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setPromptModal(null)}
                className="flex-1 py-3 bg-gray-50 text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                   const val = document.getElementById('prompt-input').value;
                   promptModal.onSave(val);
                   setPromptModal(null);
                }}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
