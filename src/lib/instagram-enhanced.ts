// Enhanced Instagram integration using TikHub API
// Comprehensive implementation with multiple endpoints
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface InstagramProfile {
    id: string;
    username: string;
    full_name: string;
    biography: string;
    profile_pic_url: string;
    follower_count: number;
    following_count: number;
    post_count: number;
    is_verified: boolean;
    is_private: boolean;
    is_business_account: boolean;
    external_url?: string;
}

export interface InstagramPost {
    id: string;
    shortcode: string;
    url: string;
    caption: string;
    media_type: 'photo' | 'video' | 'carousel';
    media_url: string;
    thumbnail_url?: string;
    like_count: number;
    comment_count: number;
    timestamp: string;
    location?: {
        id: string;
        name: string;
    };
    hashtags: string[];
    mentions: string[];
}

export interface InstagramStory {
    id: string;
    media_type: 'photo' | 'video';
    media_url: string;
    timestamp: string;
    expires_at: string;
}

export interface InstagramHighlight {
    id: string;
    title: string;
    cover_media_url: string;
    media_count: number;
}

export interface InstagramComment {
    id: string;
    text: string;
    username: string;
    timestamp: string;
    like_count: number;
    reply_count: number;
}

export class InstagramAPI {
    private apiKey: string;
    private baseUrl = 'https://api.tikhub.io/api/v1/instagram/web_app';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async makeRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
        const url = new URL(`${this.baseUrl}/${endpoint}`);
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Instagram API error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    // Get comprehensive user profile information
    async getUserProfile(username: string): Promise<InstagramProfile> {
        const data = await this.makeRequest('fetch_user_info_by_username', { username });
        
        if (!data.data) {
            throw new Error(`Profile not found for @${username}`);
        }

        const profile = data.data;
        return {
            id: profile.id,
            username: profile.username,
            full_name: profile.full_name || '',
            biography: profile.biography || '',
            profile_pic_url: profile.profile_pic_url_hd || profile.profile_pic_url,
            follower_count: profile.edge_followed_by?.count || 0,
            following_count: profile.edge_follow?.count || 0,
            post_count: profile.edge_owner_to_timeline_media?.count || 0,
            is_verified: profile.is_verified || false,
            is_private: profile.is_private || false,
            is_business_account: profile.is_business_account || false,
            external_url: profile.external_url
        };
    }

    // Get user posts and reels with pagination
    async getUserPosts(username: string, cursor?: string, limit: number = 12): Promise<{
        posts: InstagramPost[];
        next_cursor?: string;
        has_more: boolean;
    }> {
        const params: Record<string, string> = { username };
        if (cursor) params.cursor = cursor;
        if (limit) params.count = limit.toString();

        const data = await this.makeRequest('fetch_user_posts_and_reels_by_username', params);
        
        if (!data.data?.data?.items) {
            return { posts: [], has_more: false };
        }

        const posts = data.data.data.items.map((item: any): InstagramPost => ({
            id: item.id,
            shortcode: item.shortcode || '',
            url: item.permalink || `https://www.instagram.com/p/${item.shortcode}/`,
            caption: item.caption?.text || '',
            media_type: this.getMediaType(item),
            media_url: item.display_url || item.video_url || '',
            thumbnail_url: item.display_url,
            like_count: item.like_count || 0,
            comment_count: item.comment_count || 0,
            timestamp: new Date(item.taken_at * 1000).toISOString(),
            location: item.location ? {
                id: item.location.id,
                name: item.location.name
            } : undefined,
            hashtags: this.extractHashtags(item.caption?.text || ''),
            mentions: this.extractMentions(item.caption?.text || '')
        }));

        return {
            posts,
            next_cursor: data.data.pagination_token,
            has_more: !!data.data.pagination_token
        };
    }

    // Get user stories (24-hour content)
    async getUserStories(username: string): Promise<InstagramStory[]> {
        try {
            const data = await this.makeRequest('fetch_user_stories_by_username', { username });
            
            if (!data.data?.items) {
                return [];
            }

            return data.data.items.map((story: any): InstagramStory => ({
                id: story.id,
                media_type: story.media_type === 2 ? 'video' : 'photo',
                media_url: story.video_versions?.[0]?.url || story.image_versions2?.candidates?.[0]?.url || '',
                timestamp: new Date(story.taken_at * 1000).toISOString(),
                expires_at: new Date((story.taken_at + 86400) * 1000).toISOString() // 24 hours later
            }));
        } catch (error) {
            console.warn(`Stories not available for @${username}:`, error);
            return [];
        }
    }

