import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const URGENCY_ORDER = { high: 0, medium: 1, low: 2 };

function DailyBrief() {
  const [briefs, setBriefs] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cardErrors, setCardErrors] = useState({});
  const [submittingCard, setSubmittingCard] = useState(null);
  const [editedMessages, setEditedMessages] = useState({});
  
  // Simulator and Telemetry State
  const [logs, setLogs] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [customDays, setCustomDays] = useState('');

  const navigate = useNavigate();
  const consoleContainerRef = useRef(null);

  useEffect(() => {
    fetchBriefs();
    fetchCampaigns();
    fetchLogs();

    // Auto-poll logs and campaigns history
    const intervalLogs = setInterval(fetchLogs, 3000);
    const intervalCamps = setInterval(fetchCampaigns, 8000);

    return () => {
      clearInterval(intervalLogs);
      clearInterval(intervalCamps);
    };
  }, []);

  useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    }
  };

  const fetchBriefs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brief');
      if (!res.ok) {
        throw new Error(`Failed to fetch briefs: ${res.status}`);
      }
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
        setBriefs([]);
      } else {
        const sorted = (data.briefs || []).sort(
          (a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9)
        );
        setBriefs(sorted);
      }
    } catch (err) {
      console.error('Error fetching briefs:', err);
      setError(err.message || 'Brief unavailable');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/simulator/telemetry');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const handleApprove = async (brief) => {
    const label = brief.segment_label;
    setCardErrors(prev => ({ ...prev, [label]: null }));
    setSubmittingCard(label);

    const message = editedMessages[label] !== undefined 
      ? editedMessages[label] 
      : brief.suggested_message;

    try {
      // 1. Create campaign
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: brief.segment_label,
          segment_query: brief.segment_query || {},
          message_template: message,
          channel: brief.channel,
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create campaign');
      }

      const { id } = await createRes.json();

      // 2. Launch campaign
      const launchRes = await fetch(`/api/campaigns/${id}/launch`, {
        method: 'POST',
      });

      if (!launchRes.ok) {
        const errData = await launchRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to launch campaign');
      }

      // Refresh data
      fetchCampaigns();
      fetchLogs();

      // Navigate to stats page
      navigate(`/campaigns/${id}/stats`);
    } catch (err) {
      console.error('Approve error:', err);
      setCardErrors(prev => ({ ...prev, [label]: err.message }));
    } finally {
      setSubmittingCard(null);
    }
  };

  const handleMessageChange = (label, val) => {
    setEditedMessages(prev => ({ ...prev, [label]: val }));
  };

  const triggerFastForward = async (days) => {
    if (simulating) return;
    setSimulating(true);
    try {
      const res = await fetch('/api/simulator/fast-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      if (res.ok) {
        setCustomDays('');
        // Reload all parameters
        await Promise.all([fetchBriefs(), fetchCampaigns(), fetchLogs()]);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Timeline Shift failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Timeline shift error:', err);
      alert('Network error shifting timeline.');
    } finally {
      setSimulating(false);
    }
  };

  const getTagColor = (type) => {
    switch (type) {
      case 'ORDER': return '#10B981'; // Emerald
      case 'LEARNING': return '#F59E0B'; // Amber
      case 'LAUNCH': return '#6366F1'; // Indigo
      case 'RECEIPT': return '#0EA5E9'; // Sky Blue
      case 'CLOCK_SHIFT': return '#EF4444'; // Coral Red
      default: return '#9CA3AF'; // Gray
    }
  };

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--:--:--';
    }
  };

  return (
    <div>
      <h1 className="page-title">Zera CRM Command Hub</h1>
      <p className="page-subtitle">
        Zero-waste brand operations, predictive replenishment loops, and database simulation.
      </p>

      {/* Responsive Split-Pane Layout */}
      <div className="dashboard-grid">
        
        {/* Left Panel: CRM Actions */}
        <div className="dashboard-main">
          
          {/* AI Briefs Section */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Active AI Daily Recommendations
            </h2>

            {loading ? (
              <div className="card text-center" style={{ padding: '3rem 1rem' }}>
                <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                <p style={{ color: 'var(--text-muted)' }}>Calculating shopper depletions...</p>
              </div>
            ) : error || briefs.length === 0 ? (
              <div className="card text-center" style={{ padding: '3rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  No Active Restock Recommendations
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 1rem' }}>
                  All customer pantry levels are stable. Try fast-forwarding the system time to trigger depletions.
                </p>
                <button onClick={fetchBriefs} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                  Retry Fetch
                </button>
              </div>
            ) : (
              <div className="grid-2">
                {briefs.map((brief, idx) => {
                  const label = brief.segment_label;
                  const msgVal = editedMessages[label] !== undefined ? editedMessages[label] : brief.suggested_message;
                  const inlineError = cardErrors[label];
                  const isSubmitting = submittingCard === label;

                  return (
                    <div key={idx} className="card brief-card">
                      <div className="brief-header">
                        <h3 className="brief-title" style={{ fontSize: '1.1rem' }}>{brief.segment_label}</h3>
                        <span className={`badge badge-${brief.urgency || 'low'}`}>
                          {brief.urgency}
                        </span>
                      </div>

                      <p className="brief-rationale" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                        {brief.rationale}
                      </p>

                      <div className="brief-meta" style={{ padding: '0.5rem 0', margin: '0.5rem 0' }}>
                        <div className="meta-item">
                          <span className="meta-label" style={{ fontSize: '0.65rem' }}>Size</span>
                          <span className="meta-value" style={{ fontSize: '0.95rem' }}>{brief.audience_size}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label" style={{ fontSize: '0.65rem' }}>Est. Rev</span>
                          <span className="meta-value" style={{ fontSize: '0.95rem' }}>${brief.estimated_revenue?.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Message Copy Template</label>
                        <textarea
                          className="form-textarea"
                          value={msgVal}
                          onChange={(e) => handleMessageChange(label, e.target.value)}
                          maxLength={320}
                          disabled={isSubmitting}
                          style={{ minHeight: '70px', fontSize: '0.85rem', padding: '0.5rem' }}
                        />
                        <div className="char-counter" style={{ fontSize: '0.7rem' }}>{msgVal.length}/320</div>
                      </div>

                      {inlineError && (
                        <div className="alert alert-danger" style={{ padding: '0.5rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                          {inlineError}
                        </div>
                      )}

                      <div className="brief-actions">
                        <button
                          onClick={() => handleApprove(brief)}
                          disabled={isSubmitting || submittingCard !== null}
                          className="btn btn-primary"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', width: '100%' }}
                        >
                          {isSubmitting ? 'Launching...' : 'Approve & Dispatch'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Campaign History Section */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Campaign Broadcast History</h2>
            {campaigns.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No campaigns have been broadcasted yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Name</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Channel</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((camp) => (
                      <tr key={camp.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{camp.name}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textTransform: 'capitalize' }}>{camp.channel}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span className={`badge badge-${camp.status === 'completed' ? 'low' : camp.status === 'running' ? 'medium' : 'high'}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                            {camp.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {new Date(camp.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                          <button onClick={() => navigate(`/campaigns/${camp.id}/stats`)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            View Funnel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Right Panel: Simulator Control & Telemetry logs */}
        <div className="dashboard-sidebar">
          
          {/* Time Travel Simulator Card */}
          <div className="card" style={{ marginBottom: '2rem', borderTop: '2px solid var(--color-accent)' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Database Time-Travel</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Shift PostgreSQL timestamps back in time to age inventory levels and trigger depletions.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <button
                  onClick={() => triggerFastForward(1)}
                  disabled={simulating}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  +1 Day
                </button>
                <button
                  onClick={() => triggerFastForward(3)}
                  disabled={simulating}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  +3 Days
                </button>
                <button
                  onClick={() => triggerFastForward(7)}
                  disabled={simulating}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  +7 Days
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Custom days..."
                  className="form-input"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  disabled={simulating}
                  style={{ margin: 0, padding: '0.5rem', fontSize: '0.85rem', flex: 1 }}
                />
                <button
                  onClick={() => triggerFastForward(parseInt(customDays, 10))}
                  disabled={simulating || !customDays || isNaN(parseInt(customDays, 10)) || parseInt(customDays, 10) <= 0}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Shift
                </button>
              </div>

              {simulating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', fontSize: '0.85rem', justifyContent: 'center' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px', margin: 0, borderWidth: '2px' }}></div>
                  <span>Recalibrating database timelines...</span>
                </div>
              )}
            </div>
          </div>

          {/* Telemetry Console Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '400px', borderTop: '2px solid var(--color-primary)' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Live Activity Telemetry Feed</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Real-time monitoring of BullMQ, receipt hooks, and EMA calibration.
            </p>

            {/* Terminal Window */}
            <div 
              ref={consoleContainerRef}
              className="terminal-console"
              style={{
                flex: 1,
                backgroundColor: '#070a13',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '0.75rem',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                lineHeight: '1.4',
                color: 'var(--text-secondary)'
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem', textAlign: 'center' }}>
                  Listening for background operations...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {logs.map((log) => (
                    <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        [{formatTime(log.timestamp)}]
                      </span>
                      <span style={{ color: getTagColor(log.type), fontWeight: 'bold', flexShrink: 0 }}>
                        [{log.type}]
                      </span>
                      <span style={{ wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default DailyBrief;
