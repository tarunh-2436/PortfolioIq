export interface User {
  id: number;
  name: string;
  email: string;
  created_at?: string;
}

export interface Holding {
  id?: number;
  portfolio_id?: number;
  ticker: string;
  weight: number;
  created_at?: string;
  updated_at?: string;
}

export interface Portfolio {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  holdings_count?: number;
  holdings?: Holding[];
  created_at?: string;
  updated_at?: string;
}

export interface Metrics {
  annual_return: number;
  volatility: number;
  sharpe_ratio: number;
  beta: number;
  max_drawdown: number;
}

export interface TopHolding {
  ticker: string;
  weight: number;
}

export interface Diversification {
  score: number;
  top_holdings: TopHolding[];
  sector_allocation: Record<string, number>;
}

export interface Health {
  score: number;
}

export interface PerformancePoint {
  date: string;
  value: number;
}

export interface HoldingAnalysis {
  ticker: string;
  weight: number;
  current_price: number | null;
  period_return: number;
  contribution: number;
}

export interface Recommendation {
  type: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  message: string;
}

export interface AIAnalysis {
  available: boolean;
  analysis: string | null;
  model?: string | null;
  error?: string | null;
}

export interface AnalyticsResponse {
  portfolio: Array<{ ticker: string; weight: number }>;
  metrics: Metrics;
  diversification: Diversification;
  health: Health;
  performance: PerformancePoint[];
  holdings: HoldingAnalysis[];
  correlation: Record<string, Record<string, number>>;
  recommendations: Recommendation[];
  ai?: AIAnalysis;
}

export interface ScenarioAssetImpact {
  ticker: string;
  weight: number;
  shock: number;
  initial_value: number;
  change: number;
  final_value: number;
}

export interface ScenarioResult {
  initial_value: number;
  final_value: number;
  absolute_change: number;
  percentage_change: number;
  assets: ScenarioAssetImpact[];
  scenario?: {
    id: string;
    name: string;
    description: string;
  };
}

export interface OptimizationResult {
  weights: Record<string, number>;
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
}

export interface ScenarioType {
  id: string;
  name: string;
  description: string;
}