    // Get user highlights
    async getUserHighlights(username: string): Promise<InstagramHighlight[]> {
        try {
            const data = await this.makeRequest('fetch_user_highlights_by_username', { username });
            
            if (!data.data?.items) {
                return [];
            }

            return data.data.items.map((highlight: any): InstagramHighlight => ({
                id: highlight.id,
                title: highlight.title,
                cover_media_url: highlight.cover_media?.cropped_image_version?.url || '',
                media_count: highlight.media_count || 0
            }));
        } catch (error) {
            console.warn(`Highlights not available for @${username}:`, error);
            return [];
        }
    }

    // Get post comments
    async getPostComments(postUrl: string, cursor?: string): Promise<{
        comments: InstagramComment[];
        next_cursor?: string;
        has_more: boolean;
    }> {
        const params: Record<string, string> = { url: postUrl };
        if (cursor) params.cursor = cursor;

        try {
            const data = await this.makeRequest('fetch_post_comments_by_url', params);
            
            if (!data.data?.comments) {
                return { comments: [], has_more: false };
            }

            const comments = data.data.comments.map((comment: any): InstagramComment => ({
                id: comment.id,
                text: comment.text,
                username: comment.user.username,
                timestamp: new Date(comment.created_at * 1000).toISOString(),
                like_count: comment.comment_like_count || 0,
                reply_count: comment.child_comment_count || 0
            }));

            return {
                comments,
                next_cursor: data.data.next_max_id,
                has_more: data.data.has_more_comments || false
            };
        } catch (error) {
            console.warn(`Comments not available for post: ${postUrl}`, error);
            return { comments: [], has_more: false };
        }
    }

    // Search hashtags and get posts
    async searchHashtagPosts(hashtag: string, cursor?: string): Promise<{
        posts: InstagramPost[];
        next_cursor?: string;
        has_more: boolean;
    }> {
        const params: Record<string, string> = { keyword: hashtag.replace('#', '') };
        if (cursor) params.cursor = cursor;

        try {
            const data = await this.makeRequest('fetch_hashtag_posts_by_keyword_v3', params);
            
            if (!data.data?.items) {
                return { posts: [], has_more: false };
            }

            const posts = data.data.items.map((item: any): InstagramPost => ({
                id: item.id,
                shortcode: item.shortcode || '',
                url: item.permalink || `https://www.instagram.com/p/${item.shortcode}/`,
                caption: item.caption?.text || '',
                media_type: this.getMediaType(item),
                media_url: item.display_url || item.video_url || '',
                thumbnail_url: item.display_url,
                like_count: item.like_count || 0,
                comment_count: item.comment_count || 0,
                timestamp: new Date(item.taken_at * 1000).toISOString(),
                hashtags: this.extractHashtags(item.caption?.text || ''),
                mentions: this.extractMentions(item.caption?.text || '')
            }));

            return {
                posts,
                next_cursor: data.data.next_max_id,
                has_more: data.data.has_more || false
            };
        } catch (error) {
            console.warn(`Hashtag posts not available for #${hashtag}`, error);
            return { posts: [], has_more: false };
        }
    }

    // Search users
    async searchUsers(query: string): Promise<Array<{
        username: string;
        full_name: string;
        profile_pic_url: string;
        follower_count: number;
        is_verified: boolean;
    }>> {
        try {
            const data = await this.makeRequest('fetch_search_users_by_keyword_v2', { keyword: query });
            
            if (!data.data?.users) {
                return [];
            }

            return data.data.users.map((user: any) => ({
                username: user.username,
                full_name: user.full_name || '',
                profile_pic_url: user.profile_pic_url,
                follower_count: user.follower_count || 0,
                is_verified: user.is_verified || false
            }));
        } catch (error) {
            console.warn(`User search failed for query: ${query}`, error);
            return [];
        }
    }

    // Get similar accounts
    async getSimilarAccounts(username: string): Promise<Array<{
        username: string;
        full_name: string;
        profile_pic_url: string;
        follower_count: number;
    }>> {
        try {
            const data = await this.makeRequest('fetch_similar_accounts_by_username', { username });
            
            if (!data.data?.users) {
                return [];
            }

            return data.data.users.map((user: any) => ({
                username: user.username,
                full_name: user.full_name || '',
                profile_pic_url: user.profile_pic_url,
                follower_count: user.follower_count || 0
            }));
        } catch (error) {
            console.warn(`Similar accounts not available for @${username}`, error);
            return [];
        }
    }

    // Helper methods
    private getMediaType(item: any): 'photo' | 'video' | 'carousel' {
        if (item.media_type === 2) return 'video';
        if (item.media_type === 8) return 'carousel';
        return 'photo';
    }

    private extractHashtags(text: string): string[] {
        const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
        return (text.match(hashtagRegex) || []).map(tag => tag.toLowerCase());
    }

    private extractMentions(text: string): string[] {
        const mentionRegex = /@[\w.]+/g;
        return (text.match(mentionRegex) || []).map(mention => mention.toLowerCase());
    }
} 