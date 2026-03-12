import React, { useState, useCallback, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'font-awesome/css/font-awesome.min.css';
import KeyboardCapture from './components/KeyboardCapture';
import Login from './components/Login';
import { isAuthenticated, initAuth, clearAuth, getUsername } from './utils/auth';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [serverUrl, setServerUrl] = useState('');

  // Initialize authentication
  useEffect(() => {
    initAuth();
    if (isAuthenticated()) {
      setIsLoggedIn(true);
      setUsername(getUsername());
    }
  }, []);

  // Set up axios interceptor to handle 401/403 errors (unauthorized/forbidden)
  // Server sends 401 for no token, 403 for invalid/expired token
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server's verifyToken sends 401 for no token, 403 for invalid token
          if (error.response.status === 401 || error.response.status === 403) {
            // Token expired, invalid, or missing - logout user
            clearAuth();
            setIsLoggedIn(false);
            setUsername(null);
            // Disconnect socket if connected
            if (socket) {
              socket.disconnect();
              setSocket(null);
              setConnected(false);
            }
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [socket]);

  // Handle successful login
  const handleLoginSuccess = useCallback((loginServerUrl) => {
    setIsLoggedIn(true);
    setUsername(getUsername());
    // Set the server URL from login for socket connection
    if (loginServerUrl) {
      setServerUrl(loginServerUrl);
    }
  }, []);

  // Handle logout
  const handleLogout = useCallback(() => {
    clearAuth();
    setIsLoggedIn(false);
    setUsername(null);
    // Disconnect socket if connected
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    }
  }, [socket]);

  const connectToServer = useCallback((url) => {
    const serverUrlToUse = url || serverUrl;
    
    if (!serverUrlToUse || !serverUrlToUse.trim()) {
      setConnectionError('Please enter a server URL');
      return;
    }

    try {
      new URL(serverUrlToUse);
    } catch (error) {
      setConnectionError('Invalid URL format. Please include http:// or https://');
      return;
    }

    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    setConnectionError('');
    setLoading(true);
    setConnected(false);

    // Check if we're on HTTPS trying to connect to HTTP
    const isHttpsFrontend = window.location.protocol === 'https:';
    const isHttpServer = serverUrlToUse.startsWith('http://');
    
    // Configure socket connection options
    const socketOptions = {
      timeout: 10000,
      reconnectionAttempts: 3,
      // For HTTPS → HTTP connections, use polling only (more compatible with CORS)
      transports: (isHttpsFrontend && isHttpServer) ? ['polling'] : ['websocket', 'polling'],
      // Allow credentials for CORS
      withCredentials: false,
      // Force new connection
      forceNew: true
    };

    console.log('Connecting to socket:', serverUrlToUse + '/admin', socketOptions);

    const newSocket = io(serverUrlToUse + '/admin', socketOptions);

    newSocket.on('connect', () => {
      setConnected(true);
      setLoading(false);
      setConnectionError('');
    });

    newSocket.on('connect_error', (error) => {
      setLoading(false);
      setConnected(false);
      
      // Provide more specific error messages
      let errorMessage = 'Connection failed. ';
      if (isHttpsFrontend && isHttpServer) {
        errorMessage = '⚠️ HTTPS frontend cannot connect to HTTP server. ';
        errorMessage += 'Solutions: 1) Enable HTTPS on your server, 2) Use a tunnel service (Cloudflare Tunnel/ngrok), ';
        errorMessage += 'or 3) Access this app via HTTP (not recommended for production).';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please check the server URL and ensure the server is running and allows CORS.';
      }
      
      setConnectionError(errorMessage);
      console.error('Connection error:', error);
      console.error('Socket options used:', socketOptions);
      console.error('Frontend protocol:', window.location.protocol);
      console.error('Server URL:', serverUrlToUse);
    });

    newSocket.on('disconnect', (reason) => {
      setConnected(false);
      console.log('Disconnected:', reason);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      setConnectionError('An error occurred with the connection.');
    });

    setTimeout(() => {
      if (!newSocket.connected) {
        setConnectionError('Connection timeout. Check if server is running.');
        setLoading(false);
      }
    }, 10000);

    setSocket(newSocket);
  }, [socket, serverUrl]);

  const disconnectServer = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    }
  }, [socket]);

  const handleConnect = (e) => {
    e.preventDefault();
    connectToServer();
  };

  // Show login page if not authenticated
  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} initialServerUrl={serverUrl} />;
  }

  return (
    <div className="App">
      <header className="bg-white shadow-sm border-bottom py-3" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="container-fluid">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div className="d-flex align-items-center">
              <div className="bg-white rounded-circle p-3 me-3 shadow-sm">
                <i className="fas fa-keyboard text-primary fs-4"></i>
              </div>
              <div>
                <h1 className="h4 mb-0 text-white fw-bold">Keyboard Detection</h1>
                <small className="text-white opacity-75">
                  {connected ? (
                    <span>
                      <span className="status-indicator active me-2"></span>
                      Connected
                    </span>
                  ) : (
                    <span>
                      <span className="status-indicator inactive me-2"></span>
                      Disconnected
                    </span>
                  )}
                </small>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              {username && (
                <span className="text-white opacity-75 me-2">
                  <i className="fas fa-user me-1"></i>
                  {username}
                </span>
              )}
              {!connected ? (
                <form onSubmit={handleConnect} className="d-flex gap-2 flex-wrap">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Server URL (e.g., http://localhost:5000)"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    disabled={loading}
                    style={{ minWidth: '280px' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-light fw-bold"
                    disabled={loading || !serverUrl.trim()}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plug me-2"></i>
                        Connect
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <>
                  <button
                    className="btn btn-light fw-bold"
                    onClick={disconnectServer}
                  >
                    <i className="fas fa-plug me-2"></i>
                    Disconnect
                  </button>
                  <button
                    className="btn btn-light fw-bold"
                    onClick={handleLogout}
                    title="Logout"
                  >
                    <i className="fas fa-sign-out-alt me-2"></i>
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container-fluid py-4">
        {connectionError && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            <i className="fas fa-exclamation-triangle me-2"></i>
            {connectionError}
            <button
              type="button"
              className="btn-close"
              onClick={() => setConnectionError('')}
              aria-label="Close"
            ></button>
          </div>
        )}

        {connected ? (
          <KeyboardCapture
            socket={socket}
            selectedSession={null}
            connected={connected}
            onCapturingChange={() => {}}
          />
        ) : (
          <div className="row justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
            <div className="col-12 col-md-8 col-lg-6">
              <div className="card border-0 shadow-lg">
                <div className="card-body py-5 text-center">
                  <div className="mb-4">
                    <div className="bg-gradient-primary rounded-circle d-inline-flex align-items-center justify-content-center" 
                         style={{ width: '120px', height: '120px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                      <i className="fas fa-keyboard fa-4x text-white"></i>
                    </div>
                  </div>
                  <h3 className="h4 text-dark mb-3 fw-bold">Not Connected</h3>
                  <p className="text-muted mb-4 fs-5">
                    Enter a server URL above and click <strong>Connect</strong> to begin keyboard detection.
                  </p>
                  <div className="mt-4">
                    <small className="text-muted">
                      <i className="fas fa-info-circle me-2"></i>
                      Make sure your server is running and accessible
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
