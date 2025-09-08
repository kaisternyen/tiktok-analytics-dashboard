"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, CheckCircle, Database, Activity } from "lucide-react";

interface PendingVideo {
    id: string;
    username: string;
    platform: string;
    url: string;
    lastScrapedAt: string;
    scrapingCadence: string;
    minutesAgo: number;
    currentStats: {
        views: number;
        likes: number;
        comments: number;
        shares: number;
    };
}

interface PendingAccount {
    id: string;
    username: string;
    platform: string;
    lastChecked: string;
    minutesAgo: number;
}

interface CronStatusData {
    system: {
        timestamp: string;
        memoryUsage: number;
        videosNeedingScrape: number;
    };
    database: {
        status: string;
        latency: string;
    };
    statistics: {
        totalVideos: number;
        totalAccounts: number;
        hourlyVideos: number;
        dailyVideos: number;
    };
    issues: {
        overdueHourlyVideos: number;
        overdueDailyVideos: number;
        overdueAccounts: number;
        totalOverdue: number;
    };
    oldestPending: {
        username: string;
        platform: string;
        scrapingCadence: string;
        minutesAgo: number;
    } | null;
    pendingVideos: {
        hourly: PendingVideo[];
        daily: PendingVideo[];
    };
    pendingAccounts: PendingAccount[];
}

