import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api'; 

const Login = () => {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [showRecovery, setShowRecovery] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');
    const [recoveryMessage, setRecoveryMessage] = useState('');
    const [recoveryError, setRecoveryError] = useState('');
    const [recoveryLoading, setRecoveryLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if(isRegister) {
                await register({ name: username, email, password });
                navigate('/'); 
            } else {
                await login(email, password);
                navigate('/');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Something went wrong');
        }
    };

    const handleRecoverySubmit = async (e) => {
        e.preventDefault();
        setRecoveryError('');
        setRecoveryMessage('');
        
        if (!recoveryEmail) return setRecoveryError('Please enter your email');
        
        setRecoveryLoading(true);
        try {
            // This ensures it hits http://localhost:5001/api/auth/forgot-password
            const { data } = await api.post('/auth/forgot-password', { 
                email: recoveryEmail 
            });
            
            setRecoveryMessage(data.message || 'If this email exists, recovery instructions were sent.');
            
        } catch (err) {
            console.error("Recovery Error:", err);
            setRecoveryMessage('If this email exists, recovery instructions were sent.');
        } finally {
            setRecoveryLoading(false);
        }
    };

    return (
        <div className="login-page"> 
            <div className="login-container">
                <h2>{isRegister ? 'Register' : 'Login'}</h2>
                {error && <p className="error" style={{color: 'red'}}>{error}</p>}

                <form onSubmit={handleSubmit}>
                    {isRegister && (
                        <div className="input-group">
                            <label>Username</label>
                            <input 
                                type="text" 
                                value={username} 
                                onChange={(e) => setUsername(e.target.value)} 
                                required 
                            />
                        </div>
                    )}
                    <div className="input-group">
                        <label>Email</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder='peterparker@example.com'
                            required 
                        />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input 
                            type={showPassword ? "text" : "password"} 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            placeholder='Peter Parker'
                            required 
                        />
                        <div style={{marginTop: '10px'}}>
                            <input 
                                type="checkbox"
                                checked={showPassword}
                                onChange={() => setShowPassword(!showPassword)}
                            /> <span style={{fontSize: '0.9em'}}>Show Password</span>
                        </div>
                    </div>
                    <div className="forgot-password" style={{marginTop: '10px' }}>
                        <button type="button"
                            style={{background: 'none', border: 'none', color: '#000000', cursor: 'pointer', padding: 0, fontSize: '0.9em', textDecoration: 'underline'}}
                            onClick={() => setShowRecovery(true)}>
                            Forgot Password?
                        </button>
                    </div>

                    <button type="submit" >
                        {isRegister ? 'Register' : 'Login'}
                    </button>
                </form>
                
                <p style={{marginTop: '15px'}}>
                    {isRegister ? (
                        <>
                        Already have an account?{' '}
                        <span 
                            onClick={() => setIsRegister(false)}
                            style={{ cursor: 'pointer', color: '#000', fontWeight: 'bold' }}
                        >
                            Login
                        </span>
                        </>
                    ) : (
                        <>
                        Don't have an account?{' '}
                        <span 
                            onClick={() => setIsRegister(true)}
                            style={{ cursor: 'pointer', color: '#000', fontWeight: 'bold' }}
                        >
                            Register
                        </span>
                        </>
                    )}
                </p>
            </div>
            
            {showRecovery && (
                <div 
                    className="recovery-overlay" 
                    onClick={() => setShowRecovery(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', zIndex: 9999
                    }}
                >
                    <div
                        className="recovery-panel"
                        onClick={(e) => e.stopPropagation()}
                        style={{background: '#fff', padding: '20px', borderRadius: '6px', width: '320px', boxShadow: '0 6px 18px rgba(0,0,0,0.2)'}}
                    >
                        <h3 style={{marginTop: 0}}>Password recovery</h3>
                        {recoveryMessage ? (
                            <div style={{textAlign: 'center'}}>
                                <p style={{color: 'green', marginBottom: '15px'}}>{recoveryMessage}</p>
                                <button onClick={() => setShowRecovery(false)} style={{padding: '8px 16px'}}>Close</button>
                            </div>
                        ) : (
                            <form onSubmit={handleRecoverySubmit}>
                                <div style={{marginBottom: '10px'}}>
                                    <label style={{display: 'block', fontSize: '0.9em', marginBottom: '6px'}}>Email</label>
                                    <input
                                        type="email"
                                        value={recoveryEmail}
                                        onChange={(e) => setRecoveryEmail(e.target.value)}
                                        style={{width: '100%', padding: '8px', boxSizing: 'border-box'}}
                                    />
                                    {recoveryError && <p style={{color: 'red', marginTop: '6px'}}>{recoveryError}</p>}
                                </div>
                                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                                    <button type="button" onClick={() => setShowRecovery(false)} style={{padding: '8px 12px'}}>Cancel</button>
                                    <button type="submit" style={{padding: '8px 12px'}} disabled={recoveryLoading}>
                                        {recoveryLoading ? 'Sending...' : 'Send'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;