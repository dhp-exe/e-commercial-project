import React, { useState } from 'react';
import { api } from '../api';

export default function Feedback() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);

    if (!message.trim()) {
      return setStatus({ type: 'error', text: 'Please write a message before sending.' });
    }

    setLoading(true);
    try {
      await api.post('/feedback', { name, email, message });
      setStatus({ type: 'success', text: 'Thank you! Your feedback has been sent successfully.' });
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      console.error('Feedback error:', err);
      setStatus({
        type: 'error',
        text: 'Something went wrong while sending. You can also email us directly at owner@example.com.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>Send Feedback</h2>
        <p style={{ textAlign: 'center', marginBottom: '1rem', color: '#555' }}>
          We'd love to hear your thoughts or any issues you've experienced.
        </p>

        {status && (
          <div className={status.type === 'error' ? 'error' : 'success'} style={{ marginBottom: 12 }}>
            {status.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div>
            <label>Your Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Peter Parker"
            />
          </div>
          <div>
            <label>Your Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="peterparker@example.com"
            />
          </div>
          <div>
            <label>Your Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              style={{
                padding: 10,
                border: '1px solid #ccc',
                borderRadius: 6,
                fontFamily: 'inherit',
                fontSize: 15,
              }}
              placeholder="Write your feedback here..."
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}
