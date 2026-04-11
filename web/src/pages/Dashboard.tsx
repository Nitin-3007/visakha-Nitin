import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, MessageSquare, ThumbsUp, ThumbsDown, Calendar, AlertCircle, Download, Target } from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Stats {
    totals: {
        users: number;
        conversations: number;
        messages: number;
        thumbsUp: number;
        thumbsDown: number;
    };
    questionsTimeline: { _id: string; count: number; thumbsUp?: number; thumbsDown?: number }[];
}

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<'24h' | '30d' | 'month'>('30d');

    useEffect(() => {
        const fetchStats = async (isBackground = false) => {
            if (!isBackground) setLoading(true);
            try {
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const res = await axios.get(`/admin/stats?range=${range}&tz=${tz}`);
                setStats(res.data);
            } catch (err) {
                console.error("Failed to fetch statistics", err, isBackground ? "(background)" : "");
            } finally {
                if (!isBackground) setLoading(false);
            }
        };

        fetchStats();

        // Refresh every 3 minutes
        const interval = setInterval(() => {
            fetchStats(true);
        }, 3 * 60 * 1000);

        return () => clearInterval(interval);
    }, [range]);

    const handleExport = async () => {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const response = await axios.get(`/admin/stats/export?range=${range}&tz=${tz}`, {
                responseType: 'blob'
            });

            // If the response is a blob but actually contains a JSON error
            if (response.data.type === 'application/json') {
                const text = await response.data.text();
                const error = JSON.parse(text);
                throw new Error(error.message || error.error || "Export failed");
            }

            const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `questions_activity_${range}_${formatDate(new Date(), 'yyyy-MM-dd')}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            console.error("Failed to export statistics", err);
            const message = err.response?.data?.error || err.message || "An error occurred while exporting statistics.";
            alert(message);
        }
    };

    if (loading) {
        return <div className="p-8 flex items-center justify-center h-full">
            <div className="animate-pulse text-gray-500">Loading statistics...</div>
        </div>;
    }

    if (!stats || !stats.totals || !stats.questionsTimeline) {
        return <div className="p-8 flex items-center justify-center h-full text-red-500">
            <div className="text-center">
                <AlertCircle className="w-10 h-10 mx-auto mb-4 opacity-50" />
                <p className="font-bold">Invalid statistics data received.</p>
                <p className="text-sm opacity-70">Check console for details or try again later.</p>
            </div>
        </div>;
    }

    const timelines = (stats.questionsTimeline || []).map(t => ({
        ...t,
        csat: (t.thumbsUp || t.thumbsDown) ? Math.round(((t.thumbsUp || 0) / ((t.thumbsUp || 0) + (t.thumbsDown || 0))) * 100) : null
    }));

    const overallCsat = (stats.totals.thumbsUp || stats.totals.thumbsDown) 
        ? ((stats.totals.thumbsUp / (stats.totals.thumbsUp + stats.totals.thumbsDown)) * 100).toFixed(1) 
        : '0.0';

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Dashboard</h1>
                    <p className="text-gray-500 dark:text-gray-400">Overview of system activity and user feedback.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-100 dark:border-gray-700/50 self-start md:self-auto">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Auto-refreshing every 3m
                </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {[
                    { label: 'Overall CSAT', value: `${overallCsat}%`, icon: Target, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                    { label: 'Total Users', value: stats.totals.users ?? 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                    { label: 'Conversations', value: stats.totals.conversations ?? 0, icon: MessageSquare, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
                    { label: 'Helpful', value: stats.totals.thumbsUp ?? 0, icon: ThumbsUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                    { label: 'Needs Improvement', value: stats.totals.thumbsDown ?? 0, icon: ThumbsDown, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
                ].map((metric) => (
                    <div key={metric.label} className="bg-white dark:bg-brand-card p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                        <div className={`p-2 rounded-lg ${metric.bg} w-10 h-10 flex items-center justify-center mb-4`}>
                            <metric.icon className={`w-5 h-5 ${metric.color}`} />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{metric.value}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">{metric.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* Questions Timeline */}
                    <div className="bg-white dark:bg-brand-card p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-brand-primary" />
                            Questions Activity
                        </h2>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-brand-card border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
                                title="Export current activity to CSV"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export CSV
                            </button>
                            <div className="flex bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg shadow-inner">
                                {(['24h', '30d', 'month'] as const).map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setRange(r)}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${range === r
                                            ? 'bg-white dark:bg-brand-card shadow-sm text-brand-primary'
                                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        {r === '24h' ? '24h' : r === '30d' ? '30 Days' : 'Monthly'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="h-64 mt-4">
                        {timelines.length === 0 ? (
                            <div className="flex-1 h-full flex items-center justify-center text-gray-400">No activity recorded yet.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timelines} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--brand-primary, #6366f1)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="var(--brand-primary, #6366f1)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(156, 163, 175, 0.1)" />
                                    <XAxis
                                        dataKey="_id"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                                        tickFormatter={(val) => {
                                            if (!val) return '';
                                            try {
                                                const date = parseISO(val);
                                                if (range === '24h') return formatDate(date, 'HH:00');
                                                if (range === 'month') return formatDate(date, 'MMM yyyy');
                                                return formatDate(date, 'MM/dd');
                                            } catch {
                                                return val;
                                            }
                                        }}
                                        minTickGap={range === '24h' ? 20 : 30}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                            borderRadius: '8px',
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                            fontSize: '12px'
                                        }}
                                        itemStyle={{ color: 'var(--brand-primary, #6366f1)', fontWeight: 'bold' }}
                                        labelStyle={{ color: '#6b7280', marginBottom: '4px' }}
                                        formatter={(value?: number | string | (number | string)[]) => [`${value ?? 0} questions`, 'Activity']}
                                        labelFormatter={(label) => {
                                            if (!label) return '';
                                            try {
                                                const date = parseISO(label);
                                                if (range === '24h') return `Time: ${formatDate(date, 'PPP HH:00')}`;
                                                if (range === 'month') return `Month: ${formatDate(date, 'MMMM yyyy')}`;
                                                return `Date: ${formatDate(date, 'PPP')}`;
                                            } catch {
                                                return label;
                                            }
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="var(--brand-primary, #6366f1)"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorCount)"
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* CSAT Timeline */}
                <div className="bg-white dark:bg-brand-card p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                        <Target className="w-5 h-5 text-amber-500" />
                        CSAT Trend (%)
                    </h2>
                    <div className="h-48 mt-4">
                        {timelines.length === 0 ? (
                            <div className="flex-1 h-full flex items-center justify-center text-gray-400">No activity recorded yet.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={timelines} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(156, 163, 175, 0.1)" />
                                    <XAxis
                                        dataKey="_id"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                                        tickFormatter={(val) => {
                                            if (!val) return '';
                                            try {
                                                const date = parseISO(val);
                                                if (range === '24h') return formatDate(date, 'HH:00');
                                                if (range === 'month') return formatDate(date, 'MMM yyyy');
                                                return formatDate(date, 'MM/dd');
                                            } catch {
                                                return val;
                                            }
                                        }}
                                        minTickGap={range === '24h' ? 20 : 30}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                                        domain={[0, 'auto']}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                                        itemStyle={{ color: '#f59e0b', fontWeight: 'bold' }}
                                        labelStyle={{ color: '#6b7280', marginBottom: '4px' }}
                                        formatter={(value?: number) => [(value ?? 0) + '%', 'CSAT']}
                                        labelFormatter={(label) => {
                                            if (!label) return '';
                                            try {
                                                const date = parseISO(label);
                                                if (range === '24h') return `Time: ${formatDate(date, 'PPP HH:00')}`;
                                                if (range === 'month') return `Month: ${formatDate(date, 'MMMM yyyy')}`;
                                                return `Date: ${formatDate(date, 'PPP')}`;
                                            } catch {
                                                return label;
                                            }
                                        }}
                                    />
                                    <Line type="monotone" dataKey="csat" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} animationDuration={1500} connectNulls={true} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Feedback Distribution */}
                <div className="bg-white dark:bg-brand-card p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
                    <h2 className="text-lg font-bold mb-6">Feedback Ratio</h2>
                    <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-green-600">Helpful</span>
                            <span className="text-sm font-bold">{((stats.totals.thumbsUp / (stats.totals.thumbsUp + stats.totals.thumbsDown || 1)) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex mb-8">
                            <div
                                className="h-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                                style={{ width: `${(stats.totals.thumbsUp / (stats.totals.thumbsUp + stats.totals.thumbsDown || 1)) * 100}%` }}
                            />
                            <div
                                className="h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                                style={{ width: `${(stats.totals.thumbsDown / (stats.totals.thumbsUp + stats.totals.thumbsDown || 1)) * 100}%` }}
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                                    <span>Helpful</span>
                                </div>
                                <span className="font-bold">{stats.totals.thumbsUp}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                                    <span>Needs Improvement</span>
                                </div>
                                <span className="font-bold">{stats.totals.thumbsDown}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
