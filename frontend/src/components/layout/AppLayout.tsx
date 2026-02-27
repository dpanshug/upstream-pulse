import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Activity } from 'lucide-react';
import Sidebar from './Sidebar';

const SIDEBAR_KEY = 'upstream-pulse-sidebar';

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded'); } catch { /* noop */ }
      return next;
    });
  }, []);

  const handleMobileClose = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-dvh bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggle}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />

      <div
        className={`
          min-h-dvh flex flex-col
          transition-[padding] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
          ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]'}
        `}
      >
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-200/60">
          <div className="flex items-center h-14 px-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors active:scale-95"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mx-auto">
              <div className="w-6 h-6 rounded-lg bg-gray-900 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-900">Upstream Pulse</span>
            </div>
            <div className="w-9" />
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
