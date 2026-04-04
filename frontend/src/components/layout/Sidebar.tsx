import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderGit2,
  Building2,
  Users,
  Activity,
  Cpu,
  ChevronLeft,
  ChevronRight,
  X,
  Info,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PrefetchNavLink } from '../common/PrefetchLink';
import { DEFAULT_PERIOD_DAYS } from '../dashboard/types';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SignOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-[fade-in_150ms_ease-out]"
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-labelledby="sign-out-title" className="relative bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.04)] w-[360px] max-w-[calc(100vw-2rem)] p-6 animate-[dialog-in_200ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <LogOut className="w-5 h-5 text-red-500" strokeWidth={1.7} />
          </div>
          <div>
            <h3 id="sign-out-title" className="text-[15px] font-semibold text-gray-900">Sign out</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">End your current session</p>
          </div>
        </div>
        <p className="text-[13px] text-gray-500 mb-5 leading-relaxed">
          You'll be redirected to the login page and will need to authenticate again to access Upstream Pulse.
        </p>
        <div className="flex gap-2.5 justify-end">
          <button
            ref={cancelRef}
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              fetch('/oauth/sign_out', { redirect: 'manual' })
                .finally(() => { window.location.replace('/'); });
            }}
            className="px-4 py-2 text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, end: true },
  { label: 'Organizations', path: '/organizations', icon: Building2 },
  { label: 'Projects', path: '/projects', icon: FolderGit2 },
  { label: 'Contributors', path: '/contributors', icon: Users },
  { label: 'System', path: '/system', icon: Cpu, end: true },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    onMobileClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isProjectDetail = location.pathname.startsWith('/projects/') ||
    /^\/organizations\/[^/]+\/projects\//.test(location.pathname);
  const isOrgPage = location.pathname.startsWith('/organizations/') && !isProjectDetail;

  const prefetchMap: Record<string, { queryKey: string[]; url: string } | undefined> = useMemo(() => ({
    '/': { queryKey: ['dashboard', String(DEFAULT_PERIOD_DAYS)], url: `/api/metrics/dashboard?days=${DEFAULT_PERIOD_DAYS}` },
    '/organizations': { queryKey: ['orgs', String(DEFAULT_PERIOD_DAYS)], url: `/api/orgs?days=${DEFAULT_PERIOD_DAYS}` },
    '/projects': { queryKey: ['projects'], url: '/api/projects' },
    '/contributors': { queryKey: ['team-members'], url: '/api/team-members' },
  }), []);

  return (
    <>
      <SignOutDialog open={signOutOpen} onClose={() => setSignOutOpen(false)} />

      {/* Mobile backdrop */}
      <div
        className={`
          fixed inset-0 z-40 lg:hidden transition-all duration-300
          ${mobileOpen ? 'bg-black/20 backdrop-blur-sm pointer-events-auto' : 'bg-transparent pointer-events-none'}
        `}
        onClick={onMobileClose}
      />

      {/* Sidebar outer wrapper — controls width + floating inset */}
      <div
        className={`
          sidebar-wrapper
          fixed top-0 left-0 h-dvh z-50 p-2.5
          transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
          ${collapsed ? 'w-[72px]' : 'w-[260px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Collapse toggle — on card edge when expanded, outside card when collapsed */}
        <button
          onClick={onToggle}
          className={`hidden lg:flex absolute top-[26px] z-10 w-7 h-7 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-700 shadow-[0_1px_4px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${collapsed ? '-right-5' : '-right-1'}`}
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft className="w-4 h-4" />
          }
        </button>

        <aside
          className="
            h-full w-full
            bg-white/80 backdrop-blur-xl rounded-2xl
            shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]
            border border-gray-200/60
            flex flex-col overflow-hidden
          "
        >
          {/* Header: Logo */}
          <div className="relative flex-shrink-0 pt-3.5 pb-2">
            <div className={`flex items-center ${collapsed ? 'justify-center' : 'px-3.5'}`}>
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center">
                  <Activity className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-emerald-500 sidebar-pulse" />
              </div>
              <p
                className={`
                  text-[14px] font-semibold text-gray-900 leading-tight whitespace-nowrap overflow-hidden
                  transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                  ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-2.5'}
                `}
              >
                Upstream Pulse
              </p>
            </div>

            {/* Mobile close */}
            <button
              onClick={onMobileClose}
              className="lg:hidden absolute top-3 right-2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 overflow-y-auto overflow-x-hidden sidebar-scrollbar pt-1 pb-2 ${collapsed ? 'px-1.5' : 'px-2.5'}`}>
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                const active = isActive
                  ? !(item.path === '/organizations' && isProjectDetail)
                  : (item.path === '/projects' && isProjectDetail)
                    || (item.path === '/organizations' && isOrgPage);

                const prefetchConfig = prefetchMap[item.path];

                return (
                  <PrefetchNavLink
                    key={item.path}
                    to={item.path}
                    data-tooltip={item.label}
                    prefetch={prefetchConfig}
                    className={`
                      sidebar-nav-item group relative flex items-center rounded-xl
                      transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                      ${collapsed ? 'justify-center aspect-square p-0' : 'px-3 py-2.5'}
                      ${active
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100/80 hover:text-gray-700'
                      }
                    `}
                  >
                    <item.icon
                      className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-white' : ''}`}
                      strokeWidth={active ? 2 : 1.7}
                    />
                    <span
                      className={`
                        text-[13px] font-medium whitespace-nowrap overflow-hidden
                        transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                        ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-3'}
                        ${active ? 'text-white' : ''}
                      `}
                    >
                      {item.label}
                    </span>
                  </PrefetchNavLink>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className={`flex-shrink-0 pb-3 pt-1 ${collapsed ? 'px-1.5' : 'px-2.5'}`}>
            <div className="h-px bg-gray-100 mb-2" />
            {user && (
              <div
                data-tooltip={collapsed ? user.username : undefined}
                className={`
                  sidebar-nav-item group flex items-center rounded-xl mb-1
                  ${collapsed ? 'justify-center aspect-square p-0' : 'px-3 py-2'}
                `}
              >
                <div className="w-[18px] h-[18px] rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <User className="w-3 h-3 text-gray-500" strokeWidth={2} />
                </div>
                <span
                  className={`
                    text-[13px] font-medium text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis
                    transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                    ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-3'}
                  `}
                >
                  {user.username}
                </span>
              </div>
            )}
            <NavLink
              to="/about"
              data-tooltip="About"
              className={({ isActive }) => `
                sidebar-nav-item group flex items-center rounded-xl
                transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                ${collapsed ? 'justify-center aspect-square p-0' : 'px-3 py-2'}
                ${isActive
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:bg-gray-100/80 hover:text-gray-600'
                }
              `}
            >
              <Info className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.7} />
              <span
                className={`
                  text-[13px] font-medium whitespace-nowrap overflow-hidden
                  transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                  ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-3'}
                `}
              >
                About
              </span>
            </NavLink>
            <button
              onClick={() => setSignOutOpen(true)}
              data-tooltip="Sign out"
              className={`
                sidebar-nav-item group flex items-center rounded-xl w-full
                transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                ${collapsed ? 'justify-center aspect-square p-0' : 'px-3 py-2'}
                text-gray-400 hover:bg-red-50 hover:text-red-500
              `}
            >
              <LogOut className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.7} />
              <span
                className={`
                  text-[13px] font-medium whitespace-nowrap overflow-hidden
                  transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                  ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-3'}
                `}
              >
                Sign out
              </span>
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
