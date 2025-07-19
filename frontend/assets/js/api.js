// frontend/assets/js/api.js

const BASE_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:3000'
  : window.location.origin;

export async function fetchWithToken(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  return fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
}

export async function fetchWithoutToken(endpoint, options = {}) {
  const headers = {
    ...(options.headers || {}),
    'Content-Type': 'application/json',
  };

  return fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
}
