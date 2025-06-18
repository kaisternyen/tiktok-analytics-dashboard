# 📊 Tracked Accounts System

## Overview

The Tracked Accounts system allows you to automatically monitor social media accounts and add their new content to your analytics dashboard. This feature supports two types of tracking:

1. **All Content**: Automatically adds ALL new videos/posts from the account
2. **Keyword Filter**: Only adds content that contains specific keywords (e.g., "blok", "#blok", "@Blok")

## 🚀 Features

### Supported Platforms
- **TikTok**: Track TikTok creators using TikHub API
- **Instagram**: Track Instagram accounts using TikHub API  
- **YouTube**: Track YouTube channels using YouTube Data API v3

### Account Types
- **All Content**: Automatically tracks every new post/video
- **Keyword Filter**: Only tracks content containing specified keywords
  - Supports exact matches: "blok"
  - Supports hashtags: "#blok"
  - Supports mentions: "@Blok"

### Automation
- **Hourly Checks**: Cron job runs every hour to check for new content
- **Smart Filtering**: Avoids duplicate content using lastVideoId tracking
- **Batch Processing**: Processes multiple accounts efficiently

## 🛠️ Setup

### 1. Database Migration

First, update your database schema:

```bash
npx prisma db push
npx prisma generate
```

### 2. Environment Variables

Ensure you have the required API keys:

```bash
# Required for TikTok and Instagram
TIKHUB_API_KEY=your_tikhub_api_key

# Required for YouTube
YOUTUBE_API_KEY=your_youtube_api_key

# Database
DATABASE_URL=your_database_url
```

### 3. Cron Jobs

The system includes two cron jobs (requires Vercel Pro):

```json
{
  "crons": [
    {
      "path": "/api/scrape-all",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/tracked-accounts/check", 
      "schedule": "0 * * * *"
    }
  ]
}
```

## 📱 Usage

### Adding Tracked Accounts

1. Navigate to **Tracked Accounts** page
2. Click **Add Account**
3. Fill in the details:
   - **Username**: The account handle (e.g., "blokcreator")
   - **Platform**: TikTok, Instagram, or YouTube
   - **Account Type**: All Content or Keyword Filter
   - **Keyword**: Required for keyword-filtered accounts

### Managing Accounts

- **Active/Pause**: Toggle account monitoring
- **Edit**: Change account type or keywords
- **Delete**: Stop tracking an account
- **Check Now**: Manually trigger content check

### Monitoring

- View last check time for each account
- See account status (Active/Paused)
- Monitor keyword filters
- Track platform-specific icons

## 🔧 API Endpoints

### Tracked Accounts Management

```typescript
// GET /api/tracked-accounts
// List all tracked accounts

// POST /api/tracked-accounts  
// Create new tracked account
{
  "username": "blokcreator",
  "platform": "instagram",
  "accountType": "keyword",
  "keyword": "blok"
}

// PUT /api/tracked-accounts
// Update tracked account
{
  "id": "account_id",
  "isActive": true,
  "accountType": "all"
}

// DELETE /api/tracked-accounts?id=account_id
// Delete tracked account
```

### Content Checking

```typescript
// GET /api/tracked-accounts/check
// Check all active accounts for new content

// POST /api/tracked-accounts/check
// Manually trigger content check
```

## 🏗️ Architecture

### Database Schema

```sql
model TrackedAccount {
  id          String   @id @default(cuid())
  username    String   // Account username/handle
  platform    String   // "tiktok", "instagram", "youtube"
  accountType String   @default("all") // "all" or "keyword"
  keyword     String?  // Required for keyword type
  isActive    Boolean  @default(true)
  lastChecked DateTime @default(now())
  createdAt   DateTime @default(now())
  lastVideoId String?  // Track last seen video ID
  
  @@unique([username, platform])
}
```

### File Structure

