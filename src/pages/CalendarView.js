import React, { useState, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Store,
  Clock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Tag,
  Plus,
  X,
  User,
  MessageSquare,
  CalendarDays
} from 'lucide-react';
import { format, parseISO, isAfter, startOfToday } from 'date-fns';

const CalendarView = () => {
  const [events, setEvents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activeMonthIdx, setActiveMonthIdx] = useState(new Date().getMonth());
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDayView, setShowDayView] = useState(false);
  const [customerMode, setCustomerMode] = useState('existing'); // 'existing' | 'new'
  const [newCustomerName, setNewCustomerName] = useState('');
  const getInitialIST = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (330 * 60000));
    return ist.toISOString().slice(0, 16);
  };

  const [newMeeting, setNewMeeting] = useState({
    customer_id: '',
    attended_by: '',
    meeting_date: getInitialIST(),
    next_followup_date: '',
    notes: ''
  });

  const resetMeetingForm = () => {
    setNewMeeting({ 
      customer_id: '', 
      attended_by: '', 
      meeting_date: getInitialIST(), 
      next_followup_date: '', 
      notes: '' 
    });
    setCustomerMode('existing');
    setNewCustomerName('');
  };

  const navigate = useNavigate();
  const calendarRef = React.useRef(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel('calendar_v6')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, fetchAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const fetchAll = async () => {

    const [custRes, meetRes] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('meetings').select('*, customers(name)')
    ]);

    const allCustomers = custRes.data || [];
    setCustomers(allCustomers);

    const allMeetings = meetRes.data || [];

    // 1. Customer Events (Weddings/Events)
    const cEvents = allCustomers
      .filter(c => !!c.event_date)
      .map(c => ({
        id: `event-${c.id}`,
        title: `Event: ${c.name}`,
        start: c.event_date,
        backgroundColor: '#2563eb',
        borderColor: '#1d4ed8',
        extendedProps: { type: 'Event', name: c.name, originalId: c.id, venue: c.venue, status: c.status, eventType: c.event_type, notes: c.notes }
      }));

    // 2. Meeting Events (Actual meeting date)
    const mEvents = allMeetings
      .filter(m => !!m.meeting_date)
      .map(m => ({
        id: `meeting-${m.id}`,
        title: `Mtg: ${m.customers?.name || 'Unknown'}`,
        start: m.meeting_date,
        backgroundColor: '#059669',
        borderColor: '#047857',
        extendedProps: { type: 'Meeting', originalId: m.customer_id, notes: m.notes, attended_by: m.attended_by, name: m.customers?.name }
      }));

    // 3. Follow-up Events (Next follow-up date)
    const fEvents = allMeetings
      .filter(m => !!m.next_followup_date)
      .map(m => ({
        id: `followup-${m.id}`,
        title: `F/Up: ${m.customers?.name || 'Unknown'}`,
        start: m.next_followup_date,
        backgroundColor: '#1a3a2a',
        borderColor: '#1a3a2a',
        extendedProps: { type: 'Follow-up', originalId: m.customer_id, notes: m.notes, attended_by: m.attended_by, name: m.customers?.name }
      }));

    setEvents([...cEvents, ...mEvents, ...fEvents]);
  };

  const handleAddMeeting = async (e) => {
    e.preventDefault();
    setSavingMeeting(true);
    try {
      let resolvedCustomerId = newMeeting.customer_id || null;

      // If "new customer" mode, create the customer record first
      if (customerMode === 'new' && newCustomerName.trim()) {
        const { data: inserted, error: custErr } = await supabase
          .from('customers')
          .insert([{ name: newCustomerName.trim(), status: 'Lead' }])
          .select('id')
          .single();
        if (custErr) throw custErr;
        resolvedCustomerId = inserted.id;
      }

      const payload = {
        customer_id: resolvedCustomerId,
        attended_by: newMeeting.attended_by,
        meeting_date: new Date(newMeeting.meeting_date).toISOString(),
        notes: newMeeting.notes,
      };
      if (newMeeting.next_followup_date) payload.next_followup_date = newMeeting.next_followup_date;

      const { error } = await supabase.from('meetings').insert([payload]);
      if (error) throw error;

      setSuccessMessage(
        customerMode === 'new'
          ? `New lead "${newCustomerName}" added & meeting scheduled!`
          : 'Meeting scheduled successfully!'
      );
      setShowAddMeeting(false);
      resetMeetingForm();
      fetchAll();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Error adding meeting:', err);
      alert('Could not save meeting: ' + err.message);
    } finally {
      setSavingMeeting(false);
    }
  };

  const sortedEvents = useMemo(() => {
    const today = startOfToday();
    return [...events]
      .filter(e => !!e.start && isAfter(parseISO(e.start), today))   // guard null starts
      .sort((a, b) => parseISO(a.start) - parseISO(b.start));
  }, [events]);

  const [filterType, setFilterType] = useState('All');

  const filteredEvents = useMemo(() => {
    return sortedEvents.filter(e => filterType === 'All' || e.extendedProps.type === filterType);
  }, [sortedEvents, filterType]);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="flex flex-col min-h-0 space-y-4 pb-10">
      {/* Month Navigator + Add Meeting Button */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 shrink-0">
        <div className="bg-white p-1.5 border border-gray-100 rounded-2xl shadow-sm grid grid-cols-6 md:flex md:flex-wrap gap-1 flex-1">
          {months.map((m, i) => (
            <button key={m} onClick={() => {
              setActiveMonthIdx(i);
              calendarRef.current.getApi().gotoDate(new Date(new Date().getFullYear(), i, 1));
            }} className={`flex-1 py-2 text-[9px] md:text-[10px] font-black rounded-xl transition-all ${activeMonthIdx === i ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}>{m}</button>
          ))}
        </div>

        <button
          onClick={() => setShowAddMeeting(true)}
          className="flex items-center justify-center space-x-2 px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-[0.97] transition-all whitespace-nowrap"
        >
          <Plus size={16} />
          <span>Add Meeting</span>
        </button>
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl flex justify-between items-center text-xs font-bold shadow-sm shrink-0">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')}><X size={16} /></button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 lg:flex-1 min-h-0">
        {/* Calendar */}
        <div className="flex-[4] bg-white p-2 sm:p-4 md:p-6 border border-gray-100 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm flex flex-col min-h-[450px] md:min-h-[500px] lg:min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 calendar-container mobile-calendar">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={events}
                height={windowWidth < 768 ? 'auto' : '100%'}
                aspectRatio={windowWidth < 768 ? 0.8 : 1.35}
                headerToolbar={{ left: 'prev,next', center: 'title', right: '' }}
                eventClassNames="compact-event"
                dayMaxEvents={1}
                dateClick={(info) => {
                  setSelectedDate(info.dateStr);
                  setShowDayView(true);
                }}
                datesSet={(arg) => {
                  const date = arg.view.currentStart;
                  if (date.getMonth() !== activeMonthIdx) setActiveMonthIdx(date.getMonth());
                }}
              />
            </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 md:gap-5 text-[8px] md:text-[9px] font-extrabold uppercase tracking-widest px-1 shrink-0">
            <div className="flex items-center space-x-1.5 text-blue-600"><div className="w-2 h-2 rounded-full bg-blue-600" /><span>Event</span></div>
            <div className="flex items-center space-x-1.5 text-emerald-600"><div className="w-2 h-2 rounded-full bg-emerald-600" /><span>Meeting</span></div>
            <div className="flex items-center space-x-1.5 text-[#1a3a2a]"><div className="w-2 h-2 rounded-full bg-[#1a3a2a]" /><span>Follow-up</span></div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex-1 w-full lg:w-80 min-h-[400px] lg:min-h-0">
          <div className="bg-white p-6 border border-gray-100 rounded-[2.5rem] shadow-sm flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-5 shrink-0">
              <h3 className="font-extrabold text-gray-900 text-[10px] uppercase tracking-[0.2em] flex items-center space-x-2">
                <Clock size={12} className="text-blue-600" />
                <span>Upcoming Schedule</span>
              </h3>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-[9px] font-black border-0 bg-gray-50 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-100"
              >
                <option value="All">All Types</option>
                <option value="Event">Events Only</option>
                <option value="Meeting">Meetings Only</option>
                <option value="Follow-up">Follow-ups</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar min-h-0 pb-2">
              {filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-300 space-y-3">
                  <CalendarDays size={40} className="opacity-30" />
                  <p className="text-xs font-bold">No items found</p>
                </div>
              ) : (
                filteredEvents.map(event => {
                  const isExp = expandedEventId === event.id;
                  const d = event.extendedProps;
                  return (
                    <div key={event.id} className={`border rounded-[1.8rem] transition-all overflow-hidden ${isExp ? 'bg-white border-blue-200 shadow-xl ring-4 ring-blue-50/50' : 'bg-gray-50/40 border-gray-100/50 hover:bg-white hover:border-gray-200'}`}>
                      {/* Clickable Card Header */}
                      <div className="p-4 flex justify-between items-start cursor-pointer group" onClick={() => setExpandedEventId(isExp ? null : event.id)}>
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${
                              d.type === 'Follow-up' ? 'bg-[#1a3a2a] text-white' : 
                              d.type === 'Meeting' ? 'bg-emerald-100 text-emerald-800' : 
                              'bg-blue-100 text-blue-800'
                            }`}>{d.type}</span>
                            <span className="text-[9px] text-gray-400 font-bold">
                              {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(parseISO(event.start))}
                            </span>
                          </div>
                          <div className="font-black text-gray-950 text-sm leading-tight group-hover:text-blue-600 transition-colors">
                            {d.name || event.title}
                            {d.type === 'Meeting' && (
                              <span className="ml-2 text-[10px] text-emerald-600">
                                @ {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }).format(parseISO(event.start))}
                              </span>
                            )}
                          </div>
                        </div>
                        {isExp ? <ChevronUp size={16} className="text-blue-500 shrink-0" /> : <ChevronDown size={16} className="text-gray-300 group-hover:text-gray-400 shrink-0" />}
                      </div>

                      {/* Expanded Data */}
                      {isExp && (
                        <div className="px-4 pb-4 pt-0 border-t border-gray-100 space-y-4 animate-in slide-in-from-top-1 duration-200">
                          <div className="space-y-2 pt-3">
                            {d.venue && (
                              <div className="flex items-center text-[11px] text-gray-600 font-bold">
                                <MapPin size={12} className="text-blue-500 mr-2 shrink-0" />
                                <span className="truncate">{d.venue}</span>
                              </div>
                            )}
                            <div className="flex items-center text-[11px] text-gray-600 font-bold">
                              <Tag size={12} className="text-blue-500 mr-2 shrink-0" />
                              <span>{d.status || 'Scheduled'} {d.eventType ? `• ${d.eventType}` : ''}</span>
                            </div>
                            {d.attended_by && (
                              <div className="flex items-center text-[11px] text-gray-600 font-bold">
                                <User size={12} className="text-blue-500 mr-2 shrink-0" />
                                <span>Attended by: {d.attended_by}</span>
                              </div>
                            )}
                          </div>

                          {d.notes && (
                            <div className="bg-gray-50 p-3 rounded-2xl text-[10px] text-gray-500 italic leading-relaxed border border-gray-100">
                              "{d.notes}"
                            </div>
                          )}

                          {/* CTAs */}
                          <div className="flex gap-2 w-full">
                            <button
                              onClick={() => navigate('/customers')}
                              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-blue-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-wide shadow-md shadow-blue-100 hover:bg-blue-700 active:scale-[0.97] transition-all"
                            >
                              <Users size={12} />
                              <span>Customers</span>
                            </button>
                            <button
                              onClick={() => navigate('/vendors')}
                              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-[#1a3a2a] text-white rounded-2xl text-[9px] font-black uppercase tracking-wide shadow-md shadow-emerald-100 hover:opacity-90 active:scale-[0.97] transition-all"
                            >
                              <Store size={12} />
                              <span>Vendors</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Meeting Drawer */}
      {showAddMeeting && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddMeeting(false)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-100">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 leading-tight">Schedule Meeting</h3>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">Calendar Booking</p>
                </div>
              </div>
              <button onClick={() => setShowAddMeeting(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleAddMeeting} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Linked Customer — toggle between Existing/New */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Customer</label>
                  <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setCustomerMode('existing')}
                      className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${customerMode === 'existing' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode('new')}
                      className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${customerMode === 'new' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      + New Lead
                    </button>
                  </div>
                </div>

                {customerMode === 'existing' ? (
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={16} />
                    <select
                      className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 font-bold text-sm shadow-inner outline-none appearance-none"
                      value={newMeeting.customer_id}
                      onChange={e => setNewMeeting({ ...newMeeting, customer_id: e.target.value })}
                    >
                      <option value="">— No specific customer —</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.event_date ? ` · ${c.event_date}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" size={16} />
                      <input
                        required={customerMode === 'new'}
                        placeholder="Enter new customer name"
                        className="w-full pl-10 pr-4 py-3.5 bg-emerald-50/30 border-0 rounded-2xl focus:ring-2 focus:ring-emerald-100 text-gray-900 font-bold text-sm shadow-inner outline-none"
                        value={newCustomerName}
                        onChange={e => setNewCustomerName(e.target.value)}
                      />
                    </div>
                    <p className="text-[9px] text-emerald-600 font-bold px-1 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                      New lead will be added to your customers.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Attended By</label>
                <input
                  required
                  placeholder="e.g. Rajesh (Sales)"
                  className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 font-bold text-sm shadow-inner outline-none transition-all"
                  value={newMeeting.attended_by}
                  onChange={e => setNewMeeting({ ...newMeeting, attended_by: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Meeting Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 font-bold text-sm shadow-inner outline-none transition-all"
                    value={newMeeting.meeting_date}
                    onChange={e => setNewMeeting({ ...newMeeting, meeting_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Follow-up Date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 font-medium text-sm shadow-inner outline-none transition-all"
                    value={newMeeting.next_followup_date}
                    onChange={e => setNewMeeting({ ...newMeeting, next_followup_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 block mb-1.5 uppercase tracking-[0.2em]">Meeting Notes</label>
                <div className="relative">
                  <MessageSquare className="absolute left-4 top-4 text-gray-300" size={16} />
                  <textarea
                    required
                    placeholder="Discussions, outcomes, action items..."
                    className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-blue-100 text-gray-900 text-sm min-h-[120px] leading-relaxed shadow-inner outline-none transition-all"
                    value={newMeeting.notes}
                    onChange={e => setNewMeeting({ ...newMeeting, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-4 flex flex-col space-y-3">
                <button
                  type="submit"
                  disabled={savingMeeting}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all transform active:scale-[0.98] disabled:opacity-70"
                >
                  {savingMeeting ? 'Scheduling...' : 'Schedule Meeting'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddMeeting(false)}
                  className="w-full py-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all"
                >
                  Discard Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .fc { font-size: 0.7rem; --fc-border-color: #f1f5f9; }
        .fc .fc-toolbar-title { font-size: 0.85rem !important; font-weight: 900 !important; }
        .fc .fc-button { padding: 0.25rem 0.6rem !important; font-size: 0.65rem !important; border-radius: 0.8rem !important; }
        .fc .fc-col-header-cell { padding: 0.8rem 0 !important; font-size: 0.6rem !important; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
        .compact-event { font-size: 8px !important; font-weight: 800 !important; padding: 1px 3px !important; border-radius: 4px !important; border: none !important; margin-bottom: 1px !important; }
        .fc .fc-daygrid-day-frame { min-height: 50px !important; }
        .fc-day-today { background-color: #f1f9ff !important; }
        .fc .fc-daygrid-day:hover { background-color: #fafafa !important; cursor: pointer; }
      `}} />

      {/* Day View Drawer */}
      {showDayView && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDayView(false)} />
          <div className="relative w-full md:max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b flex justify-between items-center bg-white shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg">
                  {format(parseISO(selectedDate), 'dd')}
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 leading-tight">{format(parseISO(selectedDate), 'MMMM yyyy')}</h3>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">{format(parseISO(selectedDate), 'EEEE')}</p>
                </div>
              </div>
              <button onClick={() => setShowDayView(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Agenda for the Day</h4>
                
                {events.filter(e => e.start.split('T')[0] === selectedDate).length === 0 ? (
                  <div className="py-12 bg-gray-50 rounded-[2.5rem] border border-dashed border-gray-200 flex flex-col items-center justify-center text-center px-6">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                      <CalendarDays size={32} className="text-gray-300" />
                    </div>
                    <h5 className="text-sm font-bold text-gray-900">No events scheduled</h5>
                    <p className="text-xs text-gray-500 mt-1 mb-6">Your calendar is clear for this day. Want to plan something?</p>
                    
                    <div className="grid grid-cols-1 gap-3 w-full max-w-xs">
                      <button 
                        onClick={() => {
                          setNewMeeting(m => ({ ...m, meeting_date: `${selectedDate}T09:00` }));
                          setShowDayView(false);
                          setShowAddMeeting(true);
                        }}
                        className="flex items-center justify-center space-x-2 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                      >
                        <Plus size={16} />
                        <span>Schedule Meeting</span>
                      </button>
                      <button 
                        onClick={() => navigate('/customers')}
                        className="flex items-center justify-center space-x-2 py-4 bg-white border border-gray-200 text-gray-700 rounded-2xl font-black text-xs hover:bg-gray-50 transition-all"
                      >
                        <Users size={16} className="text-blue-600" />
                        <span>Add New Customer</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {events
                      .filter(e => e.start.split('T')[0] === selectedDate)
                      .map(event => {
                        const d = event.extendedProps;
                        return (
                          <div key={event.id} className="p-4 bg-gray-50 rounded-[1.8rem] border border-gray-100/50 hover:bg-white hover:border-blue-200 hover:shadow-xl transition-all group">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${
                                d.type === 'Follow-up' ? 'bg-[#1a3a2a] text-white' : 
                                d.type === 'Meeting' ? 'bg-emerald-100 text-emerald-800' : 
                                'bg-blue-100 text-blue-800'
                              }`}>{d.type}</span>
                              {d.type === 'Meeting' && (
                                <span className="text-[10px] font-bold text-emerald-600">
                                  {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' }).format(parseISO(event.start))}
                                </span>
                              )}
                            </div>
                            <div className="font-black text-gray-950 text-sm leading-tight mb-2 group-hover:text-blue-600 transition-colors">{d.name || event.title}</div>
                            {d.venue && (
                              <div className="flex items-center text-[11px] text-gray-600 font-bold mt-1">
                                <MapPin size={12} className="text-blue-500 mr-2 shrink-0" />
                                <span className="truncate">{d.venue}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    
                    {/* CTAs always visible at the bottom of the list */}
                    <div className="pt-6 border-t border-gray-100 mt-6 space-y-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Quick Actions</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => {
                            setNewMeeting(m => ({ ...m, meeting_date: `${selectedDate}T09:00` }));
                            setShowDayView(false);
                            setShowAddMeeting(true);
                          }}
                          className="flex items-center justify-center space-x-2 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                        >
                          <Plus size={14} />
                          <span>Meeting</span>
                        </button>
                        <button 
                          onClick={() => navigate('/customers')}
                          className="flex items-center justify-center space-x-2 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-black text-[10px] hover:bg-gray-50 transition-all"
                        >
                          <Users size={14} className="text-blue-600" />
                          <span>Customer</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
