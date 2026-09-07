import { Outlet, Link } from 'react-router-dom';

export default function AdminLayout() {
  return (
    <div className="admin-container" style={{display: 'flex', minHeight: '100vh'}}>
      {/* Sidebar */}
      <aside style={{width: 250, background: '#222', color: '#fff', padding: 20}}>
        <Link to="/admin" style={{textDecoration: 'none'}}>
          <h2 style={{color: 'white', cursor: 'pointer'}}>Manager</h2>
        </Link>
        <nav style={{display: 'flex', flexDirection: 'column', gap: 15, marginTop: 30}}>
          <Link to="/admin/orders" style={{color: 'white'}}>📦 Orders</Link>
          <Link to="/admin/products" style={{color: 'white'}}>🏷️ Products</Link>
          <a
            href={(import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : 'http://localhost:5001') + '/admin/queues'}
            target="_blank"
            rel="noopener noreferrer"
            style={{color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6}}
          >
            ⚡ Queues (Bull Board) ↗
          </a>
          <Link to="/" style={{color: '#888'}}>← Back to Store</Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main style={{flex: 1, padding: 40, background: '#f4f4f4'}}>
        <Outlet /> 
      </main>
    </div>
  );
}