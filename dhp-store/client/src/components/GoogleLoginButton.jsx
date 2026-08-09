import { useEffect, useRef } from 'react';
import api from '../api';

/**
 * GoogleLoginButton — Renders the Google Identity Services "Sign in with Google" button.
 *
 * Uses the GIS library loaded via <script> in index.html.
 * On successful authentication, it calls onSuccess with the credential.
 *
 * @param {function} onSuccess - Called with the credential (id_token) after successful login
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
          if (onSuccess) {
            await onSuccess(response.credential);
          }
        } catch (err) {
          const msg = err.response?.data?.message || err.message || 'Google login failed';
          onError?.(msg);
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      width: '100%',
      text: 'continue_with',
      shape: 'rectangular',
    });
  }, [onSuccess, onError]);

  return <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center' }} />;
}
