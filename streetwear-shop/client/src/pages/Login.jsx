import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const Login = () => {
    const [isRegister, setIsRegister] = useState(false); // toggle login/register
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            // Register flow
            if(isRegister) {
                await api.post('/register', { username, email, password });
                setIsRegister(false); // switch to login after successful registration
            }
            // Login flow
            else{
                const response = await api.post('/login', { email, password });
                login(response.data.token);
                navigate('/home');
            }
        } catch (err) {
            setError('something went wrong');
        }
    };

    return (
        <div className = "login-page"> 
            <div className="login-container">
                <h2>{isRegister ? 'Register' : 'Login'}</h2>
                {error && <p className="error">{error}</p>}

                <form onSubmit={handleSubmit}>
                    {isRegister && (
                        <div className = 'fade-in'>
                            <label>Username:</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    )}


                    <div>
                        <label>Email:</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label>Password:</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit">{isRegister ? 'Register' : 'Login' }</button>
                </form>
                <p>
                    {isRegister ? (
                        <>
                        Already have an account?{' '}
                        <span className ="toggle-link"
                            onClick={() => setIsRegister(false)}
                            style={{ cursor: 'pointer', color: '#000', fontWeight: 'bold' }}
                        >
                            Login
                        </span>
                        </>
                    ) : (
                        <>
                        Don't have an account?{' '}
                        <span className ="toggle-link"
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