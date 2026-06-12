import React, { useState, useEffect } from 'react';

function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/simulator/analytics');
      if (!res.ok) {
        throw new Error(`Failed to load analytics: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.message || 'Analytics details currently unavailable.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Crunching PostgreSQL attribution calculations...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center" style={{ padding: '4rem 2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
          Analytics Temporarily Offline
        </h2>
        <p className="alert alert-danger" style={{ maxWidth: '600px', margin: '0 auto' }}>{error}</p>
        <button onClick={fetchAnalytics} className="btn btn-secondary mt-4">
          Retry Calculations
        </button>
      </div>
    );
  }

  const { revenue, replenishment, calibrations, channels } = data;

  return (
    <div>
      <div className="stats-header">
        <div>
          <h1 className="page-title">CRM System Analytics Hub</h1>
          <p className="page-subtitle">
            Attribution lift models, customer replenishment rates, and machine-learning parameter drift.
          </p>
        </div>
        <button onClick={fetchAnalytics} className="btn btn-secondary">
          Refresh Metrics
        </button>
      </div>

      {/* Primary KPI Row */}
      <div className="grid-3" style={{ marginBottom: '2.5rem' }}>
        {/* Total Revenue Lift */}
        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <span className="meta-label">Closed-Loop Attribution Lift</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.5rem 0' }}>
            <span style={{ fontSize: '2.25rem', fontWeight: 'bold', fontFamily: 'var(--font-display)' }}>
              {revenue.lift_percentage.toFixed(1)}%
            </span>
            <span style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 600 }}>CRM Attributed</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Attributed Sales:</span>
              <strong style={{ color: 'var(--text-primary)' }}>${revenue.attributed.toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Organic Sales:</span>
              <strong style={{ color: 'var(--text-primary)' }}>${revenue.organic.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* On-Time Replenishments (Run-out Avoidance) */}
        <div className="card" style={{ borderLeft: '4px solid var(--color-accent)' }}>
          <span className="meta-label">Run-out Avoidance Rate</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.5rem 0' }}>
            <span style={{ fontSize: '2.25rem', fontWeight: 'bold', fontFamily: 'var(--font-display)' }}>
              {replenishment.on_time_rate.toFixed(1)}%
            </span>
            <span style={{ color: 'var(--color-accent)', fontSize: '0.9rem', fontWeight: 600 }}>On-Time</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>On-Time Restocks:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{replenishment.on_time}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total Cycles Recorded:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{replenishment.total}</strong>
            </div>
          </div>
        </div>

        {/* Brand Sales Volume */}
        <div className="card" style={{ borderLeft: '4px solid var(--status-low)' }}>
          <span className="meta-label">Total Store Revenue</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.5rem 0' }}>
            <span style={{ fontSize: '2.25rem', fontWeight: 'bold', fontFamily: 'var(--font-display)' }}>
              ${revenue.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Sales generated across all channels & organic shoppers since seed initialization.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '2rem', alignItems: 'start', marginBottom: '2.5rem' }}>
        
        {/* Adaptive Consumption Recalibrations */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Adaptive SKU Calibration Profiles</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            How Zera CRM's Exponential Moving Average (EMA) learning loop adjusts consumption parameters based on live shopper habits.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>SKU Name</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Baseline</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Learned (EMA)</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Variance</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Calibration Status</th>
                </tr>
              </thead>
              <tbody>
                {calibrations.map((cal) => (
                  <tr key={cal.sku_id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{cal.name}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{cal.baseline_days}d</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>{cal.avg_consumption_days}d</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {cal.variance_days === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>0d</span>
                      ) : cal.variance_days < 0 ? (
                        <span style={{ color: 'var(--status-high)' }}>{cal.variance_days}d (faster)</span>
                      ) : (
                        <span style={{ color: 'var(--status-low)' }}>+{cal.variance_days}d (slower)</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <span className={`badge badge-${
                        cal.status === 'Accelerated' ? 'high' : cal.status === 'Decelerated' ? 'low' : 'medium'
                      }`} style={{ fontSize: '0.7rem' }}>
                        {cal.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Channel Outbound Funnels */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Channel Performance Funnels</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Conversion and delivery rates broken down by communication touchpoint.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {channels.map((ch) => {
              const conversionRate = ch.sent > 0 ? (ch.conversions / ch.sent) * 100 : 0.0;
              const deliveryRate = ch.sent > 0 ? (ch.delivered / ch.sent) * 100 : 0.0;

              return (
                <div key={ch.channel} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ textTransform: 'capitalize', fontSize: '1rem', fontWeight: 600 }}>{ch.channel}</h3>
                    <span className="badge badge-low" style={{ fontSize: '0.75rem' }}>
                      {ch.sent} Sent
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>
                      <span>Delivery Rate:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${deliveryRate}%`, height: '100%', backgroundColor: 'var(--color-primary)' }} />
                        </div>
                        <strong style={{ minWidth: '40px', textAlign: 'right' }}>{deliveryRate.toFixed(0)}%</strong>
                      </div>
                    </div>

                    <div>
                      <span>Conversion Rate:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${conversionRate}%`, height: '100%', backgroundColor: 'var(--color-accent)' }} />
                        </div>
                        <strong style={{ minWidth: '40px', textAlign: 'right' }}>{conversionRate.toFixed(0)}%</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    <span>Conversions: {ch.conversions} order(s)</span>
                    <span>Revenue: ${ch.revenue.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Analytics;
