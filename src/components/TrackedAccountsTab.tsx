import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Users, Edit, Play, Pause, Trash2, ChevronDown } from 'lucide-react';
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

interface CronStatus {
    system: { timestamp: string; memoryUsage: number };
    database: { status: string; latency: string };
    issues: { overdueHourlyVideos: number; overdueDailyVideos: number; overdueAccounts: number; totalOverdue: number };
    oldestPending?: { username: string; platform: string; minutesAgo: number };
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
            const response = await fetch('/api/cron-status');
            if (response.ok) {
                const data = await response.json();
                setCronStatus(data);
            }
        } catch (err) {
            console.error('Failed to fetch cron status:', err);
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
                                <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                                    <div className="p-4">
                                        <div className="text-sm text-gray-600 mb-3">
                                            Last updated: {new Date(cronStatus.system.timestamp).toLocaleTimeString()}
                                        </div>
                                        {cronStatus.issues.totalOverdue > 0 ? (
                                            <div className="space-y-2">
                                                <div className="text-sm font-medium text-orange-700">Pending Jobs:</div>
                                                {cronStatus.issues.overdueHourlyVideos > 0 && (
                                                    <div className="text-sm text-gray-700">• {cronStatus.issues.overdueHourlyVideos} hourly videos overdue</div>
                                                )}
                                                {cronStatus.issues.overdueDailyVideos > 0 && (
                                                    <div className="text-sm text-gray-700">• {cronStatus.issues.overdueDailyVideos} daily videos overdue</div>
                                                )}
                                                {cronStatus.issues.overdueAccounts > 0 && (
                                                    <div className="text-sm text-gray-700">• {cronStatus.issues.overdueAccounts} accounts overdue</div>
                                                )}
                                                {cronStatus.oldestPending && (
                                                    <div className="mt-3 p-2 bg-orange-50 rounded text-sm">
                                                        <div className="font-medium">Oldest pending:</div>
                                                        <div>{cronStatus.oldestPending.platform}:{cronStatus.oldestPending.username}</div>
                                                        <div className="text-orange-600">{cronStatus.oldestPending.minutesAgo} minutes ago</div>
                                                        {cronStatus.oldestPending.minutesAgo > 1440 && (
                                                            <div className="mt-2 text-red-600 font-medium">
                                                                🚨 CRITICAL: Jobs haven&apos;t run in {Math.floor(cronStatus.oldestPending.minutesAgo / 1440)} days!
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {/* Manual trigger buttons for debugging */}
                                                <div className="mt-3">
                                                    <div className="flex gap-2 mb-2">
                                                        <button
                                                            onClick={async () => {
                                                                setManualTriggerStatus('🔄 Triggering video scraping...');
                                                                try {
                                                                    const response = await fetch('/api/manual-cron', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ job: 'scrape-all' })
                                                                    });
                                                                    const result = await response.json();
                                                                    console.log('Manual scrape-all result:', result);
                                                                    
                                                                    if (result.success) {
                                                                        setManualTriggerStatus(`✅ Video scraping completed! Check console for details.`);
                                                                    } else {
                                                                        setManualTriggerStatus(`❌ Video scraping failed: ${result.error}`);
                                                                    }
                                                                    
                                                                    // Refresh cron status after 3 seconds
                                                                    setTimeout(() => {
                                                                        fetchCronStatus();
                                                                        setManualTriggerStatus('');
                                                                    }, 5000);
                                                                } catch (error) {
                                                                    console.error('Manual trigger failed:', error);
                                                                    setManualTriggerStatus(`❌ Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                                                    setTimeout(() => setManualTriggerStatus(''), 5000);
                                                                }
                                                            }}
                                                            disabled={manualTriggerStatus.includes('🔄')}
                                                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                                        >
                                                            🔧 Force Scrape Videos
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                setManualTriggerStatus('🔄 Checking tracked accounts...');
                                                                try {
                                                                    const response = await fetch('/api/manual-cron', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ job: 'tracked-accounts' })
                                                                    });
                                                                    const result = await response.json();
                                                                    console.log('Manual tracked accounts result:', result);
                                                                    
                                                                    if (result.success) {
                                                                        setManualTriggerStatus(`✅ Account check completed! Check console for details.`);
                                                                    } else {
                                                                        setManualTriggerStatus(`❌ Account check failed: ${result.error}`);
                                                                    }
                                                                    
                                                                    // Refresh cron status after 3 seconds
                                                                    setTimeout(() => {
                                                                        fetchCronStatus();
                                                                        setManualTriggerStatus('');
                                                                    }, 5000);
                                                                } catch (error) {
                                                                    console.error('Manual trigger failed:', error);
                                                                    setManualTriggerStatus(`❌ Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                                                    setTimeout(() => setManualTriggerStatus(''), 5000);
                                                                }
                                                            }}
                                                            disabled={manualTriggerStatus.includes('🔄')}
                                                            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                                                        >
                                                            🔧 Force Check Accounts
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const response = await fetch('/api/debug-pending');
                                                                    const result = await response.json();
                                                                    console.log('🔍 DEBUG PENDING JOBS:', result);
                                                                    setManualTriggerStatus('🔍 Debug data logged to console - check browser dev tools!');
                                                                    setTimeout(() => setManualTriggerStatus(''), 5000);
                                                                } catch (error) {
                                                                    console.error('Debug failed:', error);
                                                                    setManualTriggerStatus(`❌ Debug failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                                                    setTimeout(() => setManualTriggerStatus(''), 5000);
                                                                }
                                                            }}
                                                            className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
                                                        >
                                                            🔍 Debug Pending
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const response = await fetch('/api/get-pending-videos');
                                                                    const result = await response.json();
                                                                    console.log('📋 PENDING VIDEOS ANALYSIS:', result);
                                                                    
                                                                    if (result.success) {
                                                                        const { summary, pendingVideos } = result;
                                                                        setManualTriggerStatus(`📋 PENDING ANALYSIS: ${summary.pendingVideos} videos pending (${summary.pendingByCadence.hourly || 0} hourly, ${summary.pendingByCadence.daily || 0} daily). Oldest: @${summary.oldestPending?.username} (${summary.oldestPending?.minutesAgo}min ago). Check console for full list.`);
                                                                        
                                                                        // Show pending videos in console
                                                                        console.log('🎯 SPECIFIC PENDING VIDEOS TO CLEAR:');
                                                                        pendingVideos.forEach((video: { username: string; platform: string; scrapingCadence: string; minutesAgo: number; reason: string }, index: number) => {
                                                                            console.log(`${index + 1}. @${video.username} (${video.platform}, ${video.scrapingCadence}) - ${video.minutesAgo}min ago - ${video.reason}`);
                                                                        });
                                                                    } else {
                                                                        setManualTriggerStatus(`❌ Failed to analyze pending videos: ${result.error}`);
                                                                    }
                                                                    
                                                                    setTimeout(() => setManualTriggerStatus(''), 8000);
                                                                } catch (error) {
                                                                    console.error('Analyze pending failed:', error);
                                                                    setManualTriggerStatus(`❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                                                    setTimeout(() => setManualTriggerStatus(''), 5000);
                                                                }
                                                            }}
                                                            className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
                                                        >
                                                            📋 Show Pending
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                setManualTriggerStatus('🚀 CLEARING SPECIFIC PENDING VIDEOS - This will be faster...');
                                                                try {
                                                                    // Clear pending videos (now only processes specific pending ones)
                                                                    const videosResponse = await fetch('/api/clear-pending', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' }
                                                                    });
                                                                    const videosResult = await videosResponse.json();
                                                                    console.log('Clear pending videos result:', videosResult);
                                                                    
                                                                    // Clear pending accounts
                                                                    const accountsResponse = await fetch('/api/clear-pending-accounts', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' }
                                                                    });
                                                                    const accountsResult = await accountsResponse.json();
                                                                    console.log('Clear pending accounts result:', accountsResult);
                                                                    
                                                                    if (videosResult.success && accountsResult.success) {
                                                                        setManualTriggerStatus(`✅ CLEARED SPECIFIC PENDING! Videos: ${videosResult.status.successful} processed, Accounts: ${accountsResult.status.successful} processed, ${accountsResult.status.totalNewVideos} new videos added`);
                                                                    } else {
                                                                        setManualTriggerStatus(`⚠️ Partial success - Videos: ${videosResult.success ? 'OK' : 'FAILED'}, Accounts: ${accountsResult.success ? 'OK' : 'FAILED'}`);
                                                                    }
                                                                    
                                                                    // Refresh cron status after 10 seconds
                                                                    setTimeout(() => {
                                                                        fetchCronStatus();
                                                                        setManualTriggerStatus('');
                                                                    }, 10000);
                                                                } catch (error) {
                                                                    console.error('Clear pending failed:', error);
                                                                    setManualTriggerStatus(`❌ Clear failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                                                    setTimeout(() => setManualTriggerStatus(''), 10000);
                                                                }
                                                            }}
                                                            disabled={manualTriggerStatus.includes('🚀')}
                                                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 font-bold"
                                                        >
                                                            🚀 CLEAR PENDING
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const response = await fetch('/api/test-scrape');
                                                                    const result = await response.json();
                                                                    console.log('🧪 SCRAPE-ALL PREREQUISITE TEST:', result);
                                                                    setManualTriggerStatus('🧪 Prerequisite test logged to console - check for errors!');
                                                                    setTimeout(() => setManualTriggerStatus(''), 5000);
                                                                } catch (error) {
                                                                    console.error('Test failed:', error);
                                                                    setManualTriggerStatus(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                                                    setTimeout(() => setManualTriggerStatus(''), 5000);
                                                                }
                                                            }}
                                                            className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
                                                        >
                                                            🧪 Test Prerequisites
                                                        </button>
                                                    </div>
                                                    
                                                    {/* Status feedback */}
                                                    {manualTriggerStatus && (
                                                        <div className={`text-xs p-2 rounded ${
                                                            manualTriggerStatus.includes('✅') ? 'bg-green-100 text-green-800' :
                                                            manualTriggerStatus.includes('❌') ? 'bg-red-100 text-red-800' :
                                                            manualTriggerStatus.includes('🔍') ? 'bg-purple-100 text-purple-800' :
                                                            'bg-blue-100 text-blue-800'
                                                        }`}>
                                                            {manualTriggerStatus}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-green-600">✓ All jobs up to date</div>
                                        )}
                                        <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                                            DB: {cronStatus.database.status} ({cronStatus.database.latency}) | 
                                            Memory: {cronStatus.system.memoryUsage}MB
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
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3">
                        <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                            <span className="text-xs font-medium text-blue-600">i</span>
                        </div>
                        <div className="flex-1 text-sm text-blue-800">
                            <p><strong>Fast Loading:</strong> Profile data (follower counts, total posts, profile pictures) will be populated during account checks to keep this page loading instantly.</p>
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
                                    <option value="keyword">Keyword Filter</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {formData.accountType === 'keyword' ? 'Keyword *' : 'Keyword'}
                                </label>
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
                        
                        {/* Include Existing Content Option */}
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    id="includeExistingContent"
                                    checked={formData.includeExistingContent}
                                    onChange={(e) => setFormData({ ...formData, includeExistingContent: e.target.checked })}
                                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                    <label htmlFor="includeExistingContent" className="text-sm font-medium text-gray-700 cursor-pointer">
                                        Include existing content
                                    </label>
                                    <p className="text-xs text-gray-600 mt-1">
                                        By default, only NEW content posted after adding this account will be tracked. 
                                        Check this box to also add their existing content that meets your criteria
                                        {formData.accountType === 'keyword' && formData.keyword && (
                                            <span className="font-medium"> (only posts containing &ldquo;{formData.keyword}&rdquo;)</span>
                                        )}.
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-3 mt-6">
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

                {/* Accounts List */}
                {accounts.length === 0 ? (
                    <div className="text-center py-12">
                        <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No tracked accounts yet</h3>
                        <p className="text-gray-600 mb-6">Start tracking your favorite creators to automatically add their new content</p>
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 mx-auto"
                        >
                            <Plus className="w-4 h-4" />
                            Add Your First Account
                        </button>
                    </div>
                ) :
                    <div className="space-y-4">
                        {accounts.map((account) => (
                            <div key={account.id} className="bg-white rounded-lg shadow-sm border p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        {account.pfpUrl ? (
                                            <Image 
                                                src={`/api/image-proxy?url=${encodeURIComponent(account.pfpUrl)}`}
                                                alt="Profile" 
                                                width={48}
                                                height={48}
                                                className="w-12 h-12 rounded-full object-cover border" 
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xl border">
                                                <span>?</span>
                                            </div>
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                {getPlatformIcon(account.platform)}
                                                <h3 className="text-lg font-semibold text-gray-900">{account.displayName || `@${account.username}`}</h3>
                                                <span className="text-xs text-gray-500">({account.lookedUpUsername || account.username})</span>
                                            </div>
                                                    {typeof account.followers === 'number' && (
                                                        <div className="text-xs text-gray-500">Followers: {account.followers.toLocaleString()}</div>
                                                    )}
                                                    {account.profileUrl && (
                                                        <a href={account.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">View Profile</a>
                                                    )}
                                                    <div className="text-xs mt-1">
                                                        {account.apiError || account.apiErrorMessage ? (
                                                            <span className="text-red-600 font-semibold">
                                                                ❌ {(account.apiErrorMessage || account.apiError || 'Account not found or API error').includes('rate limit') || 
                                                                     (account.apiErrorMessage || account.apiError || '').includes('429') ? 
                                                                     '⏳ Rate limited - will retry during next check' : 
                                                                     account.apiErrorMessage || account.apiError || 'Account not found or API error'}
                                                            </span>
                                                        ) : account.totalPosts === null ? (
                                                            <span className="text-gray-500">Profile data will load during next check</span>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                <span className="text-green-700">
                                                                    Tracked: {account.trackedPosts || 0} / {account.totalPosts || 0} posts
                                                                    {/* Show warning if tracked > total */}
                                                                    {(account.trackedPosts || 0) > (account.totalPosts || 0) && (
                                                                        <span className="text-orange-600 text-xs ml-2" title="We may have tracked posts that were later deleted">
                                                                            ⚠️
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <div className="flex gap-4 text-xs text-gray-500">
                                                                    <span>Last checked: {formatTimeAgo(account.lastChecked)}</span>
                                                                    {account.lastPostAdded && (
                                                                        <span className="font-medium text-blue-600">Last post: {formatTimeAgo(account.lastPostAdded)}</span>
                                                                    )}
                                                                </div>
                                                                {/* Debug info for development */}
                                                                {process.env.NODE_ENV === 'development' && (
                                                                    <div className="text-xs text-gray-400 mt-1">
                                                                        Debug: ID={account.id.substring(0, 8)}, Platform={account.platform}, User={account.username}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => toggleAccountStatus(account)}
                                            className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                                                account.isActive
                                                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                            }`}
                                        >
                                            {account.isActive ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                                            {account.isActive ? 'Active' : 'Paused'}
                                        </button>
                                        <button
                                            onClick={() => setEditingAccount(account)}
                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => deleteAccount(account.id)}
                                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                }

                {/* Edit Account Modal */}
                {editingAccount && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
                                        <option value="keyword">Keyword Filter</option>
                                    </select>
                                </div>
                                {editingAccount.accountType === 'keyword' && (
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
                                )}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={editingAccount.isActive}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, isActive: e.target.checked })}
                                        className="rounded border-gray-300"
                                    />
                                    <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                                        Active
                                    </label>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => updateAccount(editingAccount.id, {
                                        accountType: editingAccount.accountType,
                                        keyword: editingAccount.keyword,
                                        isActive: editingAccount.isActive
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