# 🔄 Migration Guide: Apify to TikHub API

This guide helps you migrate your TikTok Analytics Dashboard from Apify to TikHub API.

## 📋 Migration Overview

**What's Changing:**
- **Scraping Service**: Apify → TikHub API
- **Environment Variable**: `APIFY_API_TOKEN` → `TIKHUB_API_KEY`
- **Service File**: `src/lib/apify.ts` → `src/lib/tikhub.ts`
- **Dependencies**: Removed `apify-client` package

**What Stays the Same:**
- Database schema and existing data
- API endpoints (`/api/scrape`, `/api/scrape-all`)
- Frontend functionality and UI
- Data structure and interfaces

## 🚀 Quick Migration Steps

### 1. Get TikHub API Key
1. Visit [TikHub API](https://api.tikhub.io)
2. Sign up for an account
3. Navigate to your dashboard
4. Copy your API key

### 2. Update Environment Variables

**Local Development:**
```bash
# Remove old variable from .env.local
# APIFY_API_TOKEN=apify_api_xxxxx

# Add new variable
TIKHUB_API_KEY=your_tikhub_api_key_here
```

**Production (Vercel):**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Delete `APIFY_API_TOKEN`
3. Add `TIKHUB_API_KEY` with your TikHub API key
4. Redeploy your application

### 3. Update Code (Already Done)
The following changes have been made for you:
- ✅ Created new TikHub service (`src/lib/tikhub.ts`)
- ✅ Updated API routes to use TikHub
- ✅ Removed Apify client dependency
- ✅ Updated documentation

### 4. Install Dependencies
```bash
# Remove old Apify dependency
npm uninstall apify-client

# Install updated dependencies
npm install
```

### 5. Test Migration
```bash
# Test locally
npm run dev

# Test scraping endpoint
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123"}'
```

## 🔧 Detailed Migration Steps

### Environment Variable Migration

**Before (Apify):**
```env
APIFY_API_TOKEN=apify_api_0cULMFde4RJ5fclZJ5c5mPQZwnzbM43ELzw0
DATABASE_URL=postgresql://...
```

**After (TikHub):**
```env
TIKHUB_API_KEY=tikhub_api_0cULMFde4RJ5fclZJ5c5mPQZwnzbM43ELzw0
DATABASE_URL=postgresql://...
```

### Code Changes Summary

**Service Layer:**
- `src/lib/apify.ts` → `src/lib/tikhub.ts`
- `scrapeTikTokVideo()` function updated to use TikHub API
- `scrapeTikTokVideos()` function enhanced with batch processing

**API Routes:**
- `src/app/api/scrape/route.ts` - Import updated
- `src/app/api/scrape-all/route.ts` - Import updated

**Dependencies:**
- Removed: `apify-client`
- No new dependencies added (uses native `fetch`)

## 🆚 API Comparison

### Request Differences

**Apify (Old):**
```javascript
// Used Apify Actor
const run = await client.actor('clockworks/tiktok-video-scraper').call({
  postURLs: [url],
  shouldDownloadCovers: false,
  shouldDownloadSlideshowImages: false,
  shouldDownloadSubtitles: false,
  shouldDownloadVideos: false
});
```

**TikHub (New):**
```javascript
// Direct API call
const response = await fetch('https://api.tikhub.io/api/v1/tiktok/web/fetch_video', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ url: cleanUrl })
});
```

### Response Mapping

**Apify Response → TikHub Response:**
```javascript
// Apify fields → TikHub fields
authorMeta.name → author.unique_id
playCount → statistics.play_count
diggCount → statistics.digg_count
commentCount → statistics.comment_count
shareCount → statistics.share_count
createTimeISO → create_time (timestamp)
videoMeta.coverUrl → video.cover
musicMeta → music
```

## 🔍 Data Validation

### Testing Your Migration

1. **Environment Check:**
```bash
# Check if TikHub API key is configured
echo $TIKHUB_API_KEY
```

2. **API Connectivity:**
```bash
# Test TikHub API directly
curl -X POST https://api.tikhub.io/api/v1/tiktok/web/fetch_video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123"}'
```

3. **Application Test:**
```bash
# Test your scraping endpoint
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123"}'
```

## 💰 Cost Comparison

### Apify vs TikHub
- **Apify**: ~$0.35-0.40 per 1000 video scrapes
- **TikHub**: Check [current pricing](https://api.tikhub.io/pricing)

### Migration Cost Considerations
- TikHub offers batch processing for better efficiency
- Free tier available for testing
- Monitor usage in TikHub dashboard

## 🐛 Troubleshooting

### Common Migration Issues

**1. Environment Variable Not Set**
```
Error: TIKHUB_API_KEY environment variable is not configured
```
**Solution:** Ensure `TIKHUB_API_KEY` is set in your environment.

**2. API Key Invalid**
```
Error: TikHub API error: 401 Unauthorized
```
**Solution:** Verify your API key is correct and active.

**3. Rate Limiting**
```
Error: TikHub API error: 429 Too Many Requests
```
**Solution:** Check your TikHub usage limits and implement delays.

**4. Data Format Differences**
```
Error: Cannot read property 'xxx' of undefined
```
**Solution:** The TikHub integration handles data transformation automatically.

### Debug Steps

1. **Check Environment:**
```bash
npm run build
```

2. **Verify API Key:**
```bash
# Test API key validity
curl -H "Authorization: Bearer $TIKHUB_API_KEY" \
  https://api.tikhub.io/api/v1/tiktok/web/fetch_video
```

3. **Review Logs:**
- Check Vercel function logs
- Monitor TikHub dashboard for usage
- Review application console for errors

## 📊 Performance Comparison

### Speed Improvements
- **TikHub**: Direct API calls (faster)
- **Apify**: Actor-based processing (slower)

### Reliability Improvements
- **Better Error Handling**: More detailed error responses
- **Batch Processing**: Handle multiple videos efficiently
- **Rate Limiting**: Built-in respect for API limits

## ✅ Migration Checklist

### Pre-Migration
- [ ] TikHub account created
- [ ] API key obtained
- [ ] Current data backed up

### Migration
- [ ] Environment variables updated locally
- [ ] Environment variables updated in production
- [ ] Dependencies updated (`npm install`)
- [ ] Code changes applied
- [ ] Application tested locally

### Post-Migration
- [ ] Production deployment successful
- [ ] Scraping endpoints working
- [ ] Existing videos still accessible
- [ ] New video scraping functional
- [ ] Cron jobs running (if enabled)
- [ ] Monitoring TikHub usage

### Verification
- [ ] Single video scraping works
- [ ] Batch scraping works
- [ ] Data format matches expectations
- [ ] Performance meets requirements
- [ ] Error handling works correctly

## 🔄 Rollback Plan

If you need to rollback to Apify:

1. **Restore Environment Variable:**
```bash
# Remove TikHub
unset TIKHUB_API_KEY

# Restore Apify
export APIFY_API_TOKEN=your_apify_token
```

2. **Restore Code:**
```bash
# Restore from backup
git checkout HEAD~1 src/lib/apify.ts
git checkout HEAD~1 src/app/api/scrape/route.ts
git checkout HEAD~1 src/app/api/scrape-all/route.ts
```

3. **Restore Dependencies:**
```bash
npm install apify-client@^2.12.4
```

## 📞 Support

### Migration Help
- Review this guide thoroughly
- Test in development environment first
- Check TikHub documentation: [api.tikhub.io/docs](https://api.tikhub.io/docs)

### Issues & Questions
- Create GitHub issue for code-related problems
- Contact TikHub support for API-related issues
- Review application logs for debugging

---

**Migration Complete!** 🎉 Your TikTok Analytics Dashboard now uses TikHub API for improved performance and reliability. 