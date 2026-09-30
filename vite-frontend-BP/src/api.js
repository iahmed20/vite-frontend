import axios from 'axios';

// withCredentials sends the HttpOnly auth cookie the backend sets on sign-in
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:5078",
  withCredentials: true,
});

export default api;
