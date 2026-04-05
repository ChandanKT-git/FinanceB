import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const DEMO_USERS = [
  { label: 'Admin', email: 'admin@demo.com', password: 'Demo@1234', role: 'admin' },
  { label: 'Analyst', email: 'analyst@demo.com', password: 'Demo@1234', role: 'analyst' },
  { label: 'Viewer', email: 'viewer@demo.com', password: 'Demo@1234', role: 'viewer' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(e => e.msg || JSON.stringify(e)).join(' ') : 'Invalid credentials';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demo) => {
    setEmail(demo.email);
    setPassword(demo.password);
    setLoading(true);
    setError('');
    try {
      await login(demo.email, demo.password);
      toast.success(`Signed in as ${demo.label}`);
      navigate('/dashboard');
    } catch (err) {
      setError('Demo login failed');
      toast.error('Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-heading font-bold text-sm">FL</span>
              </div>
              <span className="font-heading font-bold text-xl tracking-tight" data-testid="app-logo">FinLedger</span>
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight" data-testid="login-heading">
              Welcome back
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Sign in to access your financial dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="pl-10"
                  data-testid="login-email-input"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pl-10 pr-10"
                  data-testid="login-password-input"
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive" data-testid="login-error">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit-btn">
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          <div className="space-y-3">
            <p className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground text-center">Quick Demo Access</p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_USERS.map(demo => (
                <button
                  key={demo.role}
                  onClick={() => handleDemoLogin(demo)}
                  disabled={loading}
                  className="px-3 py-2.5 rounded-md border border-border bg-card text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
                  data-testid={`demo-login-${demo.role}`}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Hero image */}
      <div className="hidden lg:block lg:flex-1 relative">
        <img
          src="https://images.unsplash.com/photo-1593024960993-26423171086d?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"
          alt="FinLedger"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/20" />
        <div className="absolute bottom-12 left-12 right-12">
          <p className="text-white/90 font-heading font-bold text-2xl tracking-tight">
            Enterprise-grade financial visibility
          </p>
          <p className="text-white/60 text-sm mt-2">
            Track, analyse, and visualise your organisation's financial data with role-based access control.
          </p>
        </div>
      </div>
    </div>
  );
}
