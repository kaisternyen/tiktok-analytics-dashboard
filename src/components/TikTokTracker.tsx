"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from "recharts";
import { Loader2, AlertCircle, CheckCircle, X, TrendingUp, TrendingDown, Eye, Heart, MessageCircle, Share, Play, RefreshCw } from "lucide-react";

interface VideoHistory {
    time: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
}

interface DeltaPoint {
    time: string;
    timestamp: string;
    viewsDelta: number;
    likesDelta: number;
    commentsDelta: number;
    sharesDelta: number;
    viewsTotal: number;
    likesTotal: number;
    commentsTotal: number;
    sharesTotal: number;
}

type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'lifetime';

interface TrackedVideo {
    id: string;
    url: string;
    username: string;
    description: string;
    posted: string;
    lastUpdate: string;
    status: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    history: VideoHistory[];
    hashtags: string[];
    thumbnailUrl?: string;
    music?: {
        name: string;
        author: string;
    };
    platform: 'tiktok';
    growth: {
        views: number;
        likes: number;
        comments: number;
        shares: number;
    };
}

interface CronStatus {
    system: {
        status: string;
        totalVideos: number;
        activeVideos: number;
        videosNeedingScrape: number;
    };
    cron: {
        lastActivity: string;
        minutesSinceLastActivity: number | null;
        isHealthy: boolean;
    };
    recentActivity: Array<{
        username: string;
        views: number;
        minutesAgo: number;
    }>;
}

