import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AppWindow,
  BarChart3,
  FolderKanban,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  Plus,
  QrCode,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/primitives';
import { GlobalErrorBanner } from './GlobalErrorBanner';

interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { to: '/create', label: 'Create Smart Link', shortLabel: 'Create', icon: Plus },
  { to: '/links', label: 'All Links', shortLabel: 'Links', icon: Link2 },
  { to: '/campaigns', label: 'Campaigns', shortLabel: 'Campaigns', icon: FolderKanban },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3 },
  { to: '/qr-codes', label: 'QR Codes', shortLabel: 'QR', icon: QrCode },
  { to: '/applications', label: 'Applications', shortLabel: 'Apps', icon: AppWindow },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
  { to: '/users', label: 'Users', shortLabel: 'Users', icon: Users, superAdminOnly: true },
];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/create': 'Create Smart Link',
  '/links': 'All Links',
  '/campaigns': 'Campaigns',
  '/analytics': 'Analytics',
  '/qr-codes': 'QR Codes',
  '/applications': 'Applications',
  '/settings': 'Settings',
  '/users': 'Users',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'User',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock background scroll & support Escape while mobile drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || profile?.role === 'super_admin'
  );

  const baseRoute = `/${location.pathname.split('/')[1] || 'dashboard'}`;
  const currentTitle = ROUTE_TITLES[baseRoute] || 'SmartLink';

  const fullSidebarContent = (
    <div className="flex h-full flex-col bg-white dark:bg-[#0E1422] border-r border-slate-200 dark:border-slate-800/90">
      <div className="flex h-14 sm:h-16 items-center justify-between px-4 sm:px-5 border-b border-slate-200 dark:border-slate-800/90 shrink-0">
        <Link
          to="/dashboard"
          onClick={() => setMobileOpen(false)}
          className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold">
            SL
          </span>
          <span>SmartLink</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 min-h-[44px] lg:min-h-[40px] py-2.5 lg:py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-slate-100'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800/90 p-4 shrink-0">
        <div className="flex items-center gap-3">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.fullName}
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
              {(profile?.fullName || 'U').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {profile?.fullName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {ROLE_LABELS[profile?.role || 'user']} &middot; {profile?.email}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 flex w-full min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  // Tablet compact rail (md: 768px - 1023px)
  const tabletRailContent = (
    <div className="flex h-full flex-col items-center bg-white dark:bg-[#0E1422] border-r border-slate-200 dark:border-slate-800/90">
      <div className="flex h-16 w-full items-center justify-center border-b border-slate-200 dark:border-slate-800/90 shrink-0">
        <Link
          to="/dashboard"
          title="SmartLink Dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-display text-xs font-bold"
        >
          SL
        </Link>
      </div>

      <nav className="flex-1 w-full overflow-y-auto no-scrollbar px-2 py-3 space-y-1.5 flex flex-col items-center">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center w-14 py-2 rounded-lg text-[10px] font-medium transition-colors duration-150 gap-1',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-slate-100'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-[52px]">{item.shortLabel}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800/90 py-3 px-2 flex flex-col items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          title="Sign out"
          aria-label="Sign out"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#FAFAFB] dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      {/* Tablet Slim Icon Rail (768px - 1023px) */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:block lg:hidden md:w-[76px]">
        {tabletRailContent}
      </aside>

      {/* Desktop Full Sidebar (1024px+) */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {fullSidebarContent}
      </aside>

      {/* Mobile & Tablet Expanded Slide-Over Drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden transition-opacity duration-200',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            'fixed inset-y-0 left-0 w-72 max-w-[84vw] shadow-xl transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {fullSidebarContent}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-[76px] lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 sm:h-16 items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/90 bg-white/95 dark:bg-[#0E1422]/95 backdrop-blur-sm px-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                SmartLink
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-slate-950 dark:text-white truncate">
                {currentTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Button size="sm" onClick={() => navigate('/create')}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Link</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1360px] mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8">
          <GlobalErrorBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
