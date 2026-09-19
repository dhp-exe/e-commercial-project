import Providers from '@/shared/providers/Providers';
import Navbar from '@/shared/components/Navbar';
import Footer from '@/shared/components/Footer';
import ChatBot from '@/features/ai/components/ChatBot';

/* ── Global CSS (order matters) ── */
import '@/shared/styles/main.css';
import '@/shared/styles/layout.css';
import '@/shared/styles/components.css';
import '@/shared/styles/globals.css';

export const metadata = {
  title: { default: 'DHP | Streetwear', template: '%s | DHP Streetwear' },
  description:
    'DHP Streetwear — Premium Vietnamese street fashion. Shop vintage tees, baggy jeans, bombers & more.',
  openGraph: {
    title: 'DHP Streetwear — Premium Street Fashion',
    description:
      'Premium Vietnamese street fashion. Shop vintage tees, baggy jeans, bombers & more.',
    type: 'website',
    url: 'https://e-commercial-project-mauve.vercel.app',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/icon2.png" />
        <link
          rel="preload"
          href="/loading-screen.webm"
          as="video"
          type="video/webm"
        />
        {/* Google Identity Services — required for GoogleLoginButton */}
        <script
          src="https://accounts.google.com/gsi/client?hl=en"
          async
          defer
        />
      </head>
      <body>
        <Providers>
          <Navbar />
          <ChatBot />
          <main className="container">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