export default function CronStatusPanel() {
    const [statusData, setStatusData] = useState<CronStatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [runningVideos, setRunningVideos] = useState<Set<string>>(new Set());
    const [videoResults, setVideoResults] = useState<Map<string, { success: boolean; error?: string; video?: { newStats?: { views: number; likes: number; comments: number; shares: number } } }>>(new Map());

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/cron-status');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            setStatusData(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch status');
            console.error('Failed to fetch cron status:', err);
        } finally {
            setLoading(false);
        }
    };

    const runSingleVideo = async (videoId: string) => {
        try {
            setRunningVideos(prev => new Set(prev).add(videoId));
            setVideoResults(prev => new Map(prev).set(videoId, { success: false })); // Clear previous result

            const response = await fetch('/api/run-single-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId })
            });

            const result = await response.json();
            setVideoResults(prev => new Map(prev).set(videoId, result));

            if (result.success) {
                // Refresh status to update pending list
                await fetchStatus();
            }
        } catch (err) {
            setVideoResults(prev => new Map(prev).set(videoId, {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error'
            }));
        } finally {
            setRunningVideos(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoId);
                return newSet;
            });
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !statusData) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Loading status...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span>Error: {error}</span>
                    </div>
                    <Button onClick={fetchStatus} className="mt-4" variant="outline">
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (!statusData) return null;

    const hasIssues = statusData.issues.totalOverdue > 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Cron Status</h2>
                <Button onClick={fetchStatus} variant="outline" size="sm" disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-blue-600" />
                            <h3 className="font-medium">System</h3>
                        </div>
                        <div className="text-sm space-y-1">
                            <div>Memory: {statusData.system.memoryUsage}MB</div>
                            <div>Updated: {new Date(statusData.system.timestamp).toLocaleTimeString()}</div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Database className="w-4 h-4 text-green-600" />
                            <h3 className="font-medium">Database</h3>
                        </div>
                        <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2">
                                {statusData.database.status === 'connected' ? (
                                    <CheckCircle className="w-3 h-3 text-green-500" />
                                ) : (
                                    <AlertCircle className="w-3 h-3 text-red-500" />
                                )}
                                {statusData.database.status}
                            </div>
                            <div>Latency: {statusData.database.latency}</div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-purple-600" />
                            <h3 className="font-medium">Statistics</h3>
                        </div>
                        <div className="text-sm space-y-1">
                            <div>Videos: {statusData.statistics.totalVideos}</div>
                            <div>Accounts: {statusData.statistics.totalAccounts}</div>
                            <div>Hourly: {statusData.statistics.hourlyVideos} | Daily: {statusData.statistics.dailyVideos}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {hasIssues && (
                <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="w-4 h-4 text-orange-600" />
                            <h3 className="font-medium text-orange-900">Pending Jobs ({statusData.issues.totalOverdue})</h3>
                        </div>
                        <div className="text-sm space-y-1 text-orange-800">
                            {statusData.issues.overdueHourlyVideos > 0 && (
                                <div>Overdue hourly videos: {statusData.issues.overdueHourlyVideos}</div>
                            )}
                            {statusData.issues.overdueDailyVideos > 0 && (
                                <div>Overdue daily videos: {statusData.issues.overdueDailyVideos}</div>
                            )}
                            {statusData.issues.overdueAccounts > 0 && (
                                <div>Overdue accounts: {statusData.issues.overdueAccounts}</div>
                            )}
                        </div>
                        {statusData.oldestPending && (
                            <div className="mt-3 p-2 bg-orange-100 rounded text-sm">
                                <div className="font-medium">Oldest pending:</div>
                                <div>{statusData.oldestPending.platform}:{statusData.oldestPending.username}</div>
                                <div className="text-orange-600">{statusData.oldestPending.minutesAgo} minutes ago</div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Detailed Pending Videos List */}
            {(statusData.pendingVideos.hourly.length > 0 || statusData.pendingVideos.daily.length > 0) && (
                <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <AlertCircle className="w-4 h-4 text-blue-600" />
                            <h3 className="font-medium text-blue-900">Pending Videos ({statusData.pendingVideos.hourly.length + statusData.pendingVideos.daily.length})</h3>
                        </div>
                        
                        {/* Hourly Videos */}
                        {statusData.pendingVideos.hourly.length > 0 && (
                            <div className="mb-4">
                                <h4 className="font-medium text-blue-800 mb-2">Hourly Videos ({statusData.pendingVideos.hourly.length})</h4>
                                <div className="space-y-2">
                                    {statusData.pendingVideos.hourly.map((video) => (
                                        <div key={video.id} className="bg-white p-3 rounded border border-blue-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">@{video.username}</span>
                                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{video.platform}</span>
                                                    <span className="text-xs text-gray-600">{video.minutesAgo}m ago</span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => runSingleVideo(video.id)}
                                                    disabled={runningVideos.has(video.id)}
                                                    className="text-xs"
                                                >
                                                    {runningVideos.has(video.id) ? (
                                                        <>
                                                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                                            Running...
                                                        </>
                                                    ) : (
                                                        'Run Now'
                                                    )}
                                                </Button>
                                            </div>
                                            
                                            {/* Current Stats */}
                                            <div className="text-xs text-gray-600 mb-2">
                                                Current: {video.currentStats.views} views, {video.currentStats.likes} likes, {video.currentStats.comments} comments
                                            </div>
                                            
                                            {/* Result Display */}
                                            {videoResults.has(video.id) && videoResults.get(video.id) && (
                                                <div className={`text-xs p-2 rounded ${
                                                    videoResults.get(video.id)?.success 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {videoResults.get(video.id)?.success ? (
                                                        <div>
                                                            ✅ Success! New stats: {videoResults.get(video.id)?.video?.newStats?.views} views, {videoResults.get(video.id)?.video?.newStats?.likes} likes
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            ❌ Error: {videoResults.get(video.id)?.error || 'Unknown error'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Daily Videos */}
                        {statusData.pendingVideos.daily.length > 0 && (
                            <div>
                                <h4 className="font-medium text-blue-800 mb-2">Daily Videos ({statusData.pendingVideos.daily.length})</h4>
                                <div className="space-y-2">
                                    {statusData.pendingVideos.daily.map((video) => (
                                        <div key={video.id} className="bg-white p-3 rounded border border-blue-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">@{video.username}</span>
                                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{video.platform}</span>
                                                    <span className="text-xs text-gray-600">{video.minutesAgo}m ago</span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => runSingleVideo(video.id)}
                                                    disabled={runningVideos.has(video.id)}
                                                    className="text-xs"
                                                >
                                                    {runningVideos.has(video.id) ? (
                                                        <>
                                                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                                            Running...
                                                        </>
                                                    ) : (
                                                        'Run Now'
                                                    )}
                                                </Button>
                                            </div>
                                            
                                            {/* Current Stats */}
                                            <div className="text-xs text-gray-600 mb-2">
                                                Current: {video.currentStats.views} views, {video.currentStats.likes} likes, {video.currentStats.comments} comments
                                            </div>
                                            
                                            {/* Result Display */}
                                            {videoResults.has(video.id) && videoResults.get(video.id) && (
                                                <div className={`text-xs p-2 rounded ${
                                                    videoResults.get(video.id)?.success 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {videoResults.get(video.id)?.success ? (
                                                        <div>
                                                            ✅ Success! New stats: {videoResults.get(video.id)?.video?.newStats?.views} views, {videoResults.get(video.id)?.video?.newStats?.likes} likes
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            ❌ Error: {videoResults.get(video.id)?.error || 'Unknown error'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {!hasIssues && (
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-green-800 font-medium">All jobs up to date</span>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