```
src/
├── app/
│   ├── tracked-accounts/
│   │   └── page.tsx                    # Frontend page
│   └── api/
│       └── tracked-accounts/
│           ├── route.ts                # CRUD operations
│           └── check/
│               └── route.ts            # Content checking
├── lib/
│   └── account-scrapers.ts             # Platform-specific scrapers
└── components/
    └── TikTokTracker.tsx               # Updated with navigation
```

## 🔍 Content Fetching

### Platform-Specific Implementation

The system includes placeholder implementations for each platform. To complete the implementation:

#### TikTok
```typescript
// Use TikHub API to fetch user videos
const response = await fetch(
  `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_user_videos?unique_id=${username}`,
  { headers: { 'Authorization': `Bearer ${apiKey}` } }
);
```

#### Instagram  
```typescript
// Use TikHub API to fetch user posts
const response = await fetch(
  `https://api.tikhub.io/api/v1/instagram/web_app/fetch_user_posts?username=${username}`,
  { headers: { 'Authorization': `Bearer ${apiKey}` } }
);
```

#### YouTube
```typescript
// Use YouTube Data API v3
const response = await fetch(
  `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=50&key=${apiKey}`
);
```

## 🧪 Testing

Run the test script to verify the system:

```bash
node test-tracked-accounts.js
```

## 📊 Monitoring & Analytics

### Dashboard Integration

Tracked accounts automatically add videos to your main dashboard:
- Videos appear in the **Videos** tab
- Included in aggregate metrics
- Full analytics and growth tracking
- Adaptive scraping cadence

### Status Monitoring

- **Active Accounts**: Currently being monitored
- **Last Check**: When account was last checked
- **New Videos**: Count of videos added in last check
- **Error Status**: Failed checks and error messages

## 🔒 Security & Rate Limits

### API Rate Limiting
- Sequential processing to avoid overwhelming APIs
- 2-second delays between account checks
- Respectful API usage patterns

### Error Handling
- Graceful failure handling
- Detailed error logging
- Automatic retry mechanisms
- Account status tracking

## 🚀 Deployment

### Vercel Deployment

1. Push code to repository
2. Set environment variables in Vercel dashboard
3. Enable cron jobs (Pro plan required)
4. Deploy automatically

### Local Development

```bash
# Install dependencies
npm install

# Set up database
npx prisma db push
npx prisma generate

# Run development server
npm run dev

# Test tracked accounts
node test-tracked-accounts.js
```

## 📈 Future Enhancements

### Planned Features
- **Batch Account Import**: Import multiple accounts at once
- **Advanced Keywords**: Regex patterns, multiple keywords
- **Content Scheduling**: Check accounts at specific times
- **Analytics Dashboard**: Track account performance metrics
- **Webhook Notifications**: Real-time alerts for new content

### Platform Expansion
- **Twitter/X**: Track tweets and threads
- **LinkedIn**: Monitor company posts
- **Twitch**: Track stream highlights
- **Reddit**: Monitor subreddit posts

## 🐛 Troubleshooting

### Common Issues

**Database Errors**
```bash
# Regenerate Prisma client
npx prisma generate

# Reset database (development only)
npx prisma db push --force-reset
```

**API Key Issues**
- Verify TikHub API key is valid
- Check YouTube API key permissions
- Ensure API quotas are not exceeded

**Cron Job Issues**
- Verify Vercel Pro plan is active
- Check cron job syntax in vercel.json
- Monitor execution logs in Vercel dashboard

### Debug Commands

```bash
# Check database connection
npx prisma db pull

# Test API endpoints
curl https://your-domain.com/api/tracked-accounts

# Manual content check
curl -X POST https://your-domain.com/api/tracked-accounts/check
```

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review API documentation
3. Check Vercel deployment logs
4. Verify environment variables

---

**Note**: The platform-specific content fetching is currently implemented as placeholders. You'll need to complete the implementation using the appropriate APIs for each platform. 