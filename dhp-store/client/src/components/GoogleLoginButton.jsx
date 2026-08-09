import { useEffect, useRef } from 'react';
import api from '../api';

/**
 * GoogleLoginButton — Renders the Google Identity Services "Sign in with Google" button.
 *
 * Uses the GIS library loaded via <script> in index.html.
 * On successful authentication, sends the credential to our backend
 * and calls onSuccess with the response.
 *
 * @param {function} onSuccess - Called with { name } after successful login
 * @param {function} onError - Called with error message on failure
 */
export default function GoogleLoginButton({ onSuccess, onError }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          const { data } = await api.post('/auth/google', {
            credential: response.credential,
          });
          onSuccess?.(data);
        } catch (err) {
          const msg = err.response?.data?.message || 'Google login failed';
          onError?.(msg);
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      width: '100%',
      text: 'signin_with',
      shape: 'rectangular',
    });
  }, [onSuccess, onError]);

  return <div ref={buttonRef} style={{ marginTop: '15px', display: 'flex', justifyContent: 'center' }} />;
}
