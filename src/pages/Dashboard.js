import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Users, 
  Store, 
  Calendar as CalendarIcon, 
  Wallet, 
  TrendingUp, 
  Clock, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import * as XLSX from "xlsx";
import { format, subMonths, isSameMonth, parseISO } from 'date-fns';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { label: 'Total Customers', value: '0', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', trend: '+0%' },
    { label: 'Active Projects', value: '0', icon: CalendarIcon, color: 'text-emerald-700', bg: 'bg-emerald-50', trend: 'Confirmed' },
    { label: 'Total Vendors', value: '0', icon: Store, color: 'text-violet-600', bg: 'bg-violet-50', trend: 'Partnered' },
    { label: 'Revenue (MTD)', value: '₹0', icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50', trend: 'This Month' },
  ]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [upcomingSchedule, setUpcomingSchedule] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);

  useEffect(() => {
    fetchDashboardData();

    // Real-time subscriptions
    const customersChannel = supabase
      .channel('dashboard-customers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchDashboardData)
      .subscribe();

    const paymentsChannel = supabase
      .channel('dashboard-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_payments' }, fetchDashboardData)
      .subscribe();

    const meetingsChannel = supabase
      .channel('dashboard-meetings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, fetchDashboardData)
      .subscribe();

    return () => {
      supabase.removeChannel(customersChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(meetingsChannel);
    };
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Stats
      const [customersRes, vendorsRes, paymentsRes, meetingsRes] = await Promise.all([
        supabase.from('customers').select('id, name, status, created_at, event_date, event_type, venue'),
        supabase.from('vendors').select('id', { count: 'exact' }),
        supabase.from('customer_payments').select('amount, payment_date, customers(name)'),
        supabase.from('meetings').select('id, customer_id, meeting_date, notes, customers(name)').order('meeting_date', { ascending: true }).gte('meeting_date', new Date().toISOString())
      ]);

      const customers = customersRes.data || [];
      const totalCustomers = customers.length;
      const activeProjects = customers.filter(c => ['Confirmed', 'Proposal'].includes(c.status)).length;
      const totalVendors = vendorsRes.count || 0;

      // Calculate MTD Revenue
      const now = new Date();
      const mtdPayments = (paymentsRes.data || []).filter(p => isSameMonth(parseISO(p.payment_date), now));
      const mtdRevenue = mtdPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);

      // Calculate Revenue Trend (Last 6 months)
      const revenueByMonth = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthLabel = format(monthDate, 'MMM');
        const monthRevenue = (paymentsRes.data || [])
          .filter(p => isSameMonth(parseISO(p.payment_date), monthDate))
          .reduce((acc, curr) => acc + Number(curr.amount), 0);
        revenueByMonth.push({ label: monthLabel, value: monthRevenue });
      }
      setMonthlyRevenue(revenueByMonth);

      setStats([
        { label: 'Total Customers', value: totalCustomers.toString(), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', trend: `+${customers.filter(c => isSameMonth(parseISO(c.created_at), now)).length} new` },
        { label: 'Active Projects', value: activeProjects.toString(), icon: CalendarIcon, color: 'text-emerald-700', bg: 'bg-emerald-50', trend: 'Confirmed/Proposal' },
        { label: 'Total Vendors', value: totalVendors.toString(), icon: Store, color: 'text-violet-600', bg: 'bg-violet-50', trend: 'Active Network' },
        { label: 'Revenue (MTD)', value: `₹${mtdRevenue.toLocaleString('en-IN')}`, icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50', trend: 'Gross Collections' },
      ]);

      // 2. Fetch Recent Activity (Combine latest customers and latest payments)
      const latestCustomers = customers
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3)
        .map(c => ({ type: 'customer', date: c.created_at, title: 'New Lead Added', description: `Customer: ${c.name}` }));
      
      const latestPayments = (paymentsRes.data || [])
        .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
        .slice(0, 3)
        .map(p => ({ type: 'payment', date: p.payment_date, title: 'Payment Received', description: `Amount: ₹${Number(p.amount).toLocaleString()} from ${p.customers?.name || 'Unknown'}` }));

      setRecentActivity([...latestCustomers, ...latestPayments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5));

      // 3. Unified Upcoming Schedule (Meetings + Customer Events + Follow-ups)
      const upcomingEvents = customers
        .filter(c => c.event_date && parseISO(c.event_date) >= now)
        .map(c => ({
          id: `event-${c.id}`,
          type: 'Event',
          date: c.event_date,
          title: c.name,
          subtitle: `${c.event_type || 'Event'} @ ${c.venue || 'Venue TBD'}`,
          icon: CalendarIcon,
          iconColor: 'text-blue-600',
          bg: 'bg-blue-50',
          labelBg: 'bg-blue-600'
        }));

      const upcomingMeets = (meetingsRes.data || [])
        .filter(m => m.meeting_date && parseISO(m.meeting_date) >= now)
        .map(m => ({
          id: `meeting-${m.id}`,
          type: 'Meeting',
          date: m.meeting_date,
          title: m.customers?.name || 'Unknown Customer',
          subtitle: m.notes,
          icon: Clock,
          iconColor: 'text-emerald-600',
          bg: 'bg-emerald-50',
          labelBg: 'bg-emerald-600'
        }));

      const upcomingFollowups = (meetingsRes.data || [])
        .filter(m => m.next_followup_date && parseISO(m.next_followup_date) >= now)
        .map(m => ({
          id: `followup-${m.id}`,
          type: 'Follow-up',
          date: m.next_followup_date,
          title: m.customers?.name || 'Unknown Customer',
          subtitle: `Follow-up on: ${m.notes}`,
          icon: Clock,
          iconColor: 'text-gray-600',
          bg: 'bg-gray-100',
          labelBg: 'bg-[#1a3a2a]'
        }));

      setUpcomingSchedule([...upcomingEvents, ...upcomingMeets, ...upcomingFollowups]
        .sort((a, b) => parseISO(a.date) - parseISO(b.date))
        .slice(0, 6));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportAllData = async (format) => {
    try {
      const tables = [
        'customers',
        'meetings',
        'customer_payments',
        'vendors',
        'vendor_transactions'
      ];

      const allData = {};
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        allData[table] = data;
      }

      const timestamp = new Date().toISOString();
      const exportObject = {
        exported_at: timestamp,
        client: "Third Element Production",
        data: allData
      };

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `crm-backup-${timestamp}.json`;
        a.click();
      } else if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        Object.keys(allData).forEach((key) => {
          const ws = XLSX.utils.json_to_sheet(allData[key]);
          XLSX.utils.book_append_sheet(wb, ws, key);
        });
        XLSX.writeFile(wb, `crm-backup-${timestamp.split('T')[0]}.xlsx`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Check console for details.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const maxRevenue = Math.max(...monthlyRevenue.map(r => r.value), 1);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight leading-tight">Executive Dashboard</h2>
          <p className="text-gray-500 text-xs md:text-sm mt-1 font-medium italic">Real-time insights for Third Element Production</p>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto justify-start md:justify-end">
          <Link
            to="/customers"
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-bold text-[10px] uppercase tracking-widest transition-all shadow-sm"
          >
            <Users size={14} />
            <span>Customers</span>
          </Link>
          <Link
            to="/vendors"
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-bold text-[10px] uppercase tracking-widest transition-all shadow-sm"
          >
            <Store size={14} />
            <span>Vendors</span>
          </Link>
          <Link
            to="/calendar"
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-bold text-[10px] uppercase tracking-widest transition-all shadow-sm"
          >
            <CalendarIcon size={14} />
            <span>Calendar</span>
          </Link>
          <button
            onClick={() => exportAllData('json')}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-bold text-[10px] uppercase tracking-widest transition-all shadow-sm"
          >
            <Download size={14} />
            <span>JSON Backup</span>
          </button>
          <button
            onClick={() => exportAllData('excel')}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-[0.98]"
          >
            <Download size={14} />
            <span>Excel Export</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-5 md:p-6 border border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group relative overflow-hidden">
            <div className={`w-11 h-11 md:w-12 md:h-12 ${stat.bg} rounded-2xl flex items-center justify-center mb-4 md:mb-5 group-hover:scale-110 transition-transform`}>
              <stat.icon size={22} className={stat.color} />
            </div>
            <p className="text-[9px] md:text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">{stat.label}</p>
            <div className="flex items-baseline space-x-2 mt-1">
              <h3 className="text-2xl md:text-3xl font-black text-gray-950 tracking-tighter">{stat.value}</h3>
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{stat.trend}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white p-6 md:p-8 border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden">
          <div className="flex justify-between items-center mb-8 md:mb-10">
            <div>
              <h3 className="text-base md:text-lg font-black text-gray-900 flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-600" />
                Revenue Performance
              </h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Last 6 Months</p>
            </div>
            <div className="flex items-center gap-2 bg-emerald-50 px-2 py-1 md:px-3 md:py-1.5 rounded-xl border border-emerald-100">
               <span className="text-[9px] font-black text-emerald-700 uppercase">Growth Tracked</span>
            </div>
          </div>
          
          <div className="flex items-end justify-between h-40 md:h-48 gap-3 md:gap-4 px-1 md:px-2">
            {monthlyRevenue.map((item, i) => (
              <div key={i} className="flex-1 flex flex-col items-center group">
                <div className="relative w-full flex justify-center items-end h-full">
                  <div 
                    style={{ height: `${(item.value / maxRevenue) * 100}%` }}
                    className="w-full max-w-[40px] bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg md:rounded-t-xl group-hover:from-blue-700 group-hover:to-blue-500 transition-all relative"
                  >
                  </div>
                </div>
                <span className="text-[9px] md:text-[10px] font-black text-gray-400 mt-3 md:mt-4 uppercase tracking-tighter">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-6 md:p-8 border border-gray-100 rounded-[2.5rem] shadow-sm flex flex-col min-h-[400px]">
          <h3 className="text-base md:text-lg font-black text-gray-900 flex items-center gap-2 mb-6 md:mb-8">
            <Clock size={18} className="text-violet-600" />
            Recent Activity
          </h3>
          
          <div className="space-y-5 md:space-y-6 flex-1">
            {recentActivity.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-300">
                <AlertCircle size={32} className="opacity-20 mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-center">No recent activity</p>
              </div>
            ) : (
              recentActivity.map((activity, i) => (
                <div key={i} className="flex gap-4 group">
                  <div className="relative shrink-0">
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm ${activity.type === 'payment' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                      {activity.type === 'payment' ? <Wallet size={14} /> : <Users size={14} />}
                    </div>
                    {i !== recentActivity.length - 1 && <div className="absolute top-9 md:top-10 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gray-50" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs md:text-sm font-black text-gray-900 leading-tight truncate">{activity.title}</h4>
                    <p className="text-[11px] text-gray-500 font-medium truncate">{activity.description}</p>
                    <span className="text-[8px] md:text-[9px] text-gray-400 font-bold uppercase tracking-tight">
                      {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).format(parseISO(activity.date))}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Upcoming Schedule */}
      <div className="bg-white p-8 border border-gray-100 rounded-[2.5rem] shadow-sm">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <CalendarIcon size={20} className="text-amber-600" />
            Upcoming Schedule
          </h3>
          <p className="hidden md:block text-[10px] font-black text-gray-400 uppercase tracking-widest">Events & Meetings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcomingSchedule.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-300 border-2 border-dashed border-gray-50 rounded-[2rem]">
              <CalendarIcon size={40} className="mx-auto opacity-20 mb-3" />
              <p className="text-xs font-bold uppercase tracking-widest">No upcoming schedules found</p>
            </div>
          ) : (
            upcomingSchedule.map((item) => (
              <div key={item.id} className="p-5 border border-gray-50 bg-gray-50/30 rounded-3xl hover:bg-white hover:border-blue-100 hover:shadow-xl transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${item.bg} rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                      <item.icon size={16} className={item.iconColor} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${item.labelBg} text-white`}>
                          {item.type}
                        </span>
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                            {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(parseISO(item.date))}
                          </div>
                      </div>
                      <div className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors mt-1">{item.title}</div>
                    </div>
                  </div>
                  <CheckCircle2 size={16} className="text-gray-200 group-hover:text-emerald-500 transition-colors" />
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 font-medium italic">"{item.subtitle}"</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
