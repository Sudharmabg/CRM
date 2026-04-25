import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, login } = useAuth();

  // Hardcoded credentials
  const ADMIN_EMAIL = 'thethirdelement4@gmail.com';
  const ADMIN_PASS = 'Welcome@123';

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Check against hardcoded credentials
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
      login({ email: ADMIN_EMAIL, role: 'admin' });
      navigate('/');
    } else {
      setError('Invalid email or password');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center flex-col px-4" style={{ background: '#1a3a2a' }}>
      <div className="max-w-md w-full bg-white p-10 rounded-2xl shadow-2xl">
        {/* Logo area */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#1a3a2a' }}>
            <span className="text-white font-extrabold text-xl">TE</span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Third Element</h2>
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mt-1">Productions CRM</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-xl mb-6 text-sm font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="e.g. name@example.com"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition-all text-gray-900 font-medium"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition-all text-gray-900 font-medium"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50 text-sm tracking-wide mt-2"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
      <p className="mt-6 text-white/30 text-xs font-medium uppercase tracking-wider">
        Third Element Production © 2026
      </p>
    </div>
  );
};

export default Login;
