"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Loader2, AlertCircle, CheckCircle, X, TrendingUp, TrendingDown, Eye, Heart, MessageCircle, Share, Play, RefreshCw } from "lucide-react";

interface VideoHistory {
    time: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
}

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

    const totalMetrics = {
        videos: tracked.length,
        totalViews: tracked.reduce((sum, v) => sum + v.views, 0),
        totalLikes: tracked.reduce((sum, v) => sum + v.likes, 0),
        totalComments: tracked.reduce((sum, v) => sum + v.comments, 0),
        totalShares: tracked.reduce((sum, v) => sum + v.shares, 0),
        avgGrowth: tracked.length > 0 ? tracked.reduce((sum, v) => sum + v.growth.views, 0) / tracked.length : 0,
    };

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
                                {/* Metrics Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalViews)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Eye className="w-3 h-3" />
                                                Total Views
                                            </div>
                                            <div className="text-xs mt-1">{formatGrowth(totalMetrics.avgGrowth)}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalLikes)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Heart className="w-3 h-3" />
                                                Total Likes
                                            </div>
                                            <div className="text-xs mt-1">{formatGrowth(15.2)}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalComments)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3" />
                                                Total Comments
                                            </div>
                                            <div className="text-xs mt-1">{formatGrowth(8.7)}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalShares)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Share className="w-3 h-3" />
                                                Total Shares
                                            </div>
                                            <div className="text-xs mt-1">{formatGrowth(22.3)}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{totalMetrics.videos}</div>
                                            <div className="text-sm text-gray-500">Videos Tracked</div>
                                            <div className="text-xs mt-1 text-green-600">Active</div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Performance Chart */}
                                <Card>
                                    <CardContent className="p-6">
                                        <h3 className="text-lg font-semibold mb-4">Performance Overview</h3>
                                        <div className="h-80">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={tracked[0]?.history || []}>
                                                    <XAxis
                                                        dataKey="time"
                                                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                                                        className="text-xs"
                                                    />
                                                    <YAxis tickFormatter={formatNumber} className="text-xs" />
                                                    <Tooltip
                                                        labelFormatter={(l) => new Date(l).toLocaleDateString()}
                                                        formatter={(value: number) => [formatNumber(value), '']}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="views"
                                                        stroke="#3b82f6"
                                                        fill="#3b82f6"
                                                        fillOpacity={0.1}
                                                        strokeWidth={2}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
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

                    {/* Insights Tab */}
                    {selectedVideo && (
                        <TabsContent value="insights" className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">@{selectedVideo.username}</h2>
                                    <p className="text-gray-600">{selectedVideo.description}</p>
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

                            {/* Separate Performance Charts */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card>
                                    <CardContent className="p-6">
                                        <h3 className="font-semibold mb-4">Views Over Time</h3>
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={selectedVideo.history}>
                                                    <XAxis
                                                        dataKey="time"
                                                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                                                        className="text-xs"
                                                    />
                                                    <YAxis tickFormatter={formatNumber} className="text-xs" />
                                                    <Tooltip
                                                        labelFormatter={(l) => new Date(l).toLocaleDateString()}
                                                        formatter={(value: number) => [formatNumber(value), 'Views']}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="views"
                                                        stroke="#3b82f6"
                                                        strokeWidth={2}
                                                        dot={false}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <h3 className="font-semibold mb-4">Likes Over Time</h3>
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={selectedVideo.history}>
                                                    <XAxis
                                                        dataKey="time"
                                                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                                                        className="text-xs"
                                                    />
                                                    <YAxis tickFormatter={formatNumber} className="text-xs" />
                                                    <Tooltip
                                                        labelFormatter={(l) => new Date(l).toLocaleDateString()}
                                                        formatter={(value: number) => [formatNumber(value), 'Likes']}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="likes"
                                                        stroke="#ef4444"
                                                        strokeWidth={2}
                                                        dot={false}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <h3 className="font-semibold mb-4">Comments Over Time</h3>
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={selectedVideo.history}>
                                                    <XAxis
                                                        dataKey="time"
                                                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                                                        className="text-xs"
                                                    />
                                                    <YAxis tickFormatter={formatNumber} className="text-xs" />
                                                    <Tooltip
                                                        labelFormatter={(l) => new Date(l).toLocaleDateString()}
                                                        formatter={(value: number) => [formatNumber(value), 'Comments']}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="comments"
                                                        stroke="#10b981"
                                                        strokeWidth={2}
                                                        dot={false}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <h3 className="font-semibold mb-4">Shares Over Time</h3>
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={selectedVideo.history}>
                                                    <XAxis
                                                        dataKey="time"
                                                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                                                        className="text-xs"
                                                    />
                                                    <YAxis tickFormatter={formatNumber} className="text-xs" />
                                                    <Tooltip
                                                        labelFormatter={(l) => new Date(l).toLocaleDateString()}
                                                        formatter={(value: number) => [formatNumber(value), 'Shares']}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="shares"
                                                        stroke="#8b5cf6"
                                                        strokeWidth={2}
                                                        dot={false}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Video Details */}
                            <Card>
                                <CardContent className="p-6">
                                    <h3 className="font-semibold mb-4">Video Details</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div>
                                                <span className="text-sm font-medium text-gray-500">Posted:</span>
                                                <span className="ml-2 text-sm">{new Date(selectedVideo.posted).toLocaleDateString()}</span>
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-gray-500">Last Updated:</span>
                                                <span className="ml-2 text-sm">{new Date(selectedVideo.lastUpdate).toLocaleDateString()}</span>
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-gray-500">Status:</span>
                                                <span className="ml-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                                    {selectedVideo.status}
                                                </span>
                                            </div>
                                            {selectedVideo.music && (
                                                <div>
                                                    <span className="text-sm font-medium text-gray-500">Music:</span>
                                                    <span className="ml-2 text-sm">
                                                        {selectedVideo.music.name} by {selectedVideo.music.author}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            {selectedVideo.hashtags.length > 0 && (
                                                <div>
                                                    <span className="text-sm font-medium text-gray-500 block mb-2">Hashtags:</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedVideo.hashtags.map((tag, idx) => (
                                                            <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    );
} 