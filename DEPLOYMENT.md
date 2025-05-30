# 🚀 Deployment Guide

Complete deployment guide for the TikTok Analytics Dashboard.

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL database (Neon DB recommended)
- TikHub API account
- Vercel account (for easy deployment)

## 🌍 Environment Variables

### Required Variables
```bash
# TikHub API Configuration
TIKHUB_API_KEY=your_tikhub_api_key_here

# Database Configuration  
DATABASE_URL=postgresql://user:password@host:port/database

# Optional: Redis for caching (if using BullMQ)
REDIS_URL=redis://localhost:6379
```

### Getting TikHub API Key
1. Visit [TikHub API](https://api.tikhub.io)
2. Sign up for an account
3. Navigate to your dashboard
4. Copy your API key
5. Add to environment variables

### Example .env.local
```bash
TIKHUB_API_KEY=tikhub_api_0cULMFde4RJ5fclZJ5c5mPQZwnzbM43ELzw0
DATABASE_URL=postgresql://username:password@ep-cool-cloud-123456.us-east-1.postgres.vercel-storage.com/verceldb
REDIS_URL=redis://default:password@host:port
```

## 🚀 Vercel Deployment (Recommended)

### 1. Connect Repository
1. Push your code to GitHub/GitLab
2. Visit [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your repository

### 2. Configure Build Settings
```bash
# Build Command (auto-detected)
npm run build

# Output Directory (auto-detected)  
.next

# Install Command (auto-detected)
npm install
```

### 3. Environment Variables
Add these in Vercel Dashboard → Settings → Environment Variables:
- `TIKHUB_API_KEY`
- `DATABASE_URL`
- `REDIS_URL` (optional)

### 4. Deploy
Click "Deploy" - Vercel handles everything automatically!

### 5. Enable Cron Jobs (Pro Plan Required)
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/scrape-all",
      "schedule": "0 * * * *"
    }
  ]
}
```

## 🗄️ Database Setup

### Neon DB (Recommended)
1. Visit [Neon](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Run migrations:
```bash
npx prisma migrate deploy
npx prisma generate
```

### Local PostgreSQL
```bash
# Install PostgreSQL locally
brew install postgresql  # macOS
# or install via your package manager

# Create database
createdb analytics_dashboard

# Set DATABASE_URL
DATABASE_URL=postgresql://localhost/analytics_dashboard
```

## 💰 Cost Estimation

### TikHub API Pricing
- **TikHub scraping**: Check current pricing at [TikHub Pricing](https://api.tikhub.io/pricing)
- **Free tier**: Available for testing
- **Batch processing**: More cost-effective for multiple videos

### Vercel Costs
- **Hobby Plan**: Free (with limitations)
- **Pro Plan**: $20/month (required for cron jobs)
- **Enterprise**: Custom pricing

### Database Costs
- **Neon**: Free tier available, paid plans from $19/month
- **Vercel Postgres**: Integrated with Vercel plans

## 🔧 Manual Deployment

### 1. Server Setup
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm postgresql

# CentOS/RHEL  
sudo yum install nodejs npm postgresql
```

### 2. Application Setup
```bash
# Clone repository
git clone <your-repo-url>
cd analytics_dashboard

# Install dependencies
npm ci --production

# Build application
npm run build
```

### 3. Process Manager (PM2)
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start npm --name "analytics-dashboard" -- start

# Auto-start on boot
pm2 startup
pm2 save
```

### 4. Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔐 Security Checklist

- [ ] Environment variables configured (TIKHUB_API_KEY + DATABASE_URL)
- [ ] Database connection secured with SSL
- [ ] API rate limiting implemented
- [ ] CORS properly configured
- [ ] HTTPS enabled in production
- [ ] Secrets not committed to repository

## 📊 Monitoring

### Vercel Analytics
- Enable in Vercel Dashboard
- Monitor performance and errors
- Track API usage

### Custom Monitoring
```bash
# Check application health
curl https://your-domain.com/api/health

# Monitor TikHub API usage
# (Check TikHub dashboard)
```

## 🐛 Troubleshooting

### Common Issues

**TikHub API Errors**
- Check API key validity
- Verify API usage limits
- Review TikHub status page

**Database Connection Issues**
- Verify DATABASE_URL format
- Check database server status
- Ensure proper SSL configuration

**Build Failures**
- Check Node.js version (18+ required)
- Verify all dependencies installed
- Review build logs for errors

**Cron Job Issues**
- Ensure Vercel Pro plan active
- Check cron syntax in vercel.json
- Monitor execution logs

### Debug Commands
```bash
# Check environment
npm run build

# Test database connection
npx prisma db push

# Validate TikHub connection
# (Test in application)
```

## 📈 Scaling Considerations

### Performance Optimization
- Use Redis for caching
- Implement connection pooling
- Optimize database queries
- Enable CDN for static assets

### Load Balancing
- Multiple Vercel deployments
- Database read replicas
- API rate limiting
- Queue system for heavy workloads

## 🔄 Maintenance

### Regular Tasks
- Monitor TikHub API usage
- Review database performance
- Update dependencies
- Check for rate limit issues
- Backup database regularly

### Updates
```bash
# Update dependencies
npm update

# Deploy new version
git push origin main  # Auto-deploys on Vercel
```

---

**Need help?** Check the [main README](README.md) or create an issue. 