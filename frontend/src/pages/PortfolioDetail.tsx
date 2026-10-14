import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { portfolioApi } from '../services/api';
import { Portfolio, Holding } from '../types';
import { TickerSearch } from '../components/TickerSearch';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit2,
  BarChart3,
  Sliders,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PieChart,
} from 'lucide-react';

export const PortfolioDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parseInt(id || '0', 10);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  // Form states
  const [ticker, setTicker] = useState('');
  const [weightPercent, setWeightPercent] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const navigate = useNavigate();

  const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=&^]{0,19}$/;

  useEffect(() => {
    fetchPortfolio();
  }, [portfolioId]);

  const fetchPortfolio = async () => {
    setLoading(true);
    try {
      const data = await portfolioApi.getPortfolio(portfolioId);
      setPortfolio(data);
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalWeight = () => {
    if (!portfolio?.holdings) return 0;
    return portfolio.holdings.reduce((sum, h) => sum + Number(h.weight), 0) * 100;
  };

  // Share of the portfolio still unallocated (in %), never below zero
  const remainingPercent = () => Math.max(0, 100 - calculateTotalWeight());

  const closeAddModal = () => {
    setShowAddModal(false);
    setTicker('');
    setWeightPercent('');
    setError('');
  };

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const symbol = ticker.trim().toUpperCase();
    const weightPct = parseFloat(weightPercent);

    if (!symbol) {
      setError('Search for a company and pick a result, or type a ticker symbol.');
      return;
    }
    if (!TICKER_RE.test(symbol)) {
      setError('Ticker may only contain letters, numbers and . - = & ^ (e.g. AAPL or RELIANCE.NS).');
      return;
    }
    if (!Number.isFinite(weightPct) || weightPct <= 0 || weightPct > 100) {
      setError('Allocation weight must be greater than 0% and at most 100%.');
      return;
    }
    if (weightPct > remainingPercent() + 0.05) {
      setError(
        `Only ${remainingPercent().toFixed(2)}% of the portfolio is still unallocated. Lower this weight or reduce another holding first.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { resolved } = await portfolioApi.addHolding(portfolioId, symbol, weightPct / 100);
      closeAddModal();
      if (resolved?.changed) {
        const detail = [resolved.name, resolved.exchange].filter(Boolean).join(' \u00b7 ');
        setNotice(
          `Added as ${resolved.symbol}${detail ? ` (${detail})` : ''} - the exchange was chosen automatically.`
        );
      } else if (resolved?.unverified) {
        setNotice(`${resolved.symbol} was added, but the ticker could not be verified right now.`);
      } else {
        setNotice('');
      }
      fetchPortfolio();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add holding.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHolding || !selectedHolding.id) return;
    setError('');
    const weightPct = parseFloat(weightPercent);
    const maxAllowed = remainingPercent() + Number(selectedHolding.weight) * 100;

    if (!Number.isFinite(weightPct) || weightPct <= 0 || weightPct > 100) {
      setError('Allocation weight must be greater than 0% and at most 100%.');
      return;
    }
    if (weightPct > maxAllowed + 0.05) {
      setError(`The most this holding can have is ${maxAllowed.toFixed(2)}% (total allocation cannot exceed 100%).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await portfolioApi.updateHolding(portfolioId, selectedHolding.id, weightPct / 100);
      setShowEditModal(false);
      setSelectedHolding(null);
      setWeightPercent('');
      fetchPortfolio();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update holding.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteHolding = async (holdingId: number) => {
    if (!window.confirm('Remove holding from portfolio?')) return;
    try {
      await portfolioApi.deleteHolding(portfolioId, holdingId);
      fetchPortfolio();
    } catch (err) {
      alert('Failed to delete holding.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="max-w-md mx-auto my-12 text-center">
        <p className="text-gray-600">Portfolio not found.</p>
        <Link to="/portfolios" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to Portfolios
        </Link>
      </div>
    );
  }

  const totalWeight = calculateTotalWeight();
  const isWeightValid = Math.abs(totalWeight - 100) < 0.1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/portfolios" className="inline-flex items-center space-x-1 text-sm font-medium text-gray-500 hover:text-gray-900 mb-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Portfolios</span>
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">{portfolio.name}</h1>
            <p className="text-gray-500 text-sm mt-1">{portfolio.description || 'No description provided.'}</p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(`/portfolios/${portfolioId}/dashboard`)}
              disabled={!isWeightValid || (portfolio.holdings && portfolio.holdings.length === 0)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Run Analytics</span>
            </button>
            <button
              onClick={() => navigate(`/portfolios/${portfolioId}/scenario`)}
              disabled={!isWeightValid || (portfolio.holdings && portfolio.holdings.length === 0)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sliders className="w-4 h-4" />
              <span>Scenario Simulator</span>
            </button>
            <button
              onClick={() => navigate(`/portfolios/${portfolioId}/optimize`)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            >
              <Cpu className="w-4 h-4" />
              <span>Optimizer</span>
            </button>
          </div>
        </div>
      </div>

      {/* Weight Summary Banner */}
      <div
        className={`p-4 rounded-xl border mb-6 flex items-center justify-between ${
          isWeightValid
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        <div className="flex items-center space-x-3">
          {isWeightValid ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          )}
          <div>
            <span className="font-semibold text-sm">
              Total Portfolio Allocation: {totalWeight.toFixed(1)}%
            </span>
            {!isWeightValid && (
              <p className="text-xs mt-0.5">
                Portfolio weights must sum to exactly 100% to run analytics and scenario simulations.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => { setError(''); setShowAddModal(true); }}
          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-md shadow-sm hover:bg-gray-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Holding</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 text-sm mb-6 flex items-start justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="ml-3 text-sky-600 hover:text-sky-800 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Holdings Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Portfolio Holdings</h2>
          <span className="text-xs text-gray-500 font-medium">
            {portfolio.holdings?.length || 0} Assets
          </span>
        </div>

        {portfolio.holdings && portfolio.holdings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Ticker</th>
                  <th className="px-6 py-3">Weight (%)</th>
                  <th className="px-6 py-3">Allocation Bar</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {portfolio.holdings.map((h) => {
                  const weightPct = Number(h.weight) * 100;
                  return (
                    <tr key={h.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 font-bold text-gray-900">{h.ticker}</td>
                      <td className="px-6 py-4 font-semibold text-sky-600">
                        {weightPct.toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 w-64">
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-sky-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, weightPct)}%` }}
                          ></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setError('');
                            setSelectedHolding(h);
                            setWeightPercent((Number(h.weight) * 100).toString());
                            setShowEditModal(true);
                          }}
                          className="p-1.5 text-gray-400 hover:text-sky-600 rounded-md transition-colors"
                          title="Edit Weight"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => h.id && handleDeleteHolding(h.id)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md transition-colors"
                          title="Delete Holding"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-500 text-sm">No holdings added to this portfolio yet.</p>
            <button
              onClick={() => { setError(''); setShowAddModal(true); }}
              className="mt-4 inline-flex items-center space-x-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First Holding</span>
            </button>
          </div>
        )}
      </div>

      {/* Add Holding Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Asset Holding</h2>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleAddHolding} className="space-y-4">
              <TickerSearch value={ticker} onChange={(symbol) => setTicker(symbol)} autoFocus />

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Weight Allocation (%)</label>
                  <span className="text-xs text-gray-500">
                    Unallocated: <strong>{remainingPercent().toFixed(2)}%</strong>
                  </span>
                </div>
                <div className="mt-1 flex space-x-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Math.max(0.01, remainingPercent())}
                    required
                    value={weightPercent}
                    onChange={(e) => setWeightPercent(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500"
                    placeholder="e.g. 25.0"
                  />
                  <button
                    type="button"
                    onClick={() => setWeightPercent(remainingPercent().toFixed(2))}
                    disabled={remainingPercent() <= 0}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap disabled:opacity-50"
                  >
                    Use remaining
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add Holding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Holding Modal */}
      {showEditModal && selectedHolding && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Edit Weight for {selectedHolding.ticker}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleEditHolding} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Weight Allocation (%) - up to {(remainingPercent() + Number(selectedHolding.weight) * 100).toFixed(2)}%
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remainingPercent() + Number(selectedHolding.weight) * 100}
                  required
                  value={weightPercent}
                  onChange={(e) => setWeightPercent(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedHolding(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Update Weight'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

