import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function SegmentBuilder() {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const [resolvedData, setResolvedData] = useState(null);
  
  // Campaign creation state
  const [campaignName, setCampaignName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [channel, setChannel] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState(null);

  const navigate = useNavigate();

  const handleResolve = async (e) => {
    e.preventDefault();
    if (description.trim().length === 0) return;

    setLoading(true);
    setResolveError(null);
    setResolvedData(null);
    setLaunchError(null);

    try {
      const res = await fetch('/api/segments/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to resolve segment');
      }

      const data = await res.json();
      setResolvedData(data);
      // Pre-fill a default name
      setCampaignName(`NL Segment Campaign - ${new Date().toLocaleDateString()}`);
    } catch (err) {
      console.error('Resolution error:', err);
      setResolveError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchCampaign = async (e) => {
    e.preventDefault();
    if (!messageTemplate.trim() || !channel || !resolvedData) return;

    setLaunching(true);
    setLaunchError(null);

    try {
      // 1. Create campaign
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          segment_query: resolvedData.segment_query,
          message_template: messageTemplate,
          channel,
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

      navigate(`/campaigns/${id}/stats`);
    } catch (err) {
      console.error('Launch campaign error:', err);
      setLaunchError(err.message);
    } finally {
      setLaunching(false);
    }
  };

  const isSubmitDisabled = description.trim().length === 0 || loading;
  const isLaunchDisabled = !messageTemplate.trim() || !channel || launching;

  return (
    <div>
      <h1 className="page-title">Natural Language Segment Builder</h1>
      <p className="page-subtitle">Describe your target audience in plain English to build segments.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        
        {/* NL Description Input Card */}
        <div className="card">
          <form onSubmit={handleResolve}>
            <div className="form-group">
              <label className="form-label">Who do you want to target?</label>
              <textarea
                className="form-textarea"
                placeholder="e.g. Customers who prefer whatsapp, ordered floor cleaner in the last 60 days, and are about to run out in 5 days."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                disabled={loading}
                style={{ minHeight: '120px' }}
              />
              <div className="char-counter">{description.length}/500</div>
            </div>

            {resolveError && (
              <div className="alert alert-danger">
                {resolveError}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isSubmitDisabled} 
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {loading ? 'Analyzing with Claude...' : 'Build Segment'}
            </button>
          </form>
        </div>

        {/* Resolved Segment Results & Launch Form */}
        {resolvedData && (
          <div className="card" style={{ borderTop: '2px solid var(--color-primary)' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Segment Resolved Successfully!</span>
              <span className="badge badge-low" style={{ fontSize: '0.85rem' }}>
                Audience Size: {resolvedData.estimated_audience_size} shoppers
              </span>
            </h2>

            <div className="grid-2" style={{ marginBottom: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Applied Filters</h3>
                <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {resolvedData.segment_query.recency_days && (
                    <li>Ordered in the last <strong>{resolvedData.segment_query.recency_days}</strong> days</li>
                  )}
                  {resolvedData.segment_query.min_orders && (
                    <li>Placed at least <strong>{resolvedData.segment_query.min_orders}</strong> order(s)</li>
                  )}
                  {resolvedData.segment_query.channel_preference && (
                    <li>Prefers messaging channel: <strong style={{ textTransform: 'capitalize' }}>{resolvedData.segment_query.channel_preference}</strong></li>
                  )}
                  {resolvedData.segment_query.depletion_window_days && (
                    <li>Product running out in next <strong>{resolvedData.segment_query.depletion_window_days}</strong> days</li>
                  )}
                  {resolvedData.segment_query.sku_ids && resolvedData.segment_query.sku_ids.length > 0 && (
                    <li>Has purchased specific SKUs (IDs: {resolvedData.segment_query.sku_ids.join(', ')})</li>
                  )}
                  {!Object.values(resolvedData.segment_query).some(val => val !== null) && (
                    <li>All customers (no filters matched)</li>
                  )}
                </ul>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Query Payload</h3>
                <div className="query-editor-card">
                  {JSON.stringify(resolvedData.segment_query, null, 2)}
                </div>
              </div>
            </div>

            {/* Campaign Inception Form */}
            <form onSubmit={handleLaunchCampaign} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Launch Campaign to Segment</h3>
              
              <div className="form-group">
                <label className="form-label">Campaign Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  required
                  disabled={launching}
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Outbound Channel</label>
                  <select
                    className="form-select"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    required
                    disabled={launching}
                  >
                    <option value="">Select channel...</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Message Template</label>
                <textarea
                  className="form-textarea"
                  placeholder="Hello {name}, your {product} is running low. Reorder now!"
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  maxLength={1000}
                  required
                  disabled={launching}
                />
                <div className="char-counter">{messageTemplate.length}/1000</div>
              </div>

              {launchError && (
                <div className="alert alert-danger">
                  {launchError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLaunchDisabled}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1rem' }}
              >
                {launching ? 'Launching Campaign...' : 'Launch Outbound Campaign'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default SegmentBuilder;
