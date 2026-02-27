import { useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderGit2,
  Users,
  Activity,
  ChevronLeft,
  ChevronRight,
  X,
  Github,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, end: true },
  { label: 'Projects', path: '/projects', icon: FolderGit2 },
  { label: 'Contributors', path: '/contributors', icon: Users },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();

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

  const isProjectDetail = location.pathname.startsWith('/projects/');

  return (
    <>
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
                const active = isActive || (item.path === '/projects' && isProjectDetail);

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    data-tooltip={item.label}
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
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className={`flex-shrink-0 pb-3 pt-1 ${collapsed ? 'px-1.5' : 'px-2.5'}`}>
            <div className="h-px bg-gray-100 mb-2" />
            <a
              href="https://github.com/dpanshug/upstream-pulse"
              target="_blank"
              rel="noopener noreferrer"
              data-tooltip="GitHub"
              className={`sidebar-nav-item group flex items-center rounded-xl transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] text-gray-400 hover:bg-gray-100/80 hover:text-gray-600 ${collapsed ? 'justify-center aspect-square p-0' : 'px-3 py-2'}`}
            >
              <Github className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.7} />
              <span
                className={`
                  text-[13px] font-medium whitespace-nowrap overflow-hidden
                  transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                  ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-3'}
                `}
              >
                GitHub
              </span>
            </a>
          </div>
        </aside>
      </div>
    </>
  );
}
