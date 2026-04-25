import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for mocked session first
    const mockedUser = localStorage.getItem('crm_mocked_user');
    if (mockedUser) {
      setUser(JSON.parse(mockedUser));
    }

    // Still listen to Supabase auth if we use it later
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else if (!localStorage.getItem('crm_mocked_user')) {
        setUser(null);
      }
      setLoading(false);
    });

    setLoading(false);
    return () => subscription.unsubscribe();
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('crm_mocked_user', JSON.stringify(userData));
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('crm_mocked_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
