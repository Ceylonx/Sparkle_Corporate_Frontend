import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const AxiosInterceptor = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Request interceptor → attach token if available
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem("token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor → handle errors (like 401)
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("userId");
          localStorage.removeItem("token");
          // window.location.href = `${import.meta.env.VITE_APP_BASE_URL || window.location.origin}/login`; 
        }
        return Promise.reject(error);
      }
    );

    // Cleanup when component unmounts
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [navigate]);

  return null;
};

export default AxiosInterceptor;
