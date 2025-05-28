# 🚀 TikTok Analytics Deployment Guide

## 📦 Free Deployment Setup

### Step 1: Deploy to Vercel

1. **Push code to GitHub** (if not already done)
2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub
   - Click "Import Project"
   - Select your repository

3. **Configure Environment Variables** in Vercel:
   ```
   APIFY_API_TOKEN=apify_api_0cULMFde4RJ5fclZJ5c5mPQZwnzbM43ELzw0
   DATABASE_URL=file:./dev.db
   ```

4. **Deploy**: Vercel will automatically deploy your app

### Step 2: Set up GitHub Actions

1. **Add GitHub Secret**:
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add new secret: `VERCEL_URL`
   - Value: `https://your-app-name.vercel.app` (get this from Vercel dashboard)

2. **Enable Actions**:
   - GitHub Actions should automatically detect the workflow file
   - The workflow will run every hour starting from deployment

### Step 3: Test Manual Scraping

Visit these URLs to test:
- **Manual scrape all**: `https://your-app.vercel.app/api/scrape-all`
- **View videos**: `https://your-app.vercel.app/api/videos`
- **Dashboard**: `https://your-app.vercel.app`

## 🕐 Automation Schedule

- **Frequency**: Every hour at minute 0 (12:00, 1:00, 2:00, etc.)
- **Manual trigger**: Go to GitHub Actions tab → "Hourly TikTok Video Scraping" → "Run workflow"
- **Logs**: Check GitHub Actions tab for detailed logs of each run

## 💰 Cost Breakdown

- **Vercel hosting**: FREE
- **GitHub Actions**: FREE (2000 minutes/month)
- **Database**: FREE (SQLite in repo)
- **Apify scraping**: ~$0.35-0.40 per 1000 scrapes

**Example monthly costs**:
- 50 videos × 24 hours × 30 days = 36,000 scrapes = ~$13-15/month
- 100 videos = ~$25-30/month

## 🔧 Monitoring & Maintenance

### Check GitHub Actions Logs
1. Go to your repo → Actions tab
2. Click on latest "Hourly TikTok Video Scraping" run
3. Expand steps to see detailed logs

### Manual Triggers
- **Scrape all videos**: Visit `/api/scrape-all`
- **Add new video**: Use the dashboard form
- **View raw data**: Visit `/api/videos`

### Troubleshooting
- **Actions failing**: Check VERCEL_URL secret is correct
- **Scraping errors**: Check Apify API token and rate limits
- **Database issues**: Prisma migrations may be needed

## 📊 Expected Performance

- **Scrape speed**: ~2-3 seconds per video
- **Concurrent limit**: 1 video at a time (respectful to TikTok)
- **Success rate**: 95%+ under normal conditions
- **Data freshness**: Updated every hour automatically

## 🚀 Going Live Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel deployment successful
- [ ] Environment variables configured
- [ ] VERCEL_URL secret added to GitHub
- [ ] Test manual scrape-all endpoint
- [ ] First automated run completed
- [ ] Dashboard shows real data

Your TikTok Analytics platform is now running on autopilot! 🎉 