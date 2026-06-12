import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import DailyBrief from './components/DailyBrief.jsx';
import CampaignStats from './components/CampaignStats.jsx';
import SegmentBuilder from './components/SegmentBuilder.jsx';
import Customers from './components/Customers.jsx';
import Analytics from './components/Analytics.jsx';

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="navbar">
          <NavLink to="/" className="brand">
            <span>Zera</span> CRM
          </NavLink>
          <nav className="nav-links">
            <NavLink to="/" className="nav-link" end>
              Daily Brief
            </NavLink>
            <NavLink to="/segment" className="nav-link">
              Segment Builder
            </NavLink>
            <NavLink to="/shoppers" className="nav-link">
              Shopper Database
            </NavLink>
            <NavLink to="/analytics" className="nav-link">
              System Analytics
            </NavLink>
          </nav>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<DailyBrief />} />
            <Route path="/campaigns/:id/stats" element={<CampaignStats />} />
            <Route path="/segment" element={<SegmentBuilder />} />
            <Route path="/shoppers" element={<Customers />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
