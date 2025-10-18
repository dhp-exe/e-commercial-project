# Streetwear Shop

## Overview
The Streetwear Shop is a full-stack e-commerce application built using React for the frontend, Node.js for the backend, and MySQL for the database. This project allows users to browse products, manage their shopping cart, and authenticate their accounts. This application also provides a payment/transaction method.

## Project Structure
```
streetwear-shop
├── package.json
├── .gitignore
├── README.md
├── server
│   ├── package.json
│   ├── .env
│   └── src
│       ├── index.js
│       ├── db.js
│       ├── middleware
│       │   └── auth.js
│       └── routes
│           ├── auth.js
│           ├── products.js
│           └── cart.js
└── client
    ├── package.json
    ├── index.html
    └── src
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        ├── context
        │   ├── AuthContext.jsx
        │   └── CartContext.jsx
        ├── components
        │   └── Navbar.jsx
        ├── pages
        │   ├── Home.jsx
        │   ├── Products.jsx
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   └── Cart.jsx
        └── styles.css
```

## Features
- **User Authentication**: Users can register and log in to their accounts.
- **Product Browsing**: Users can view a list of products with filtering options.
- **Shopping Cart**: Users can add products to their cart and manage quantities.
- **Responsive Design**: The application is designed to be mobile-friendly.

## Getting Started

### Prerequisites
- Node.js
- MySQL

### Installation
1. Clone the repository:
   ```
   git clone https://github.com/dhp-exe/e-commercial-project.git
   cd streetwear-shop
   ```

2. Install server dependencies:
   ```
   cd server
   npm install
   ```

3. Set up the environment variables in the `.env` file:
   ```
   DB_HOST=your_database_host
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   DB_NAME=your_database_name
   JWT_SECRET=your_jwt_secret
   ```

4. Install client dependencies:
   ```
   cd ../client
   npm install
   ```

### Running the Application
1. Start the backend server:
   ```
   cd server
   npm start
   ```

2. Start the frontend application:
   ```
   cd ../client
   npm run dev
   ```

### License
This project is licensed under the MIT License.
