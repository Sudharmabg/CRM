import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, X, Search, Trash2, Edit2, Image as ImageIcon, Package } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export const CONDITIONS = ['New', 'Used', 'Repair', 'Refurbish', 'Discard'];
const conditionStyle = {
  New: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Used: 'bg-blue-50 text-blue-700 border-blue-100',
  Repair: 'bg-orange-50 text-orange-700 border-orange-100',
  Refurbish: 'bg-purple-50 text-purple-700 border-purple-100',
  Discard: 'bg-red-50 text-red-700 border-red-100',
};

const emptyForm = () => ({ code: '', name: '', description: '', available_qty: 0, price: '', condition: 'New', image_url: '' });
const labelCls = 'text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]';
const inputCls = 'w-full px-4 py-3 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 font-bold text-sm shadow-inner outline-none';

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [conditionFilter, setConditionFilter] = useState('All');
  const [drawer, setDrawer] = useState(null); // { id?: string } | null
  const [form, setForm] = useState(emptyForm());
  const [tab, setTab] = useState('Details');
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase.from('inventory').select('*').order('code', { ascending: true });
    if (!error) setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
    const ch = supabase.channel('inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchItems)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i =>
      (conditionFilter === 'All' || i.condition === conditionFilter) &&
      (!q || [i.code, i.name, i.description].some(v => (v || '').toLowerCase().includes(q)))
    );
  }, [items, search, conditionFilter]);

  const totalValue = useMemo(() => filtered.reduce((s, i) => s + Number(i.available_qty || 0) * Number(i.price || 0), 0), [filtered]);

  const openDrawer = (item) => {
    setForm(item ? { ...emptyForm(), ...item } : emptyForm());
    setImageFile(null);
    setTab('Details');
    setDrawer({ id: item?.id });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let imageUrl = form.image_url || null;
      if (imageFile) {
        const path = `${Date.now()}-${imageFile.name.replace(/[^\w.-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('inventory').upload(path, imageFile);
        if (upErr) throw upErr;
        imageUrl = supabase.storage.from('inventory').getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description,
        available_qty: Number(form.available_qty || 0),
        price: Number(form.price || 0),
        condition: form.condition,
        image_url: imageUrl,
      };
      const { error } = drawer.id
        ? await supabase.from('inventory').update(payload).eq('id', drawer.id)
        : await supabase.from('inventory').insert([payload]);
      if (error) throw error;
      setDrawer(null);
      fetchItems();
    } catch (err) {
      console.error('Error saving inventory item:', err);
      alert('Could not save item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete ${item.name} (${item.code})?`)) return;
    const { error } = await supabase.from('inventory').delete().eq('id', item.id);
    if (error) alert('Could not delete item: ' + error.message);
    else fetchItems();
  };

  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : form.image_url;

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500">Loading Inventory...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} products · stock value {fmt(totalValue)}</p>
        </div>
        <button onClick={() => openDrawer(null)} className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-bold shadow-lg shadow-blue-100">
          <Plus size={18} /><span>Add Product</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            placeholder="Search by code, name or description..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={conditionFilter} onChange={e => setConditionFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
          <option value="All">All conditions</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Image', 'Code', 'Product', 'Available Qty', 'Price', 'Condition', ''].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  {i.image_url
                    ? <img src={i.image_url} alt={i.name} className="w-12 h-12 object-cover rounded-lg border border-gray-100" />
                    : <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center text-gray-300"><ImageIcon size={18} /></div>}
                </td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-gray-600">{i.code}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{i.name}</div>
                  {i.description && <div className="text-xs text-gray-400 truncate max-w-[260px]">{i.description}</div>}
                </td>
                <td className="px-4 py-3 font-bold text-gray-900">{i.available_qty}</td>
                <td className="px-4 py-3">{fmt(i.price)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${conditionStyle[i.condition] || 'bg-gray-50 text-gray-600 border-gray-100'}`}>{i.condition}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <button onClick={() => openDrawer(i)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg" title="Edit"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(i)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-16 text-center text-gray-400 text-sm italic">No products found.</div>}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawer(null)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center"><Package size={22} /></div>
                <h3 className="text-xl font-extrabold text-gray-900">{drawer.id ? 'Edit Product' : 'Add Product'}</h3>
              </div>
              <button onClick={() => setDrawer(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} /></button>
            </div>

            <div className="flex px-6 border-b">
              {['Details', 'Product Description'].map(t => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-3 font-bold text-sm relative ${tab === t ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  {t}
                  {tab === t && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full" />}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              {tab === 'Details' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Inventory Code</label>
                      <input required placeholder="e.g. FLR-001" className={inputCls} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Condition</label>
                      <select className={inputCls} value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
                        {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Name of the Product</label>
                    <input required className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Available Qty</label>
                      <input type="number" min="0" className={inputCls} value={form.available_qty} onChange={e => setForm({ ...form, available_qty: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Price</label>
                      <input type="number" min="0" className={inputCls} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Image of the Product</label>
                    {previewUrl && <img src={previewUrl} alt="Preview" className="w-32 h-32 object-cover rounded-2xl border border-gray-100 mb-2" />}
                    <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} className="text-xs" />
                  </div>
                </>
              ) : (
                <div>
                  <label className={labelCls}>Product Description</label>
                  <textarea
                    placeholder="Material, size, colour, usage notes..."
                    className="w-full p-5 bg-gray-50 border-0 rounded-3xl focus:ring-2 focus:ring-blue-100 text-sm shadow-inner outline-none min-h-[240px]"
                    value={form.description || ''}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              )}

              <button type="submit" disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 disabled:opacity-70">
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
