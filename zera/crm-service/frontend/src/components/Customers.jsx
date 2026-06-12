import React, { useState, useEffect } from 'react';

function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerDetails, setSelectedCustomerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, [search, channelFilter]);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerDetails(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/customers', window.location.origin);
      if (search) url.searchParams.append('search', search);
      if (channelFilter) url.searchParams.append('channel', channelFilter);
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetails = async (id) => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedCustomerDetails(data);
      }
    } catch (err) {
      console.error('Error fetching customer details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDrawer = () => {
    setSelectedCustomerId(null);
    setSelectedCustomerDetails(null);
  };

  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 120px)' }}>
      <h1 className="page-title">Shopper Database Directory</h1>
      <p className="page-subtitle">Track individual consumer profiles, order intervals, and replenishment forecasting.</p>

      {/* Filter Toolbar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr', gap: '1rem', alignItems: 'center' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <input
              type="text"
              placeholder="Search shoppers by name, email, or phone..."
              className="form-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ margin: 0 }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <select
              className="form-select"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              style={{ margin: 0 }}
            >
              <option value="">All Channel Preferences</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
        </div>
      </div>

      {/* Shopper List Card */}
      <div className="card">
        {loading && customers.length === 0 ? (
          <div className="text-center" style={{ padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
            <p style={{ color: 'var(--text-muted)' }}>Querying database...</p>
          </div>
        ) : customers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No shoppers match your filters.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Full Name</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Email Address</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Phone Number</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Channel Preference</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((cust) => (
                  <tr
                    key={cust.id}
                    className="clickable-row"
                    onClick={() => setSelectedCustomerId(cust.id)}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{cust.name}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{cust.email}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{cust.phone || '—'}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span className={`badge badge-${cust.channel_preference === 'email' ? 'low' : cust.channel_preference === 'whatsapp' ? 'medium' : 'high'}`}>
                        {cust.channel_preference}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomerId(cust.id);
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      >
                        Inspect Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Profile Drawer Overlay */}
      {selectedCustomerId && (
        <div
          onClick={closeDrawer}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 99,
            display: 'flex',
            justifyContent: 'flex-end',
            transition: 'opacity 0.3s'
          }}
        >
          {/* Drawer Body */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '550px',
              height: '100%',
              backgroundColor: 'var(--bg-card)',
              borderLeft: '1px solid var(--border-color)',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100,
              overflow: 'hidden'
            }}
          >
            {/* Drawer Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), transparent)'
            }} >
              <div>
                <h2 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 700 }}>{selectedCustomerDetails?.profile?.name || 'Loading Shopper...'}</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{selectedCustomerDetails?.profile?.email}</span>
                  <span style={{ color: 'var(--border-color)' }}>•</span>
                  <span style={{ color: 'var(--text-muted)' }}>{selectedCustomerDetails?.profile?.phone || 'No phone'}</span>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {detailsLoading ? (
                <div className="text-center" style={{ padding: '5rem 0' }}>
                  <div className="spinner" style={{ margin: '0 auto' }}></div>
                  <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Reading timelines...</p>
                </div>
              ) : selectedCustomerDetails ? (
                <>
                  {/* Depletion Forecast Card */}
                  <div>
                    <h3 style={{ color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                      Depletion & Restocking Predictions
                    </h3>
                    {selectedCustomerDetails.depletion_forecasts.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No active depletion calculations found (needs order history).</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {selectedCustomerDetails.depletion_forecasts.map((dep, idx) => {
                          const isUrgent = dep.days_remaining <= 7;
                          const depletionStatus = dep.days_remaining < 0 
                            ? 'Runout' 
                            : isUrgent 
                            ? 'Urgent' 
                            : 'Stable';

                          return (
                            <div
                              key={idx}
                              style={{
                                padding: '0.75rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--border-radius)',
                                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div>
                                <strong style={{ fontSize: '0.95rem' }}>{dep.product_name}</strong>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  Last Ordered: {new Date(dep.ordered_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span className={`badge badge-${depletionStatus === 'Runout' || depletionStatus === 'Urgent' ? 'high' : 'low'}`} style={{ fontSize: '0.75rem' }}>
                                  {depletionStatus} ({dep.days_remaining}d remaining)
                                </span>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  Avg Rate: {dep.avg_consumption_days}d
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Purchase History */}
                  <div>
                    <h3 style={{ color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                      Order History ({selectedCustomerDetails.orders.length})
                    </h3>
                    {selectedCustomerDetails.orders.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>This customer has placed no orders.</p>
                    ) : (
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', overflow: 'hidden' }}>
                        {selectedCustomerDetails.orders.map((ord, idx) => (
                          <div
                            key={ord.id}
                            style={{
                              padding: '0.75rem',
                              borderBottom: idx === selectedCustomerDetails.orders.length - 1 ? 'none' : '1px solid var(--border-color)',
                              backgroundColor: 'rgba(255, 255, 255, 0.01)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.9rem'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 500 }}>{ord.product_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {new Date(ord.ordered_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 600 }}>${ord.amount}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Qty: {ord.quantity}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Communication History */}
                  <div>
                    <h3 style={{ color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                      Campaign Touchpoint Timeline ({selectedCustomerDetails.communications.length})
                    </h3>
                    {selectedCustomerDetails.communications.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No messages have been sent to this shopper.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {selectedCustomerDetails.communications.map((comm) => (
                          <div
                            key={comm.id}
                            style={{
                              padding: '0.75rem',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: 'rgba(255, 255, 255, 0.02)',
                              fontSize: '0.9rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                              <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {comm.campaign_name}
                              </strong>
                              <span className={`badge badge-${
                                comm.status === 'delivered' || comm.status === 'opened' || comm.status === 'clicked'
                                  ? 'low' 
                                  : comm.status === 'sent' || comm.status === 'queued'
                                  ? 'medium' 
                                  : 'high'
                              }`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                                {comm.status}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.3' }}>
                              "{comm.message}"
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                              <span style={{ textTransform: 'capitalize' }}>Via: {comm.channel}</span>
                              <span>Sent: {new Date(comm.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;
