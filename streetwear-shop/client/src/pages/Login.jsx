import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Login = () => {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const { login, register } = useContext(AuthContext);
    const navigate = useNavigate();

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
                            required 
                        />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input 
                            type={showPassword ? "text" : "password"} 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
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

                    <button type="submit" style={{marginTop: '20px'}}>
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
        </div>
    );
};

export default Login;