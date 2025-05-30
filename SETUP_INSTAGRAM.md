# 🚀 Instagram Setup Instructions

## Current Status
✅ **Instagram API Integration** - Complete  
✅ **Frontend UI Updates** - Complete  
⚠️ **Database Schema** - Needs migration  
⚠️ **Testing** - Ready for testing  

## 🔧 Required Steps to Complete Setup

### 1. Database Migration (Required)
Run this command in your **deployed environment** (where you have DATABASE_URL):

```bash
# Option 1: Push schema changes (recommended for development)
npx prisma db push

# Option 2: Generate and apply migration (recommended for production)
npx prisma migrate dev --name add-instagram-support
```

### 2. Verify Environment Variables
Make sure your deployed environment has:
```bash
TIKHUB_API_KEY="your_api_key_here"
DATABASE_URL="your_database_url_here"
```

### 3. Test Instagram Integration
After the database migration, test with these URLs:
- **Instagram Post**: `https://www.instagram.com/p/[POST_ID]/`
- **Instagram Reel**: `https://www.instagram.com/reel/[REEL_ID]/`

## 🐛 Current Error Resolution

The **500 error on `/api/videos`** and **400 error on `/api/scrape-instagram`** are happening because:

1. **Missing Database Fields**: The code expects `platform`, `isReel`, and `location` fields that don't exist yet
2. **Schema Mismatch**: Prisma is trying to access fields that haven't been migrated

## 💡 Temporary Workaround
The code now includes **graceful fallbacks** that:
- ✅ Detect if new fields exist in the schema
- ✅ Only use Instagram fields if available
- ✅ Fall back to basic schema if needed
- ✅ Provide detailed debugging logs

## 📊 What Will Work After Migration

### Before Migration (Current):
- ❌ Instagram tracking returns errors
- ❌ Platform detection not stored
- ❌ Videos list may have issues

### After Migration:
- ✅ Full Instagram post and reel tracking
- ✅ Platform-specific UI indicators
- ✅ Instagram-specific data (location, reel detection)
- ✅ Unified TikTok + Instagram analytics

## 🔍 Debugging Commands

Check your current schema:
```bash
npx prisma db pull
npx prisma generate
```

View database structure:
```bash
npx prisma studio
```

Check migration status:
```bash
npx prisma migrate status
```

## 📱 After Setup Verification

Once migration is complete, verify:

1. **UI Updates**:
   - Instagram gradient icon appears
   - Reel badges show for reels
   - Location tags appear

2. **API Responses**:
   - `/api/videos` returns 200 status
   - `/api/scrape-instagram` works with Instagram URLs
   - Platform field populated correctly

3. **Database**:
   - New fields exist: `platform`, `isReel`, `location`
   - Instagram content saved with correct platform

## 🚨 If Issues Persist

1. **Check Console Logs**: Detailed debugging is now active
2. **Verify TikHub API**: Test with a simple TikTok URL first
3. **Database Connection**: Ensure DATABASE_URL is accessible
4. **API Key**: Verify TIKHUB_API_KEY works for Instagram endpoints

---

**Ready for migration!** 🎉 Once you run the database migration in your deployed environment, Instagram support will be fully functional. 