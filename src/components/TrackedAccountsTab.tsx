import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Users, Edit, Play, Trash2, ChevronDown } from 'lucide-react';
import Image from 'next/image';

interface TrackedAccount {
    id: string;
    username: string;
    platform: string;
    accountType: 'all' | 'keyword';
    keyword?: string;
    isActive: boolean;
    lastChecked: string;
    createdAt: string;
    lastVideoId?: string;
    lastPostAdded?: string;  // Track when new posts were actually added
    trackedPosts?: number;
    totalPosts?: number;
    pfpUrl?: string;
    apiStatus?: string;
    apiError?: string;
    displayName?: string;
    lookedUpUsername?: string;
    followers?: number;
    profileUrl?: string;
    apiErrorMessage?: string;
}

interface AddAccountForm {
    username: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    accountType: 'all' | 'keyword';
    keyword: string;
    includeExistingContent: boolean;
}

interface PendingVideo {
    id: string;
    username: string;
    platform: string;
    url: string;
    lastScrapedAt: string;
    scrapingCadence: string;
    minutesAgo: number;
    reason: string;
    currentStats: {
        views: number;
        likes: number;
        comments: number;
        shares: number;
    };
}

interface CronStatus {
    system: { timestamp: string; memoryUsage: number; videosNeedingScrape: number };
    database: { status: string; latency: string };
    issues: { overdueHourlyVideos: number; overdueDailyVideos: number; overdueAccounts: number; totalOverdue: number };
    oldestPending?: { username: string; platform: string; minutesAgo: number };
    pendingVideos: {
        hourly: PendingVideo[];
        daily: PendingVideo[];
    };
    pendingAccounts: Array<{
        id: string;
        username: string;
        platform: string;
        lastChecked: string;
        minutesAgo: number;
        reason: string;
    }>;
}

// Add a helper to extract username/handle from a pasted URL
function extractHandle(input: string, platform: string): string {
    // Remove @ symbol if present
    let handle = input.startsWith('@') ? input.slice(1) : input;
    
    // For TikTok, extract handle from full URL if needed
    if (platform === 'tiktok' && handle.includes('tiktok.com')) {
        const match = handle.match(/tiktok\.com\/@([^/?]+)/);
        if (match) {
            handle = match[1];
        }
    }
    
    // For Instagram, extract handle from full URL if needed
    if (platform === 'instagram' && handle.includes('instagram.com')) {
        const match = handle.match(/instagram\.com\/([^/?]+)/);
        if (match) {
            handle = match[1];
        }
    }
    
    return handle;
}

// Helper function to format "time ago"
function formatTimeAgo(dateString?: string): string {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return `${diffInWeeks}w ago`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
}

// Restore getPlatformIcon
const getPlatformIcon = (platform: string) => {
    switch (platform) {
        case 'tiktok':
            return <div className="w-5 h-5 bg-black rounded flex items-center justify-center"><Play className="w-3 h-3 text-white" /></div>;
        case 'instagram':
            return <div className="w-5 h-5 bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 rounded flex items-center justify-center"><div className="w-3 h-3 bg-white rounded-full border border-gray-200"></div></div>;
        case 'youtube':
            return <div className="w-5 h-5 bg-red-600 rounded flex items-center justify-center"><Play className="w-3 h-3 text-white" /></div>;
        default:
            return null;
    }
};

