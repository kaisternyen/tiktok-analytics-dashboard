# 🚀 TikTok Analytics Deployment Guide

## 📦 Free Deployment Setup

### Step 1: Set up Database (Required for Vercel)

**⚠️ IMPORTANT**: SQLite doesn't work on Vercel. You need a PostgreSQL database.

**Option A: Vercel Postgres (Recommended)**
1. Go to your Vercel dashboard
2. Select your project → Storage tab
3. Create → Postgres
4. Copy the `DATABASE_URL` from the `.env.local` tab

**Option B: Neon (Free alternative)**
1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project
3. Copy the connection string

### Step 2: Deploy to Vercel

1. **Push code to GitHub** (if not already done)
2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub
   - Click "Import Project"
   - Select your repository

3. **Configure Environment Variables** in Vercel:
   ```
   APIFY_API_TOKEN=apify_api_0cULMFde4RJ5fclZJ5c5mPQZwnzbM43ELzw0
   DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
   ```
   
   **⚠️ Replace `DATABASE_URL` with your actual PostgreSQL connection string from Step 1**

4. **Deploy**: Vercel will automatically deploy your app

### Step 3: Run Database Migration

After deployment, you need to set up the database schema:

1. **In your local terminal**:
   ```bash
   # Install Vercel CLI if not already installed
   npm i -g vercel
   
   # Login to Vercel
   vercel login
   
   # Link your project
   vercel link
   
   # Pull environment variables
   vercel env pull .env.local
   
   # Run migration
   npx prisma migrate deploy
   npx prisma generate
   ```

### Step 4: Set up GitHub Actions

1. **Add GitHub Secret**:
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add new secret: `VERCEL_URL`
   - Value: `https://your-app-name.vercel.app` (get this from Vercel dashboard)

2. **Enable Actions**:
   - GitHub Actions should automatically detect the workflow file
   - The workflow will run every hour starting from deployment

### Step 5: Test Manual Scraping

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
- **Vercel Postgres**: FREE (for starter projects)
- **GitHub Actions**: FREE (2000 minutes/month)
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
- **500 Errors**: Check DATABASE_URL is set correctly and database is accessible
- **Actions failing**: Check VERCEL_URL secret is correct
- **Scraping errors**: Check Apify API token and rate limits
- **Database issues**: Run `npx prisma migrate deploy` to sync schema

## 📊 Expected Performance

- **Scrape speed**: ~2-3 seconds per video
- **Concurrent limit**: 1 video at a time (respectful to TikTok)
- **Success rate**: 95%+ under normal conditions
- **Data freshness**: Updated every hour automatically

## 🚀 Going Live Checklist

- [ ] PostgreSQL database created (Vercel Postgres or Neon)
- [ ] Code pushed to GitHub
- [ ] Vercel deployment successful
- [ ] Environment variables configured (APIFY_API_TOKEN + DATABASE_URL)
- [ ] Database migration completed (`npx prisma migrate deploy`)
- [ ] VERCEL_URL secret added to GitHub
- [ ] Test manual scrape-all endpoint
- [ ] First automated run completed
- [ ] Dashboard shows real data

Your TikTok Analytics platform is now running on autopilot! 🎉 