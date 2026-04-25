import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Store, 
  Calendar, 
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ onClose }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/vendors', icon: Store, label: 'Vendors' },
    { to: '/calendar', icon: Calendar, label: 'Calendar' },
  ];

  return (
    <div className="flex flex-col h-full w-full lg:w-64 border-l lg:border-l-0 lg:border-r border-white/5" style={{ background: '#1a3a2a' }}>
      {/* Logo */}
      <div className="p-7 border-b border-white/10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-white tracking-tighter leading-none">Third Element</h1>
          <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mt-1">Productions CRM</p>
        </div>
        <button onClick={onClose} className="lg:hidden text-white/40 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>
      
      {/* Nav */}
      <nav className="flex-1 p-5 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => {
              if (window.innerWidth < 1024) onClose?.();
            }}
            className={({ isActive }) => 
              `flex items-center space-x-3 px-5 py-3.5 rounded-2xl transition-all font-bold text-sm ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/40' 
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-5 border-t border-white/10">
        <button 
          onClick={handleLogout}
          className="flex items-center space-x-3 px-5 py-3.5 w-full text-left text-white/40 hover:bg-red-500/10 hover:text-red-400 rounded-2xl transition-all text-sm font-bold"
        >
          <LogOut size={19} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
