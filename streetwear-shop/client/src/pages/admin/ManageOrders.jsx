import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function ManageOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null); // Controls the Popup

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      const { data } = await api.get('/orders/admin/all');
      setOrders(data);
    } catch (err) {
      console.error("Failed to load orders", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(orderId, newStatus) {
    try {
      await api.put(`/orders/${orderId}/status`, { status: newStatus });
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err) {
      alert("Failed to update status: " + (err.response?.data?.message || err.message));
    }
  }

  if (loading) return <p style={{padding: 20}}>Loading orders...</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Manage Orders</h2>
      
      <div style={{
          overflow: 'auto',                
          maxHeight: 'calc(100vh - 150px)',   
          border: '1px solid #eee', 
          borderRadius: 8,
          boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
          background: 'white'
      }}>
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr style={{textAlign: 'left', borderBottom: '2px solid #eee'}}>
              <th style={{padding: 15, position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10}}>ID</th>
              <th style={{padding: 15, position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10}}>Customer</th>
              <th style={{padding: 15, position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10}}>Items</th>
              <th style={{padding: 15, position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10}}>Total</th>
              <th style={{padding: 15, position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10}}>Payment</th>
              <th style={{padding: 15, position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10}}>Status</th>
              <th style={{padding: 15, position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 10}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id} style={{borderBottom: '1px solid #eee'}}>
                <td style={{padding: 15, fontWeight: 'bold'}}>#{order.id}</td>
                <td style={{padding: 15}}>
                  <div style={{fontWeight: 500}}>{order.name}</div>
                  <div style={{fontSize: '0.85em', color: '#666'}}>{order.email}</div>
                  <div style={{fontSize: '0.85em', color: '#666'}}>{order.phone}</div>
                </td>
                <td style={{padding: 15}}>
                   {order.items?.length || 0} Items
                </td>
                <td style={{padding: 15}}>${Number(order.total).toFixed(2)}</td>
                <td style={{padding: 15}}>
                   <span style={{
                       background: '#eee', padding: '4px 8px', borderRadius: 4, 
                       fontSize: '0.85em', fontWeight: '500'
                   }}>
                     {order.payment_method || 'COD'}
                   </span>
                </td>
                <td style={{padding: 15}}>
                  <span className={`status-badge ${order.status}`} style={{
                    padding: '4px 8px', borderRadius: 4, textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 'bold',
                    background: order.status === 'new' ? '#e6f7ff' : order.status === 'cancelled' ? '#fff1f0' : order.status === 'shipping'? '#f6dfff': order.status === 'received'? '#fffddf':'#f6ffed',
                    color: order.status === 'new' ? '#1890ff' : order.status === 'cancelled' ? '#cf1322' : order.status === 'shipping'? '#681683': order.status ==='received'? '#636000': '#52c41a'
                  }}>
                    {order.status}
                  </span>
                </td>
                <td style={{padding: 15}}>
                  <div style={{display: 'flex', gap: 10}}>
                    <button 
                      onClick={() => setSelectedOrder(order)}
                      style={{cursor: 'pointer', padding: '6px 12px', background: '#222', color: '#fff', border: 'none', borderRadius: 4}}
                    >
                      View
                    </button>
                    
                    <select 
                      value={order.status} 
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      style={{padding: '5px', borderRadius: 4, border: '1px solid #ddd'}}
                    >
                      <option value="new">New</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="shipping">Shipping</option>
                      <option value="received">Received</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- ORDER DETAILS MODAL --- */}
      {selectedOrder && (
         <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', 
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }} onClick={() => setSelectedOrder(null)}>
          
          <div style={{
              background: 'white', width: '90%', maxWidth: '500px', borderRadius: '8px', 
              padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto'
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
              <h3 style={{margin: 0}}>Order #{selectedOrder.id} Details</h3>
              <button onClick={() => setSelectedOrder(null)} style={{border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer'}}>&times;</button>
            </div>

            {/* Customer Info Block */}
            <div style={{background: '#f9f9f9', padding: 15, borderRadius: 6, marginBottom: 15}}>
                <strong>Customer:</strong> {selectedOrder.name}<br/>
                <strong>Email:</strong> {selectedOrder.email}<br/>
                <strong>Address:</strong> {selectedOrder.address}, {selectedOrder.city}
                {selectedOrder.note && (
                    <div style={{marginTop: 10, paddingTop: 10, borderTop: '1px solid #ddd'}}>
                        <strong>📝 Note from Customer:</strong><br/>
                        <span style={{color: '#555', fontStyle: 'italic'}}>"{selectedOrder.note}"</span>
                    </div>
                )}
            </div>

            {/* Product List */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              {selectedOrder.items && selectedOrder.items.map((item, idx) => (
                 <div key={idx} style={{display: 'flex', gap: 15, borderBottom: '1px solid #eee', paddingBottom: 10}}>
                    <img 
                      src={item.image_url || "https://via.placeholder.com/50"} 
                      alt={item.name} 
                      style={{width: 60, height: 60, objectFit: 'cover', borderRadius: 4}}
                    />
                    <div>
                       <p style={{margin: '0 0 5px 0', fontWeight: 'bold'}}>{item.name}</p>
                       <p style={{margin: 0, fontSize: '0.9em', color: '#555'}}>
                         Size: {item.size} | Qty: {item.quantity}
                       </p>
                       <p style={{margin: '5px 0 0 0', fontWeight: 500}}>
                         ${Number(item.price).toFixed(2)}
                       </p>
                    </div>
                 </div>
              ))}
            </div>

            <div style={{marginTop: 20, textAlign: 'right', fontSize: '1.2em', fontWeight: 'bold'}}>
                Total: ${Number(selectedOrder.total).toFixed(2)}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}