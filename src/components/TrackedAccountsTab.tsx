import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Users } from 'lucide-react';

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
}

// Add a helper to extract username/handle from a pasted URL
function extractHandle(input: string, platform: string): string {
    const value = input.trim();
    if (platform === 'tiktok') {
        // Accept @handle or full URL
        if (value.startsWith('@')) return value.slice(1);
        const match = value.match(/tiktok\.com\/@([\w.\-]+)/);
        if (match) return match[1];
        return value;
    } else if (platform === 'instagram') {
        // Accept handle or full URL
        if (value.startsWith('@')) return value.slice(1);
        const match = value.match(/instagram\.com\/(?:@)?([\w.\-]+)/);
        if (match) return match[1].replace(/\/$/, '');
        return value.replace(/\/$/, '');
    } else if (platform === 'youtube') {
        // Accept handle, channel ID, or full URL
        if (value.startsWith('@')) return value.slice(1);
        const match = value.match(/youtube\.com\/(?:c|user|channel)\/([\w\-@]+)/);
        if (match) return match[1];
        return value;
    }
    return value;
}

export function TrackedAccountsTab() {
    const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingAccount, setEditingAccount] = useState<TrackedAccount | null>(null);
    const [checkingAccounts, setCheckingAccounts] = useState(false);
    const [formData, setFormData] = useState<AddAccountForm>({
        username: '',
        platform: 'tiktok',
        accountType: 'all',
        keyword: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Fetch tracked accounts
    const fetchAccounts = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/tracked-accounts');
            const data = await response.json();
            
            if (data.success) {
                setAccounts(data.accounts);
            } else {
                setError('Failed to fetch tracked accounts');
            }
        } catch {
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
                setSuccess(`${data.message}${extraInfo}`);
                setShowAddForm(false);
                setFormData({ username: '', platform: 'tiktok', accountType: 'all', keyword: '' });
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

    useEffect(() => {
        fetchAccounts();
    }, []);

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
                                <div className="flex items-center gap-4">
                                    {account.pfpUrl ? (
                                        <img src={account.pfpUrl} alt="Profile" className="w-12 h-12 rounded-full object-cover border" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xl border">
                                            <span>?</span>
                                        </div>
                                    )}
                                    <div>
                                        <div className="flex items-center gap-2">
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
                                                <span className="text-red-600 font-semibold">❌ {account.apiErrorMessage || account.apiError || 'Account not found or API error'}</span>
                                            ) : account.totalPosts === null ? (
                                                <span className="text-gray-400">Loading...</span>
                                            ) : (
                                                <span className="text-green-700">Tracked: {account.trackedPosts} / {account.totalPosts} posts</span>
                                            )}
                                        </div>
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