import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, categoriesApi } from '@/lib/api';
import { formatCurrency, formatPercent, formatDateShort } from '@/lib/formatters';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, PiggyBank, Activity } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

const INCOME_COLOR = 'var(--fin-income)';
const EXPENSE_COLOR = 'var(--fin-expense)';
const SAVINGS_COLOR = 'var(--fin-savings)';

export default function DashboardPage() {
  const { hasPermission } = useAuth();
  const [granularity, setGranularity] = useState('monthly');

  const { data: summaryData } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardApi.summary().then(r => r.data.data),
  });

  const { data: trendData } = useQuery({
    queryKey: ['dashboard-trend', granularity],
    queryFn: () => dashboardApi.trend({ granularity }).then(r => r.data.data),
  });

  const { data: categoryData } = useQuery({
    queryKey: ['dashboard-category-breakdown'],
    queryFn: () => dashboardApi.categoryBreakdown().then(r => r.data.data),
  });

  const { data: recentData } = useQuery({
    queryKey: ['dashboard-recent'],
    queryFn: () => dashboardApi.recent().then(r => r.data.data),
  });

  const { data: insightsData } = useQuery({
    queryKey: ['dashboard-insights'],
    queryFn: () => dashboardApi.insights().then(r => r.data.data),
    enabled: hasPermission('insights:read'),
  });

  const summary = summaryData || {};
  const trend = trendData || { labels: [], income: [], expense: [], net: [] };
  const categories = categoryData || { income: [], expense: [] };
  const recent = recentData || [];
  const insights = insightsData || {};

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
    {
      title: 'NET BALANCE',
      value: formatCurrency(summary.net_balance_cents || 0),
      icon: Wallet,
      color: (summary.net_balance_cents || 0) >= 0 ? INCOME_COLOR : EXPENSE_COLOR,
      sub: `${summary.total_transactions || 0} transactions`,
    },
    {
      title: 'TOTAL INCOME',
      value: formatCurrency(summary.total_income_cents || 0),
      icon: ArrowUpRight,
      color: INCOME_COLOR,
      sub: `${summary.income_count || 0} entries`,
    },
    {
      title: 'TOTAL EXPENSES',
      value: formatCurrency(summary.total_expenses_cents || 0),
      icon: ArrowDownRight,
      color: EXPENSE_COLOR,
      sub: `${summary.expense_count || 0} entries`,
    },
    {
      title: 'SAVINGS RATE',
      value: `${summary.savings_rate_percent || 0}%`,
      icon: PiggyBank,
      color: SAVINGS_COLOR,
      sub: summary.savings_rate_percent > 0 ? 'Positive savings' : 'Negative savings',
    },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight" data-testid="dashboard-heading">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Financial overview for the current period</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="summary-cards">
        {summaryCards.map((card, i) => (
          <Card key={i} className="border border-border shadow-sm hover:shadow-md transition-shadow duration-200" data-testid={`summary-card-${i}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">{card.title}</span>
                <card.icon className="h-4 w-4" style={{ color: card.color }} />
              </div>
              <div className="font-mono text-2xl font-bold tracking-tight" style={{ color: card.color, fontVariantNumeric: 'tabular-nums' }} data-testid={`summary-value-${i}`}>
                {card.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Trend Chart */}
        <Card className="xl:col-span-2 border border-border shadow-sm" data-testid="trend-chart-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Income vs Expense Trend</CardTitle>
            <Select value={granularity} onValueChange={setGranularity}>
              <SelectTrigger className="w-28 h-8 text-xs" data-testid="granularity-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="h-72" data-testid="trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }}
                  formatter={(v) => [`$${v.toFixed(2)}`, '']}
                />
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
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="border border-border shadow-sm" data-testid="category-chart-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-72 flex flex-col items-center" data-testid="category-chart">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={2}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }}
                    formatter={(v, name) => [`$${v.toFixed(2)} (${pieData.find(p => p.name === name)?.percentage || 0}%)`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No expense data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Transactions */}
        <Card className="border border-border shadow-sm" data-testid="recent-transactions-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recent.length > 0 ? recent.map(txn => (
                <div key={txn.id} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`recent-txn-${txn.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold" style={{ backgroundColor: txn.category?.color_hex + '20', color: txn.category?.color_hex }}>
                      {txn.category?.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{txn.description || txn.category?.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateShort(txn.date)}</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium" style={{ color: txn.type === 'income' ? INCOME_COLOR : EXPENSE_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                    {txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount_cents)}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-6">No recent transactions</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Insights Strip */}
        {hasPermission('insights:read') && insights && (
          <Card className="border border-border shadow-sm" data-testid="insights-strip-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Key Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.highest_spending_category && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                  <Activity className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">Highest Spending</p>
                    <p className="text-xs text-muted-foreground">{insights.highest_spending_category.name} - {formatCurrency(insights.highest_spending_category.total_cents)}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                {insights.month_over_month_change_percent >= 0 ? <TrendingUp className="h-5 w-5" style={{ color: EXPENSE_COLOR }} /> : <TrendingDown className="h-5 w-5" style={{ color: INCOME_COLOR }} />}
                <div>
                  <p className="text-sm font-medium">Month over Month</p>
                  <p className="text-xs text-muted-foreground">{formatPercent(insights.month_over_month_change_percent || 0)} spending change</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                <Wallet className="h-5 w-5" style={{ color: SAVINGS_COLOR }} />
                <div>
                  <p className="text-sm font-medium">Average Daily Spend</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(insights.avg_daily_spend_cents || 0)}</p>
                </div>
              </div>
              {insights.projected_monthly_expense_cents > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                  <PiggyBank className="h-5 w-5" style={{ color: INCOME_COLOR }} />
                  <div>
                    <p className="text-sm font-medium">Projected Monthly</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(insights.projected_monthly_expense_cents)} estimated expenses</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
