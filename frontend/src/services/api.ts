import axios from 'axios';
import {
  User,
  Portfolio,
  Holding,
  AnalyticsResponse,
  ScenarioResult,
  OptimizationResult,
  ScenarioType,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';


const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('portfolioiq_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth Services
export const authApi = {
  register: async (name: string, email: string, password: string) => {
    const res = await api.post<{ user: User; token: string }>('/auth/register', { name, email, password });
    return res.data;
  },
  login: async (email: string, password: string) => {
    const res = await api.post<{ user: User; token: string }>('/auth/login', { email, password });
    return res.data;
  },
  getMe: async () => {
    const res = await api.get<{ user: User }>('/auth/me');
    return res.data.user;
  },
};

// Portfolio Services
export const portfolioApi = {
  getPortfolios: async () => {
    const res = await api.get<{ portfolios: Portfolio[] }>('/portfolios');
    return res.data.portfolios;
  },
  createPortfolio: async (name: string, description?: string, holdings?: Array<{ ticker: string; weight: number }>) => {
    const res = await api.post<{ portfolio: Portfolio }>('/portfolios', { name, description, holdings });
    return res.data.portfolio;
  },
  getPortfolio: async (id: number) => {
    const res = await api.get<{ portfolio: Portfolio }>(`/portfolios/${id}`);
    return res.data.portfolio;
  },
  updatePortfolio: async (id: number, name: string, description?: string) => {
    const res = await api.put<{ portfolio: Portfolio }>(`/portfolios/${id}`, { name, description });
    return res.data.portfolio;
  },
  deletePortfolio: async (id: number) => {
    const res = await api.delete(`/portfolios/${id}`);
    return res.data;
  },
  addHolding: async (portfolioId: number, ticker: string, weight: number) => {
    const res = await api.post<{ holding: Holding }>(`/portfolios/${portfolioId}/holdings`, { ticker, weight });
    return res.data.holding;
  },
  updateHolding: async (portfolioId: number, holdingId: number, weight: number) => {
    const res = await api.put<{ holding: Holding }>(`/portfolios/${portfolioId}/holdings/${holdingId}`, { weight });
    return res.data.holding;
  },
  deleteHolding: async (portfolioId: number, holdingId: number) => {
    const res = await api.delete(`/portfolios/${portfolioId}/holdings/${holdingId}`);
    return res.data;
  },
};

// Analytics Services
export const analyticsApi = {
  analyzePortfolio: async (portfolioId: number) => {
    const res = await api.post<AnalyticsResponse>(`/portfolios/${portfolioId}/analyze`);
    return res.data;
  },
  runScenario: async (
    portfolioId: number,
    scenario?: string,
    portfolioValue: number = 1000000,
    customShocks?: Record<string, number>
  ) => {
    const res = await api.post<ScenarioResult>(`/portfolios/${portfolioId}/scenario`, {
      scenario,
      portfolio_value: portfolioValue,
      custom_shocks: customShocks,
    });
    return res.data;
  },
  optimizePortfolio: async (portfolioId: number, tickers?: string[]) => {
    const res = await api.post<OptimizationResult>(`/portfolios/${portfolioId}/optimize`, { tickers });
    return res.data;
  },
  getScenarioTypes: async () => {
    const res = await api.get<{ scenarios: ScenarioType[] }>('/scenarios/types');
    return res.data.scenarios;
  },
};

