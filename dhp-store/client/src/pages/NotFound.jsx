import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '80vh',
      textAlign: 'center',
      backgroundColor: 'var(--bg)',
      color: 'var(--text)'
    }}>
      <h1 style={{
        fontFamily: '"DM Serif Display", serif',
        fontWeight: '400',
        fontSize: '4rem',
        marginBottom: '1rem',
        color: 'var(--accent)'
      }}>
        Destination Hidden? Perhaps.
      </h1>
      <p style={{
        fontSize: '1.2rem',
        color: 'var(--muted)',
        marginBottom: '2rem'
      }}>
        We couldn't find the page you were looking for.
      </p>
      <Link to="/" className="button">
        Return Home
      </Link>
    </div>
  );
};

export default NotFound;
