import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function RecommendRow({ title, products }) {
  const navigate = useNavigate();

  if (!products || products.length === 0) return null;

  return (
    <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
      <h3 style={{ marginBottom: '20px', fontSize: '24px' }}>{title}</h3>
      
      {/* Horizontal Scroll Container */}
      <div style={{ 
        display: 'flex', 
        gap: '20px', 
        overflowX: 'auto', 
        paddingBottom: '10px',
        scrollbarWidth: 'thin'
      }}>
        {products.map(p => (
          <div 
            key={p.id}
            onClick={() => {
              navigate(`/product/${p.id}`);
              window.scrollTo(0, 0); // Reset scroll to top
            }}
            style={{ 
              minWidth: '200px', // Fixed width for consistent "small card" look
              maxWidth: '200px',
              cursor: 'pointer', 
              border: '1px solid #eee', 
              borderRadius: '8px', 
              padding: '10px',
              backgroundColor: '#fff',
              flexShrink: 0, // Prevents cards from squishing
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <img 
              src={p.image_url} 
              alt={p.name} 
              style={{ 
                width: '100%', 
                height: '200px', 
                objectFit: 'cover', 
                borderRadius: '4px' 
              }} 
            />
            <h4 style={{ 
              fontSize: '16px', 
              margin: '10px 0 5px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {p.name}
            </h4>
            <div style={{ fontWeight: 'bold', color: '#333' }}>
              ${Number(p.price).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}