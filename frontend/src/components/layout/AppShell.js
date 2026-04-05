import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import {
  LayoutDashboard, ArrowLeftRight, Lightbulb, Users, Menu, X,
  LogOut, ChevronDown, Sun, Moon,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:read' },
  { path: '/transactions', label: 'Transactions', icon: ArrowLeftRight, permission: 'transactions:read' },
  { path: '/insights', label: 'Insights', icon: Lightbulb, permission: 'insights:read' },
  { path: '/users', label: 'Users', icon: Users, permission: 'users:read' },
];

export default function AppShell({ children }) {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') { document.documentElement.classList.add('dark'); return true; }
    return false;
  });

  const toggleTheme = () => {
    setDark(prev => {
      const next = !prev;
      if (next) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredNav = NAV_ITEMS.filter(item => hasPermission(item.permission));

  const roleBadgeColor = {
    admin: 'bg-primary/10 text-primary border-primary/20',
    analyst: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    viewer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  };

  return (
    <div className="min-h-screen flex bg-background" data-testid="app-shell">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex md:w-60 flex-col border-r border-border bg-card" data-testid="sidebar">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-heading font-bold text-xs">FL</span>
            </div>
            <span className="font-heading font-bold text-lg tracking-tight">FinLedger</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1" data-testid="sidebar-nav">
          {filteredNav.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="text-xs">{dark ? 'Dark' : 'Light'}</span>
            </div>
            <Switch checked={dark} onCheckedChange={toggleTheme} data-testid="theme-toggle" />
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 h-full bg-card border-r border-border flex flex-col">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-heading font-bold text-xs">FL</span>
                </div>
                <span className="font-heading font-bold text-lg">FinLedger</span>
              </div>
              <button onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {filteredNav.map(item => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 sticky top-0 z-30" data-testid="topbar">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-btn">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-[0.1em] uppercase border ${roleBadgeColor[user?.role] || ''}`} data-testid="user-role-badge">
              {user?.role}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-9 px-2" data-testid="user-menu-trigger">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    {user?.full_name?.charAt(0) || 'U'}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">{user?.full_name}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="md:hidden" onClick={toggleTheme}>
                  {dark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                  {dark ? 'Light Mode' : 'Dark Mode'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} data-testid="logout-btn">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
