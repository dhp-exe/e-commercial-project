# DHP Store
*Website link: https://dhp-store.onrender.com*
## Overview
DHP Store is a full-stack e-commerce application implementing a modern React (Vite) frontend and a Node.js + Express backend with MySQL. The project includes user authentication, a shopping flow, admin management tools, file uploads, role-based access control, and server-side protections such as rate limiting. Orders and inventory updates use transactional operations to maintain data integrity.

## Project Structure
```text
dhp-store/
├── docker-compose.yml
├── package.json
├── client/                       # Frontend (React + Vite)
│   ├── Dockerfile
│   ├── index.html
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   └── src
│       ├── api.js
│       ├── main.jsx
│       ├── App.jsx
│       ├── styles.css
│       ├── assets/
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── CartDrawer.jsx
│       │   └── ProtectedRoute.jsx
│       ├── context/
│       │   ├── AuthContext.jsx
│       │   └── CartContext.jsx
│       └── pages/
│           ├── Home.jsx
│           ├── Products.jsx
│           ├── ProductDetails.jsx
│           ├── Cart.jsx
│           ├── Checkout.jsx
│           ├── Login.jsx
│           ├── Account.jsx
│           ├── ResetPassword.jsx
│           ├── Contact.jsx
│           └── admin/
│               ├── AdminLayout.jsx
│               ├── AdminDashboard.jsx
│               ├── ManageProducts.jsx
│               └── ManageOrders.jsx
├── server/                       # Backend (Node.js + Express)
│   ├── Dockerfile
│   ├── package.json
│   └── src
│       ├── index.js              # Express app entry
│       ├── db.js                 # MySQL connection + transaction helpers
│       ├── middleware/
│       │   ├── requireAuth.js
│       │   ├── requireRole.js
│       │   ├── rateLimit.js
│       │   └── upload.js
│       ├── routes/
│       │   ├── auth.js
│       │   ├── products.js
│       │   ├── cart.js
│       │   ├── orders.js
│       │   └── feedback.js
│       └── uploads/              # Uploaded images/files
└── README.md
```

## Key Features
### Customer experience

- **User Authentication:** Secure Login & Registration with JWT based sessions and Bcrypt hashing and password-reset flows.

- **Profile Management:** Users can update personal info, upload profile pictures, and change passwords.

- **Product Browsing:** Browse products with search functionality and category filtering.

- **Shopping Cart:** Real-time cart management (add, remove, update quantities) and sent to server to update database.

- **Checkout System:**
   - Delivery information validation.

   - Multiple Payment Gateways: Stripe (Credit Card), VNPay (QR/ATM), PayPal, and COD.

- **Order History:** Users can track the status of their orders (New, Confirmed, Shipping, etc.) via their account dashboard.
- **Feedback System**: Customers can leave feedback; backend stores and exposes feedback entries.
### Admin & Staff Dashboard
- **Role-Based Access (RBAC)**: `requireRole` middleware for admin-only routes and protected admin UI.
- **Product and Order management**: 
   - View all orders with customer details and item breakdowns, update order statuses.
   - Product listing, filtering, product details with images (uploads supported).
### Security
- **Rate limiting:** IP rate limiting middleware to protect endpoints
- **Secure cookies:** HttpOnly cookies for session management.
- **Protected Routes**: Frontend protected routes for authenticated areas (`ProtectedRoute` component).
### Technical
- **Unified Deployment:** The backend is configured to serve the React frontend static build, allowing for single-port deployment (ideal for Ngrok tunneling).

- **Database:** Optimized MySQL queries with connection pooling.
- **Docker Support**: `docker-compose.yml` + `Dockerfile` for client and server to run in containers.

### 🛠️ Tech Stack
Frontend: React.js, Vite, CSS3

Backend: Node.js, Express.js

Database: MySQL

Payments: Stripe API, PayPal SDK, VNPay integration

Tools: Multer (File Uploads), Nodemailer (Emails), Ngrok (Tunneling)

## Getting Started

### Prerequisites
- Node.js (v16+)
- MYSQL server
- Docker (optional, for containerized setup)

### Installation (local)
1. Clone the repository and enter the project folder:

```bash
git clone https://github.com/dhp-exe/e-commercial-project.git
cd dhp-store
```

2. Install server dependencies:

```bash
cd server
npm install
```

3. Create a `.env` file in `server/` with these variables:

```env
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
JWT_SECRET=your_jwt_secret
PORT=...
```

4. Install client dependencies:

```bash
cd ../client
npm install
```
5. Create `.env` file in `client/`
```bash
VITE_STRIPE_PUBLIC_KEY=your_stripe_public_key
```
### Running the Application (local)

Start the backend:

```bash
cd server
npm start
```

Start the frontend (dev server):

```bash
cd ../client
npm run dev
```

### Running with Docker

From the `dhp-store` root (requires Docker & Docker Compose):

```bash
docker-compose up --build
```

## Notes
- Database migrations and seed scripts can be added to `server/src` to initialize sample data.
- Add automated tests for critical routes and payment/checkout flows.

### License
This project is licensed under the MIT License.
