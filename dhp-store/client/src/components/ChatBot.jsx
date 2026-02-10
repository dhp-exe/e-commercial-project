import React, { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import './ChatBot.css'; 

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hi! Im Naviah! Your AI stylist. How can I help you?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/chat', { message: userMsg.text });
      setMessages(prev => [...prev, { sender: 'bot', text: res.data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', text: "Sorry, I'm offline." }]);
    }
    setLoading(false);
  };

  return (
    <div className="chatbot-wrapper">
      {/* Toggle Button */}
      {!isOpen && (
        <button className="chat-toggle-btn" onClick={() => setIsOpen(true)}>
          💬
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="chat-window fade-in">
          <div className="chat-header">
            <span>Naviah - AI Assistant</span>
            <button onClick={() => setIsOpen(false)}>✕</button>
          </div>
          
          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
            {loading && <div className="message bot">Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-area" onSubmit={sendMessage}>
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about hoodies..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}