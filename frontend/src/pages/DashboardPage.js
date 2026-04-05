import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatPercent, formatDateShort } from '@/lib/formatters';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, PiggyBank, Activity, Heart, Shield, BarChart3, Target } from 'lucide-react';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { DateRangePicker } from '@/components/DateRangePicker';
import { PageTransition, StaggerContainer, StaggerItem, FadeIn } from '@/components/MotionWrappers';

const INCOME_COLOR = 'var(--fin-income)';
const EXPENSE_COLOR = 'var(--fin-expense)';
const SAVINGS_COLOR = 'var(--fin-savings)';

function HealthScoreRing({ score, size = 120 }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? INCOME_COLOR : score >= 60 ? SAVINGS_COLOR : EXPENSE_COLOR;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--border))" strokeWidth="8" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="8" fill="none"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
      />
    </svg>
  );
}

export default function DashboardPage() {
  const { hasPermission } = useAuth();
  const [granularity, setGranularity] = useState('monthly');
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  const dateParams = {};
  if (dateRange.from) dateParams.date_from = dateRange.from.toISOString().split('T')[0];
  if (dateRange.to) dateParams.date_to = dateRange.to.toISOString().split('T')[0];

  const { data: summaryData } = useQuery({
    queryKey: ['dashboard-summary', dateParams],
    queryFn: () => dashboardApi.summary(dateParams).then(r => r.data.data),
  });

  const { data: trendData } = useQuery({
    queryKey: ['dashboard-trend', granularity],
    queryFn: () => dashboardApi.trend({ granularity }).then(r => r.data.data),
  });

  const { data: categoryData } = useQuery({
    queryKey: ['dashboard-category-breakdown', dateParams],
    queryFn: () => dashboardApi.categoryBreakdown(dateParams).then(r => r.data.data),
  });

  const { data: recentData } = useQuery({
    queryKey: ['dashboard-recent'],
    queryFn: () => dashboardApi.recent().then(r => r.data.data),
  });

  const { data: insightsData } = useQuery({
    queryKey: ['dashboard-insights', dateParams],
    queryFn: () => dashboardApi.insights(dateParams).then(r => r.data.data),
    enabled: hasPermission('insights:read'),
  });

  const { data: healthData } = useQuery({
    queryKey: ['dashboard-health-score'],
    queryFn: () => dashboardApi.healthScore().then(r => r.data.data),
  });

  const summary = summaryData || {};
  const trend = trendData || { labels: [], income: [], expense: [], net: [] };
  const categories = categoryData || { income: [], expense: [] };
  const recent = recentData || [];
  const insights = insightsData || {};
  const health = healthData || {};

  const trendChartData = trend.labels.map((label, i) => ({
    name: label,
    income: (trend.income[i] || 0) / 100,
    expense: (trend.expense[i] || 0) / 100,
    net: (trend.net[i] || 0) / 100,
  }));

  const pieData = categories.expense?.map(c => ({
    name: c.category,
    value: c.total_cents / 100,
    color: c.color_hex,
    percentage: c.percentage,
  })) || [];

  const summaryCards = [
    { title: 'NET BALANCE', value: formatCurrency(summary.net_balance_cents || 0), icon: Wallet, color: (summary.net_balance_cents || 0) >= 0 ? INCOME_COLOR : EXPENSE_COLOR, sub: `${summary.total_transactions || 0} transactions` },
    { title: 'TOTAL INCOME', value: formatCurrency(summary.total_income_cents || 0), icon: ArrowUpRight, color: INCOME_COLOR, sub: `${summary.income_count || 0} entries` },
    { title: 'TOTAL EXPENSES', value: formatCurrency(summary.total_expenses_cents || 0), icon: ArrowDownRight, color: EXPENSE_COLOR, sub: `${summary.expense_count || 0} entries` },
    { title: 'SAVINGS RATE', value: `${summary.savings_rate_percent || 0}%`, icon: PiggyBank, color: SAVINGS_COLOR, sub: summary.savings_rate_percent > 0 ? 'Positive savings' : 'Negative savings' },
  ];

  return (
    <PageTransition>
      <div className="space-y-6" data-testid="dashboard-page">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight" data-testid="dashboard-heading">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Financial overview for the current period</p>
          </div>
          <DateRangePicker from={dateRange.from} to={dateRange.to} onSelect={setDateRange} />
        </div>

        {/* Summary Cards */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="summary-cards">
          {summaryCards.map((card, i) => (
            <StaggerItem key={i}>
              <Card className="border border-border shadow-sm hover:shadow-md transition-shadow duration-200" data-testid={`summary-card-${i}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">{card.title}</span>
                    <card.icon className="h-4 w-4" style={{ color: card.color }} />
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-bold tracking-tight" style={{ color: card.color, fontVariantNumeric: 'tabular-nums' }} data-testid={`summary-value-${i}`}>
                    {card.value}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Financial Health Score */}
        {health.score !== undefined && (
          <FadeIn delay={0.2}>
            <Card className="border border-border shadow-sm" data-testid="health-score-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-2">
                  <Heart className="h-4 w-4" /> Financial Health Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="relative flex-shrink-0">
                    <HealthScoreRing score={health.score} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-3xl font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: health.score >= 80 ? INCOME_COLOR : health.score >= 60 ? SAVINGS_COLOR : EXPENSE_COLOR }} data-testid="health-score-value">
                        {Math.round(health.score)}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">{health.grade}</span>
                    </div>
                  </div>
                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {health.components && Object.values(health.components).map((comp, i) => (
                      <div key={i} className="space-y-1.5" data-testid={`health-component-${i}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{comp.label}</span>
                          <span className="text-xs font-mono text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(comp.score)}/100</span>
                        </div>
                        <Progress value={comp.score} className="h-1.5" />
                        {comp.detail && <span className="text-[10px] text-muted-foreground">{comp.detail}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex-shrink-0 hidden lg:block">
                    <div className="space-y-2">
                      {health.tips?.map((tip, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Target className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: SAVINGS_COLOR }} />
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
          <FadeIn delay={0.1}>
            <Card className="xl:col-span-2 border border-border shadow-sm" data-testid="trend-chart-card">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Income vs Expense Trend</CardTitle>
                <Select value={granularity} onValueChange={setGranularity}>
                  <SelectTrigger className="w-28 h-8 text-xs" data-testid="granularity-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="pt-0" data-testid="trend-chart">
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }} formatter={(v) => [`$${v.toFixed(2)}`, '']} />
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={INCOME_COLOR} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={INCOME_COLOR} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={EXPENSE_COLOR} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="income" stroke={INCOME_COLOR} fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
                      <Area type="monotone" dataKey="expense" stroke={EXPENSE_COLOR} fill="url(#expenseGrad)" strokeWidth={2} name="Expense" />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.15}>
            <Card className="border border-border shadow-sm" data-testid="category-chart-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Expense Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-0" data-testid="category-chart">
                {pieData.length > 0 ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={2}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }} formatter={(v, name) => [`$${v.toFixed(2)} (${pieData.find(p => p.name === name)?.percentage || 0}%)`, name]} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">No expense data</div>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          <FadeIn delay={0.2}>
            <Card className="border border-border shadow-sm" data-testid="recent-transactions-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {recent.length > 0 ? recent.map(txn => (
                    <div key={txn.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0" data-testid={`recent-txn-${txn.id}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: txn.category?.color_hex + '20', color: txn.category?.color_hex }}>
                          {txn.category?.name?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{txn.description || txn.category?.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDateShort(txn.date)}</p>
                        </div>
                      </div>
                      <span className="font-mono text-sm font-medium flex-shrink-0 ml-3" style={{ color: txn.type === 'income' ? INCOME_COLOR : EXPENSE_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                        {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount_cents)}
                      </span>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground text-center py-6">No recent transactions</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          {hasPermission('insights:read') && insights && (
            <FadeIn delay={0.25}>
              <Card className="border border-border shadow-sm" data-testid="insights-strip-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Key Insights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {insights.highest_spending_category && (
                    <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                      <Activity className="h-5 w-5 text-destructive flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Highest Spending</p>
                        <p className="text-xs text-muted-foreground truncate">{insights.highest_spending_category.name} - {formatCurrency(insights.highest_spending_category.total_cents)}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                    {(insights.month_over_month_change_percent || 0) >= 0 ? <TrendingUp className="h-5 w-5 flex-shrink-0" style={{ color: EXPENSE_COLOR }} /> : <TrendingDown className="h-5 w-5 flex-shrink-0" style={{ color: INCOME_COLOR }} />}
                    <div>
                      <p className="text-sm font-medium">Month over Month</p>
                      <p className="text-xs text-muted-foreground">{formatPercent(insights.month_over_month_change_percent || 0)} spending change</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                    <Wallet className="h-5 w-5 flex-shrink-0" style={{ color: SAVINGS_COLOR }} />
                    <div>
                      <p className="text-sm font-medium">Average Daily Spend</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(insights.avg_daily_spend_cents || 0)}</p>
                    </div>
                  </div>
                  {insights.projected_monthly_expense_cents > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                      <PiggyBank className="h-5 w-5 flex-shrink-0" style={{ color: INCOME_COLOR }} />
                      <div>
                        <p className="text-sm font-medium">Projected Monthly</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(insights.projected_monthly_expense_cents)} estimated expenses</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </FadeIn>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
