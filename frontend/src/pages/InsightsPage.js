import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Calendar, Tag } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const INCOME_COLOR = 'var(--fin-income)';
const EXPENSE_COLOR = 'var(--fin-expense)';
const SAVINGS_COLOR = 'var(--fin-savings)';

export default function InsightsPage() {
  const { hasPermission } = useAuth();

  const { data: insightsData, isLoading } = useQuery({
    queryKey: ['insights-full'],
    queryFn: () => dashboardApi.insights().then(r => r.data.data),
    enabled: hasPermission('insights:read'),
  });

  if (!hasPermission('insights:read')) {
    return (
      <div className="flex items-center justify-center h-[60vh]" data-testid="insights-access-denied">
        <Card className="border border-border shadow-sm max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-heading text-xl font-bold mb-2">Upgrade Access</h2>
            <p className="text-sm text-muted-foreground">Insights are available for Analyst and Admin roles. Contact your administrator to upgrade your access level.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const insights = insightsData || {};
  const heatmapData = insights.heatmap_data || [];
  const monthlyComparison = insights.monthly_comparison || [];
  const unusual = insights.unusual_transactions || [];

  // Find max spend for heatmap intensity
  const maxSpend = Math.max(...heatmapData.map(d => d.amount_cents), 1);

  // Group heatmap by weeks
  const heatmapByWeek = [];
  const sortedHeatmap = [...heatmapData].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sortedHeatmap.length; i += 7) {
    heatmapByWeek.push(sortedHeatmap.slice(i, i + 7));
  }

  // Top categories from monthly comparison
  const topCategories = [...monthlyComparison].sort((a, b) => b.current - a.current).slice(0, 8);
  const maxCatSpend = Math.max(...topCategories.map(c => Math.max(c.current, c.previous)), 1);

  return (
    <div className="space-y-6" data-testid="insights-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight" data-testid="insights-heading">Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">Advanced analytics and spending patterns</p>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border border-border shadow-sm" data-testid="insight-highest-category">
          <CardContent className="p-5">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Highest Spending</span>
            <p className="font-heading text-lg font-bold mt-2">{insights.highest_spending_category?.name || '-'}</p>
            <p className="text-sm text-muted-foreground font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {insights.highest_spending_category ? formatCurrency(insights.highest_spending_category.total_cents) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-sm" data-testid="insight-mom-change">
          <CardContent className="p-5">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Month over Month</span>
            <div className="flex items-center gap-2 mt-2">
              {(insights.month_over_month_change_percent || 0) >= 0 ? <TrendingUp className="h-5 w-5" style={{ color: EXPENSE_COLOR }} /> : <TrendingDown className="h-5 w-5" style={{ color: INCOME_COLOR }} />}
              <span className="font-heading text-lg font-bold">{formatPercent(insights.month_over_month_change_percent || 0)}</span>
            </div>
            <p className="text-sm text-muted-foreground">vs previous month</p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-sm" data-testid="insight-avg-daily">
          <CardContent className="p-5">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Avg Daily Spend</span>
            <p className="font-heading text-lg font-bold mt-2 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(insights.avg_daily_spend_cents || 0)}
            </p>
            <p className="text-sm text-muted-foreground">per day this period</p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-sm" data-testid="insight-projected">
          <CardContent className="p-5">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Projected Monthly</span>
            <p className="font-heading text-lg font-bold mt-2 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(insights.projected_monthly_expense_cents || 0)}
            </p>
            <p className="text-sm text-muted-foreground">estimated expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Spending Heatmap */}
      <Card className="border border-border shadow-sm" data-testid="spending-heatmap-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Spending Heatmap (Last 90 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="flex gap-1 min-w-[600px]">
              {heatmapByWeek.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map(day => {
                    const intensity = day.amount_cents / maxSpend;
                    return (
                      <div
                        key={day.date}
                        className="w-4 h-4 rounded-sm border border-border cursor-pointer"
                        style={{ backgroundColor: intensity > 0 ? `rgba(184, 92, 56, ${0.15 + intensity * 0.85})` : 'hsl(var(--accent))' }}
                        title={`${day.date}: ${formatCurrency(day.amount_cents)}`}
                        data-testid={`heatmap-cell-${day.date}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
              <span>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map(v => (
                <div key={v} className="w-3 h-3 rounded-sm" style={{ backgroundColor: v > 0 ? `rgba(184, 92, 56, ${0.15 + v * 0.85})` : 'hsl(var(--accent))' }} />
              ))}
              <span>More</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Monthly Comparison */}
        <Card className="border border-border shadow-sm" data-testid="monthly-comparison-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Monthly Comparison by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {monthlyComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyComparison} layout="vertical" margin={{ top: 0, right: 10, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${(v/100).toFixed(0)}`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={80} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }} formatter={v => [`$${(v/100).toFixed(2)}`, '']} />
                  <Bar dataKey="current" fill={EXPENSE_COLOR} name="Current" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" name="Previous" radius={[0, 4, 4, 0]} barSize={12} opacity={0.4} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No comparison data</div>
            )}
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card className="border border-border shadow-sm" data-testid="top-categories-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Top Spending Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topCategories.map((cat, i) => (
                <div key={cat.category} data-testid={`top-category-${i}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">{cat.category}</span>
                    <span className="font-mono text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cat.current)}</span>
                  </div>
                  <Progress value={(cat.current / maxCatSpend) * 100} className="h-2" />
                </div>
              ))}
              {topCategories.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No category data</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly Cards */}
      {unusual.length > 0 && (
        <Card className="border border-border shadow-sm" data-testid="anomaly-cards-section">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Unusual Transactions (Z-Score &gt; 2.0)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {unusual.map(txn => (
                <div key={txn.id} className="p-4 rounded-md border border-destructive/20 bg-destructive/5" data-testid={`anomaly-${txn.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="destructive" className="text-[10px]">Z: {txn.zscore}</Badge>
                    <span className="font-mono text-sm font-bold" style={{ color: EXPENSE_COLOR, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(txn.amount_cents)}</span>
                  </div>
                  <p className="text-sm">{txn.description || 'No description'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Tags */}
      {insights.top_tags && insights.top_tags.length > 0 && (
        <Card className="border border-border shadow-sm" data-testid="top-tags-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-2">
              <Tag className="h-4 w-4" /> Top Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {insights.top_tags.map(tag => (
                <Badge key={tag} variant="outline" className="px-3 py-1" data-testid={`top-tag-${tag}`}>{tag}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
