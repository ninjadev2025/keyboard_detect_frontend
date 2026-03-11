import axios from 'axios';

const TOKEN_KEY = 'adminToken';
const USERNAME_KEY = 'adminUsername';

/**
 * Get the stored authentication token
 */
export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Get the stored username
 */
export const getUsername = () => {
  return localStorage.getItem(USERNAME_KEY);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  const token = getToken();
  return !!token;
};

/**
 * Set authentication token and configure axios
 */
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete axios.defaults.headers.common['Authorization'];
  }
};

/**
 * Set username
 */
export const setUsername = (username) => {
  if (username) {
    localStorage.setItem(USERNAME_KEY, username);
  } else {
    localStorage.removeItem(USERNAME_KEY);
  }
};

/**
 * Clear authentication (logout)
 */
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  delete axios.defaults.headers.common['Authorization'];
};

/**
 * Initialize axios with token if available
 */
export const initAuth = () => {
  const token = getToken();
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
};
