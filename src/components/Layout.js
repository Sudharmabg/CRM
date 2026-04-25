import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';

const Layout = ({ children }) => {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex w-full h-screen bg-gray-50/30 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Mobile Sidebar (Drawer) */}
      <div 
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
        <div className={`absolute inset-y-0 right-0 w-72 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <Sidebar onClose={() => setIsSidebarOpen(false)} />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 bg-[#1a3a2a] flex items-center justify-between px-5 shrink-0 shadow-md z-20">
          <div className="flex items-center space-x-3">
             <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs">TE</div>
             <h1 className="text-white font-black text-xs uppercase tracking-[0.2em]">Third Element</h1>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-white/80 hover:text-white transition-colors"
          >
            <Menu size={24} />
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto w-full no-scrollbar md:custom-scrollbar bg-gray-50/30">
          <div className="w-full max-w-[1600px] mx-auto px-4 py-6 md:p-8 md:pt-10 min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
