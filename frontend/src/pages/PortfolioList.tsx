import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { portfolioApi } from '../services/api';
import { Portfolio } from '../types';
import { Plus, PieChart, ArrowRight, Trash2, Layers, AlertCircle } from 'lucide-react';

export const PortfolioList: React.FC = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPortfolios();
  }, []);

  const fetchPortfolios = async () => {
    setLoading(true);
    try {
      const data = await portfolioApi.getPortfolios();
      setPortfolios(data);
    } catch (err) {
      console.error('Failed to load portfolios:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const newP = await portfolioApi.createPortfolio(name, description, [
        { ticker: 'AAPL', weight: 0.5 },
        { ticker: 'MSFT', weight: 0.5 },
      ]);
      setShowModal(false);
      setName('');
      setDescription('');
      navigate(`/portfolios/${newP.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create portfolio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this portfolio?')) return;
    try {
      await portfolioApi.deletePortfolio(id);
      setPortfolios(portfolios.filter((p) => p.id !== id));
    } catch (err) {
      alert('Failed to delete portfolio.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Investment Portfolios</h1>
          <p className="text-gray-500 text-sm mt-1">Manage holdings and launch analytics simulations</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Portfolio</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
        </div>
      ) : portfolios.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-lg mx-auto my-12">
          <div className="mx-auto w-12 h-12 bg-sky-50 text-sky-600 rounded-full flex items-center justify-center mb-4">
            <PieChart className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No portfolios created yet</h3>
          <p className="text-gray-500 text-sm mt-1 mb-6">
            Get started by creating your first investment portfolio to analyze risk and performance.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Portfolio</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolios.map((portfolio) => (
            <Link
              key={portfolio.id}
              to={`/portfolios/${portfolio.id}`}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="p-2 bg-sky-50 text-sky-600 rounded-lg group-hover:bg-sky-600 group-hover:text-white transition-colors">
                    <PieChart className="w-5 h-5" />
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, portfolio.id)}
                    className="text-gray-400 hover:text-rose-600 p-1 rounded-md transition-colors"
                    title="Delete portfolio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mt-4 group-hover:text-sky-600 transition-colors">
                  {portfolio.name}
                </h3>
                <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                  {portfolio.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-gray-400" />
                  <span>{portfolio.holdings_count || 0} Holdings</span>
                </span>
                <span className="font-medium text-sky-600 flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
                  <span>View Analytics</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Portfolio Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Portfolio</h2>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Portfolio Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g. Core Growth Tech"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g. Concentrated blue-chip tech stocks for long term growth"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Portfolio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

