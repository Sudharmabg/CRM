import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import CalendarView from './pages/CalendarView';
import Budget from './pages/Budget';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <Layout>
              <Dashboard />
            </Layout>
          } />
          <Route path="/customers" element={
            <Layout>
              <Customers />
            </Layout>
          } />
          <Route path="/vendors" element={
            <Layout>
              <Vendors />
            </Layout>
          } />
          <Route path="/calendar" element={
            <Layout>
              <CalendarView />
            </Layout>
          } />
          <Route path="/budget" element={
            <Layout>
              <Budget />
            </Layout>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