export default function TikTokTracker() {
    const [videoUrl, setVideoUrl] = useState("");
    const [tracked, setTracked] = useState<TrackedVideo[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<TrackedVideo | null>(null);
    const [activeTab, setActiveTab] = useState("overview");
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
    const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
    const [timePeriod, setTimePeriod] = useState<TimePeriod>('daily');
    const [showDeltas, setShowDeltas] = useState(true);

    // Fetch videos from database on component mount
    useEffect(() => {
        fetchVideos();
    }, []);

    // Auto-refresh status every 30 seconds
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const response = await fetch('/api/status');
                if (response.ok) {
                    const data = await response.json();
                    setCronStatus(data.status);
                }
            } catch (error) {
                console.error('Failed to fetch status:', error);
            }
        };

        // Fetch immediately
        fetchStatus();

        // Set up interval for auto-refresh
        const interval = setInterval(fetchStatus, 30000); // Every 30 seconds

        return () => clearInterval(interval);
    }, []);

    const fetchVideos = async () => {
        try {
            console.log('📋 Fetching videos from API...');
            const response = await fetch('/api/videos');
            const result = await response.json();

            if (result.success) {
                setTracked(result.videos);
                console.log(`✅ Loaded ${result.videos.length} videos from database`);
            } else {
                console.error('❌ Failed to fetch videos:', result.error);
            }
        } catch (err) {
            console.error('💥 Error fetching videos:', err);
        }
    };

    const handleTrack = async () => {
        if (!videoUrl) return;

        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            console.log('🚀 Submitting URL for scraping:', videoUrl);

            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: videoUrl.trim() }),
            });

            const result = await response.json();
            console.log('📦 API response:', result);

            if (!response.ok) {
                throw new Error(result.error || 'Failed to scrape video');
            }

            if (result.success && result.data) {
                setVideoUrl("");
                setSuccess(`✅ Successfully ${result.message || 'added'} video by @${result.data.username}!`);

                // Refresh the videos list
                await fetchVideos();
            } else {
                throw new Error(result.error || 'No data received');
            }
        } catch (err) {
            console.error('💥 Error adding video:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(`Failed to add video: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshAll = async () => {
        setIsRefreshing(true);
        setError(null);
        setSuccess(null);

        try {
            console.log('🔄 Refreshing all videos...');

            // Refresh each video by re-scraping
            for (const video of tracked) {
                console.log(`🔄 Refreshing @${video.username}...`);

                const response = await fetch('/api/scrape', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url: video.url }),
                });

                if (!response.ok) {
                    console.warn(`⚠️ Failed to refresh @${video.username}`);
                }
            }

            // Fetch updated data
            await fetchVideos();
            setSuccess(`✅ Successfully refreshed ${tracked.length} videos!`);

        } catch (err) {
            console.error('💥 Error refreshing videos:', err);
            setError('Failed to refresh some videos');
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDeleteVideo = async (videoId: string, event: React.MouseEvent) => {
        event.stopPropagation();

        // Find the video to get username for confirmation
        const videoToDelete = tracked.find(v => v.id === videoId);
        if (!videoToDelete) return;

        // Show confirmation
        if (!confirm(`Are you sure you want to delete @${videoToDelete.username}? This will remove all tracking data permanently.`)) {
            return;
        }

        try {
            setDeletingVideoId(videoId);
            console.log(`🗑️ Deleting video: @${videoToDelete.username}`);

            const response = await fetch(`/api/videos/${videoId}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete video');
            }

            console.log(`✅ Successfully deleted: @${videoToDelete.username}`);

            // Remove from local state immediately
            setTracked(prev => prev.filter(video => video.id !== videoId));

            // Clear selected video if it was the deleted one
            if (selectedVideo?.id === videoId) {
                setSelectedVideo(null);
                setActiveTab("overview");
            }

            // Show success message
            setSuccess(`✅ Successfully deleted @${videoToDelete.username} and all tracking data`);
            setError(null);

        } catch (err) {
            console.error('💥 Error deleting video:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(`Failed to delete video: ${errorMessage}`);
            setSuccess(null);
        } finally {
            setDeletingVideoId(null);
        }
    };

    // Calculate comprehensive metrics for overview
    const calculateOverviewMetrics = () => {
        if (tracked.length === 0) return {
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            videos: 0,
            viewsGrowth: 0,
            likesGrowth: 0,
            commentsGrowth: 0,
            sharesGrowth: 0,
            engagementRate: 0,
            avgViewsPerVideo: 0
        };

        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let totalShares = 0;
        let totalViewsGrowth = 0;
        let totalLikesGrowth = 0;
        let totalCommentsGrowth = 0;
        let totalSharesGrowth = 0;

        tracked.forEach(video => {
            totalViews += video.views;
            totalLikes += video.likes;
            totalComments += video.comments;
            totalShares += video.shares;

            // Calculate 24-hour growth
            const filtered = filterDataByTimePeriod(video.history, 'daily');
            if (filtered.length >= 2) {
                const latest = filtered[filtered.length - 1];
                const previous = filtered[0];
                totalViewsGrowth += latest.views - previous.views;
                totalLikesGrowth += latest.likes - previous.likes;
                totalCommentsGrowth += latest.comments - previous.comments;
                totalSharesGrowth += latest.shares - previous.shares;
            }
        });

        const engagementRate = totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0;
        const avgViewsPerVideo = tracked.length > 0 ? totalViews / tracked.length : 0;

        return {
            totalViews,
            totalLikes,
            totalComments,
            totalShares,
            videos: tracked.length,
            viewsGrowth: totalViewsGrowth,
            likesGrowth: totalLikesGrowth,
            commentsGrowth: totalCommentsGrowth,
            sharesGrowth: totalSharesGrowth,
            engagementRate,
            avgViewsPerVideo
        };
    };

    const overviewMetrics = calculateOverviewMetrics();

    const formatNumber = (num: number) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    const formatGrowth = (growth: number) => {
        const isPositive = growth >= 0;
        return (
            <span className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(growth).toFixed(1)}%
            </span>
        );
    };

    // Advanced data processing for analytics
    const filterDataByTimePeriod = (history: VideoHistory[], period: TimePeriod): VideoHistory[] => {
        const now = new Date();
        let cutoffDate: Date;

        switch (period) {
            case 'daily':
                cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'weekly':
                cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'monthly':
                cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'yearly':
                cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            case 'lifetime':
                return history;
        }

        return history.filter(point => new Date(point.time) >= cutoffDate);
    };

    const calculateDeltas = (history: VideoHistory[]): DeltaPoint[] => {
        if (history.length < 2) return [];

        const deltaPoints: DeltaPoint[] = [];

        for (let i = 1; i < history.length; i++) {
            const current = history[i];
            const previous = history[i - 1];

            deltaPoints.push({
                time: current.time,
                timestamp: new Date(current.time).toISOString(),
                viewsDelta: current.views - previous.views,
                likesDelta: current.likes - previous.likes,
                commentsDelta: current.comments - previous.comments,
                sharesDelta: current.shares - previous.shares,
                viewsTotal: current.views,
                likesTotal: current.likes,
                commentsTotal: current.comments,
                sharesTotal: current.shares,
            });
        }

        return deltaPoints;
    };

    const formatXAxisByPeriod = (timestamp: string, period: TimePeriod): string => {
        const date = new Date(timestamp);

        switch (period) {
            case 'daily':
                return date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            case 'weekly':
                return date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
            case 'monthly':
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
            case 'yearly':
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    year: '2-digit'
                });
            case 'lifetime':
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric'
                });
            default:
                return date.toLocaleDateString();
        }
    };

    const formatTooltipTimestamp = (timestamp: string): string => {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const getYAxisDomain = (data: DeltaPoint[] | VideoHistory[], dataKey: string, showDeltas: boolean): [number, number] => {
        if (!data || data.length === 0) return [0, 100];

        const values: number[] = [];
        data.forEach(d => {
            if (dataKey in d) {
                const value = d[dataKey as keyof (DeltaPoint | VideoHistory)];
                if (typeof value === 'number') {
                    values.push(value);
                }
            }
        });

        if (values.length === 0) return [0, 100];

        const min = Math.min(...values);
        const max = Math.max(...values);

        if (showDeltas) {
            // For deltas, center around 0 with symmetric range
            const absMax = Math.max(Math.abs(min), Math.abs(max));
            const padding = absMax * 0.1;
            return [-absMax - padding, absMax + padding];
        } else {
            // For totals, start from reasonable baseline
            const range = max - min;
            const padding = range * 0.1;
            return [Math.max(0, min - padding), max + padding];
        }
    };

    const formatDeltaNumber = (num: number): string => {
        const sign = num >= 0 ? '+' : '';
        if (Math.abs(num) >= 1000000) return `${sign}${(num / 1000000).toFixed(1)}M`;
        if (Math.abs(num) >= 1000) return `${sign}${(num / 1000).toFixed(1)}K`;
        return `${sign}${num}`;
    };

    const getTimePeriodLabel = (period: TimePeriod): string => {
        switch (period) {
            case 'daily': return 'Last 24 Hours';
            case 'weekly': return 'Last 7 Days';
            case 'monthly': return 'Last 30 Days';
            case 'yearly': return 'Last 12 Months';
            case 'lifetime': return 'All Time';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                                <Play className="w-4 h-4 text-white" />
                            </div>
                            <h1 className="text-xl font-semibold text-gray-900">TikTok Analytics</h1>
                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                                ● {tracked.length} videos tracked
                            </span>
                            {cronStatus && (
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cronStatus.cron.isHealthy
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                        }`}>
                                        <span className={`w-2 h-2 rounded-full ${cronStatus.cron.isHealthy ? 'bg-green-500' : 'bg-red-500'
                                            }`} />
                                        Cron {cronStatus.cron.isHealthy ? 'Active' : 'Inactive'}
                                    </span>
                                    {cronStatus.cron.minutesSinceLastActivity !== null && (
                                        <span className="text-xs text-gray-500">
                                            Last: {cronStatus.cron.minutesSinceLastActivity}m ago
                                        </span>
                                    )}
                                    {cronStatus.system.videosNeedingScrape > 0 && (
                                        <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded-full">
                                            {cronStatus.system.videosNeedingScrape} pending
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                onClick={handleRefreshAll}
                                disabled={isRefreshing || tracked.length === 0}
                                className="flex items-center gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                {isRefreshing ? 'Refreshing...' : 'Refresh All'}
                            </Button>
                            <Input
                                placeholder="Paste TikTok video URL"
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                                disabled={isLoading}
                                className="w-80"
                            />
                            <Button onClick={handleTrack} disabled={isLoading || !videoUrl}>
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Track Video"}
                            </Button>
                        </div>
                    </div>

                    {/* Status Messages */}
                    {error && (
                        <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                            <AlertCircle className="w-4 h-4" />
                            <span className="whitespace-pre-line">{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700">
                            <CheckCircle className="w-4 h-4" />
                            <span>{success}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-6">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="videos">Videos</TabsTrigger>
                        {selectedVideo && (
                            <TabsTrigger value="insights">
                                Insights - @{selectedVideo.username}
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-6">
                        {tracked.length === 0 ? (
                            <Card>
                                <CardContent className="p-12 text-center">
                                    <div className="text-gray-500 mb-4">
                                        <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                        <h3 className="text-lg font-medium mb-2">No videos tracked yet</h3>
                                        <p>Add your first TikTok video URL above to get started with analytics!</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <>
                                {/* Enhanced Metrics Cards with KPIs */}
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(overviewMetrics.totalViews)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Eye className="w-3 h-3" />
                                                Total Views
                                            </div>
                                            <div className="text-xs mt-1">
                                                {overviewMetrics.viewsGrowth >= 0 ? '+' : ''}{formatNumber(overviewMetrics.viewsGrowth)} today
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(overviewMetrics.totalLikes)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Heart className="w-3 h-3" />
                                                Total Likes
                                            </div>
                                            <div className="text-xs mt-1">
                                                {overviewMetrics.likesGrowth >= 0 ? '+' : ''}{formatNumber(overviewMetrics.likesGrowth)} today
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(overviewMetrics.totalComments)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3" />
                                                Comments
                                            </div>
                                            <div className="text-xs mt-1">
                                                {overviewMetrics.commentsGrowth >= 0 ? '+' : ''}{formatNumber(overviewMetrics.commentsGrowth)} today
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(overviewMetrics.totalShares)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Share className="w-3 h-3" />
                                                Shares
                                            </div>
                                            <div className="text-xs mt-1">
                                                {overviewMetrics.sharesGrowth >= 0 ? '+' : ''}{formatNumber(overviewMetrics.sharesGrowth)} today
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{overviewMetrics.engagementRate.toFixed(1)}%</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <TrendingUp className="w-3 h-3" />
                                                Engagement
                                            </div>
                                            <div className="text-xs mt-1 text-blue-600">
                                                {overviewMetrics.engagementRate > 3 ? 'Excellent' :
                                                    overviewMetrics.engagementRate > 2 ? 'Good' :
                                                        overviewMetrics.engagementRate > 1 ? 'Average' : 'Low'}
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(overviewMetrics.avgViewsPerVideo)}</div>
                                            <div className="text-sm text-gray-500">Avg Views</div>
                                            <div className="text-xs mt-1 text-gray-600">per video</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{overviewMetrics.videos}</div>
                                            <div className="text-sm text-gray-500">Videos</div>
                                            <div className="text-xs mt-1 text-green-600">Active</div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Professional Analytics Dashboard */}
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900">Performance Analytics</h3>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    {getTimePeriodLabel(timePeriod)} • {showDeltas ? 'Growth Changes' : 'Total Values'}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                {/* Time Period Selector */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-gray-700">Period:</span>
                                                    <div className="flex bg-gray-100 rounded-lg p-1">
                                                        {(['daily', 'weekly', 'monthly', 'yearly', 'lifetime'] as TimePeriod[]).map((period) => (
                                                            <button
                                                                key={period}
                                                                onClick={() => setTimePeriod(period)}
                                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timePeriod === period
                                                                    ? 'bg-white text-gray-900 shadow-sm'
                                                                    : 'text-gray-600 hover:text-gray-900'
                                                                    }`}
                                                            >
                                                                {period === 'daily' ? '24H' :
                                                                    period === 'weekly' ? '7D' :
                                                                        period === 'monthly' ? '30D' :
                                                                            period === 'yearly' ? '1Y' : 'All'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Delta Toggle */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-gray-700">View:</span>
                                                    <div className="flex bg-gray-100 rounded-lg p-1">
                                                        <button
                                                            onClick={() => setShowDeltas(false)}
                                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${!showDeltas
                                                                ? 'bg-white text-gray-900 shadow-sm'
                                                                : 'text-gray-600 hover:text-gray-900'
                                                                }`}
                                                        >
                                                            Total
                                                        </button>
                                                        <button
                                                            onClick={() => setShowDeltas(true)}
                                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${showDeltas
                                                                ? 'bg-white text-gray-900 shadow-sm'
                                                                : 'text-gray-600 hover:text-gray-900'
                                                                }`}
                                                        >
                                                            Growth
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Enhanced Charts */}
                                        <div className="space-y-8">
                                            {tracked.slice(0, 3).map((video) => {
                                                const filteredHistory = filterDataByTimePeriod(video.history, timePeriod);
                                                const deltaData = showDeltas ? calculateDeltas(filteredHistory) : filteredHistory;

                                                if (deltaData.length === 0) return null;

                                                return (
                                                    <div key={video.id} className="border border-gray-200 rounded-lg p-4">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                                <span className="font-medium text-gray-900">@{video.username}</span>
                                                                <span className="text-sm text-gray-500">
                                                                    {formatNumber(video.views)} views
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {deltaData.length} data points
                                                            </div>
                                                        </div>

                                                        <div className="h-64">
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <AreaChart data={deltaData}>
                                                                    <XAxis
                                                                        dataKey="time"
                                                                        tickFormatter={(t) => formatXAxisByPeriod(t, timePeriod)}
                                                                        className="text-xs"
                                                                        interval="preserveStartEnd"
                                                                    />
                                                                    <YAxis
                                                                        tickFormatter={(value) =>
                                                                            showDeltas ? formatDeltaNumber(value) : formatNumber(value)
                                                                        }
                                                                        className="text-xs"
                                                                        domain={getYAxisDomain(
                                                                            deltaData,
                                                                            showDeltas ? 'viewsDelta' : 'viewsTotal',
                                                                            showDeltas
                                                                        )}
                                                                    />
                                                                    <Tooltip
                                                                        labelFormatter={(label) => formatTooltipTimestamp(label)}
                                                                        formatter={(value: number, name: string) => {
                                                                            const cleanName = name.replace('Delta', '').replace('Total', '');
                                                                            const formattedValue = showDeltas
                                                                                ? formatDeltaNumber(value)
                                                                                : formatNumber(value);
                                                                            return [formattedValue, cleanName];
                                                                        }}
                                                                        labelStyle={{
                                                                            color: '#374151',
                                                                            fontWeight: '600',
                                                                            fontSize: '12px'
                                                                        }}
                                                                        contentStyle={{
                                                                            backgroundColor: 'white',
                                                                            border: '1px solid #e5e7eb',
                                                                            borderRadius: '8px',
                                                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                                                        }}
                                                                    />
                                                                    <Area
                                                                        type="monotone"
                                                                        dataKey={showDeltas ? "viewsDelta" : "viewsTotal"}
                                                                        stroke="#3b82f6"
                                                                        fill="#3b82f6"
                                                                        fillOpacity={0.1}
                                                                        strokeWidth={2}
                                                                        name="Views"
                                                                    />
                                                                    <Area
                                                                        type="monotone"
                                                                        dataKey={showDeltas ? "likesDelta" : "likesTotal"}
                                                                        stroke="#ef4444"
                                                                        fill="#ef4444"
                                                                        fillOpacity={0.1}
                                                                        strokeWidth={2}
                                                                        name="Likes"
                                                                    />
                                                                    <Area
                                                                        type="monotone"
                                                                        dataKey={showDeltas ? "commentsDelta" : "commentsTotal"}
                                                                        stroke="#f59e0b"
                                                                        fill="#f59e0b"
                                                                        fillOpacity={0.1}
                                                                        strokeWidth={2}
                                                                        name="Comments"
                                                                    />
                                                                    <Area
                                                                        type="monotone"
                                                                        dataKey={showDeltas ? "sharesDelta" : "sharesTotal"}
                                                                        stroke="#10b981"
                                                                        fill="#10b981"
                                                                        fillOpacity={0.1}
                                                                        strokeWidth={2}
                                                                        name="Shares"
                                                                    />
                                                                    {showDeltas && (
                                                                        <ReferenceLine
                                                                            y={0}
                                                                            stroke="#6b7280"
                                                                            strokeDasharray="3 3"
                                                                            strokeWidth={1}
                                                                        />
                                                                    )}
                                                                </AreaChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {tracked.length === 0 && (
                                                <div className="text-center py-12 text-gray-500">
                                                    <div className="w-16 h-16 mx-auto mb-4 opacity-50">
                                                        <TrendingUp className="w-full h-full" />
                                                    </div>
                                                    <h3 className="text-lg font-medium mb-2">No analytics data</h3>
                                                    <p>Track some videos to see performance analytics here!</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </TabsContent>

                    {/* Videos Tab */}
                    <TabsContent value="videos">
                        <Card>
                            <CardContent className="p-0">
                                {tracked.length === 0 ? (
                                    <div className="p-12 text-center text-gray-500">
                                        <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                        <h3 className="text-lg font-medium mb-2">No videos to display</h3>
                                        <p>Track your first TikTok video to see it appear here!</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="text-left p-4 font-medium text-gray-900">Creator</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Platform</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Views</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Likes</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Comments</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Shares</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Growth</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Status</th>
                                                    <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tracked.map((video) => (
                                                    <tr
                                                        key={video.id}
                                                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedVideo(video);
                                                            setActiveTab("insights");
                                                        }}
                                                    >
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-3">
                                                                {video.thumbnailUrl && (
                                                                    <img
                                                                        src={video.thumbnailUrl}
                                                                        alt={`${video.username} thumbnail`}
                                                                        className="w-10 h-14 object-cover rounded bg-gray-200"
                                                                        onError={(e) => {
                                                                            e.currentTarget.style.display = 'none';
                                                                        }}
                                                                    />
                                                                )}
                                                                <div>
                                                                    <div className="font-medium text-gray-900">@{video.username}</div>
                                                                    <div className="text-sm text-gray-500 max-w-xs truncate">
                                                                        {video.description}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-5 h-5 bg-black rounded flex items-center justify-center">
                                                                    <Play className="w-3 h-3 text-white" />
                                                                </div>
                                                                <span className="text-sm font-medium">TikTok</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 font-medium">{formatNumber(video.views)}</td>
                                                        <td className="p-4 font-medium">{formatNumber(video.likes)}</td>
                                                        <td className="p-4 font-medium">{formatNumber(video.comments)}</td>
                                                        <td className="p-4 font-medium">{formatNumber(video.shares)}</td>
                                                        <td className="p-4">{formatGrowth(video.growth.views)}</td>
                                                        <td className="p-4">
                                                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                                                                {video.status}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <button
                                                                onClick={(e) => handleDeleteVideo(video.id, e)}
                                                                disabled={deletingVideoId === video.id}
                                                                className={`p-1 rounded transition-colors ${deletingVideoId === video.id
                                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                                    : 'hover:bg-red-100 text-red-600 hover:text-red-700'
                                                                    }`}
                                                                title={deletingVideoId === video.id ? 'Deleting...' : 'Remove video'}
                                                            >
                                                                {deletingVideoId === video.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <X className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Enhanced Insights Tab */}
                    {selectedVideo && (
                        <TabsContent value="insights" className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">@{selectedVideo.username}</h2>
                                    <p className="text-gray-600 max-w-2xl">{selectedVideo.description}</p>
                                </div>
                                <Button variant="outline" onClick={() => setActiveTab("videos")}>
                                    ← Back to Videos
                                </Button>
                            </div>

                            {/* Current Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card>
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-bold text-gray-900">{formatNumber(selectedVideo.views)}</div>
                                        <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                                            <Eye className="w-3 h-3" />
                                            Views
                                        </div>
                                        <div className="text-xs mt-1">{formatGrowth(selectedVideo.growth.views)}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-bold text-gray-900">{formatNumber(selectedVideo.likes)}</div>
                                        <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                                            <Heart className="w-3 h-3" />
                                            Likes
                                        </div>
                                        <div className="text-xs mt-1">{formatGrowth(selectedVideo.growth.likes)}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-bold text-gray-900">{formatNumber(selectedVideo.comments)}</div>
                                        <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                                            <MessageCircle className="w-3 h-3" />
                                            Comments
                                        </div>
                                        <div className="text-xs mt-1">{formatGrowth(selectedVideo.growth.comments)}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-bold text-gray-900">{formatNumber(selectedVideo.shares)}</div>
                                        <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                                            <Share className="w-3 h-3" />
                                            Shares
                                        </div>
                                        <div className="text-xs mt-1">{formatGrowth(selectedVideo.growth.shares)}</div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Professional Individual Analytics */}
                            <Card>
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900">Detailed Performance Analytics</h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {getTimePeriodLabel(timePeriod)} • {showDeltas ? 'Growth Changes' : 'Total Values'}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            {/* Time Period Selector */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-gray-700">Period:</span>
                                                <div className="flex bg-gray-100 rounded-lg p-1">
                                                    {(['daily', 'weekly', 'monthly', 'yearly', 'lifetime'] as TimePeriod[]).map((period) => (
                                                        <button
                                                            key={period}
                                                            onClick={() => setTimePeriod(period)}
                                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timePeriod === period
                                                                ? 'bg-white text-gray-900 shadow-sm'
                                                                : 'text-gray-600 hover:text-gray-900'
                                                                }`}
                                                        >
                                                            {period === 'daily' ? '24H' :
                                                                period === 'weekly' ? '7D' :
                                                                    period === 'monthly' ? '30D' :
                                                                        period === 'yearly' ? '1Y' : 'All'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Delta Toggle */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-gray-700">View:</span>
                                                <div className="flex bg-gray-100 rounded-lg p-1">
                                                    <button
                                                        onClick={() => setShowDeltas(false)}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${!showDeltas
                                                            ? 'bg-white text-gray-900 shadow-sm'
                                                            : 'text-gray-600 hover:text-gray-900'
                                                            }`}
                                                    >
                                                        Total
                                                    </button>
                                                    <button
                                                        onClick={() => setShowDeltas(true)}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${showDeltas
                                                            ? 'bg-white text-gray-900 shadow-sm'
                                                            : 'text-gray-600 hover:text-gray-900'
                                                            }`}
                                                    >
                                                        Growth
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {(() => {
                                        const filteredHistory = filterDataByTimePeriod(selectedVideo.history, timePeriod);
                                        const deltaData = showDeltas ? calculateDeltas(filteredHistory) : filteredHistory;

                                        if (deltaData.length === 0) {
                                            return (
                                                <div className="text-center py-12 text-gray-500">
                                                    <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                                    <h3 className="text-lg font-medium mb-2">No data for this period</h3>
                                                    <p>Try selecting a different time period or wait for more data collection.</p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="space-y-8">
                                                {/* Combined Multi-Metric Chart */}
                                                <div className="border border-gray-200 rounded-lg p-4">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h4 className="font-medium text-gray-900">All Metrics</h4>
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                                                <span>Views</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                                                <span>Likes</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                                                <span>Comments</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                                                <span>Shares</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="h-80">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <AreaChart data={deltaData}>
                                                                <XAxis
                                                                    dataKey="time"
                                                                    tickFormatter={(t) => formatXAxisByPeriod(t, timePeriod)}
                                                                    className="text-xs"
                                                                    interval="preserveStartEnd"
                                                                />
                                                                <YAxis
                                                                    tickFormatter={(value) =>
                                                                        showDeltas ? formatDeltaNumber(value) : formatNumber(value)
                                                                    }
                                                                    className="text-xs"
                                                                />
                                                                <Tooltip
                                                                    labelFormatter={(label) => formatTooltipTimestamp(label)}
                                                                    formatter={(value: number, name: string) => {
                                                                        const cleanName = name.replace('Delta', '').replace('Total', '');
                                                                        const formattedValue = showDeltas
                                                                            ? formatDeltaNumber(value)
                                                                            : formatNumber(value);
                                                                        return [formattedValue, cleanName];
                                                                    }}
                                                                    labelStyle={{
                                                                        color: '#374151',
                                                                        fontWeight: '600',
                                                                        fontSize: '12px'
                                                                    }}
                                                                    contentStyle={{
                                                                        backgroundColor: 'white',
                                                                        border: '1px solid #e5e7eb',
                                                                        borderRadius: '8px',
                                                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                                                    }}
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey={showDeltas ? "viewsDelta" : "viewsTotal"}
                                                                    stroke="#3b82f6"
                                                                    fill="#3b82f6"
                                                                    fillOpacity={0.1}
                                                                    strokeWidth={2}
                                                                    name="Views"
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey={showDeltas ? "likesDelta" : "likesTotal"}
                                                                    stroke="#ef4444"
                                                                    fill="#ef4444"
                                                                    fillOpacity={0.1}
                                                                    strokeWidth={2}
                                                                    name="Likes"
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey={showDeltas ? "commentsDelta" : "commentsTotal"}
                                                                    stroke="#f59e0b"
                                                                    fill="#f59e0b"
                                                                    fillOpacity={0.1}
                                                                    strokeWidth={2}
                                                                    name="Comments"
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey={showDeltas ? "sharesDelta" : "sharesTotal"}
                                                                    stroke="#10b981"
                                                                    fill="#10b981"
                                                                    fillOpacity={0.1}
                                                                    strokeWidth={2}
                                                                    name="Shares"
                                                                />
                                                                {showDeltas && (
                                                                    <ReferenceLine
                                                                        y={0}
                                                                        stroke="#6b7280"
                                                                        strokeDasharray="3 3"
                                                                        strokeWidth={1}
                                                                    />
                                                                )}
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>

                                                {/* Individual Metric Charts Grid */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {[
                                                        { key: 'views', name: 'Views', color: '#3b82f6', icon: Eye },
                                                        { key: 'likes', name: 'Likes', color: '#ef4444', icon: Heart },
                                                        { key: 'comments', name: 'Comments', color: '#f59e0b', icon: MessageCircle },
                                                        { key: 'shares', name: 'Shares', color: '#10b981', icon: Share }
                                                    ].map((metric) => {
                                                        const MetricIcon = metric.icon;
                                                        const dataKey = showDeltas ? `${metric.key}Delta` : `${metric.key}Total`;

                                                        return (
                                                            <Card key={metric.key}>
                                                                <CardContent className="p-4">
                                                                    <div className="flex items-center gap-2 mb-3">
                                                                        <MetricIcon className="w-4 h-4" style={{ color: metric.color }} />
                                                                        <h4 className="font-medium text-gray-900">{metric.name}</h4>
                                                                        <span className="text-xs text-gray-500">
                                                                            ({deltaData.length} points)
                                                                        </span>
                                                                    </div>
                                                                    <div className="h-32">
                                                                        <ResponsiveContainer width="100%" height="100%">
                                                                            <LineChart data={deltaData}>
                                                                                <XAxis
                                                                                    dataKey="time"
                                                                                    tickFormatter={(t) => formatXAxisByPeriod(t, timePeriod)}
                                                                                    className="text-xs"
                                                                                    interval="preserveStartEnd"
                                                                                />
                                                                                <YAxis
                                                                                    tickFormatter={(value) =>
                                                                                        showDeltas ? formatDeltaNumber(value) : formatNumber(value)
                                                                                    }
                                                                                    className="text-xs"
                                                                                    domain={getYAxisDomain(deltaData, dataKey, showDeltas)}
                                                                                />
                                                                                <Tooltip
                                                                                    labelFormatter={(label) => formatTooltipTimestamp(label)}
                                                                                    formatter={(value: number) => [
                                                                                        showDeltas ? formatDeltaNumber(value) : formatNumber(value),
                                                                                        metric.name
                                                                                    ]}
                                                                                    contentStyle={{
                                                                                        backgroundColor: 'white',
                                                                                        border: '1px solid #e5e7eb',
                                                                                        borderRadius: '6px',
                                                                                        fontSize: '12px'
                                                                                    }}
                                                                                />
                                                                                <Line
                                                                                    type="monotone"
                                                                                    dataKey={dataKey}
                                                                                    stroke={metric.color}
                                                                                    strokeWidth={2}
                                                                                    dot={false}
                                                                                />
                                                                                {showDeltas && (
                                                                                    <ReferenceLine
                                                                                        y={0}
                                                                                        stroke="#9ca3af"
                                                                                        strokeDasharray="2 2"
                                                                                        strokeWidth={1}
                                                                                    />
                                                                                )}
                                                                            </LineChart>
                                                                        </ResponsiveContainer>
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    );
} 