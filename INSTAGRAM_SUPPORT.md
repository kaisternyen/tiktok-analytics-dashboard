# 📸 Instagram Support

Your TikTok Analytics Dashboard now supports **Instagram** content tracking using the same TikHub API key!

## 🆕 What's New

### Supported Instagram Content
- **Regular Posts** (photos and videos)
- **Instagram Reels** (automatically detected)
- **Stories** (if accessible via API)

### Platform Features
- **Automatic Platform Detection** - Just paste any Instagram URL
- **Instagram-specific Metrics** - Views, likes, comments (shares not available on Instagram)
- **Reel Indicators** - Clearly shows when content is a Reel
- **Location Data** - Displays location tags when available
- **Platform Icons** - Visual distinction between TikTok and Instagram content

## 🔗 Supported URL Formats

### Instagram URLs
```
https://www.instagram.com/p/ABC123/     # Regular posts
https://www.instagram.com/reel/DEF456/ # Reels  
https://instagr.am/p/GHI789/           # Short URLs
```

### TikTok URLs (still supported)
```
https://www.tiktok.com/@user/video/123 # Regular videos
https://vm.tiktok.com/ABC123/          # Short URLs
https://www.tiktok.com/t/DEF456/       # Mobile URLs
```

## 🎯 How to Use

1. **Paste Instagram URL** - The system automatically detects the platform
2. **Click "Track Content"** - Works for both TikTok and Instagram
3. **View Analytics** - All metrics are tracked and displayed together
4. **Platform Filtering** - Easily identify content by platform icons

## 📊 Instagram vs TikTok Metrics

| Metric | TikTok | Instagram | Notes |
|--------|--------|-----------|--------|
| Views | ✅ | ✅ | Full support |
| Likes | ✅ | ✅ | Full support |  
| Comments | ✅ | ✅ | Full support |
| Shares | ✅ | ❌ | Instagram API limitation |
| Music/Audio | ✅ | ❌ | TikTok-specific |
| Location | ❌ | ✅ | Instagram-specific |
| Reel Detection | ❌ | ✅ | Instagram-specific |

## 🔧 Technical Implementation

### Database Schema
```sql
-- New fields added to support Instagram
ALTER TABLE videos ADD COLUMN platform VARCHAR(20) DEFAULT 'tiktok';
ALTER TABLE videos ADD COLUMN isReel BOOLEAN NULL;
ALTER TABLE videos ADD COLUMN location VARCHAR(255) NULL;
```

### API Endpoints
- `/api/scrape` - TikTok content (existing)
- `/api/scrape-instagram` - Instagram content (new)
- `/api/videos` - Returns both platforms (updated)

### TikHub API Usage
- **TikTok**: `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video`
- **Instagram**: `https://api.tikhub.io/api/v1/instagram/web/fetch_post_detail`

## 🚀 Getting Started

No additional setup required! Your existing TikHub API key works for both platforms.

### Rate Limits
- Same rate limits apply to both platforms
- Approximately $0.001 per request for both TikTok and Instagram
- Batch processing available for efficiency

### Error Handling
- Clear error messages for each platform
- Platform-specific troubleshooting
- Graceful fallbacks for unsupported content

## 🔍 Features by Platform

### TikTok
- ✅ Video metrics tracking
- ✅ Music/sound information
- ✅ Hashtag extraction
- ✅ Share count tracking
- ✅ Growth analytics

### Instagram  
- ✅ Post/Reel metrics tracking
- ✅ Location data
- ✅ Reel vs Post distinction
- ✅ Hashtag extraction from captions
- ✅ Growth analytics
- ❌ Share count (API limitation)
- ❌ Music data (not available)

## 💡 Pro Tips

1. **Mixed Analytics** - Track both platforms in one dashboard
2. **Platform Comparison** - Compare performance across platforms
3. **Content Strategy** - Use location data for Instagram geo-targeting
4. **Reel Focus** - Identify high-performing Reels vs regular posts
5. **Cross-Platform Growth** - Monitor total audience across platforms

## 🐛 Known Limitations

- Instagram share counts not available via API
- Private Instagram accounts cannot be tracked
- Some Instagram posts may require additional permissions
- Stories have limited tracking capabilities

---

**Need Help?** Check the main README or create an issue for Instagram-specific questions. 