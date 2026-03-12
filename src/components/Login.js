import React, { useState } from 'react';
import axios from 'axios';
import { setAuthToken, setUsername as setStoredUsername } from '../utils/auth';
import './Login.css';

const Login = ({ onLoginSuccess, initialServerUrl }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Use current origin since server and frontend run on same IP
    const serverUrlValue = window.location.origin;

    try {
      // Direct request to same origin
      const loginUrl = '/api/admin/login';
      const requestData = {
        username: username.trim(),
        password: password.trim()
      };
      
      console.log('Login request to:', loginUrl);
      console.log('Login data:', { username: requestData.username, password: '***' });
      
      const response = await axios.post(loginUrl, requestData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Server returns { token } on success
      if (response.data && response.data.token) {
        // Store token and username using auth utility
        setAuthToken(response.data.token);
        setStoredUsername(username);
        
        // Call success callback with server URL
        onLoginSuccess(serverUrlValue);
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      // Server returns 401 with { message: "Invalid credentials" } for wrong credentials
      console.error('Login error:', err);
      if (err.response) {
        console.error('Response status:', err.response.status);
        console.error('Response data:', err.response.data);
        
        if (err.response.status === 401) {
          // Use server's error message if available, otherwise default
          const errorMessage = err.response.data?.message || 'Invalid username or password';
          setError(errorMessage);
        } else if (err.response.data && err.response.data.message) {
          setError(err.response.data.message);
        } else {
          setError(`Login failed: ${err.response.status} ${err.response.statusText}`);
        }
      } else if (err.code === 'ERR_NETWORK' || err.message.includes('Network Error')) {
        setError('Cannot connect to server. Please check: 1) Server is running, 2) Server allows connections, 3) Firewall/network allows the connection.');
      } else if (err.code === 'ERR_CERT' || err.message.includes('certificate')) {
        setError('SSL Certificate Error: The server\'s SSL certificate is invalid or self-signed.');
      } else {
        setError('Login failed. Please try again.');
        console.error('Unexpected error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <i className="fas fa-shield-alt fa-3x text-primary mb-3"></i>
          <h2 className="mb-2">Admin Login</h2>
          <p className="text-muted">Enter your credentials to access the keyboard detection panel</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="alert alert-danger" role="alert">
              <i className="fas fa-exclamation-circle me-2"></i>
              {error}
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="username" className="form-label">
              <i className="fas fa-user me-2"></i>Username
            </label>
            <input
              type="text"
              className="form-control form-control-lg"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="form-label">
              <i className="fas fa-lock me-2"></i>Password
            </label>
            <input
              type="password"
              className="form-control form-control-lg"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-100"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Logging in...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt me-2"></i>
                Login
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
