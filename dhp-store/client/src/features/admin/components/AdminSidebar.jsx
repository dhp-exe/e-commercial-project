import Link from 'next/link';

export default function AdminSidebar() {
  return (
    <aside style={{width: 250, background: '#222', color: '#fff', padding: 20}}>
      <Link href="/admin" style={{textDecoration: 'none'}}>
        <h2 style={{color: 'white', cursor: 'pointer'}}>Manager</h2>
      </Link>
      <nav style={{display: 'flex', flexDirection: 'column', gap: 15, marginTop: 30}}>
        <Link href="/admin/orders" style={{color: 'white'}}>📦 Orders</Link>
        <Link href="/admin/products" style={{color: 'white'}}>🏷️ Products</Link>
        <a
          href={(process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '') : 'http://localhost:5001') + '/admin/queues'}
          target="_blank"
          rel="noopener noreferrer"
          style={{color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6}}
        >
          ⚡ Queues (Bull Board) ↗
        </a>
        <Link href="/" style={{color: '#888'}}>← Back to Store</Link>
      </nav>
    </aside>
  );
}