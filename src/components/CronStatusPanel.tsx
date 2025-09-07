"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, CheckCircle, Database, Activity } from "lucide-react";

interface CronStatusData {
    system: {
        timestamp: string;
        memoryUsage: number;
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
}

export default function CronStatusPanel() {
    const [statusData, setStatusData] = useState<CronStatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
