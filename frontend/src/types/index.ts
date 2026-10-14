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

export interface DomainImpact {
  domain: string;
  weight: number;
  holdings_count: number;
  shock: number;
  initial_value: number;
  change: number;
  final_value: number;
  /** Percentage-point effect on total portfolio return */
  impact: number;
}

export interface ScenarioResult {
  initial_value: number;
  final_value: number;
  absolute_change: number;
  percentage_change: number;
  domains: DomainImpact[];
  insights: string[];
  scenario?: {
    id: string;
    name: string;
    description: string;
    category?: string;
  };
}

export interface PortfolioDomain {
  domain: string;
  /** Fraction of the portfolio (0-1) */
  weight: number;
  holdings_count: number;
}

export interface LLMResult {
  available: boolean;
  analysis: string | null;
  model?: string | null;
  error?: string | null;
}

export interface OptimizationAsset {
  ticker: string;
  optimal_weight: number;
  current_weight?: number;
  change?: number;
  action?: 'Hold' | 'Exit' | 'Add' | 'Increase' | 'Reduce';
  role: string;
  annual_return: number;
  volatility: number;
  sharpe_ratio: number;
  avg_correlation: number;
  reasons: string[];
}

export interface PortfolioStats {
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
}

export interface OptimizationResult {
  weights: Record<string, number>;
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  method?: 'max_sharpe' | 'min_volatility';
  current?: PortfolioStats | null;
  explanation?: {
    summary: string;
    assets: OptimizationAsset[];
    notes: string[];
  };
  ai?: LLMResult;
}

export interface ScenarioType {
  id: string;
  name: string;
  description: string;
  category?: string;
  /** Assumed shock per domain, in percent */
  domain_shocks?: Record<string, number>;
}

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  region: 'US' | 'India' | 'Global';
  type?: string;
  recommended?: boolean;
}

export interface AddHoldingResult {
  holding: Holding;
  resolved?: {
    symbol: string;
    name: string;
    exchange: string | null;
    region: string | null;
    changed: boolean;
    unverified: boolean;
  };
}
