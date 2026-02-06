import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import "./Checkout.css";

// API KEYS
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
const PAYPAL_CLIENT_ID = "test"; 

function StripeModalContent({ onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setMsg(error.message);
      setLoading(false);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      onSuccess("Stripe Credit Card");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{marginBottom:'20px'}}>Enter Card Details</h3>
      <PaymentElement />
      <button className="black-btn" style={{marginTop:'20px'}} disabled={loading}>
        {loading ? "Processing..." : "Pay Now"}
      </button>
      {msg && <div style={{color:'red', marginTop:'10px'}}>{msg}</div>}
    </form>
  );
}

// --- MAIN CHECKOUT COMPONENT ---
export default function Checkout() {
  const { items, total, refresh } = useCart();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  // State
  const [paymentMethod, setPaymentMethod] = useState("vnpay");
  const [showModal, setShowModal] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [note, setNote] = useState("");

  // 1. Added Email to state
  const [deliveryInfo, setDeliveryInfo] = useState({
    name: "", email: "", phone: "", address: "", city: "", district: ""
  });
  
  const [errors, setErrors] = useState({});
  const [voucher, setVoucher] = useState("");
  const [discount, setDiscount] = useState(0);

  // Autofill
  useEffect(() => {
    // Attempt to get profile (works if logged in)
    api.get('/auth/profile').then(({data}) => {
      setDeliveryInfo(prev => ({
          ...prev, 
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || ""
      }));
    }).catch(() => {
        // Guest user - do nothing
    });
  }, []);

  // Load Stripe
  useEffect(() => {
    // Only fetch payment intent if we have a total > 0
    if(total > 0) {
        api.post("/orders/create-payment", {items})
        .then((res) => setClientSecret(res.data.clientSecret))
        .catch(console.error);
    }
  }, [total, items]);

  const handleInput = (e) => {
    const { name, value } = e.target;
    setDeliveryInfo({ ...deliveryInfo, [name]: value });
    if (errors[name]) setErrors({ ...errors, [name]: null });
  };

  // 2. Updated Validation
  const validateForm = () => {
    const newErrors = {};
    if (!deliveryInfo.name.trim()) newErrors.name = "Please enter your full name";
    if (!deliveryInfo.email.trim()) newErrors.email = "Please enter your email"; // Check Email
    else if (!/\S+@\S+\.\S+/.test(deliveryInfo.email)) newErrors.email = "Invalid email format";
    
    if (!deliveryInfo.phone.trim()) newErrors.phone = "Please enter your phone number";
    if (!deliveryInfo.address.trim()) newErrors.address = "Please enter your address";
    if (!deliveryInfo.city.trim()) newErrors.city = "Please enter your city";
    if (!deliveryInfo.district.trim()) newErrors.district = "Please enter your district";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCompleteOrder = () => {
    if (validateForm()) {
        if (paymentMethod === 'cod') {
            handleSuccess("Cash on Delivery");
            return;
        }
        setShowModal(true);
    }
  };

  const handleSuccess = async (methodName) => {
    try {
      await api.post("/orders", {
          items: items, 
          total: (total - discount),
          deliveryInfo: deliveryInfo,
          paymentMethod: methodName,
          note: note
      }); 

      localStorage.removeItem('local_cart');
      await refresh(); 
      
      navigate("/account"); 
      alert(`Order Successful via ${methodName}!`);
    } 
    catch (err) {
      console.error(err);
      alert("Order failed to save: " + (err.response?.data?.message || err.message));
    }
  };

  const finalTotal = total - discount;

  return (
    <div className="checkout-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>&larr; Back to Shop</button>
      </div>
      <div className="checkout-container">
        
        {/* --- LEFT: DELIVERY & SELECTION --- */}
        <div className="checkout-left">
          
          <section>
            <div className="left-header">
              <h2 className="section-title">Delivery Information</h2>
              {!isAuthenticated && (
                <button className="login-link-btn" onClick={() => navigate('/login')}>
                  {`Login / Register`}
                </button>
              )}
            </div>
            
            <div className="form-grid">
               
               <div className="input-group">
                 <input 
                   className={`checkout-input ${errors.name ? 'error' : ''}`}
                   name="name" 
                   placeholder="Full Name" 
                   value={deliveryInfo.name} 
                   onChange={handleInput} 
                 />
                 {errors.name && <span className="error-msg">{errors.name}</span>}
               </div>

               <div className="input-group">
                 <input 
                   className={`checkout-input ${errors.email ? 'error' : ''}`}
                   name="email" 
                   type="email"
                   placeholder="Email Address" 
                   value={deliveryInfo.email} 
                   onChange={handleInput} 
                 />
                 {errors.email && <span className="error-msg">{errors.email}</span>}
               </div>

               <div className="input-group">
                 <input 
                   className={`checkout-input ${errors.phone ? 'error' : ''}`}
                   name="phone" 
                   placeholder="Phone Number" 
                   value={deliveryInfo.phone} 
                   onChange={handleInput} 
                 />
                 {errors.phone && <span className="error-msg">{errors.phone}</span>}
               </div>

               <div className="input-group">
                 <input 
                   className={`checkout-input ${errors.address ? 'error' : ''}`}
                   name="address" 
                   placeholder="Address" 
                   value={deliveryInfo.address} 
                   onChange={handleInput} 
                 />
                 {errors.address && <span className="error-msg">{errors.address}</span>}
               </div>

               <div className="form-row">
                 <div className="input-group">
                   <input 
                     className={`checkout-input ${errors.city ? 'error' : ''}`}
                     name="city" 
                     placeholder="Province/City" 
                     value={deliveryInfo.city} 
                     onChange={handleInput} 
                   />
                   {errors.city && <span className="error-msg">{errors.city}</span>}
                 </div>
                 
                 <div className="input-group">
                   <input 
                     className={`checkout-input ${errors.district ? 'error' : ''}`}
                     name="district" 
                     placeholder="District" 
                     value={deliveryInfo.district} 
                     onChange={handleInput} 
                   />
                   {errors.district && <span className="error-msg">{errors.district}</span>}
                 </div>
               </div>
               
               <textarea 
                className="checkout-input" 
                placeholder="Order notes (optional)" 
                rows={3} 
                value = {note}
                onChange={(e) => setNote(e.target.value)}
                />
            </div>
          </section>

          {/* Shipping */}
          <section>
            <h2 className="section-title">Shipping method</h2>
            <div className="payment-methods">
              <div className="payment-option selected">
                 <input type="radio" checked readOnly />
                 <span>Standard delivery (Free)</span>
              </div>
            </div>
          </section>

          {/* Payment Selection */}
          <section>
            <h2 className="section-title">Payment method</h2>
            <div className="payment-methods">
                <div className={`payment-option ${paymentMethod === 'cod' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cod')}>
                    <input type="radio" checked={paymentMethod === 'cod'} readOnly />
                    <span>Cash on Delivery (COD)</span>
                </div>
                <div className={`payment-option ${paymentMethod === 'vnpay' ? 'selected' : ''}`} onClick={() => setPaymentMethod('vnpay')}>
                    <input type="radio" checked={paymentMethod === 'vnpay'} readOnly />
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Icon-VNPAY-QR.png" height="24" alt="vnpay"/>
                        <span>VNPay Gateway</span>
                    </div>
                </div>
                <div className={`payment-option ${paymentMethod === 'stripe' ? 'selected' : ''}`} onClick={() => setPaymentMethod('stripe')}>
                    <input type="radio" checked={paymentMethod === 'stripe'} readOnly />
                    <img src="https://cdn-icons-png.flaticon.com/512/6963/6963703.png" height="24" alt="stripe"/>
                    <span>Credit Card (Stripe)</span>
                </div>
                <div className={`payment-option ${paymentMethod === 'paypal' ? 'selected' : ''}`} onClick={() => setPaymentMethod('paypal')}>
                    <input type="radio" checked={paymentMethod === 'paypal'} readOnly />
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" height="24" alt="paypal"/>
                        <span>Gateway</span>
                    </div>
                </div>
            </div>
          </section>
        </div>

        {/* --- RIGHT: SUMMARY & BUTTON --- */}
        <div className="checkout-right">
           <div className="order-summary-box">
             <h2 className="summary-title">Order Overview</h2>
             
             <div className="order-items-scroll">
               {items.map(item => (
                 <div key={`${item.product_id}-${item.size}`} className="summary-item">
                   <div style={{position:'relative'}}>
                      <img src={item.image_url} className="summary-img" alt={item.name} />
                      <span style={{position:'absolute', top:-8, right:-8, background:'#666', color:'#fff', borderRadius:'50%', width:20, height:20, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center'}}>{item.qty}</span>
                   </div>
                   <div className="summary-details">
                     <div className="summary-name">{item.name}</div>
                     <div style={{fontSize:12, color:'#666'}}>Size: {item.size || "Standard"}</div>
                   </div>
                   <div className="summary-price">${(item.price * item.qty).toFixed(2)}</div>
                 </div>
               ))}
             </div>

             <div className="voucher-input-group">
                <input placeholder="Discount code" value={voucher} onChange={e => setVoucher(e.target.value)} />
                <button className="black-btn" style={{width:'auto'}} onClick={() => voucher === "WELCOME20" ? setDiscount(total*0.2) : alert("Invalid")}>Apply</button>
             </div>

             <div className="totals-row"><span>Subtotal</span><span>${total.toFixed(2)}</span></div>
             <div className="totals-row"><span>Shipping</span><span>$0.00</span></div>
             <div className="totals-row"><span>Discount</span><span>-${discount.toFixed(2)}</span></div>
             <div className="totals-row final"><span>Total</span><span>${finalTotal.toFixed(2)}</span></div>

             <button className="black-btn" style={{marginTop:'20px'}} onClick={handleCompleteOrder}>
                Complete Order
             </button>
           </div>
        </div>
      </div>

      {/* --- PAYMENT MODAL --- */}
      {showModal && (
        <div className="payment-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="payment-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
               {paymentMethod === 'vnpay' && <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Logo-VNPAY-QR-1.png" alt="VNPay Header" />}
               {paymentMethod === 'stripe' && <span>Secure Card Payment</span>}
               {paymentMethod === 'paypal' && <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" height="24" alt="PayPal" />}
               <button onClick={() => setShowModal(false)} style={{background:'none', border:'none', fontSize:24, cursor:'pointer'}}>&times;</button>
            </div>
            <div className="modal-body">
               {paymentMethod === 'vnpay' && (
                 <div className="vnpay-gateway">
                    <h3 style={{textAlign:'center', marginBottom:20}}>Select Payment Method</h3>
                    <div className="vnpay-option" onClick={() => handleSuccess("VNPay App")}>
                        <div className="vnpay-text">Banking Apps (VNPay QR)</div>
                        <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Icon-VNPAY-QR.png" className="vnpay-icon" alt="qr"/>
                    </div>
                    <div className="vnpay-option" onClick={() => handleSuccess("ATM Card")}>
                        <div className="vnpay-text">Domestic ATM Card</div>
                        <span>🏦</span>
                    </div>
                    <div className="vnpay-option" onClick={() => handleSuccess("Intl Card")}>
                        <div className="vnpay-text">International Card (Visa/Master)</div>
                        <div style={{display:'flex', gap:5}}>
                           <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" height="15" alt="visa"/>
                           <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" height="15" alt="master"/>
                        </div>
                    </div>
                 </div>
               )}
               {paymentMethod === 'stripe' && clientSecret && (
                  <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={stripePromise}>
                     <StripeModalContent onSuccess={handleSuccess} />
                  </Elements>
               )}
               {paymentMethod === 'paypal' && (
                  <PayPalScriptProvider options={{ "client-id": PAYPAL_CLIENT_ID }}>
                      <PayPalButtons 
                         style={{ layout: "vertical" }}
                         createOrder={(data, actions) => {
                            return actions.order.create({ purchase_units: [{ amount: { value: finalTotal } }] });
                         }}
                         onApprove={async (data, actions) => {
                            await actions.order.capture();
                            handleSuccess("PayPal");
                         }}
                      />
                  </PayPalScriptProvider>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}