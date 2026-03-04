// Configuration for different environments
const config = {
  development: {
    backendUrl: '', // Use proxy in development
    frontendUrl: 'http://localhost:8080'
  },
  production: {
    backendUrl: 'https://pointing-poker-backend.onrender.com',
    frontendUrl: 'https://pointing-poker-frontend.onrender.com'
  }
};

const environment = import.meta.env.MODE || 'development';

export const API_BASE_URL = config[environment as keyof typeof config].backendUrl;
export const FRONTEND_URL = config[environment as keyof typeof config].frontendUrl;

// Helper function to get full API URL
export const getApiUrl = (path: string): string => {
  return `${API_BASE_URL}${path}`;
};

// Helper function to check if in production
export const isProduction = (): boolean => {
  return environment === 'production';
};

export default config[environment as keyof typeof config];