import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { supabase } from '@/api/supabaseClient';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';

// ─── Helpers ────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtDate(dateStr) {
  try { return format(parseISO(dateStr), 'MMM d'); } catch { return dateStr; }
}

const PERIOD_OPTIONS = [
  { label: '7 days',  value: 7  },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

const CHART_COLORS = {
  indigo:  '#6366f1',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  sky:     '#0ea5e9',
  violet:  '#8b5cf6',
};

// ─── Small components ───────────────────────────────────────────

function MetricCard({ label, value, sub, icon, accent = 'indigo', loading }) {
  const colors = {
    indigo:  'bg-indigo-500/10 text-indigo-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber:   'bg-amber-500/10 text-amber-400',
    rose:    'bg-rose-500/10 text-rose-400',
    sky:     'bg-sky-500/10 text-sky-400',
    violet:  'bg-violet-500/10 text-violet-400',
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
        {icon && (
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm ${colors[accent]}`}>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-slate-800 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-white tracking-tight">{fmt(value)}</p>
      )}
      {sub && !loading && (
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      )}
    </div>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
    </div>
  );
}

function ChartCard({ title, description, children, loading }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <SectionHeader title={title} description={description} />
      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold text-white">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Post type & slip breakdown ─────────────────────────────────

function BreakdownBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-medium">{fmt(value)} <span className="text-slate-500">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────

export default function AdminDashboard() {
  const { logoutAdmin, user } = useAdminAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState(30);
  const [overview, setOverview] = useState(null);
  const [userGrowth, setUserGrowth] = useState([]);
  const [dauTrend, setDauTrend] = useState([]);
  const [featureTrend, setFeatureTrend] = useState([]);
  const [eventCounts, setEventCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_analytics_overview');
    if (error) throw error;
    setOverview(data);
  }, []);

  const loadCharts = useCallback(async (days) => {
    setChartsLoading(true);
    const [g, a, f, e] = await Promise.all([
      supabase.rpc('get_user_growth',        { days_back: days }),
      supabase.rpc('get_active_users_trend', { days_back: days }),
      supabase.rpc('get_feature_usage_trend',{ days_back: days }),
      supabase.rpc('get_event_counts',       { days_back: days }),
    ]);
    if (g.error) throw g.error;
    if (a.error) throw a.error;
    if (f.error) throw f.error;

    const fmtRow = row => ({ ...row, date: fmtDate(row.date) });
    setUserGrowth((g.data || []).map(fmtRow));
    setDauTrend((a.data || []).map(fmtRow));
    setFeatureTrend((f.data || []).map(fmtRow));
    setEventCounts(e.data || []);
    setChartsLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError('');
      try {
        await loadOverview();
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [loadOverview]);

  useEffect(() => {
    loadCharts(period).catch(err => {
      console.error('Chart load failed:', err);
    });
  }, [period, loadCharts]);

  async function handleLogout() {
    await logoutAdmin();
    navigate('/admin/login', { replace: true });
  }

  // Derived values
  const totalPosts = overview
    ? (overview.posts_meal + overview.posts_workout + overview.posts_slip + overview.posts_milestone)
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-semibold text-sm">Accountable Admin</span>
            <span className="hidden sm:inline text-xs text-slate-500 font-normal">Analytics Dashboard</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-800"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-950 border border-red-800 rounded-xl text-sm text-red-300">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        {/* Period selector */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Overview</h1>
            <p className="text-xs text-slate-500 mt-0.5">All metrics are aggregated — no personal data is shown.</p>
          </div>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  period === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Row 1 — Users */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Total Users"
            value={overview?.total_users}
            sub="all time"
            accent="indigo"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            }
          />
          <MetricCard
            label="DAU"
            value={overview?.dau}
            sub="active today"
            accent="emerald"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <MetricCard
            label="WAU"
            value={overview?.wau}
            sub="active last 7 days"
            accent="sky"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
          <MetricCard
            label="MAU"
            value={overview?.mau}
            sub="active last 30 days"
            accent="violet"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </div>

        {/* KPI Row 2 — Content */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="New Signups"
            value={overview?.new_users_month}
            sub="last 30 days"
            accent="amber"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            }
          />
          <MetricCard
            label="Total Posts"
            value={overview?.total_posts}
            sub="all time"
            accent="rose"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            }
          />
          <MetricCard
            label="Active Partnerships"
            value={overview?.active_partnerships}
            sub={`of ${overview?.total_partnerships ?? '—'} total`}
            accent="emerald"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            }
          />
          <MetricCard
            label="Slips Reported"
            value={overview?.total_slips}
            sub={`${fmt(overview?.total_rules ?? 0)} rules created`}
            accent="sky"
            loading={loading}
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
        </div>

        {/* User Growth Chart */}
        <ChartCard
          title="User Growth"
          description={`New signups per day — last ${period} days`}
          loading={chartsLoading}
        >
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={userGrowth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradIndigo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.indigo} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.indigo} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(userGrowth.length / 6)}
              />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="new_users"
                name="New Users"
                stroke={CHART_COLORS.indigo}
                strokeWidth={2}
                fill="url(#gradIndigo)"
                dot={false}
                activeDot={{ r: 4, fill: CHART_COLORS.indigo }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* DAU Trend Chart */}
        <ChartCard
          title="Daily Active Users"
          description={`Unique users active per day — last ${period} days`}
          loading={chartsLoading}
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dauTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(dauTrend.length / 6)}
              />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="dau"
                name="DAU"
                stroke={CHART_COLORS.emerald}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: CHART_COLORS.emerald }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Feature Usage Chart */}
        <ChartCard
          title="Feature Usage"
          description={`Posts, slips, rules, and partnerships created per day — last ${period} days`}
          loading={chartsLoading}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={featureTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(featureTrend.length / 6)}
              />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', color: '#94a3b8', paddingTop: '12px' }}
                formatter={v => <span style={{ color: '#94a3b8' }}>{v}</span>}
              />
              <Bar dataKey="posts"        name="Posts"        fill={CHART_COLORS.indigo}  radius={[2, 2, 0, 0]} maxBarSize={18} />
              <Bar dataKey="slips"        name="Slips"        fill={CHART_COLORS.rose}    radius={[2, 2, 0, 0]} maxBarSize={18} />
              <Bar dataKey="rules"        name="Rules"        fill={CHART_COLORS.amber}   radius={[2, 2, 0, 0]} maxBarSize={18} />
              <Bar dataKey="partnerships" name="Partnerships" fill={CHART_COLORS.emerald} radius={[2, 2, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bottom row: Post breakdown + Event counts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Post type breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <SectionHeader title="Post Breakdown" description="All-time posts by type" />
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-6 bg-slate-800 rounded animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-4">
                <BreakdownBar label="Meals"      value={overview?.posts_meal}      total={totalPosts} color={CHART_COLORS.emerald} />
                <BreakdownBar label="Workouts"   value={overview?.posts_workout}   total={totalPosts} color={CHART_COLORS.sky}    />
                <BreakdownBar label="Slips"      value={overview?.posts_slip}      total={totalPosts} color={CHART_COLORS.rose}   />
                <BreakdownBar label="Milestones" value={overview?.posts_milestone} total={totalPosts} color={CHART_COLORS.amber}  />
              </div>
            )}
          </div>

          {/* Slip breakdown + top events */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6">
            <div>
              <SectionHeader title="Slip Breakdown" description="Self-reported vs. witnessed" />
              {loading ? (
                <div className="space-y-3">
                  {[1,2].map(i => <div key={i} className="h-6 bg-slate-800 rounded animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  <BreakdownBar
                    label="Self-reported"
                    value={overview?.slips_self}
                    total={overview?.total_slips}
                    color={CHART_COLORS.violet}
                  />
                  <BreakdownBar
                    label="Witnessed"
                    value={overview?.slips_witnessed}
                    total={overview?.total_slips}
                    color={CHART_COLORS.rose}
                  />
                </div>
              )}
            </div>

            {eventCounts.length > 0 && (
              <div>
                <SectionHeader title="Top Events" description={`Most-fired events — last ${period} days`} />
                <div className="space-y-2">
                  {eventCounts.slice(0, 6).map(ev => (
                    <div key={ev.event} className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-mono truncate max-w-[60%]">{ev.event}</span>
                      <span className="text-white font-semibold">{fmt(ev.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* New signups quick stats */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <SectionHeader title="Signup Velocity" description="New user registrations" />
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Today',       value: overview?.new_users_today },
              { label: 'This week',   value: overview?.new_users_week  },
              { label: 'This month',  value: overview?.new_users_month },
            ].map(item => (
              <div key={item.label} className="text-center">
                {loading ? (
                  <div className="h-7 w-12 mx-auto bg-slate-800 rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-white">{fmt(item.value)}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

      </main>

      <footer className="border-t border-slate-900 mt-8 py-6">
        <p className="text-center text-xs text-slate-700">
          Accountable Admin · Analytics data is aggregated and does not contain personal information
        </p>
      </footer>
    </div>
  );
}
