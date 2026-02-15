import React, { useState, useEffect } from 'react';
import './Feedback.css';
import { api } from '../api';

export default function Feedback() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/profile').then(({ data }) => {
      setName(data.name || '');
      setEmail(data.email || '');
    }).catch(() => {
      // not logged in or error, ignore
    });
  }, []);

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
    } 
    catch (err) {
      console.error('Feedback error:', err);
      setStatus({
        type: 'error',
        text: 'Something went wrong while sending. You can also email us directly at dhpStore@gmail.com.',
      });
    } 
    finally {
      setLoading(false);
    }
  }

  return (
    <div className="feedback-page">
      <div className="feedback-container">
        <h2>Send Feedback</h2>
        <p className="description">
          We'd love to hear your thoughts or any issues you've experienced.
        </p>

        {status && (
          <div className={status.type === 'error' ? 'error' : 'success'} style={{ marginBottom: 20, width: '100%', textAlign: 'center' }}>
            {status.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Your Name </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Peter Parker"
              required
            />
          </div>

          <div className="form-group">
            <label>Your Email </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="peterparker@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Your Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
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