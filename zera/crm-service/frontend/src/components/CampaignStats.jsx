import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

function CampaignStats() {
  const { id } = useParams();
  
  const [stats, setStats] = useState({
    queued: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    opened: 0,
    clicked: 0,
    campaign_name: '',
    channel: '',
    message_template: '',
    communications: [],
  });
  const [campaignStatus, setCampaignStatus] = useState('draft');
  const [campaignComplete, setCampaignComplete] = useState(false);
  const [pollError, setPollError] = useState(null);
  const consecutiveFailures = useRef(0);

  useEffect(() => {
    fetchStats(); // initial fetch
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/${id}/stats`);
        if (!res.ok) {
          throw new Error(`Failed to fetch: ${res.status}`);
        }
        
        const data = await res.json();
        
        setStats({
          queued: data.queued ?? 0,
          sent: data.sent ?? 0,
          delivered: data.delivered ?? 0,
          failed: data.failed ?? 0,
          opened: data.opened ?? 0,
          clicked: data.clicked ?? 0,
          campaign_name: data.campaign_name || '',
          channel: data.channel || '',
          message_template: data.message_template || '',
          communications: data.communications || [],
        });
        setCampaignStatus(data.campaign_status || 'running');
        consecutiveFailures.current = 0;
        setPollError(null);

        if (data.campaign_status === 'completed') {
          setCampaignComplete(true);
          clearInterval(interval);
        }
      } catch (err) {
        consecutiveFailures.current += 1;
        console.error('Polling error:', err);
        
        if (consecutiveFailures.current >= 3) {
          setPollError('Stats unavailable — check connection');
          clearInterval(interval);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      const data = await res.json();
      setStats({
        queued: data.queued ?? 0,
        sent: data.sent ?? 0,
        delivered: data.delivered ?? 0,
        failed: data.failed ?? 0,
        opened: data.opened ?? 0,
        clicked: data.clicked ?? 0,
        campaign_name: data.campaign_name || '',
        channel: data.channel || '',
        message_template: data.message_template || '',
        communications: data.communications || [],
      });
      setCampaignStatus(data.campaign_status || 'running');
      if (data.campaign_status === 'completed') {
        setCampaignComplete(true);
      }
    } catch (err) {
      console.error('Initial stats load failed:', err);
    }
  };

  const [confetti, setConfetti] = useState([]);
  const [lastNotification, setLastNotification] = useState(null);

  const triggerConfetti = () => {
    const particles = [];
    for (let i = 0; i < 70; i++) {
      particles.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        color: `hsl(${Math.random() * 15 + 25}, 70%, ${Math.random() * 20 + 50}%)`,
        size: Math.random() * 8 + 6,
      });
    }
    setConfetti(particles);
    setTimeout(() => setConfetti([]), 2300);
  };

  const simulatePurchase = async (comm) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: comm.customer_id,
          sku_id: comm.sku_id,
          quantity: 1,
          amount: comm.price
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Fire confetti
        triggerConfetti();
        // Update stats
        fetchStats();
        
        // Show notification banner
        if (data.learning_feedback) {
          setLastNotification(data.learning_feedback.message);
        } else {
          setLastNotification(`Shopper ${comm.customer_name} placed an order of $${comm.price}. Depletion cycle reset.`);
        }
        // Auto clear after 8s
        setTimeout(() => setLastNotification(null), 8000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Conversion Simulation failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error simulating purchase:', err);
      alert('Error simulating purchase: ' + err.message);
    }
  };

  const totalComms = stats.queued + stats.sent + stats.delivered + stats.failed + stats.opened + stats.clicked;
  
  const getPercentage = (count) => {
    if (totalComms === 0) return 0;
    return (count / totalComms) * 100;
  };

  const funnelStages = [
    { key: 'queued', label: 'Queued in BullMQ', color: 'var(--text-muted)' },
    { key: 'sent', label: 'Dispatched to simulator', color: 'var(--color-accent)' },
    { key: 'delivered', label: 'Delivered successfully', color: 'var(--color-primary)' },
    { key: 'failed', label: 'Bounced / Failed', color: 'var(--status-high)' },
    { key: 'opened', label: 'Message Opened', color: 'var(--status-medium)' },
    { key: 'clicked', label: 'Links Clicked', color: 'var(--status-low)' },
  ];

  return (
    <div>
      {/* Floating feedback loop notification */}
      {lastNotification && (
        <div className="alert alert-info" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.02))',
          border: '1px solid var(--color-primary)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1)',
          marginBottom: '1.5rem',
          padding: '1rem',
          fontSize: '0.9rem'
        }}>
          <span><strong>Closed-Loop Feedback:</strong> {lastNotification}</span>
          <button 
            onClick={() => setLastNotification(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
          >
            &times;
          </button>
        </div>
      )}

      <div className="stats-header">
        <div>
          <h1 className="page-title">{stats.campaign_name || 'Campaign Performance'}</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.25rem' }}>
            <span>Channel: <strong style={{ textTransform: 'capitalize' }}>{stats.channel || 'Loading...'}</strong></span>
            <span style={{ color: 'var(--border-color)' }}>|</span>
            <span>Real-time delivery & engagement analytics</span>
          </p>
        </div>
        <Link to="/" className="btn btn-secondary">
          Back to Dashboard
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Funnel Visualizer Card */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Delivery Funnel</h2>
          
          {pollError && (
            <div className="alert alert-danger">
              {pollError}
            </div>
          )}

          <div className="funnel-container">
            {funnelStages.map((stage) => {
              const count = stats[stage.key];
              const pct = getPercentage(count);

              return (
                <div key={stage.key} className="funnel-row">
                  <span className="funnel-label">{stage.label}</span>
                  <div className="funnel-bar-container">
                    <div 
                      className="funnel-bar" 
                      style={{ 
                        width: `${pct}%`,
                        background: stage.color === 'var(--color-primary)' 
                          ? undefined 
                          : `linear-gradient(90deg, ${stage.color}, hsl(210, 40%, 40%))`
                      }}
                    ></div>
                  </div>
                  <span className="funnel-count">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Campaign Info / Status Side-card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Campaign Status</h2>
          
          <div>
            <div className="meta-label">Current State</div>
            <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`badge badge-${
                campaignStatus === 'completed' 
                  ? 'low' 
                  : campaignStatus === 'running' 
                  ? 'medium' 
                  : 'high'
              }`}>
                {campaignStatus}
              </span>
            </div>
          </div>

          <div>
            <div className="meta-label">Total Outbound Target</div>
            <div className="meta-value" style={{ fontSize: '1.75rem', marginTop: '0.25rem' }}>
              {totalComms}
            </div>
          </div>

          {stats.message_template && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <div className="meta-label" style={{ marginBottom: '0.5rem' }}>Message Copy Template</div>
              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                fontSize: '0.85rem',
                lineHeight: '1.4',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace'
              }}>
                {stats.message_template}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            {campaignComplete ? (
              <div className="alert alert-info text-center" style={{ margin: 0, fontWeight: 600 }}>
                Campaign Complete
              </div>
            ) : pollError ? (
              <div className="alert alert-warning text-center" style={{ margin: 0 }}>
                Connection Lost
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                <div className="spinner" style={{ width: '20px', height: '20px', margin: 0, borderWidth: '2px' }}></div>
                <span>Polling live data...</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Broadcast Dispatch Logs */}
      <div className="card mt-4" style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Broadcast Dispatch Logs</h2>
        
        {stats.communications.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No messages have been dispatched yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Customer Name</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Contact Address</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Rendered Message</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Last Updated</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.communications.map((comm) => (
                  <tr key={comm.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{comm.customer_name}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{comm.customer_contact}</td>
                    <td style={{ padding: '0.75rem 0.5rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comm.message}>
                      {comm.message}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span className={`badge badge-${
                        comm.status === 'delivered' || comm.status === 'opened' || comm.status === 'clicked'
                          ? 'low' 
                          : comm.status === 'sent' || comm.status === 'queued'
                          ? 'medium' 
                          : 'high'
                      }`}>
                        {comm.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(comm.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      {['delivered', 'opened', 'clicked'].includes(comm.status) ? (
                        <button
                          onClick={() => simulatePurchase(comm)}
                          className="btn btn-primary"
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: '#10B981',
                            borderColor: '#10B981',
                            boxShadow: 'none',
                          }}
                        >
                          Simulate Order
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting Delivery</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confetti particles */}
      {confetti.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            backgroundColor: p.color,
            width: `${p.size}px`,
            height: `${p.size}px`,
          }}
        />
      ))}
    </div>
  );
}

export default CampaignStats;
