import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, PieChart, Sliders, Cpu, LogOut, User as UserIcon } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/portfolios" className="flex items-center space-x-3 group">
              <div className="p-2 bg-sky-600 rounded-lg text-white group-hover:bg-sky-500 transition-colors">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white">
                Portfolio<span className="text-sky-400">IQ</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center space-x-2">
              <Link
                to="/portfolios"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                  isActive('/portfolios')
                    ? 'bg-slate-800 text-sky-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <PieChart className="w-4 h-4" />
                <span>Portfolios</span>
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-slate-300 text-sm">
              <UserIcon className="w-4 h-4 text-sky-400" />
              <span className="font-medium">{user.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium text-slate-300 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