export function TrackedAccountsTab() {
    const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingAccount, setEditingAccount] = useState<TrackedAccount | null>(null);
    const [checkingAccounts, setCheckingAccounts] = useState(false);
    const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
    const [showCronDropdown, setShowCronDropdown] = useState(false);
    const [manualTriggerStatus, setManualTriggerStatus] = useState<string>('');
    const [runningVideos, setRunningVideos] = useState<Set<string>>(new Set());
    const [refreshingStatus, setRefreshingStatus] = useState(false);
    const [clearingPending, setClearingPending] = useState(false);
    const [formData, setFormData] = useState<AddAccountForm>({
        username: '',
        platform: 'tiktok',
        accountType: 'all',
        keyword: '',
        includeExistingContent: false
    });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchCronStatus = async () => {
        try {
            setRefreshingStatus(true);
            const response = await fetch('/api/cron-status');
            if (response.ok) {
                const data = await response.json();
                setCronStatus(data);
            }
        } catch (err) {
            console.error('Failed to fetch cron status:', err);
        } finally {
            setRefreshingStatus(false);
        }
    };

    // Auto-refresh cron status every 30 seconds to keep pending list accurate
    useEffect(() => {
        if (showCronDropdown) {
            fetchCronStatus(); // Fetch immediately when dropdown opens
            const interval = setInterval(fetchCronStatus, 30000); // Then every 30 seconds
            return () => clearInterval(interval);
        }
    }, [showCronDropdown]);

    const clearPending = async () => {
        try {
            setClearingPending(true);
            const response = await fetch('/api/clear-pending', { method: 'POST' });
            if (response.ok) {
                // Immediately refresh the status to show cleared pending list
                await fetchCronStatus();
                setManualTriggerStatus('✅ Pending list cleared successfully');
                setTimeout(() => setManualTriggerStatus(''), 3000);
            } else {
                setManualTriggerStatus('❌ Failed to clear pending list');
                setTimeout(() => setManualTriggerStatus(''), 3000);
            }
        } catch (err) {
            console.error('Failed to clear pending:', err);
            setManualTriggerStatus('❌ Error clearing pending list');
            setTimeout(() => setManualTriggerStatus(''), 3000);
        } finally {
            setClearingPending(false);
        }
    };

    const runSingleVideo = async (videoId: string) => {
        try {
            setRunningVideos(prev => new Set(prev).add(videoId));

            const response = await fetch('/api/run-single-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId })
            });

            const result = await response.json();

            if (result.success) {
                await fetchCronStatus();
            }
        } catch (err) {
            console.error('Failed to run single video:', err);
        } finally {
            setRunningVideos(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoId);
                return newSet;
            });
        }
    };

    // Fetch tracked accounts
    const fetchAccounts = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/tracked-accounts');
            const data = await response.json();
            
            if (data.success) {
                // Validate and clean the account data before setting state
                const validatedAccounts = data.accounts.map((account: TrackedAccount) => {
                    // Ensure required fields have default values
                    const cleanAccount = {
                        ...account,
                        trackedPosts: typeof account.trackedPosts === 'number' ? account.trackedPosts : 0,
                        totalPosts: typeof account.totalPosts === 'number' ? account.totalPosts : 0,
                        displayName: account.displayName || `@${account.username}`,
                        lastChecked: account.lastChecked || new Date().toISOString()
                    };
                    
                    // Log any suspicious data in development
                    if (process.env.NODE_ENV === 'development') {
                        if (cleanAccount.trackedPosts > cleanAccount.totalPosts && cleanAccount.totalPosts > 0) {
                            console.warn(`⚠️ Account ${cleanAccount.platform}:${cleanAccount.username} has more tracked (${cleanAccount.trackedPosts}) than total (${cleanAccount.totalPosts}) posts`);
                        }
                        if (cleanAccount.trackedPosts === 0 && cleanAccount.lastPostAdded) {
                            console.warn(`⚠️ Account ${cleanAccount.platform}:${cleanAccount.username} shows 0 tracked posts but has lastPostAdded: ${cleanAccount.lastPostAdded}`);
                        }
                    }
                    
                    return cleanAccount;
                });
                
                setAccounts(validatedAccounts);
                
                // Log summary in development
                if (process.env.NODE_ENV === 'development') {
                    console.log('📊 Fetched accounts summary:', {
                        total: validatedAccounts.length,
                        byPlatform: validatedAccounts.reduce((acc: Record<string, number>, account: TrackedAccount) => {
                            acc[account.platform] = (acc[account.platform] || 0) + 1;
                            return acc;
                        }, {}),
                        totalTrackedPosts: validatedAccounts.reduce((sum: number, acc: TrackedAccount) => sum + (acc.trackedPosts || 0), 0)
                    });
                }
            } else {
                setError('Failed to fetch tracked accounts');
            }
        } catch (err) {
            console.error('Error fetching tracked accounts:', err);
            setError('Error fetching tracked accounts');
        } finally {
            setLoading(false);
        }
    };

    // Add new tracked account
    const addAccount = async () => {
        try {
            setError(null);
            // Always extract handle before submitting
            const cleanUsername = extractHandle(formData.username, formData.platform);
            const response = await fetch('/api/tracked-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, username: cleanUsername })
            });
            
            const data = await response.json();
            
            if (data.success) {
                let extraInfo = '';
                if (typeof data.trackedPosts === 'number' && typeof data.totalPosts === 'number') {
                    extraInfo = ` (Tracked: ${data.trackedPosts} / ${data.totalPosts} posts)`;
                } else if (typeof data.trackedPosts === 'number') {
                    extraInfo = ` (Tracked: ${data.trackedPosts} posts)`;
                }
                
                // Show different message if background processing is happening
                if (data.backgroundProcessing) {
                    setSuccess(`${data.message}${extraInfo} - Check back in a few minutes for existing content`);
                } else {
                    setSuccess(`${data.message}${extraInfo}`);
                }
                
                setShowAddForm(false);
                setFormData({ username: '', platform: 'tiktok', accountType: 'all', keyword: '', includeExistingContent: false });
                fetchAccounts();
            } else {
                setError(data.error);
            }
        } catch {
            setError('Error adding tracked account');
        }
    };

    // Update tracked account
    const updateAccount = async (id: string, updates: Partial<TrackedAccount>) => {
        try {
            setError(null);
            const response = await fetch('/api/tracked-accounts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...updates })
            });
            
            const data = await response.json();
            
            if (data.success) {
                setSuccess(data.message);
                setEditingAccount(null);
                fetchAccounts();
            } else {
                setError(data.error);
            }
        } catch {
            setError('Error updating tracked account');
        }
    };

    // Check all accounts for new content
    const checkAccounts = async () => {
        try {
            setCheckingAccounts(true);
            setError(null);
            const response = await fetch('/api/tracked-accounts/check');
            const data = await response.json();
            
            if (data.success) {
                setSuccess(`Checked ${data.results.totalAccounts} accounts. Found ${data.results.totalNewVideos} new videos.`);
                fetchAccounts(); // Refresh to get updated lastChecked times
            } else {
                setError(data.error);
            }
        } catch {
            setError('Error checking accounts');
        } finally {
            setCheckingAccounts(false);
        }
    };

    // Restore toggleAccountStatus
    const toggleAccountStatus = async (account: TrackedAccount) => {
        await updateAccount(account.id, { isActive: !account.isActive });
    };

    // Restore deleteAccount
    const deleteAccount = async (id: string) => {
        if (!confirm('Are you sure you want to stop tracking this account?')) return;
        try {
            setError(null);
            const response = await fetch(`/api/tracked-accounts?id=${id}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            if (data.success) {
                setSuccess(data.message);
                fetchAccounts();
            } else {
                setError(data.error);
            }
        } catch {
            setError('Error deleting tracked account');
        }
    };

    useEffect(() => {
        fetchAccounts();
        fetchCronStatus();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showCronDropdown && !(event.target as Element).closest('.relative')) {
                setShowCronDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCronDropdown]);

    // Clear messages after 5 seconds
    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => {
                setSuccess(null);
                setError(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [success, error]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="max-w-6xl mx-auto">
                    <div className="animate-pulse">
                        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
                        <div className="space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-20 bg-gray-200 rounded"></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Tracked Accounts</h1>
                        <p className="text-gray-600 mt-2">Automatically track new content from your favorite creators</p>
                    </div>
                    <div className="flex gap-3">
                        <div className="relative">
                            <button
                                onClick={() => {
                                    setShowCronDropdown(!showCronDropdown);
                                    if (!showCronDropdown) fetchCronStatus();
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                                    (cronStatus?.issues?.totalOverdue ?? 0) > 0 
                                        ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' 
                                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                <span className="text-sm">
                                    Cron Status {(cronStatus?.issues?.totalOverdue ?? 0) > 0 && `(${cronStatus?.issues?.totalOverdue ?? 0} pending)`}
                                </span>
                                <ChevronDown className={`w-4 h-4 transition-transform ${showCronDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showCronDropdown && cronStatus && (
                                <div className="absolute top-full left-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                                    <div className="p-4">
                                        <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                                            <span>Last updated: {new Date(cronStatus.system.timestamp).toLocaleTimeString()}</span>
                                            {refreshingStatus && (
                                                <span className="flex items-center gap-1 text-xs text-blue-600">
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                    Refreshing...
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Summary */}
                                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                            <div className="text-sm font-medium text-gray-700 mb-2">Status Summary:</div>
                                            <div className="text-xs space-y-1">
                                                <div>• {cronStatus.issues.overdueHourlyVideos} hourly videos pending</div>
                                                <div>• {cronStatus.issues.overdueDailyVideos} daily videos pending</div>
                                                <div>• {cronStatus.issues.overdueAccounts} accounts pending</div>
                                                <div className="text-gray-500">DB: {cronStatus.database.status} ({cronStatus.database.latency}ms) | Memory: {cronStatus.system.memoryUsage}MB</div>
                                            </div>
                                        </div>

                                        {/* Pending Videos List */}
                                        {(cronStatus.pendingVideos?.hourly?.length > 0 || cronStatus.pendingVideos?.daily?.length > 0 || cronStatus.pendingAccounts?.length > 0) ? (
                                            <div className="space-y-3">
                                                <div className="text-sm font-medium text-orange-700">Pending Items:</div>
                                                
                                                {/* Hourly Videos */}
                                                {cronStatus.pendingVideos?.hourly?.length > 0 && (
                                                    <div>
                                                        <div className="text-xs font-medium text-blue-700 mb-2">Hourly ({cronStatus.pendingVideos.hourly.length})</div>
                                                        <div className="space-y-1 max-h-32 overflow-y-auto">
                                                            {cronStatus.pendingVideos.hourly.slice(0, 10).map((video) => (
                                                                <div key={video.id} className="flex items-center justify-between bg-blue-50 p-2 rounded text-xs">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-medium truncate">@{video.username}</div>
                                                                        <div className="text-gray-600">{video.platform} • {video.minutesAgo}m ago</div>
                                                                        <div className="text-gray-500 text-xs truncate" title={video.reason}>
                                                                            {video.reason}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => runSingleVideo(video.id)}
                                                                        disabled={runningVideos.has(video.id)}
                                                                        className="ml-2 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                                                                    >
                                                                        {runningVideos.has(video.id) ? '...' : 'Run'}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {cronStatus.pendingVideos.hourly.length > 10 && (
                                                                <div className="text-xs text-gray-500 text-center py-1">
                                                                    +{cronStatus.pendingVideos.hourly.length - 10} more...
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* Daily Videos */}
                                                {cronStatus.pendingVideos?.daily?.length > 0 && (
                                                    <div>
                                                        <div className="text-xs font-medium text-green-700 mb-2">Daily ({cronStatus.pendingVideos.daily.length})</div>
                                                        <div className="space-y-1 max-h-32 overflow-y-auto">
                                                            {cronStatus.pendingVideos.daily.slice(0, 10).map((video) => (
                                                                <div key={video.id} className="flex items-center justify-between bg-green-50 p-2 rounded text-xs">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-medium truncate">@{video.username}</div>
                                                                        <div className="text-gray-600">{video.platform} • {video.minutesAgo}m ago</div>
                                                                        <div className="text-gray-500 text-xs truncate" title={video.reason}>
                                                                            {video.reason}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => runSingleVideo(video.id)}
                                                                        disabled={runningVideos.has(video.id)}
                                                                        className="ml-2 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                                                    >
                                                                        {runningVideos.has(video.id) ? '...' : 'Run'}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {cronStatus.pendingVideos.daily.length > 10 && (
                                                                <div className="text-xs text-gray-500 text-center py-1">
                                                                    +{cronStatus.pendingVideos.daily.length - 10} more...
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* Pending Accounts */}
                                                {cronStatus.pendingAccounts?.length > 0 && (
                                                    <div>
                                                        <div className="text-xs font-medium text-purple-700 mb-2">Accounts ({cronStatus.pendingAccounts.length})</div>
                                                        <div className="space-y-1 max-h-32 overflow-y-auto">
                                                            {cronStatus.pendingAccounts.slice(0, 10).map((account) => (
                                                                <div key={account.id} className="flex items-center justify-between bg-purple-50 p-2 rounded text-xs">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="font-medium truncate">@{account.username}</div>
                                                                        <div className="text-gray-600">{account.platform} • {account.minutesAgo}m ago</div>
                                                                        <div className="text-gray-500 text-xs truncate" title={account.reason}>
                                                                            {account.reason}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={async () => {
                                                                            setManualTriggerStatus('🔄 Checking account...');
                                                                            try {
                                                                                const response = await fetch('/api/tracked-accounts/check', { method: 'POST' });
                                                                                const result = await response.json();
                                                                                if (result.success) {
                                                                                    setManualTriggerStatus(`✅ Account checked - ${result.results.totalNewVideos} new videos`);
                                                                                } else {
                                                                                    setManualTriggerStatus(`❌ Failed: ${result.error}`);
                                                                                }
                                                                                setTimeout(() => {
                                                                                    fetchCronStatus();
                                                                                    setManualTriggerStatus('');
                                                                                }, 3000);
                                                                            } catch (error) {
                                                                                setManualTriggerStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
                                                                                setTimeout(() => setManualTriggerStatus(''), 3000);
                                                                            }
                                                                        }}
                                                                        disabled={manualTriggerStatus.includes('🔄')}
                                                                        className="ml-2 px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:opacity-50"
                                                                    >
                                                                        {manualTriggerStatus.includes('🔄') ? '...' : 'Check'}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {cronStatus.pendingAccounts.length > 10 && (
                                                                <div className="text-xs text-gray-500 text-center py-1">
                                                                    +{cronStatus.pendingAccounts.length - 10} more...
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-green-600">✓ All items up to date</div>
                                        )}

                                        {/* Quick Actions */}
                                        <div className="mt-4 pt-3 border-t border-gray-200">
                                            <div className="text-xs font-medium text-gray-700 mb-2">Quick Actions:</div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={async () => {
                                                        setManualTriggerStatus('🔄 Running all pending...');
                                                        try {
                                                            const response = await fetch('/api/clear-pending', { method: 'POST' });
                                                            const result = await response.json();
                                                            if (result.success) {
                                                                setManualTriggerStatus(`✅ Processed ${result.status.successful} videos`);
                                                            } else {
                                                                setManualTriggerStatus(`❌ Failed: ${result.error}`);
                                                            }
                                                            setTimeout(() => {
                                                                fetchCronStatus();
                                                                setManualTriggerStatus('');
                                                            }, 3000);
                                                        } catch (error) {
                                                            setManualTriggerStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
                                                            setTimeout(() => setManualTriggerStatus(''), 3000);
                                                        }
                                                    }}
                                                    disabled={manualTriggerStatus.includes('🔄')}
                                                    className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 disabled:opacity-50"
                                                >
                                                    Run All
                                                </button>
                                                <button
                                                    onClick={clearPending}
                                                    disabled={clearingPending || manualTriggerStatus.includes('🔄')}
                                                    className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                                                >
                                                    {clearingPending ? 'Clearing...' : 'Clear Pending'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowCronDropdown(false);
                                                        fetchCronStatus();
                                                    }}
                                                    className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
                                                >
                                                    Refresh
                                                </button>
                                            </div>
                                            {manualTriggerStatus && (
                                                <div className={`mt-2 text-xs p-2 rounded ${
                                                    manualTriggerStatus.includes('✅') ? 'bg-green-100 text-green-800' :
                                                    manualTriggerStatus.includes('❌') ? 'bg-red-100 text-red-800' :
                                                    'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {manualTriggerStatus}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={checkAccounts}
                            disabled={checkingAccounts || accounts.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw className={`w-4 h-4 ${checkingAccounts ? 'animate-spin' : ''}`} />
                            {checkingAccounts ? 'Checking...' : 'Check Now'}
                        </button>
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            <Plus className="w-4 h-4" />
                            Add Account
                        </button>
                    </div>
                </div>

                {/* Info Card */}
                <div className="mb-8 p-6 bg-white rounded-lg shadow-sm border">
                    <div className="flex items-center gap-3 mb-4">
                        <Users className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-semibold">How It Works</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <h3 className="font-medium text-gray-900 mb-2">1. Add Accounts</h3>
                            <p className="text-gray-600 text-sm">Add TikTok, Instagram, or YouTube accounts to track. Choose to track all content or specific keywords.</p>
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900 mb-2">2. Automatic Monitoring</h3>
                            <p className="text-gray-600 text-sm">We check for new content every hour and automatically add new videos to your tracking list.</p>
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900 mb-2">3. Analytics Dashboard</h3>
                            <p className="text-gray-600 text-sm">View detailed analytics, growth trends, and performance metrics for all tracked content.</p>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-800">{error}</p>
                    </div>
                )}
                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-green-800">{success}</p>
                    </div>
                )}

                {/* Add Account Form */}
                {showAddForm && (
                    <div className="mb-8 p-6 bg-white rounded-lg shadow-sm border">
                        <h2 className="text-xl font-semibold mb-4">Add New Tracked Account</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    placeholder="@username"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
                                <select
                                    value={formData.platform}
                                    onChange={(e) => setFormData({ ...formData, platform: e.target.value as 'tiktok' | 'instagram' | 'youtube' })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="tiktok">TikTok</option>
                                    <option value="instagram">Instagram</option>
                                    <option value="youtube">YouTube</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
                                <select
                                    value={formData.accountType}
                                    onChange={(e) => setFormData({ ...formData, accountType: e.target.value as 'all' | 'keyword' })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="all">All Content</option>
                                    <option value="keyword">Keyword Only</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Keyword (optional)</label>
                                <input
                                    type="text"
                                    value={formData.keyword}
                                    onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                                    placeholder="blok, #blok, @Blok"
                                    disabled={formData.accountType === 'all'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                                />
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="includeExistingContent"
                                    checked={formData.includeExistingContent}
                                    onChange={(e) => setFormData({ ...formData, includeExistingContent: e.target.checked })}
                                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-2 text-sm text-gray-700">Include existing content (last 10 posts)</span>
                            </label>
                        </div>
                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={addAccount}
                                disabled={!formData.username || (formData.accountType === 'keyword' && !formData.keyword)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Add Account
                            </button>
                            <button
                                onClick={() => setShowAddForm(false)}
                                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Tracked Accounts List */}
                <div className="space-y-4">
                    {accounts.map((account) => (
                        <div key={account.id} className="bg-white rounded-lg shadow-sm border p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    {account.pfpUrl ? (
                                        <Image
                                            src={account.pfpUrl}
                                            alt={`${account.username} profile`}
                                            width={40}
                                            height={40}
                                            className="rounded-full"
                                        />
                                    ) : (
                                        getPlatformIcon(account.platform)
                                    )}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-gray-900">@{account.username}</h3>
                                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                                {account.platform}
                                            </span>
                                            {account.accountType === 'keyword' && account.keyword && (
                                                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                                                    {account.keyword}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            Last checked: {formatTimeAgo(account.lastChecked)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleAccountStatus(account)}
                                        className={`px-3 py-1 text-xs rounded ${
                                            account.isActive
                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                    >
                                        {account.isActive ? 'Active' : 'Paused'}
                                    </button>
                                    <button
                                        onClick={() => setEditingAccount(account)}
                                        className="p-2 text-gray-400 hover:text-gray-600"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => deleteAccount(account.id)}
                                        className="p-2 text-gray-400 hover:text-red-600"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <div className="text-gray-500">Posts Tracked</div>
                                    <div className="font-medium">{account.trackedPosts || 0}</div>
                                </div>
                                <div>
                                    <div className="text-gray-500">Total Posts</div>
                                    <div className="font-medium">{account.totalPosts || 0}</div>
                                </div>
                                <div>
                                    <div className="text-gray-500">Last Added</div>
                                    <div className="font-medium">{formatTimeAgo(account.lastPostAdded)}</div>
                                </div>
                                <div>
                                    <div className="text-gray-500">Status</div>
                                    <div className={`font-medium ${
                                        account.apiStatus === 'success' ? 'text-green-600' :
                                        account.apiStatus === 'error' ? 'text-red-600' :
                                        'text-gray-600'
                                    }`}>
                                        {account.apiStatus || 'Unknown'}
                                    </div>
                                </div>
                            </div>
                            
                            {account.apiError && (
                                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                    Error: {account.apiError}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Edit Account Modal */}
                {editingAccount && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 w-full max-w-md">
                            <h2 className="text-xl font-semibold mb-4">Edit Account</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
                                    <select
                                        value={editingAccount.accountType}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, accountType: e.target.value as 'all' | 'keyword' })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="all">All Content</option>
                                        <option value="keyword">Keyword Only</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Keyword</label>
                                    <input
                                        type="text"
                                        value={editingAccount.keyword || ''}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, keyword: e.target.value })}
                                        placeholder="blok, #blok, @Blok"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button
                                    onClick={() => updateAccount(editingAccount.id, {
                                        accountType: editingAccount.accountType,
                                        keyword: editingAccount.keyword
                                    })}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Save Changes
                                </button>
                                <button
                                    onClick={() => setEditingAccount(null)}
                                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}