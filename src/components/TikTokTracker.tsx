"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Loader2, AlertCircle, CheckCircle, X, TrendingUp, TrendingDown, Eye, Heart, MessageCircle, Share, Play, LogOut, RefreshCw } from "lucide-react";
import VideoFilterSortBar, { SortCondition, FilterGroup } from './VideoFilterSortBar';
import { formatInTimeZone } from 'date-fns-tz';
import { TrackedAccountsTab } from '../components/TrackedAccountsTab';

interface VideoHistory {
    time: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
}

interface Tag {
    id: string;
    name: string;
    color?: string | null;
    description?: string | null;
}

interface TrackedVideo {
    id: string;
    url: string;
    username: string;
    description: string;
    posted: string;
    lastUpdate: string;
    status: string;
    views: number; // Period-specific views (delta when timeframe filter applied)
    likes: number; // Period-specific likes
    comments: number; // Period-specific comments
    shares: number; // Period-specific shares
    totalViews: number; // Always total current views
    totalLikes: number; // Always total current likes
    totalComments: number; // Always total current comments
    totalShares: number; // Always total current shares
    history: VideoHistory[];
    hashtags: string[];
    tags: Tag[]; // Video tags
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
    // Moderation fields
    lastModeratedAt?: string | null;
    moderatedBy?: string | null;
    threadsPlanted?: number;
    gotTopComment?: boolean;
    totalCommentsModerated?: number;
    newCommentsCount?: number; // New comments since last moderation
    commentsAtLastModeration?: number; // Comment count when last moderated
    phase1Notified?: boolean;
    phase2Notified?: boolean;
    currentPhase?: string;
    // Threads planted fields
    threadsPlantedNote?: string; // Free-form note about threads planted
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

type TimePeriod = 'D' | 'W' | 'M' | '3M' | '1Y' | 'ALL' | 'TODAY_EST';

// Helper function to get display label for time periods
const getTimePeriodLabel = (period: TimePeriod): string => {
    switch (period) {
        case 'TODAY_EST': return 'Today EST';
        case 'D': return 'D';
        case 'W': return 'W';
        case 'M': return 'M';
        case '3M': return '3M';
        case '1Y': return '1Y';
        case 'ALL': return 'ALL';
        default: return period;
    }
};

export default function TikTokTracker() {
    const [videoUrl, setVideoUrl] = useState("");
    const [tracked, setTracked] = useState<TrackedVideo[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<TrackedVideo | null>(null);
    const [activeTab, setActiveTab] = useState("overview");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
    const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
    // Unified time period for both chart and videos list
    const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>('W');
    const [showDelta, setShowDelta] = useState(true); // Default to delta view
    const [timeGranularity, setTimeGranularity] = useState<'hourly' | 'daily' | 'weekly'>('daily');
    
    // Custom date range state
    const [customDateRange, setCustomDateRange] = useState<[string, string] | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    
    // Global star state removed - no longer needed with simplified moderation
    
    // Chart drag selection state (TODO: implement drag selection)
    // const [isDragging, setIsDragging] = useState(false);
    // const [dragStart, setDragStart] = useState<number | null>(null);
    // const [dragEnd, setDragEnd] = useState<number | null>(null);

    // Individual video chart states (separate from overview)
    const [selectedVideoTimePeriod, setSelectedVideoTimePeriod] = useState<TimePeriod>('W');
    const [showViewsDelta, setShowViewsDelta] = useState(false);
    const [showLikesDelta, setShowLikesDelta] = useState(false);
    const [showCommentsDelta, setShowCommentsDelta] = useState(false);
    const [showSharesDelta, setShowSharesDelta] = useState(false);

    const [filters, setFilters] = useState<FilterGroup>({ operator: 'AND', conditions: [] });
    const [sorts, setSorts] = useState<SortCondition[]>([]);
    
    // Tags state
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [isLoadingTags, setIsLoadingTags] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [newTagColor, setNewTagColor] = useState("#3b82f6");
    const [showAddTagForm, setShowAddTagForm] = useState(false);
    const [refreshingVideos, setRefreshingVideos] = useState<Set<string>>(new Set());
    
    // Derive timeframe from selectedTimePeriod or custom date range for unified control
    const timeframe = React.useMemo<[string, string] | null>(() => {
        // Use custom date range if available
        if (customDateRange) {
            return customDateRange;
        }
        
        if (selectedTimePeriod === 'ALL') return null;
        
        const now = new Date();
        let startDate: Date;
        
        switch (selectedTimePeriod) {
            case 'D':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'W':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'M':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '3M':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case '1Y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            case 'TODAY_EST':
                // Get today at midnight EST
                const nowEST = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
                const midnightEST = new Date(nowEST.getFullYear(), nowEST.getMonth(), nowEST.getDate());
                // Convert back to UTC for consistent handling
                startDate = new Date(midnightEST.getTime() - (midnightEST.getTimezoneOffset() * 60000));
                break;
            default:
                return null;
        }
        
        return [startDate.toISOString(), now.toISOString()];
    }, [selectedTimePeriod, customDateRange]);

    // Handle chart point click to focus on specific day with hourly granularity
    const handleChartClick = (data: { activePayload?: Array<{ payload: { time: string } }> }) => {
        if (data && data.activePayload && data.activePayload[0]) {
            const clickedTime = data.activePayload[0].payload.time;
            const clickedDate = new Date(clickedTime);
            
            // Check if we're already in hourly granularity (clicking on an hour)
            if (timeGranularity === 'hourly') {
                // Create a 2-point graph: previous hour + selected hour
                const selectedHour = new Date(clickedDate);
                const previousHour = new Date(selectedHour.getTime() - 60 * 60 * 1000); // 1 hour before
                
                // Set date range from previous hour to end of selected hour
                const startTime = new Date(previousHour);
                startTime.setMinutes(0, 0, 0); // Start of previous hour
                const endTime = new Date(selectedHour);
                endTime.setMinutes(59, 59, 999); // End of selected hour
                
                setCustomDateRange([startTime.toISOString(), endTime.toISOString()]);
                // Keep hourly granularity to show the 2 data points
                setTimeGranularity('hourly');
            } else {
                // Original behavior: Set date range to the clicked day (24 hours) and switch to hourly
                const startOfDay = new Date(clickedDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(clickedDate);
                endOfDay.setHours(23, 59, 59, 999);
                
                setCustomDateRange([startOfDay.toISOString(), endOfDay.toISOString()]);
                setSelectedTimePeriod('D'); // Update period display
                setTimeGranularity('hourly'); // Switch to hourly view for day detail
            }
        }
    };

    // Logout function
    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            // Redirect to login page
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
            // Still redirect even if logout API fails
            window.location.href = '/login';
        }
    };

    // Tag management functions
    const fetchTags = async () => {
        setIsLoadingTags(true);
        try {
            const response = await fetch('/api/tags');
            const data = await response.json();
            if (data.success) {
                setAvailableTags(data.data);
            } else {
                console.error('Failed to fetch tags:', data.error);
            }
        } catch (error) {
            console.error('Error fetching tags:', error);
        } finally {
            setIsLoadingTags(false);
        }
    };

    const createTag = async () => {
        if (!newTagName.trim()) return;
        
        try {
            const response = await fetch('/api/tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: newTagName.trim(),
                    color: newTagColor,
                }),
            });
            
