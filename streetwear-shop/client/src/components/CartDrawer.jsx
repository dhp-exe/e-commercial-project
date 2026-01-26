import React, {useContext, useState} from "react";
import {useNavigate} from "react-router-dom";
import api from "../api";
import { CartContext } from "../context/CartContext";
import "./CartDrawer.css";

export default function CartDrawer({ isOpen, onClose }) {
  const { items, total, update, refresh } = useContext(CartContext);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  async function handleCheckout() {
    if (items.length === 0) {
      alert("Your cart is empty!");
      return;
    }
    onClose(); 
    navigate("/checkout");
  }

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
        <button 
          className="checkout-btn" 
          onClick={handleCheckout}
          disabled={isLoading || items.length === 0}
          style={{ opacity: (isLoading || items.length === 0) ? 0.5 : 1 }}
        >
          {isLoading ? "Processing..." : "Checkout"}
        </button>
      </div>
    </div>
  );
}
