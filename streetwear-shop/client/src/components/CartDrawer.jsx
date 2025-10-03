import React from "react";
import { useContext } from "react";
import { CartContext } from "../context/CartContext";
import "./CartDrawer.css"; // we'll style separately

export default function CartDrawer({ isOpen, onClose }) {
  const { items, total, update } = useContext(CartContext);

  return (
    <div className={`cart-drawer ${isOpen ? "open" : ""}`}>
      <div className="cart-header">
        <h2>🛒 Your cart</h2>
        <button onClick={onClose}>✖</button>
      </div>

      <div className="cart-body">
        {items.length === 0 ? (
          <p>Your cart is empty</p>
        ) : (
          items.map((item) => (
            <div key={item.product_id} className="cart-item">
              <img src={item.image_url} alt={item.name} />
              <div>
                <h4>{item.name}</h4>
                <p>${Number(item.price*item.qty).toFixed(2)}</p>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button onClick={() => update(item.product_id, Math.max(0, item.qty - 1))}>-</button>
                  <span style={{ fontWeight: "bold", minWidth: "20px", textAlign: "center" }}>{item.qty}</span>
                  <button onClick={() => update(item.product_id, item.qty + 1)}>+</button>
                  </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cart-footer">
        <h3>Total: ${Number(total).toFixed(2)}</h3>
        <button className="checkout-btn">Checkout</button>
      </div>
    </div>
  );
}