            const data = await response.json();
            if (data.success) {
                setAvailableTags(prev => [...prev, data.data]);
                setNewTagName("");
                setNewTagColor("#3b82f6");
                setShowAddTagForm(false);
                setSuccess(`Tag "${data.data.name}" created successfully`);
            } else {
                setError(data.error || 'Failed to create tag');
            }
        } catch (error) {
            console.error('Error creating tag:', error);
            setError('Failed to create tag');
        }
    };

    const addTagToVideo = async (videoId: string, tagId: string) => {
        try {
            const response = await fetch(`/api/videos/${videoId}/tags`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tagId }),
            });
            
            const data = await response.json();
            if (data.success) {
                // Update local state
                setTracked(prev => prev.map(video => 
                    video.id === videoId 
                        ? { ...video, tags: [...video.tags, data.data] }
                        : video
                ));
                setSuccess(`Tag added to video`);
            } else {
                setError(data.error || 'Failed to add tag to video');
            }
        } catch (error) {
            console.error('Error adding tag to video:', error);
            setError('Failed to add tag to video');
        }
    };

    const removeTagFromVideo = async (videoId: string, tagId: string) => {
        try {
            const response = await fetch(`/api/videos/${videoId}/tags?tagId=${tagId}`, {
                method: 'DELETE',
            });
            
            const data = await response.json();
            if (data.success) {
                // Update local state
                setTracked(prev => prev.map(video => 
                    video.id === videoId 
                        ? { ...video, tags: video.tags.filter(tag => tag.id !== tagId) }
                        : video
                ));
                setSuccess(`Tag removed from video`);
            } else {
                setError(data.error || 'Failed to remove tag from video');
            }
        } catch (error) {
            console.error('Error removing tag from video:', error);
            setError('Failed to remove tag from video');
        }
    };

    const deleteTag = async (tagId: string) => {
        if (!confirm('Are you sure you want to delete this tag? This will remove it from all videos.')) {
            return;
        }

        try {
            const response = await fetch(`/api/tags/${tagId}`, {
                method: 'DELETE',
            });
            
            const data = await response.json();
            if (data.success) {
                // Update local state - remove tag from availableTags and from all videos
                setAvailableTags(prev => prev.filter(tag => tag.id !== tagId));
                setTracked(prev => prev.map(video => ({
                    ...video,
                    tags: video.tags.filter(tag => tag.id !== tagId)
                })));
                setSuccess('Tag deleted successfully');
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || 'Failed to delete tag');
            }
        } catch (error) {
            console.error('Error deleting tag:', error);
            setError('Failed to delete tag');
        }
    };

    const handleManualRefresh = async (videoId: string) => {
        try {
            setRefreshingVideos(prev => new Set(prev).add(videoId));
            
            const response = await fetch(`/api/run-single-video`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ videoId }),
            });
            
            const data = await response.json();
            if (data.success) {
                // Refresh the videos list to show updated data
                await fetchVideos();
                setSuccess(`Video data refreshed successfully for @${data.video?.username || 'video'}`);
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || 'Failed to refresh video data');
                setTimeout(() => setError(''), 3000);
            }
        } catch (error) {
            console.error('Error refreshing video:', error);
            setError('Failed to refresh video data');
            setTimeout(() => setError(''), 3000);
        } finally {
            setRefreshingVideos(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoId);
                return newSet;
            });
        }
    };

    // TODO: Implement chart drag selection
    // const handleMouseDown = (data: any) => { ... };
    // const handleMouseMove = (data: any) => { ... };
    // const handleMouseUp = () => { ... };

    // Clear custom date range
    const clearCustomDateRange = () => {
        setCustomDateRange(null);
        setShowDatePicker(false);
    };

    // Define the mapping between display field names and database field names (memoized)
    const fieldMapping = useMemo(() => ({
        'Creator': 'username',
        'Platform': 'platform',
        'Views': 'currentViews',
        'TotalViews': 'currentViews', // Sort by current views for total views column
        'Likes': 'currentLikes',
        'Comments': 'currentComments',
        'Shares': 'currentShares',
        'Growth': 'currentViews', // Sort by views for growth
        'Posted': 'createdAt',
        'Cadence': 'scrapingCadence',
        'Status': 'status'
    }), []);

    // Local sorting function - no API calls needed (memoized for performance)
    const sortVideosLocally = useCallback((videosToSort: TrackedVideo[], sortField: string, sortOrder: 'asc' | 'desc', displayField?: string): TrackedVideo[] => {
        return [...videosToSort].sort((a, b) => {
            let aValue: string | number, bValue: string | number;
            
            // Map database fields to video object properties
            switch (sortField) {
                case 'username':
                    aValue = a.username.toLowerCase();
                    bValue = b.username.toLowerCase();
                    break;
                case 'platform':
                    aValue = a.platform.toLowerCase();
                    bValue = b.platform.toLowerCase();
                    break;
                case 'currentViews':
                    // If this is for TotalViews column, use totalViews; otherwise use period views
                    if (displayField === 'TotalViews') {
                        aValue = a.totalViews;
                        bValue = b.totalViews;
                    } else {
                        aValue = a.views;
                        bValue = b.views;
                    }
                    break;
                case 'currentLikes':
                    aValue = a.likes;
                    bValue = b.likes;
                    break;
                case 'currentComments':
                    aValue = a.comments;
                    bValue = b.comments;
                    break;
                case 'currentShares':
                    aValue = a.shares;
                    bValue = b.shares;
                    break;
                case 'createdAt':
                    aValue = new Date(a.posted).getTime();
                    bValue = new Date(b.posted).getTime();
                    break;
                case 'scrapingCadence':
                    aValue = a.scrapingCadence.toLowerCase();
                    bValue = b.scrapingCadence.toLowerCase();
                    break;
                case 'status':
                    aValue = a.status.toLowerCase();
                    bValue = b.status.toLowerCase();
                    break;
                default:
                    aValue = (a as unknown as Record<string, unknown>)[sortField] as string | number || '';
                    bValue = (b as unknown as Record<string, unknown>)[sortField] as string | number || '';
            }
            
            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, []); // Empty dependency array since this function doesn't depend on any state

    // Handle header click for sorting - now uses local sorting
    const handleHeaderClick = (field: string) => {
        const dbField = fieldMapping[field as keyof typeof fieldMapping] || field;
        const currentSort = sorts.find(sort => sort.field === dbField);
        
        let newSortOrder: 'asc' | 'desc';
        
        if (!currentSort || currentSort.order === 'desc') {
            // No current sort or currently descending, set to ascending
            newSortOrder = 'asc';
        } else {
            // Currently ascending, change to descending
            newSortOrder = 'desc';
        }

        // Update sorts state for UI indicators
        const newSorts: SortCondition[] = [{ field: dbField, order: newSortOrder }];
        setSorts(newSorts);
        
        // Sort locally - no API call needed!
        const sortedVideos = sortVideosLocally(tracked, dbField, newSortOrder, field);
        setTracked(sortedVideos);
    };

    // Get current sort state for a field
    const getSortState = (field: string): 'asc' | 'desc' | null => {
        const dbField = fieldMapping[field as keyof typeof fieldMapping] || field;
        const currentSort = sorts.find(sort => sort.field === dbField);
        return currentSort ? currentSort.order : null;
    };

    // Render sort icon for header
    const renderSortIcon = (field: string) => {
        const sortState = getSortState(field);
        if (sortState === 'asc') {
            return <TrendingUp className="w-4 h-4 ml-1 text-blue-600" />;
        } else if (sortState === 'desc') {
            return <TrendingDown className="w-4 h-4 ml-1 text-blue-600" />;
        }
        return <span className="w-4 h-4 ml-1"></span>; // Placeholder for consistent spacing
    };

    const fetchVideos = useCallback(async (customFilters: FilterGroup = filters, customSorts = sorts, customTimeframe: [string, string] | null = timeframe) => {
        console.log('fetchVideos called with:', { customFilters, customSorts, customTimeframe });
        try {
            console.log('📋 Fetching videos from API...');
            // Build query params for filters and sorts
            const params = new URLSearchParams();
            let filterGroup = { ...customFilters };
            // If timeframe is set, add it as a filter condition
            if (customTimeframe && customTimeframe[0] && customTimeframe[1]) {
                // Remove any existing timeframe condition
                filterGroup = {
                    ...filterGroup,
                    conditions: [
                        ...customFilters.conditions.filter(c => c.field !== 'timeframe'),
                        { field: 'timeframe', operator: 'is within', value: [customTimeframe[0], customTimeframe[1]] }
                    ]
                };
            }
            if (filterGroup.conditions.length > 0) {
                params.set('filter', encodeURIComponent(JSON.stringify(filterGroup)));
            }
            if (customSorts.length > 0) {
                params.set('sort', encodeURIComponent(JSON.stringify(customSorts)));
            }
            // Do NOT send separate timeframe param
            const apiUrl = `/api/videos${params.toString() ? `?${params.toString()}` : ''}`;
            console.log('➡️ API Request URL:', apiUrl);
            const response = await fetch(apiUrl);
            const result = await response.json();

            let timeframeStart: Date | null = null;
            let timeframeEnd: Date | null = null;
            if (customTimeframe && customTimeframe[0] && customTimeframe[1]) {
                timeframeStart = new Date(customTimeframe[0]);
                timeframeEnd = new Date(customTimeframe[1]);
            }

            if (result.success) {
                console.log('📦 Raw API response:', {
                    totalVideos: result.videos.length,
                    sampleVideo: result.videos[0] ? {
                        username: result.videos[0].username,
                        views: result.videos[0].views,
                        likes: result.videos[0].likes
                    } : null
                });
                
                // Removed verbose video stats logging to prevent console spam
                
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
                }) => {
                    // If timeframe filter is present, use delta logic
                    if (timeframeStart && timeframeEnd) {
                        const filteredHistory = video.history.filter(h => {
                            const t = new Date(h.time).getTime();
                            return t >= timeframeStart!.getTime() && t <= timeframeEnd!.getTime();
                        });
                        const sortedHistory = [...filteredHistory].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                        const start = sortedHistory[0];
                        const end = sortedHistory[sortedHistory.length - 1];
                        
                        // If insufficient history data, fall back to current values instead of null
                        if (!start || !end || start === end) {
                            // Only log this occasionally to avoid console spam
                            if (Math.random() < 0.1) { // Log 10% of the time
                                console.log(`⚠️ Insufficient history data for @${video.username} - using current values instead of delta`);
                            }
                            return {
                                ...video,
                                views: video.views, // Use current values from API
                                likes: video.likes,
                                comments: video.comments,
                                shares: video.shares,
                                growth: video.growth || { views: 0, likes: 0, comments: 0, shares: 0 },
                                history: filteredHistory,
                            };
                        }
                        
                        const views = end.views - start.views;
                        const likes = end.likes - start.likes;
                        const comments = end.comments - start.comments;
                        const shares = end.shares - start.shares;
                        const growth = {
                            views: start.views > 0 ? ((end.views - start.views) / start.views) * 100 : 0,
                            likes: start.likes > 0 ? ((end.likes - start.likes) / start.likes) * 100 : 0,
                            comments: start.comments > 0 ? ((end.comments - start.comments) / start.comments) * 100 : 0,
                            shares: start.shares > 0 ? ((end.shares - start.shares) / start.shares) * 100 : 0,
                        };
                        return {
                            ...video,
                            views,
                            likes,
                            comments,
                            shares,
                            growth,
                            history: filteredHistory,
                        };
                    } else {
                        // No timeframe filter: use the current values from the API response
                        // The API already provides the correct current values
                        const views = video.views;
                        const likes = video.likes;
                        const comments = video.comments;
                        const shares = video.shares;
                        const growth = video.growth || { views: 0, likes: 0, comments: 0, shares: 0 };
                        return {
                            ...video,
                            views,
                            likes,
                            comments,
                            shares,
                            growth,
                            history: video.history,
                        };
                    }
                }).filter(Boolean); // Remove nulls

                console.log('🔄 After frontend transformation:', {
                    totalVideos: transformedVideos.length,
                    sampleVideo: transformedVideos[0] ? {
                        username: transformedVideos[0].username,
                        views: transformedVideos[0].views,
                        likes: transformedVideos[0].likes
                    } : null
                });

                setTracked(transformedVideos);
                
                // Apply current sort order to the new data if any sort is active
                if (sorts.length > 0) {
                    const currentSort = sorts[0];
                    // Find the display field name for the current sort
                    const displayField = Object.keys(fieldMapping).find(key => 
                        fieldMapping[key as keyof typeof fieldMapping] === currentSort.field
                    );
                    const sortedVideos = sortVideosLocally(transformedVideos, currentSort.field, currentSort.order, displayField);
                    setTracked(sortedVideos);
                } else {
                    setTracked(transformedVideos);
                }
                
                console.log(`✅ Loaded ${transformedVideos.length} videos from database`);
            } else {
                console.error('❌ Failed to fetch videos:', result.error);
            }
        } catch (err) {
            console.error('💥 Error fetching videos:', err);
        }
    }, [filters, sorts, timeframe, fieldMapping, sortVideosLocally]);

    // Fetch videos from database on component mount
    useEffect(() => {
        fetchVideos();
    }, [fetchVideos]);

    // Fetch tags on component mount
    useEffect(() => {
        fetchTags();
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
                // Removed console log to prevent spam every 30 seconds
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
    }, [fetchVideos]);

    useEffect(() => {
        // Only fetch from API when filters or timeframe change, not sorts
        // We intentionally don't include 'sorts' in dependencies to prevent API calls on sort changes
        fetchVideos(filters, sorts, timeframe);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, timeframe, fetchVideos]);

    useEffect(() => {
        console.log('[TikTokTracker] sorts state changed:', sorts);
    }, [sorts]);

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
                
                // Try to get error details from response body
                try {
                    const errorData = await response.json();
                    console.error('📄 Error response body:', errorData);
                    console.error('🔍 Error details:', {
                        success: errorData.success,
                        error: errorData.error,
                        debugInfo: errorData.debugInfo,
                        platform: errorData.platform,
                        url: errorData.url,
                        timestamp: errorData.timestamp
                    });
                } catch (parseError) {
                    console.error('❌ Could not parse error response:', parseError);
                }
                
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

    // Handle "Just Moderated" - marks last moderated date
    const handleJustModerated = async (videoId: string) => {
        try {
            const response = await fetch(`/api/videos/${videoId}/moderation`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'mark_moderated',
                    moderatedBy: 'user'
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to mark as moderated');
            }

            console.log(`📝 Video ${videoId} marked as moderated`);

            // Update local state
            setTracked(prev => prev.map(video => 
                video.id === videoId
                    ? {
                        ...video,
                        lastModeratedAt: result.video.lastModeratedAt,
                        moderatedBy: result.video.moderatedBy,
                        newCommentsCount: 0, // Reset new comments count
                        commentsAtLastModeration: video.totalComments // Store current comment count as baseline
                    }
                    : video
            ));

        } catch (err) {
            console.error('💥 Error marking as moderated:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(`Failed to mark as moderated: ${errorMessage}`);
        }
    };


    // Handle top comment checkbox toggle
    const handleTopCommentToggle = async (videoId: string, checked: boolean) => {
        try {
            const response = await fetch(`/api/videos/${videoId}/moderation`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'update_star',
                    gotTopComment: checked
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to update top comment status');
            }

            console.log(`📝 Video ${videoId} top comment status: ${checked}`);

            // Update local state
            setTracked(prev => prev.map(video => 
                video.id === videoId
                    ? {
                        ...video,
                        gotTopComment: checked
                    }
                    : video
            ));

        } catch (err) {
            console.error('💥 Error updating top comment status:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(`Failed to update top comment status: ${errorMessage}`);
        }
    };

    // Handle phase change
    const handlePhaseChange = async (videoId: string, newPhase: string) => {
        try {
            const response = await fetch(`/api/videos/${videoId}/moderation`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'update_phase',
                    currentPhase: newPhase
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to update phase');
            }

            console.log(`📝 Video ${videoId} phase updated to: ${newPhase}`);

            // Update local state
            setTracked(prev => prev.map(video => 
                video.id === videoId
                    ? {
                        ...video,
                        currentPhase: newPhase
                    }
                    : video
            ));

        } catch (err) {
            console.error('💥 Error updating phase:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(`Failed to update phase: ${errorMessage}`);
        }
    };

    // handleModerationUpdate function removed - no longer needed with simplified moderation

    // Helper function to open video URL in new tab
    const openVideoInNewTab = (url: string, event: React.MouseEvent) => {
        event.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
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

    // X-axis formatting based on time granularity
    const formatXAxisTick = (value: string) => {
        const date = new Date(value);
        
        switch (timeGranularity) {
            case 'hourly':
                return `${String(date.getHours()).padStart(2, '0')}:00`;
            case 'daily':
                return `${date.getMonth() + 1}/${date.getDate()}`;
            case 'weekly':
                return `${date.getMonth() + 1}/${date.getDate()}`;
            default:
                return value;
        }
    };

    // Get tick interval based on data length and granularity
    const getTickInterval = (dataLength: number) => {
        if (timeGranularity === 'hourly') {
            return dataLength > 24 ? Math.floor(dataLength / 12) : 0; // Show ~12 ticks for hourly
        } else if (timeGranularity === 'daily') {
            return dataLength > 14 ? Math.floor(dataLength / 7) : 0; // Show ~7 ticks for daily
        } else {
            return dataLength > 8 ? Math.floor(dataLength / 4) : 0; // Show ~4 ticks for weekly
        }
    };

    // Y-axis domain calculation
    const getYAxisDomain = (data: ChartDataPoint[]) => {
        if (data.length === 0) return [0, 100];
        
        const values = data.map(d => d.views);
        const min = Math.min(...values);
        const max = Math.max(...values);
        
        if (showDelta) {
            // For delta view, include negative values
            const padding = (max - min) * 0.1;
            return [min - padding, max + padding];
        } else {
            // For absolute values, start from 0
            return [0, max * 1.1];
        }
    };

    // Custom tick formatter for individual video charts
    const formatVideoXAxisTick = (tickItem: string) => {
        // Format in EST
        return formatInTimeZone(new Date(tickItem), 'America/New_York', 'MMM d, h aa');
    };

    // Custom tooltip with hover details
    const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }>; label?: string }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload as ChartDataPoint;
            // Format in EST
            const dateStr = formatInTimeZone(label || '', 'America/New_York', 'MMM d, yyyy h:mm aa zzz');

            return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-medium text-gray-900">
                        {dateStr}
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

    // Helper function to group data points by time granularity
    const aggregateDataByGranularity = (data: ChartDataPoint[], granularity: 'hourly' | 'daily' | 'weekly'): ChartDataPoint[] => {
        if (data.length === 0) return [];

        const grouped = new Map<string, ChartDataPoint[]>();
        
        data.forEach(point => {
            const date = new Date(point.time);
            let key: string;
            
            switch (granularity) {
                case 'hourly':
                    // Group by hour (YYYY-MM-DD HH:00)
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                    break;
                case 'daily':
                    // Group by day (YYYY-MM-DD)
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    break;
                case 'weekly':
                    // Group by week (start of week)
                    const weekStart = new Date(date);
                    const day = weekStart.getDay();
                    const diff = weekStart.getDate() - day;
                    weekStart.setDate(diff);
                    weekStart.setHours(0, 0, 0, 0);
                    key = weekStart.toISOString().split('T')[0];
                    break;
                default:
                    key = point.time;
            }
            
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(point);
        });

        // Aggregate the grouped data points
        const aggregated: ChartDataPoint[] = [];
        
        for (const [timeKey, points] of grouped.entries()) {
            // For each time bucket, take the latest values (most recent data point)
            const sortedPoints = points.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
            const latestPoint = sortedPoints[0];
            
            // Use the time key as the display time and the latest point's data
            // Don't preserve delta - it will be recalculated based on aggregated points
            aggregated.push({
                time: timeKey,
                views: latestPoint.views,
                delta: 0, // Will be recalculated
                originalTime: new Date(timeKey)
            });
        }
        
        // Sort by time and recalculate deltas based on aggregated data
        const sortedAggregated = aggregated.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        
        // Recalculate deltas for aggregated data
        return sortedAggregated.map((point, index) => {
            if (index > 0) {
                const previousPoint = sortedAggregated[index - 1];
                const delta = Math.max(0, point.views - previousPoint.views); // Ensure non-negative
                return {
                    ...point,
                    delta
                };
            }
            return {
                ...point,
                delta: 0 // First point has no delta
            };
        });
    };

    // Enhanced chart data processing with proper aggregate data across ALL videos
    const getChartData = (): { chartData: ChartDataPoint[], filteredVideoCount: number } => {
        if (tracked.length === 0) return { chartData: [], filteredVideoCount: 0 };

        let timeframeStart: Date | null = null;
        let timeframeEnd: Date | null = null;
        if (timeframe && timeframe[0] && timeframe[1]) {
            timeframeStart = new Date(timeframe[0]);
            timeframeEnd = new Date(timeframe[1]);
        }

        // Filter videos based on timeframe and cadence
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Check if this is the daily view (D preset or TODAY_EST) - only show hourly cadence videos
        const isDailyView = selectedTimePeriod === 'D' || selectedTimePeriod === 'TODAY_EST';
        
        const eligibleVideos = tracked.filter(video => {
            // For daily view (D preset), ONLY include hourly cadence videos
            if (isDailyView) {
                return video.platform && video.scrapingCadence === 'hourly';
            }
            
            // For longer timeframes, use the original logic
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

        // CRITICAL: Filter out videos with insufficient data points for meaningful charts
        const videosWithSufficientData = eligibleVideos.filter(video => {
            if (!video.history || video.history.length < 2) {
                return false; // Need at least 2 data points for a meaningful chart
            }
            
            // For daily view, ensure we have at least 2 data points in the timeframe
            if (timeframeStart && timeframeEnd) {
                const dataPointsInTimeframe = video.history.filter(point => {
                    const pointTime = new Date(point.time).getTime();
                    return pointTime >= timeframeStart.getTime() && pointTime <= timeframeEnd.getTime();
                });
                return dataPointsInTimeframe.length >= 2;
            }
            
            return true; // No timeframe filter, use all data
        });

        // Collect all unique timestamps from videos with sufficient data
        const allTimestamps = new Set<string>();
        videosWithSufficientData.forEach(video => {
            if (video.history?.length) {
                video.history.forEach(point => {
                    allTimestamps.add(point.time);
                });
            }
        });

        // Convert to sorted array
        let sortedTimestamps = Array.from(allTimestamps).sort((a, b) => 
            new Date(a).getTime() - new Date(b).getTime()
        );

        // If timeframe filter is present, filter timestamps to only those within the range
        if (timeframeStart && timeframeEnd) {
            sortedTimestamps = sortedTimestamps.filter(ts => {
                const t = new Date(ts).getTime();
                return t >= timeframeStart!.getTime() && t <= timeframeEnd!.getTime();
            });
        }

        // Filter timestamps by selected time period (if no timeframe filter)
        let filteredTimestamps = sortedTimestamps;
        if (!timeframeStart || !timeframeEnd) {
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
                case 'TODAY_EST':
                    // Filter timestamps from midnight EST today to now
                    const nowEST = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
                    const midnightEST = new Date(nowEST.getFullYear(), nowEST.getMonth(), nowEST.getDate());
                    const midnightUTC = new Date(midnightEST.getTime() - (midnightEST.getTimezoneOffset() * 60000));
                    filteredTimestamps = sortedTimestamps.filter(timestamp =>
                        new Date(timestamp) >= midnightUTC
                    );
                    break;
                case 'ALL':
                default:
                    // Use all timestamps
                    break;
            }
        }

        // Build proper aggregate data by carrying forward last known values
        const aggregateData: ChartDataPoint[] = [];
        const lastKnownValues: { [videoId: string]: VideoHistory } = {};

        // Initialize with first known values for each video with sufficient data
        videosWithSufficientData.forEach(video => {
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
            videosWithSufficientData.forEach(video => {
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

        // First, create raw chart data with absolute values
        const rawChartData: ChartDataPoint[] = aggregateData.map((point) => ({
            time: point.time,
            views: point.views,
            delta: 0, // Will be calculated after aggregation
            originalTime: new Date(point.time)
        }));

        // Apply time granularity aggregation (this will recalculate deltas)
        const aggregatedData = aggregateDataByGranularity(rawChartData, timeGranularity);
        
        // Apply delta mode if requested
        const finalChartData = aggregatedData.map((point, index) => {
            if (showDelta && index > 0) {
                // Use the delta calculated by aggregateDataByGranularity
                return {
                    ...point,
                    views: point.delta // Show delta instead of absolute views
                };
            } else if (showDelta && index === 0) {
                // First point in delta mode should show 0
                return {
                    ...point,
                    views: 0,
                    delta: 0
                };
            }
            return point; // Absolute mode - show actual views
        });

        return { chartData: finalChartData, filteredVideoCount: videosWithSufficientData.length };
    };

    // Get videos with sufficient data points for totals calculation (same filtering as chart)
    const getFilteredVideosForTotals = (): TrackedVideo[] => {
        if (tracked.length === 0) return [];

        let timeframeStart: Date | null = null;
        let timeframeEnd: Date | null = null;
        if (timeframe && timeframe[0] && timeframe[1]) {
            timeframeStart = new Date(timeframe[0]);
            timeframeEnd = new Date(timeframe[1]);
        }

        // Filter videos based on timeframe and cadence (same logic as getChartData)
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Check if this is the daily view (D preset or TODAY_EST) - only show hourly cadence videos
        const isDailyView = selectedTimePeriod === 'D' || selectedTimePeriod === 'TODAY_EST';
        
        const eligibleVideos = tracked.filter(video => {
            // For daily view (D preset), ONLY include hourly cadence videos
            if (isDailyView) {
                return video.platform && video.scrapingCadence === 'hourly';
            }
            
            // For longer timeframes, use the original logic
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

        // CRITICAL: Filter out videos with insufficient data points for meaningful totals
        const videosWithSufficientData = eligibleVideos.filter(video => {
            if (!video.history || video.history.length < 2) {
                return false; // Need at least 2 data points for meaningful totals
            }
            
            // For daily view, ensure we have at least 2 data points in the timeframe
            if (timeframeStart && timeframeEnd) {
                const dataPointsInTimeframe = video.history.filter(point => {
                    const pointTime = new Date(point.time).getTime();
                    return pointTime >= timeframeStart.getTime() && pointTime <= timeframeEnd.getTime();
                });
                return dataPointsInTimeframe.length >= 2;
            }
            
            return true; // No timeframe filter, use all data
        });

        return videosWithSufficientData;
    };

    const { chartData, filteredVideoCount: oldFilteredVideoCount } = getChartData();
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
            const delta = Math.max(0, currentValue - previousValue); // Ensure non-negative

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
    
    // Use the filtered video count from the chart data
    const filteredVideosForTotals = getFilteredVideosForTotals();
    
    const totalMetrics = {
        videos: selectedTimePeriod === 'D' ? oldFilteredVideoCount : filteredVideosForTotals.length,
        // Show period views when timeframe filter is active, total views otherwise
        totalViews: filteredVideosForTotals.reduce((sum, v) => sum + v.views, 0),
        totalLikes: filteredVideosForTotals.reduce((sum, v) => sum + v.likes, 0),
        totalComments: filteredVideosForTotals.reduce((sum, v) => sum + v.comments, 0),
        totalShares: filteredVideosForTotals.reduce((sum, v) => sum + v.shares, 0),
        avgGrowth: filteredVideosForTotals.length > 0 ? filteredVideosForTotals.reduce((sum, v) => sum + v.growth.views, 0) / filteredVideosForTotals.length : 0,
        totalThreads: filteredVideosForTotals.reduce((sum, v) => sum + (v.threadsPlanted || 0), 0),
        totalCommentsModerated: filteredVideosForTotals.reduce((sum, v) => sum + (v.totalCommentsModerated || 0), 0),
        moderatedVideos: filteredVideosForTotals.filter(v => v.lastModeratedAt).length,
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="max-w-7xl mx-auto">
                    {/* Main Header Row */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                                    <Play className="w-4 h-4 text-white" />
                                </div>
                                <h1 className="text-xl font-semibold text-gray-900">Social Media Analytics</h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                onClick={handleLogout}
                                className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Logout"
                            >
                                <LogOut className="w-4 h-4" />
                                Logout
                            </Button>
                            <Button
                                variant="outline"
                                className="flex items-center gap-2"
                                onClick={async () => {
                                    // Test the first video with 0 stats
                                    const firstZeroStatsVideo = tracked.find(v => v.views === 0 && v.likes === 0 && v.comments === 0);
                                    if (!firstZeroStatsVideo) {
                                        console.log('❌ No videos with 0 stats found to test');
                                        return;
                                    }
                                    
                                    console.log(`🧪 TESTING SINGLE VIDEO: @${firstZeroStatsVideo.username} (${firstZeroStatsVideo.platform})`);
                                    console.log(`📊 Current stats: views=${firstZeroStatsVideo.views}, likes=${firstZeroStatsVideo.likes}, comments=${firstZeroStatsVideo.comments}`);
                                    
                                    try {
                                        const response = await fetch('/api/test-single-video', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ videoId: firstZeroStatsVideo.id })
                                        });
                                        const result = await response.json();
                                        
                                        console.log('🧪 SINGLE VIDEO TEST RESULT:', result);
                                        
                                        if (result.success) {
                                            console.log('📊 TikHub API Response Details:');
                                            console.log(`  Success: ${result.tikHubResult.success}`);
                                            console.log(`  Has Data: ${result.tikHubResult.hasData}`);
                                            console.log(`  Error: ${result.tikHubResult.error}`);
                                            console.log(`  Duration: ${result.tikHubResult.duration}ms`);
                                            console.log(`  Raw Data:`, result.tikHubResult.rawData);
                                            console.log(`  Debug Info:`, result.tikHubResult.debugInfo);
                                        } else {
                                            console.error('❌ Single video test failed:', result.error);
                                        }
                                    } catch (error) {
                                        console.error('💥 Single video test error:', error);
                                    }
                                }}
                                disabled={isLoading}
                            >
                                🧪 Test Single Video
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

                    {/* Tags Management Section */}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-gray-900">Tags Management</h3>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAddTagForm(!showAddTagForm)}
                            >
                                {showAddTagForm ? 'Cancel' : '+ New Tag'}
                            </Button>
                        </div>
                        
                        {showAddTagForm && (
                            <div className="mb-4 p-3 bg-white rounded border">
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="Tag name"
                                        value={newTagName}
                                        onChange={(e) => setNewTagName(e.target.value)}
                                        className="flex-1"
                                    />
                                    <input
                                        type="color"
                                        value={newTagColor}
                                        onChange={(e) => setNewTagColor(e.target.value)}
                                        className="w-10 h-8 rounded border cursor-pointer"
                                        title="Choose tag color"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={createTag}
                                        disabled={!newTagName.trim()}
                                    >
                                        Create
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex flex-wrap gap-2">
                            {isLoadingTags ? (
                                <span className="text-sm text-gray-500">Loading tags...</span>
                            ) : availableTags.length === 0 ? (
                                <span className="text-sm text-gray-500">No tags created yet. Create your first tag above!</span>
                            ) : (
                                availableTags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full border"
                                        style={{
                                            backgroundColor: tag.color ? `${tag.color}20` : '#f3f4f6',
                                            borderColor: tag.color || '#d1d5db',
                                            color: tag.color || '#374151'
                                        }}
                                        title={tag.description || tag.name}
                                    >
                                        {tag.name}
                                        <span className="text-xs text-gray-500 ml-1">
                                            ({tracked.filter(video => video.tags.some(vTag => vTag.id === tag.id)).length})
                                        </span>
                                        <button
                                            onClick={() => deleteTag(tag.id)}
                                            className="ml-1 hover:bg-red-100 rounded-full p-0.5 text-red-600 hover:text-red-800"
                                            title="Delete tag"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))
                            )}
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
                <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="overview">
                    <TabsList className="mb-6">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="tracked-accounts">Tracked Accounts</TabsTrigger>
                        {selectedVideo && (
                            <TabsTrigger value="insights">Insights - @{selectedVideo.username}</TabsTrigger>
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
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalViews)}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Eye className="w-3 h-3" />
                                                {timeframe ? 'Period Views' : 'Total Views'}
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
                                    <Card>
                                        <CardContent className="p-4">
                                            <div className="text-2xl font-bold text-gray-900">{formatNumber(totalMetrics.totalThreads)}</div>
                                            <div className="text-sm text-gray-500">Threads Started</div>
                                            <div className="text-xs mt-1 text-purple-600">{totalMetrics.moderatedVideos} videos with threads</div>
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
                                                {/* Time Granularity Selector */}
                                                <div className="flex border border-gray-200 rounded-md">
                                                    {(['hourly', 'daily', 'weekly'] as const).map((granularity) => (
                                                        <button
                                                            key={granularity}
                                                            onClick={() => setTimeGranularity(granularity)}
                                                            className={`px-3 py-1 text-xs font-medium transition-colors ${timeGranularity === granularity
                                                                ? 'bg-green-500 text-white'
                                                                : 'text-gray-600 hover:bg-gray-100'
                                                                } first:rounded-l-md last:rounded-r-md`}
                                                        >
                                                            {granularity.charAt(0).toUpperCase() + granularity.slice(1)}
                                                        </button>
                                                    ))}
                                                </div>
                                                {/* Unified Time Period Selector (controls both chart and videos) */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-600">Time Period:</span>
                                                        <div className="flex border border-gray-200 rounded-md">
                                                            {(['TODAY_EST', 'D', 'W', 'M', '3M', '1Y', 'ALL'] as TimePeriod[]).map((period) => (
                                                                <button
                                                                    key={period}
                                                                    onClick={() => {
                                                                        setSelectedTimePeriod(period);
                                                                        setCustomDateRange(null); // Clear custom range when selecting preset
                                                                    }}
                                                                    className={`px-3 py-1 text-xs font-medium transition-colors ${selectedTimePeriod === period && !customDateRange
                                                                        ? 'bg-blue-500 text-white'
                                                                        : 'text-gray-600 hover:bg-gray-100'
                                                                        } first:rounded-l-md last:rounded-r-md`}
                                                                    >
                                                                    {getTimePeriodLabel(period)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Custom Date Range Controls - Moved Below */}
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-600">Custom Range:</span>
                                                        <button
                                                            onClick={() => setShowDatePicker(!showDatePicker)}
                                                            className={`px-3 py-1 text-xs font-medium border rounded-md transition-colors ${customDateRange
                                                                ? 'bg-green-500 text-white border-green-500'
                                                                : 'text-gray-600 border-gray-200 hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            📅 Select Dates
                                                        </button>
                                                        {customDateRange && (
                                                            <button
                                                                onClick={clearCustomDateRange}
                                                                className="px-2 py-1 text-xs text-gray-500 hover:text-red-500"
                                                                title="Clear custom date range"
                                                            >
                                                                ✕ Clear
                                                            </button>
                                                        )}
                                                        {customDateRange && (
                                                            <span className="text-xs text-gray-500">
                                                                {new Date(customDateRange[0]).toLocaleDateString()} - {new Date(customDateRange[1]).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {/* Date Picker Panel */}
                                                {showDatePicker && (
                                                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-xs text-gray-600">From:</label>
                                                                <input
                                                                    type="datetime-local"
                                                                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                                                                    value={customDateRange ? new Date(customDateRange[0]).toISOString().slice(0, 16) : ''}
                                                                    onChange={(e) => {
                                                                        const startDate = e.target.value ? new Date(e.target.value).toISOString() : '';
                                                                        if (startDate && customDateRange) {
                                                                            setCustomDateRange([startDate, customDateRange[1]]);
                                                                        } else if (startDate) {
                                                                            const endDate = new Date(startDate);
                                                                            endDate.setDate(endDate.getDate() + 1);
                                                                            setCustomDateRange([startDate, endDate.toISOString()]);
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-xs text-gray-600">To:</label>
                                                                <input
                                                                    type="datetime-local"
                                                                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                                                                    value={customDateRange ? new Date(customDateRange[1]).toISOString().slice(0, 16) : ''}
                                                                    onChange={(e) => {
                                                                        const endDate = e.target.value ? new Date(e.target.value).toISOString() : '';
                                                                        if (endDate && customDateRange) {
                                                                            setCustomDateRange([customDateRange[0], endDate]);
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    const now = new Date();
                                                                    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                                                                    setCustomDateRange([yesterday.toISOString(), now.toISOString()]);
                                                                }}
                                                                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                                            >
                                                                Last 24h
                                                            </button>
                                                        </div>
                                                        {customDateRange && (
                                                            <div className="mt-2 text-xs text-gray-600">
                                                                Selected: {new Date(customDateRange[0]).toLocaleDateString()} - {new Date(customDateRange[1]).toLocaleDateString()}
                                                                {(() => {
                                                                    // Check if this is a 2-hour range (2-point graph mode)
                                                                    const start = new Date(customDateRange[0]);
                                                                    const end = new Date(customDateRange[1]);
                                                                    const hoursDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                                                                    
                                                                    if (hoursDiff <= 2 && timeGranularity === 'hourly') {
                                                                        return (
                                                                            <span className="ml-2 text-green-600 font-medium">
                                                                                (2-point hour view: {start.getHours()}:00-{end.getHours()}:00)
                                                                            </span>
                                                                        );
                                                                    } else if (timeGranularity === 'hourly') {
                                                                        return (
                                                                            <span className="ml-2 text-blue-600 cursor-pointer hover:underline" onClick={() => setShowDatePicker(false)}>
                                                                                Click specific hours to create 2-point graphs
                                                                            </span>
                                                                        );
                                                                    } else {
                                                                        return (
                                                                            <span className="ml-2 text-blue-600 cursor-pointer hover:underline" onClick={() => setShowDatePicker(false)}>
                                                                                Click chart points to focus on specific days, or drag on chart to select range
                                                                            </span>
                                                                        );
                                                                    }
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
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
                                                    <AreaChart 
                                                        data={chartData} 
                                                        margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                                                        onClick={handleChartClick}
                                                    >
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

                                {/* Videos Section */}
                                <div className="space-y-4">
                                    <h2 className="text-xl font-semibold text-gray-900">All Videos</h2>
                                    
                                    {/* Cadence Info Card */}
                                    <Card>
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

                                    {/* Quick Tags Filter */}
                                    {availableTags.length > 0 && (
                                        <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                                            <h4 className="text-sm font-medium text-gray-900 mb-2">Quick Filter by Tags:</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {availableTags.map((tag) => {
                                                    const isActive = filters.conditions.some(condition => 
                                                        condition.field === 'tags' && 
                                                        condition.operator === 'contains' && 
                                                        condition.value === tag.name
                                                    );
                                                    return (
                                                        <button
                                                            key={tag.id}
                                                            onClick={() => {
                                                                if (isActive) {
                                                                    // Remove tag filter
                                                                    const newFilters = {
                                                                        ...filters,
                                                                        conditions: filters.conditions.filter(condition => 
                                                                            !(condition.field === 'tags' && 
                                                                              condition.operator === 'contains' && 
                                                                              condition.value === tag.name)
                                                                        )
                                                                    };
                                                                    setFilters(newFilters);
                                                                } else {
                                                                    // Add tag filter
                                                                    const newFilters = {
                                                                        ...filters,
                                                                        conditions: [
                                                                            ...filters.conditions,
                                                                            {
                                                                                field: 'tags',
                                                                                operator: 'contains',
                                                                                value: tag.name
                                                                            }
                                                                        ]
                                                                    };
                                                                    setFilters(newFilters);
                                                                }
                                                            }}
                                                            className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full border transition-colors ${
                                                                isActive 
                                                                    ? 'bg-blue-100 border-blue-300 text-blue-800' 
                                                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                            style={isActive ? {} : {
                                                                backgroundColor: tag.color ? `${tag.color}10` : undefined,
                                                                borderColor: tag.color || undefined,
                                                                color: tag.color || undefined
                                                            }}
                                                            title={tag.description || `Filter by ${tag.name}`}
                                                        >
                                                            {tag.name}
                                                            <span className="text-xs text-gray-500 ml-1">
                                                                ({tracked.filter(video => video.tags.some(vTag => vTag.id === tag.id)).length})
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Filter/Sort Bar (timeframe controlled by main time period selector) */}
                                    <VideoFilterSortBar
                                        filters={filters}
                                        sorts={sorts}
                                        timeframe={timeframe}
                                        onChange={(newFilters, newSorts) => {
                                            // Check if filters changed (should trigger API call)
                                            const filtersChanged = JSON.stringify(filters) !== JSON.stringify(newFilters);
                                            // Check if sorts changed (should only update local state)
                                            const sortsChanged = JSON.stringify(sorts) !== JSON.stringify(newSorts);
                                            
                                            if (filtersChanged) {
                                                setFilters(newFilters);
                                                // Filters changed - fetch new data from API
                                                fetchVideos(newFilters, newSorts, timeframe);
                                            }
                                            
                                            if (sortsChanged && !filtersChanged) {
                                                setSorts(newSorts);
                                                // Only sorts changed - apply local sorting
                                                if (newSorts.length > 0) {
                                                    const sort = newSorts[0];
                                                    const displayField = Object.keys(fieldMapping).find(key => 
                                                        fieldMapping[key as keyof typeof fieldMapping] === sort.field
                                                    );
                                                    const sortedVideos = sortVideosLocally(tracked, sort.field, sort.order, displayField);
                                                    setTracked(sortedVideos);
                                                }
                                            }
                                            
                                            if (filtersChanged && sortsChanged) {
                                                // Both changed - API call will handle both
                                                setSorts(newSorts);
                                            }
                                        }}
                                    />
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
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Creator')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Creator
                                                                        {renderSortIcon('Creator')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Platform')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Platform
                                                                        {renderSortIcon('Platform')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Views')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        {timeframe ? 'Period Views' : 'Views'}
                                                                        {renderSortIcon('Views')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('TotalViews')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Total Views
                                                                        {renderSortIcon('TotalViews')}
                                                                    </div>
                                                                </th>
                                                                <th className="text-left p-4 font-medium text-gray-900">Data Age</th>
                                                                <th className="text-left p-4 font-medium text-gray-900">Refresh</th>
                                                                {/* Moderation columns moved here for better visibility */}
                                                                <th className="text-left p-4 font-medium text-gray-900">New Comments</th>
                                                                <th className="text-left p-4 font-medium text-gray-900">Threads Planted Note</th>
                                                                <th className="text-left p-4 font-medium text-gray-900">Check for top comment</th>
                                                                <th className="text-left p-4 font-medium text-gray-900">Phase</th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Likes')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Likes
                                                                        {renderSortIcon('Likes')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Comments')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Comments
                                                                        {renderSortIcon('Comments')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Shares')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Shares
                                                                        {renderSortIcon('Shares')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Growth')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Growth
                                                                        {renderSortIcon('Growth')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Posted')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Posted
                                                                        {renderSortIcon('Posted')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Cadence')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Cadence
                                                                        {renderSortIcon('Cadence')}
                                                                    </div>
                                                                </th>
                                                                <th 
                                                                    className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                                                    onClick={() => handleHeaderClick('Status')}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Status
                                                                        {renderSortIcon('Status')}
                                                                    </div>
                                                                </th>
                                                                <th className="text-left p-4 font-medium text-gray-900">Tags</th>
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
                                                                            {video.thumbnailUrl && typeof video.thumbnailUrl === 'string' && video.thumbnailUrl.trim() !== '' && video.thumbnailUrl.startsWith('http') ? (
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
                                                                                            // Suppress error log to avoid console spam
                                                                                            // Hide the image and show fallback
                                                                                            const img = e.target as HTMLImageElement;
                                                                                            img.style.display = 'none';
                                                                                            const fallback = img.parentElement?.querySelector('.thumbnail-fallback') as HTMLElement;
                                                                                            if (fallback) {
                                                                                                fallback.style.display = 'flex';
                                                                                            }
                                                                                        }}
                                                                                        onLoad={() => {
                                                                                            // Thumbnail loaded successfully
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
                                                                    <td className="p-4 font-medium text-gray-600">{formatNumber(video.totalViews)}</td>
                                                                    {/* Data Age column */}
                                                                    <td className="p-4 text-sm">
                                                                        {(() => {
                                                                            if (!video.lastUpdate) return 'Unknown';
                                                                            const now = new Date();
                                                                            const lastUpdate = new Date(video.lastUpdate);
                                                                            const minutesAgo = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60));
                                                                            
                                                                            if (minutesAgo < 1) return 'Just now';
                                                                            if (minutesAgo < 60) return `${minutesAgo}m ago`;
                                                                            
                                                                            const hoursAgo = Math.floor(minutesAgo / 60);
                                                                            if (hoursAgo < 24) return `${hoursAgo}h ago`;
                                                                            
                                                                            const daysAgo = Math.floor(hoursAgo / 24);
                                                                            return `${daysAgo}d ago`;
                                                                        })()}
                                                                    </td>
                                                                    {/* Manual Refresh column */}
                                                                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={async (e) => {
                                                                                e.stopPropagation();
                                                                                await handleManualRefresh(video.id);
                                                                            }}
                                                                            disabled={refreshingVideos.has(video.id)}
                                                                            className="text-xs"
                                                                            title="Manually refresh this video's data"
                                                                        >
                                                                            {refreshingVideos.has(video.id) ? (
                                                                                <>
                                                                                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                                                    Refreshing...
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <RefreshCw className="w-3 h-3 mr-1" />
                                                                                    Refresh
                                                                                </>
                                                                            )}
                                                                        </Button>
                                                                    </td>
                                                                    {/* Just Moderated column */}
                                                                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                                                        <div className="flex flex-col gap-1">
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                title={video.newCommentsCount && video.newCommentsCount > 0 ? 
                                                                                    `Click to mark ${video.newCommentsCount} new comment${video.newCommentsCount !== 1 ? 's' : ''} as moderated` : 
                                                                                    'Mark as just moderated'}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleJustModerated(video.id);
                                                                                }}
                                                                                className={`text-xs py-1 px-2 h-6 relative transition-all duration-200 ${
                                                                                    video.newCommentsCount && video.newCommentsCount > 0 ? 
                                                                                        'bg-red-50 hover:bg-red-100 text-red-800 border-red-200 shadow-sm' :
                                                                                        !video.lastModeratedAt ? 'bg-green-50 hover:bg-green-100 text-green-800' :
                                                                                        (() => {
                                                                                            const hoursSinceModeration = video.lastModeratedAt ? 
                                                                                                (new Date().getTime() - new Date(video.lastModeratedAt).getTime()) / (1000 * 60 * 60) : 0;
                                                                                            if (hoursSinceModeration < 2) return 'bg-green-50 hover:bg-green-100 text-green-800';
                                                                                            if (hoursSinceModeration < 6) return 'bg-yellow-50 hover:bg-yellow-100 text-yellow-800';
                                                                                            return 'bg-red-50 hover:bg-red-100 text-red-800';
                                                                                        })()
                                                                                }`}
                                                                            >
                                                                                {video.newCommentsCount && video.newCommentsCount > 0 ? (
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-sm"></div>
                                                                                        <span className="font-medium">{video.newCommentsCount} new comment{video.newCommentsCount !== 1 ? 's' : ''}</span>
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="font-medium">Just Moderated</span>
                                                                                )}
                                                                            </Button>
                                                                            {video.lastModeratedAt && (
                                                                                <div className="text-xs text-gray-500">
                                                                                    Last moderated at {new Date(video.lastModeratedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    {/* Threads Planted Note column */}
                                                                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                                                        <div className="flex items-center">
                                                                            <input
                                                                                type="text"
                                                                                value={video.threadsPlantedNote || ''}
                                                                                onChange={(e) => {
                                                                                    setTracked(prev => prev.map(v => 
                                                                                        v.id === video.id
                                                                                            ? { ...v, threadsPlantedNote: e.target.value }
                                                                                            : v
                                                                                    ));
                                                                                }}
                                                                                onBlur={async () => {
                                                                                    try {
                                                                                        const response = await fetch(`/api/videos/${video.id}/moderation`, {
                                                                                            method: 'PATCH',
                                                                                            headers: { 'Content-Type': 'application/json' },
                                                                                            body: JSON.stringify({
                                                                                                action: 'update_threads_note',
                                                                                                threadsPlantedNote: video.threadsPlantedNote || ''
                                                                                            }),
                                                                                        });
                                                                                        if (!response.ok) throw new Error('Failed to update note');
                                                                                    } catch (err) {
                                                                                        console.error('Error updating threads note:', err);
                                                                                    }
                                                                                }}
                                                                                className="w-32 px-2 py-1 text-xs border rounded"
                                                                                placeholder="Threads note..."
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                    {/* Check for top comment column */}
                                                                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                                                        <div className="flex items-center justify-center">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={video.gotTopComment || false}
                                                                                onChange={(e) => {
                                                                                    handleTopCommentToggle(video.id, e.target.checked);
                                                                                }}
                                                                                className="w-4 h-4"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                    {/* Phase column */}
                                                                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                                                        <select
                                                                            value={video.currentPhase || 'PHS 0'}
                                                                            onChange={(e) => handlePhaseChange(video.id, e.target.value)}
                                                                            className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer ${
                                                                                video.currentPhase === 'PHS 0' 
                                                                                    ? 'bg-gray-100 text-gray-800'
                                                                                    : video.currentPhase === 'In PHS 1'
                                                                                    ? 'bg-blue-100 text-blue-800'
                                                                                    : video.currentPhase === 'PHS 1 Complete'
                                                                                    ? 'bg-green-100 text-green-800'
                                                                                    : video.currentPhase === 'In PHS 2'
                                                                                    ? 'bg-orange-100 text-orange-800'
                                                                                    : video.currentPhase === 'PHS 2 Complete'
                                                                                    ? 'bg-purple-100 text-purple-800'
                                                                                    : 'bg-gray-100 text-gray-800'
                                                                            }`}
                                                                        >
                                                                            <option value="PHS 0">PHS 0</option>
                                                                            <option value="In PHS 1">In PHS 1</option>
                                                                            <option value="PHS 1 Complete">PHS 1 Complete</option>
                                                                            <option value="In PHS 2">In PHS 2</option>
                                                                            <option value="PHS 2 Complete">PHS 2 Complete</option>
                                                                        </select>
                                                                    </td>
                                                                    <td className="p-4 font-medium">{formatNumber(video.likes)}</td>
                                                                    <td className="p-4 font-medium">{formatNumber(video.comments)}</td>
                                                                    <td className="p-4">
                                                                        {video.platform === 'instagram' || video.platform === 'youtube' ? 'N/A' : formatNumber(video.shares)}
                                                                    </td>
                                                                    <td className="p-4">{formatGrowth(video.growth.views)}</td>
                                                                    <td className="p-4">{new Date(video.posted).toLocaleDateString()}</td>
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
                                                                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                                                            video.status === 'active'
                                                                                ? 'bg-green-100 text-green-800'
                                                                                : video.status === 'error'
                                                                                ? 'bg-red-100 text-red-800'
                                                                                : 'bg-yellow-100 text-yellow-800'
                                                                        }`}>
                                                                            {video.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-4">
                                                                        <div className="flex flex-wrap gap-1 max-w-32">
                                                                            {video.tags.map((tag) => (
                                                                                <span
                                                                                    key={tag.id}
                                                                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border"
                                                                                    style={{
                                                                                        backgroundColor: tag.color ? `${tag.color}20` : '#f3f4f6',
                                                                                        borderColor: tag.color || '#d1d5db',
                                                                                        color: tag.color || '#374151'
                                                                                    }}
                                                                                    title={tag.description || tag.name}
                                                                                >
                                                                                    {tag.name}
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            removeTagFromVideo(video.id, tag.id);
                                                                                        }}
                                                                                        className="ml-1 hover:bg-red-100 rounded-full p-0.5"
                                                                                        title="Remove tag"
                                                                                    >
                                                                                        <X className="w-3 h-3" />
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                            <select
                                                                                className="text-xs border rounded px-2 py-1 bg-white"
                                                                                value=""
                                                                                onChange={(e) => {
                                                                                    if (e.target.value) {
                                                                                        addTagToVideo(video.id, e.target.value);
                                                                                        e.target.value = "";
                                                                                    }
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <option value="">+ Add tag</option>
                                                                                {availableTags
                                                                                    .filter(tag => !video.tags.some(vTag => vTag.id === tag.id))
                                                                                    .map(tag => (
                                                                                        <option key={tag.id} value={tag.id}>
                                                                                            {tag.name}
                                                                                        </option>
                                                                                    ))
                                                                                }
                                                                            </select>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-4">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleDeleteVideo(video.id, e);
                                                                            }}
                                                                            disabled={deletingVideoId === video.id}
                                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                        >
                                                                            {deletingVideoId === video.id ? (
                                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                            ) : (
                                                                                <X className="w-3 h-3" />
                                                                            )}
                                                                        </Button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            </>
                        )}
                    </TabsContent>


                    {/* Tracked Accounts Tab */}
                    <TabsContent value="tracked-accounts">
                        <TrackedAccountsTab />
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
                                <Button variant="outline" onClick={() => setActiveTab("overview")}>
                                    ← Back to Overview
                                </Button>
                            </div>

                            {/* Current Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card>
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-bold text-gray-900">{formatNumber(selectedVideo.views)}</div>
                                        <div className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                                            <Eye className="w-3 h-3" />
                                            {timeframe ? 'Period Views' : 'Views'}
                                        </div>
                                        {timeframe && (
                                            <div className="text-xs text-gray-400 mt-1">
                                                Total: {formatNumber(selectedVideo.totalViews)}
                                            </div>
                                        )}
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
                                            {(['TODAY_EST', 'D', 'W', 'M', '3M', '1Y', 'ALL'] as TimePeriod[]).map((period) => (
                                                <button
                                                    key={period}
                                                    onClick={() => setSelectedVideoTimePeriod(period)}
                                                    className={`px-3 py-1 text-xs font-medium transition-colors ${selectedVideoTimePeriod === period
                                                        ? 'bg-blue-500 text-white'
                                                        : 'text-gray-600 hover:bg-gray-100'
                                                        } first:rounded-l-md last:rounded-r-md`}
                                                >
                                                    {getTimePeriodLabel(period)}
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

            {/* Moderation form modal removed - using simplified buttons now */}
        </div>
    );
} 