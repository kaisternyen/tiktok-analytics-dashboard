"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
    platform: 'tiktok' | 'instagram' | 'youtube';
    scrapingCadence: string; // 'hourly' | 'daily' | 'testing'
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

interface ChartDataPoint {
    time: string;
    views: number;
    delta: number;
    originalTime: Date;
}

type TimePeriod = 'D' | 'W' | 'M' | '3M' | '1Y' | 'ALL';

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
    const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>('W');
    const [showDelta, setShowDelta] = useState(false);

    // Individual video chart states
    const [selectedVideoTimePeriod, setSelectedVideoTimePeriod] = useState<TimePeriod>('W');
    const [showViewsDelta, setShowViewsDelta] = useState(false);
    const [showLikesDelta, setShowLikesDelta] = useState(false);
    const [showCommentsDelta, setShowCommentsDelta] = useState(false);
    const [showSharesDelta, setShowSharesDelta] = useState(false);

    // Fetch videos from database on component mount
    useEffect(() => {
        fetchVideos();
    }, []);

    // Auto-refresh status every 30 seconds AND auto-refresh video data
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

        // Auto-refresh videos data every 30 seconds for real-time updates
        const autoRefreshVideos = async () => {
            try {
                await fetchVideos();
                console.log('🔄 Auto-refreshed video data');
            } catch (error) {
                console.error('Failed to auto-refresh videos:', error);
            }
        };

        // Fetch immediately
        fetchStatus();

        // Set up interval for auto-refresh (30 seconds)
        const interval = setInterval(() => {
            fetchStatus();
            autoRefreshVideos();
        }, 30000); // Every 30 seconds for real-time feel

        return () => clearInterval(interval);
    }, []);

    const fetchVideos = async () => {
        try {
            console.log('📋 Fetching videos from API...');
            const response = await fetch('/api/videos');
            const result = await response.json();

            if (result.success) {
                const transformedVideos = result.videos.map((video: {
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
                    hashtags: string[];
                    thumbnailUrl?: string;
                    music?: { name: string; author: string };
                    platform: 'tiktok' | 'instagram' | 'youtube';
                    history: VideoHistory[];
                    growth: { views: number; likes: number; comments: number; shares: number };
                }) => ({
                    ...video,
                    growth: {
                        views: video.growth?.views || 0,
                        likes: video.growth?.likes || 0,
                        comments: video.growth?.comments || 0,
                        shares: video.growth?.shares || 0,
                    }
                }));

                console.log('📊 Transformed videos with thumbnail info:', transformedVideos.map((v: TrackedVideo) => ({
                    username: v.username,
                    platform: v.platform,
                    hasThumbnail: !!v.thumbnailUrl,
                    thumbnailUrl: v.thumbnailUrl ? v.thumbnailUrl.substring(0, 50) + '...' : null
                })));

                setTracked(transformedVideos);
                console.log(`✅ Loaded ${transformedVideos.length} videos from database`);
            } else {
                console.error('❌ Failed to fetch videos:', result.error);
            }
        } catch (err) {
            console.error('💥 Error fetching videos:', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        console.log('🎬 Form submission started:', { videoUrl, isLoading });

        if (!videoUrl.trim()) {
            console.warn('⚠️ Empty URL submitted');
            setError('Please enter a TikTok URL');
            return;
        }

        if (isLoading) {
            console.warn('⚠️ Request already in progress, ignoring duplicate submission');
            return;
        }

        console.log('🚀 Processing URL:', videoUrl.trim());
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            console.log('📡 Making API call to /api/scrape...');
            const startTime = Date.now();

            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: videoUrl.trim() }),
            });

            const requestTime = Date.now() - startTime;
            console.log(`⏱️ API request completed in ${requestTime}ms`);
            console.log('📞 Response details:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries())
            });

            if (!response.ok) {
                console.error('❌ HTTP error response:', {
                    status: response.status,
                    statusText: response.statusText
                });
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            console.log('🔄 Parsing JSON response...');
            const data = await response.json();

            console.log('📦 Received data:', {
                success: data.success,
                hasData: !!data.data,
                hasError: !!data.error,
                hasDebugInfo: !!data.debugInfo,
                dataKeys: Object.keys(data)
            });

            console.log('🔍 Full response data:', JSON.stringify(data, null, 2));

            if (data.success && data.data) {
                console.log('✅ Video data received successfully:', {
                    id: data.data.id,
                    username: data.data.username,
                    views: data.data.views,
                    likes: data.data.likes
                });
                setVideoUrl("");
                setSuccess(`✅ Successfully ${data.message || 'added'} video by @${data.data.username}!`);

                // Refresh the videos list
                await fetchVideos();
            } else {
                console.error('❌ API returned error:', {
                    error: data.error,
                    debugInfo: data.debugInfo
                });
                setError(data.error || 'Failed to scrape video');

                // Log debug info if available for troubleshooting
                if (data.debugInfo) {
                    console.log('🐛 Debug information:', data.debugInfo);
                }
            }
        } catch (err) {
            console.error('💥 Exception occurred during fetch:', err);
            console.error('Error details:', {
                name: err instanceof Error ? err.name : 'Unknown',
                message: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined
            });
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            console.log('🏁 Request completed, setting loading to false');
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

    // Helper function to open video URL in new tab
    const openVideoInNewTab = (url: string, event: React.MouseEvent) => {
        event.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
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

    // Custom tick formatter for simplified X-axis labels with exactly 3 ticks
    const formatXAxisTick = (tickItem: string) => {
        const date = new Date(tickItem);

        // Format based on selected time period
        switch (selectedTimePeriod) {
            case 'D':
                // Daily: show time to the minute (12:00 AM)
                return date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            case 'W':
            case 'M':
                // Weekly/Monthly: show day (JAN 7)
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
            case '3M':
            case '1Y':
            case 'ALL':
                // 3M and higher: show day + year (JAN 7, 2025)
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
            default:
                return date.toLocaleDateString();
        }
    };

    // Custom tick formatter for individual video charts
    const formatVideoXAxisTick = (tickItem: string) => {
        const date = new Date(tickItem);

        // Format based on selected video time period
        switch (selectedVideoTimePeriod) {
            case 'D':
                // Daily: show time to the minute (12:00 AM)
                return date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            case 'W':
            case 'M':
                // Weekly/Monthly: show day (JAN 7)
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
            case '3M':
            case '1Y':
            case 'ALL':
                // 3M and higher: show day + year (JAN 7, 2025)
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
            default:
                return date.toLocaleDateString();
        }
    };

    // Calculate interval for showing exactly 3 ticks
    const getTickInterval = (dataLength: number) => {
        if (dataLength <= 3) return 0; // Show all if 3 or fewer points
        return Math.floor((dataLength - 1) / 2); // Calculate interval to show start, middle, end
    };

    // Dynamic Y-axis domain for meaningful scaling
    const getYAxisDomain = (data: ChartDataPoint[]) => {
        if (data.length === 0) return [0, 100];

        const values = data.map(d => d.views);
        const min = Math.min(...values);
        const max = Math.max(...values);

        // Add some padding to the range
        const padding = (max - min) * 0.1;
        return [Math.max(0, min - padding), max + padding];
    };

    // Custom tooltip with hover details
    const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }>; label?: string }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload as ChartDataPoint;
            const date = new Date(label || '');

            return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-medium text-gray-900">
                        {date.toLocaleDateString()} {date.toLocaleTimeString()}
                    </p>
                    {showDelta ? (
                        <>
                            <p className="text-blue-600">
                                Delta: {formatNumber(data.delta)} views
                            </p>
                            <p className="text-gray-600 text-sm">
                                Total: {formatNumber(totalMetrics.totalViews)} views
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-blue-600">
                                Views: {formatNumber(data.views)}
                            </p>
                            {data.delta !== 0 && (
                                <p className="text-gray-600 text-sm">
                                    Change: {data.delta > 0 ? '+' : ''}{formatNumber(data.delta)}
                                </p>
                            )}
                        </>
                    )}
                </div>
            );
        }
        return null;
    };

    // Enhanced chart data processing with proper aggregate data across ALL videos
    const getChartData = (): ChartDataPoint[] => {
        if (tracked.length === 0) return [];

        // Filter out videos on daily cadence that haven't been scraped today for live charts
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const eligibleVideos = tracked.filter(video => {
            // Always include hourly videos 
            if (video.platform && video.scrapingCadence === 'hourly') {
                return true;
            }
            
            // For daily videos, only include if they've been scraped today
            if (video.platform && video.scrapingCadence === 'daily') {
                const lastScraped = new Date(video.lastUpdate);
                return lastScraped >= todayStart;
            }
            
            // Default: include video if cadence is unknown (backward compatibility)
            return true;
        });

        console.log(`📊 Chart data: Including ${eligibleVideos.length}/${tracked.length} videos (excluding stale daily-cadence videos)`);

        // Collect all unique timestamps from eligible videos
        const allTimestamps = new Set<string>();
        eligibleVideos.forEach(video => {
            if (video.history?.length) {
                video.history.forEach(point => {
                    allTimestamps.add(point.time);
                });
            }
        });

        // Convert to sorted array
        const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => 
            new Date(a).getTime() - new Date(b).getTime()
        );

        // Filter timestamps by selected time period
        let filteredTimestamps = sortedTimestamps;

        switch (selectedTimePeriod) {
            case 'D':
                filteredTimestamps = sortedTimestamps.filter(timestamp =>
                    new Date(timestamp) >= new Date(now.getTime() - 24 * 60 * 60 * 1000)
                );
                break;
            case 'W':
                filteredTimestamps = sortedTimestamps.filter(timestamp =>
                    new Date(timestamp) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                );
                break;
            case 'M':
                filteredTimestamps = sortedTimestamps.filter(timestamp =>
                    new Date(timestamp) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                );
                break;
            case '3M':
                filteredTimestamps = sortedTimestamps.filter(timestamp =>
                    new Date(timestamp) >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
                );
                break;
            case '1Y':
                filteredTimestamps = sortedTimestamps.filter(timestamp =>
                    new Date(timestamp) >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
                );
                break;
            case 'ALL':
            default:
                // Use all timestamps
                break;
        }

        // Build proper aggregate data by carrying forward last known values
        const aggregateData: ChartDataPoint[] = [];
        const lastKnownValues: { [videoId: string]: VideoHistory } = {};

        // Initialize with first known values for each eligible video
        eligibleVideos.forEach(video => {
            if (video.history?.length) {
                const firstPoint = video.history
                    .filter(h => filteredTimestamps.includes(h.time))
                    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())[0];
                
                if (firstPoint) {
                    lastKnownValues[video.id] = firstPoint;
                }
            }
        });

        // Process each timestamp and build aggregate
        filteredTimestamps.forEach(timestamp => {
            // Update last known values for videos that have data at this timestamp
            eligibleVideos.forEach(video => {
                const pointAtTime = video.history?.find(h => h.time === timestamp);
                if (pointAtTime) {
                    lastKnownValues[video.id] = pointAtTime;
                }
            });

            // Calculate aggregate values using last known values
            const aggregateViews = Object.values(lastKnownValues).reduce((sum, point) => sum + point.views, 0);

            // Only add if we have data for at least one video at this point
            if (Object.keys(lastKnownValues).length > 0) {
                aggregateData.push({
                    time: timestamp,
                    views: aggregateViews,
                    delta: 0, // Will be calculated below
                    originalTime: new Date(timestamp)
                });
            }
        });

        // Calculate delta values properly
        const chartData: ChartDataPoint[] = aggregateData.map((point, index) => {
            const previousPoint = index > 0 ? aggregateData[index - 1] : point;
            const delta = point.views - previousPoint.views;

            return {
                time: point.time,
                views: showDelta ? delta : point.views,
                delta,
                originalTime: new Date(point.time)
            };
        });

        return chartData;
    };

    const chartData = getChartData();
    const yAxisDomain = getYAxisDomain(chartData);

    // Enhanced chart data processing for individual video metrics
    const getVideoChartData = (metric: 'views' | 'likes' | 'comments' | 'shares', showDelta: boolean): ChartDataPoint[] => {
        if (!selectedVideo?.history?.length) return [];

        const history = selectedVideo.history;
        const now = new Date();
        let filteredData = [...history];

        // Filter by time period
        switch (selectedVideoTimePeriod) {
            case 'D':
                filteredData = history.filter(point =>
                    new Date(point.time) >= new Date(now.getTime() - 24 * 60 * 60 * 1000)
                );
                break;
            case 'W':
                filteredData = history.filter(point =>
                    new Date(point.time) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                );
                break;
            case 'M':
                filteredData = history.filter(point =>
                    new Date(point.time) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                );
                break;
            case '3M':
                filteredData = history.filter(point =>
                    new Date(point.time) >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
                );
                break;
            case '1Y':
                filteredData = history.filter(point =>
                    new Date(point.time) >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
                );
                break;
            case 'ALL':
            default:
                // Use all data
                break;
        }

        // Sort by time
        filteredData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        // Calculate delta values
        const chartData: ChartDataPoint[] = filteredData.map((point, index) => {
            const previousPoint = index > 0 ? filteredData[index - 1] : point;
            const currentValue = point[metric];
            const previousValue = previousPoint[metric];
            const delta = currentValue - previousValue;

            return {
                time: point.time,
                views: showDelta ? delta : currentValue,
                delta,
                originalTime: new Date(point.time)
            };
        });

        return chartData;
    };

    // Get chart data for each metric
    const viewsChartData = getVideoChartData('views', showViewsDelta);
    const likesChartData = getVideoChartData('likes', showLikesDelta);
    const commentsChartData = getVideoChartData('comments', showCommentsDelta);
    const sharesChartData = getVideoChartData('shares', showSharesDelta);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="max-w-7xl mx-auto">
                    {/* Main Header Row */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                                <Play className="w-4 h-4 text-white" />
                            </div>
                            <h1 className="text-xl font-semibold text-gray-900">Social Media Analytics</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                className="flex items-center gap-2 cursor-default select-none"
                                tabIndex={-1}
                                aria-disabled="true"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                {isRefreshing ? 'Refreshing...' : 'Refresh All'}
                            </Button>
                            <Input
                                placeholder="Paste TikTok or Instagram URL"
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                                disabled={isLoading}
                                className="w-80"
                            />
                            <Button onClick={handleSubmit} disabled={isLoading || !videoUrl}>
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Track Post"}
                            </Button>
                        </div>
                    </div>

                    {/* Status Indicators Row */}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                        <span className="bg-green-100 text-green-800 text-xs font-medium px-3 py-1.5 rounded-full">
                            ● {tracked.length} videos tracked
                        </span>
                        {cronStatus && (
                            <div className="flex items-center gap-3">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${cronStatus.cron.isHealthy
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                    }`}>
                                    <span className={`w-2 h-2 rounded-full ${cronStatus.cron.isHealthy ? 'bg-green-500' : 'bg-red-500'
                                        }`} />
                                    Cron {cronStatus.cron.isHealthy ? 'Active' : 'Inactive'}
                                </span>
                                {cronStatus.cron.minutesSinceLastActivity !== null && (
                                    <span className="text-xs text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                                        Last: {cronStatus.cron.minutesSinceLastActivity}m ago
                                    </span>
                                )}
                                {cronStatus.system.videosNeedingScrape > 0 && (
                                    <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-3 py-1.5 rounded-full">
                                        {cronStatus.system.videosNeedingScrape} pending
                                    </span>
                                )}
                            </div>
                        )}
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

                                {/* Enhanced Performance Chart */}
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-semibold">
                                                Performance Overview - Aggregate Stats ({tracked.length} videos)
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                {/* Time Period Selector */}
                                                <div className="flex border border-gray-200 rounded-md">
                                                    {(['D', 'W', 'M', '3M', '1Y', 'ALL'] as TimePeriod[]).map((period) => (
                                                        <button
                                                            key={period}
                                                            onClick={() => setSelectedTimePeriod(period)}
                                                            className={`px-3 py-1 text-xs font-medium transition-colors ${selectedTimePeriod === period
                                                                ? 'bg-blue-500 text-white'
                                                                : 'text-gray-600 hover:bg-gray-100'
                                                                } first:rounded-l-md last:rounded-r-md`}
                                                        >
                                                            {period}
                                                        </button>
                                                    ))}
                                                </div>
                                                {/* Delta Toggle */}
                                                <Button
                                                    variant={showDelta ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => setShowDelta(!showDelta)}
                                                    className="text-xs"
                                                >
                                                    {showDelta ? 'Total Views' : 'View Delta'}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="h-80">
                                            {chartData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                        <XAxis
                                                            dataKey="time"
                                                            tickFormatter={formatXAxisTick}
                                                            className="text-xs"
                                                            tick={{ fontSize: 10 }}
                                                            interval={getTickInterval(chartData.length)}
                                                        />
                                                        <YAxis
                                                            tickFormatter={formatNumber}
                                                            className="text-xs"
                                                            domain={yAxisDomain}
                                                        />
                                                        <Tooltip content={<CustomTooltip />} />
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
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-500">
                                                    <div className="text-center">
                                                        <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                        <p>No data available for selected period</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Real-time Update Indicator */}
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                                <span className="text-sm text-gray-600">
                                                    Auto-refreshing every 30 seconds • Last update: {new Date().toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                Cron: Every hour • Next scrape in ~{60 - new Date().getMinutes()}m
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </TabsContent>

                    {/* Videos Tab */}
                    <TabsContent value="videos">
                        {/* Cadence Info Card */}
                        <Card className="mb-4">
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                                        <span className="text-xs font-medium text-blue-600">i</span>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-medium text-gray-900 mb-1">Adaptive Scraping Cadence</h4>
                                        <div className="text-sm text-gray-600 space-y-1">
                                            <p>• <span className="text-blue-600 font-medium">Hourly</span>: New videos (first week) and high-performance videos (10k+ daily views)</p>
                                            <p>• <span className="text-orange-600 font-medium">Daily</span>: Older videos with low views - scraped at 12:00 AM EST</p>
                                            <p>• <span className="text-purple-600 font-medium">Testing</span>: Development mode - scraped every minute</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
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
                                                    <th className="text-left p-4 font-medium text-gray-900">Cadence</th>
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
                                                                {video.thumbnailUrl ? (
                                                                    <div 
                                                                        className="relative w-10 h-14 cursor-pointer hover:opacity-80 transition-opacity"
                                                                        onClick={(e) => openVideoInNewTab(video.url, e)}
                                                                        title="Click to open video in new tab"
                                                                    >
                                                                        <Image
                                                                            src={`/api/image-proxy?url=${encodeURIComponent(video.thumbnailUrl)}`}
                                                                            alt={`${video.username} thumbnail`}
                                                                            className="w-10 h-14 object-cover rounded bg-gray-200"
                                                                            width={40}
                                                                            height={56}
                                                                            onError={(e) => {
                                                                                console.log('❌ Thumbnail failed to load for:', video.username, video.thumbnailUrl);
                                                                                // Hide the image and show fallback
                                                                                const img = e.target as HTMLImageElement;
                                                                                img.style.display = 'none';
                                                                                const fallback = img.parentElement?.querySelector('.thumbnail-fallback') as HTMLElement;
                                                                                if (fallback) {
                                                                                    fallback.style.display = 'flex';
                                                                                }
                                                                            }}
                                                                            onLoad={() => {
                                                                                console.log('✅ Thumbnail loaded successfully for:', video.username);
                                                                            }}
                                                                        />
                                                                        {/* Fallback div for failed images */}
                                                                        <div className="thumbnail-fallback absolute inset-0 bg-gray-200 rounded flex items-center justify-center" style={{ display: 'none' }}>
                                                                            <Play className="w-4 h-4 text-gray-400" />
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div 
                                                                        className="w-10 h-14 bg-gray-200 rounded flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                                                                        onClick={(e) => openVideoInNewTab(video.url, e)}
                                                                        title="Click to open video in new tab"
                                                                    >
                                                                        <Play className="w-4 h-4 text-gray-400" />
                                                                    </div>
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
                                                                {video.platform === 'instagram' ? (
                                                                    <div className="w-5 h-5 bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 rounded flex items-center justify-center">
                                                                        <div className="w-3 h-3 bg-white rounded-full border border-gray-200"></div>
                                                                    </div>
                                                                ) : video.platform === 'youtube' ? (
                                                                    <div className="w-5 h-5 bg-red-600 rounded flex items-center justify-center">
                                                                        <Play className="w-3 h-3 text-white" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-5 h-5 bg-black rounded flex items-center justify-center">
                                                                        <Play className="w-3 h-3 text-white" />
                                                                    </div>
                                                                )}
                                                                <span className="text-sm font-medium">
                                                                    {video.platform === 'instagram' ? 'Instagram' : 
                                                                     video.platform === 'youtube' ? 'YouTube' : 'TikTok'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 font-medium">{formatNumber(video.views)}</td>
                                                        <td className="p-4 font-medium">{formatNumber(video.likes)}</td>
                                                        <td className="p-4 font-medium">{formatNumber(video.comments)}</td>
                                                        <td className="p-4">
                                                            {video.platform === 'instagram' || video.platform === 'youtube' ? 'N/A' : formatNumber(video.shares)}
                                                        </td>
                                                        <td className="p-4">{formatGrowth(video.growth.views)}</td>
                                                        <td className="p-4">
                                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                                                video.scrapingCadence === 'hourly' 
                                                                    ? 'bg-blue-100 text-blue-800' 
                                                                    : video.scrapingCadence === 'daily'
                                                                    ? 'bg-orange-100 text-orange-800'
                                                                    : 'bg-purple-100 text-purple-800'
                                                            }`}>
                                                                {video.scrapingCadence === 'hourly' ? '1H' : 
                                                                 video.scrapingCadence === 'daily' ? '1D' : 
                                                                 '1M'}
                                                            </span>
                                                        </td>
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
                                <div 
                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={(e) => openVideoInNewTab(selectedVideo.url, e)}
                                    title="Click to open video in new tab"
                                >
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
                                        <div className="text-3xl font-bold text-gray-900">
                                            {selectedVideo.platform === 'instagram' || selectedVideo.platform === 'youtube' ? 'N/A' : formatNumber(selectedVideo.shares)}
                                        </div>
                                        <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                                            <Share className="w-3 h-3" />
                                            Shares
                                        </div>
                                        <div className="text-xs mt-1">
                                            {selectedVideo.platform === 'instagram' || selectedVideo.platform === 'youtube' ? 'Not tracked' : formatGrowth(selectedVideo.growth.shares)}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Enhanced Individual Video Charts */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold">Performance Charts</h3>
                                    <div className="flex items-center gap-2">
                                        {/* Time Period Selector for Individual Charts */}
                                        <div className="flex border border-gray-200 rounded-md">
                                            {(['D', 'W', 'M', '3M', '1Y', 'ALL'] as TimePeriod[]).map((period) => (
                                                <button
                                                    key={period}
                                                    onClick={() => setSelectedVideoTimePeriod(period)}
                                                    className={`px-3 py-1 text-xs font-medium transition-colors ${selectedVideoTimePeriod === period
                                                        ? 'bg-blue-500 text-white'
                                                        : 'text-gray-600 hover:bg-gray-100'
                                                        } first:rounded-l-md last:rounded-r-md`}
                                                >
                                                    {period}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Enhanced Performance Charts */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Views Chart */}
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold">Views Over Time</h3>
                                            <Button
                                                variant={showViewsDelta ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setShowViewsDelta(!showViewsDelta)}
                                                className="text-xs"
                                            >
                                                {showViewsDelta ? 'Total' : 'Delta'}
                                            </Button>
                                        </div>
                                        <div className="h-64">
                                            {viewsChartData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={viewsChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                        <XAxis
                                                            dataKey="time"
                                                            tickFormatter={formatVideoXAxisTick}
                                                            className="text-xs"
                                                            tick={{ fontSize: 10 }}
                                                            interval={getTickInterval(viewsChartData.length)}
                                                        />
                                                        <YAxis
                                                            tickFormatter={formatNumber}
                                                            className="text-xs"
                                                            domain={getYAxisDomain(viewsChartData)}
                                                        />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="views"
                                                            stroke="#3b82f6"
                                                            strokeWidth={2}
                                                            dot={false}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-500">
                                                    <div className="text-center">
                                                        <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                        <p className="text-sm">No data for selected period</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Likes Chart */}
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold">Likes Over Time</h3>
                                            <Button
                                                variant={showLikesDelta ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setShowLikesDelta(!showLikesDelta)}
                                                className="text-xs"
                                            >
                                                {showLikesDelta ? 'Total' : 'Delta'}
                                            </Button>
                                        </div>
                                        <div className="h-64">
                                            {likesChartData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={likesChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                        <XAxis
                                                            dataKey="time"
                                                            tickFormatter={formatVideoXAxisTick}
                                                            className="text-xs"
                                                            tick={{ fontSize: 10 }}
                                                            interval={getTickInterval(likesChartData.length)}
                                                        />
                                                        <YAxis
                                                            tickFormatter={formatNumber}
                                                            className="text-xs"
                                                            domain={getYAxisDomain(likesChartData)}
                                                        />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="views"
                                                            stroke="#ef4444"
                                                            strokeWidth={2}
                                                            dot={false}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-500">
                                                    <div className="text-center">
                                                        <Heart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                        <p className="text-sm">No data for selected period</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Comments Chart */}
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold">Comments Over Time</h3>
                                            <Button
                                                variant={showCommentsDelta ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setShowCommentsDelta(!showCommentsDelta)}
                                                className="text-xs"
                                            >
                                                {showCommentsDelta ? 'Total' : 'Delta'}
                                            </Button>
                                        </div>
                                        <div className="h-64">
                                            {commentsChartData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={commentsChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                        <XAxis
                                                            dataKey="time"
                                                            tickFormatter={formatVideoXAxisTick}
                                                            className="text-xs"
                                                            tick={{ fontSize: 10 }}
                                                            interval={getTickInterval(commentsChartData.length)}
                                                        />
                                                        <YAxis
                                                            tickFormatter={formatNumber}
                                                            className="text-xs"
                                                            domain={getYAxisDomain(commentsChartData)}
                                                        />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="views"
                                                            stroke="#10b981"
                                                            strokeWidth={2}
                                                            dot={false}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-500">
                                                    <div className="text-center">
                                                        <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                        <p className="text-sm">No data for selected period</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Shares Chart */}
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold">Shares Over Time</h3>
                                            <Button
                                                variant={showSharesDelta ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setShowSharesDelta(!showSharesDelta)}
                                                className="text-xs"
                                            >
                                                {showSharesDelta ? 'Total' : 'Delta'}
                                            </Button>
                                        </div>
                                        <div className="h-64">
                                            {sharesChartData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={sharesChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                        <XAxis
                                                            dataKey="time"
                                                            tickFormatter={formatVideoXAxisTick}
                                                            className="text-xs"
                                                            tick={{ fontSize: 10 }}
                                                            interval={getTickInterval(sharesChartData.length)}
                                                        />
                                                        <YAxis
                                                            tickFormatter={formatNumber}
                                                            className="text-xs"
                                                            domain={getYAxisDomain(sharesChartData)}
                                                        />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="views"
                                                            stroke="#8b5cf6"
                                                            strokeWidth={2}
                                                            dot={false}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-500">
                                                    <div className="text-center">
                                                        <Share className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                        <p className="text-sm">No data for selected period</p>
                                                    </div>
                                                </div>
                                            )}
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