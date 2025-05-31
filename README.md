# 📊 TikTok Analytics Dashboard

A powerful analytics dashboard for tracking TikTok video performance over time using real-time scraping via TikHub API.

## ✨ Features

- **Real-time TikTok Scraping**: Powered by TikHub's robust TikTok API
- **Performance Tracking**: Monitor views, likes, comments, and shares over time
- **Beautiful Charts**: Visualize growth trends with interactive charts
- **Automated Updates**: Hourly cron jobs for continuous monitoring
- **Multiple Videos**: Track unlimited TikTok videos simultaneously
- **Smart Processing**: Intelligent batch processing with rate limiting
- **Cost Effective**: Optimized API usage to minimize costs

## 🔑 **IMPORTANT: Get Your TikHub API Key First!**

Before you can use this dashboard, you need a TikHub API key:

1. **Visit**: [https://tikhub.io](https://tikhub.io)
2. **Sign up**: Create a free account (no credit card required)
3. **Verify**: Check your email and verify your account
4. **Get API key**: Generate your API key in the dashboard
5. **Daily credits**: Use the check-in feature for free daily credits

📖 **Detailed setup guide**: See `TIKHUB_SETUP.md` for step-by-step instructions.

🧪 **Test your key**: Run `node test-tikhub-api.js` after setup.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL database (or Neon DB)
- TikHub account (free tier available)

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd analytics_dashboard
npm install
```

2. **Set up your database**
```bash
# Set up your PostgreSQL database URL
npx prisma migrate dev
npx prisma generate
```

3. **Set up TikHub**
- Create a free account at [TikHub](https://api.tikhub.io)
- Get your API key from the dashboard
- Copy your API key

4. **Configure environment variables**
```bash
echo "TIKHUB_API_KEY=your_tikhub_api_key_here" > .env.local
echo "DATABASE_URL=your_database_url_here" >> .env.local
```

5. **Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📈 How it Works

### Adding a Video

1. **Paste TikTok URL**: Copy any TikTok video URL
2. **Click "Start Tracking"**: The app will scrape the video data using TikHub
3. **View Analytics**: See real-time metrics and historical trends

### Automated Monitoring

- Videos are automatically re-scraped every hour via Vercel cron jobs
- Historical data is stored for trend analysis
- Smart processing only updates videos that need refreshing

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (Neon DB)
- **Scraping**: TikHub API integration
- **Charts**: Recharts
- **Styling**: Tailwind CSS
- **Deployment**: Vercel

## 🔄 Data Flow

1. User submits TikTok URL
2. Next.js API validates and cleans the URL
3. Backend uses TikHub's TikTok API
4. Data is transformed and stored in PostgreSQL
5. Frontend displays real-time analytics

## 📊 TikHub API Integration Details

### Single Video Scraping
- **Endpoint**: `/api/v1/tiktok/web/fetch_video`
- **Method**: POST with video URL
- **Authentication**: Bearer token (API key)
- **Rate Limiting**: Respectful delays between requests

### Batch Processing
- **Endpoint**: `/api/v1/tiktok/app/v3/fetch_multi_video`
- **Method**: POST with multiple URLs
- **Optimization**: Processes multiple videos in single request
- **Fallback**: Individual requests if batch fails

### Data Transformation
Raw TikHub data is transformed to standardized format:
- Video metadata (ID, URL, description)
- Performance metrics (views, likes, comments, shares)
- User information (username, profile data)
- Content details (hashtags, music, thumbnails)
- Timestamps for tracking changes

## 📁 Project Structure

```
analytics_dashboard/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── scrape/           # Single video scraping
│   │   │   └── scrape-all/       # Batch processing & cron
│   │   ├── components/           # React components
│   │   └── page.tsx             # Main dashboard
│   └── lib/
│       ├── prisma.ts            # Database client
│       └── tikhub.ts            # TikHub integration service
└── prisma/
    └── schema.prisma            # Database schema
```

## 🌍 Environment Variables

```env
TIKHUB_API_KEY=your_token_here    # Required for scraping
DATABASE_URL=your_db_url_here     # PostgreSQL connection
```

## 🎯 Performance & Costs

### API Usage Optimization
- **Smart Caching**: Only scrapes videos that need updates
- **Batch Processing**: Multiple videos in single API call
- **Rate Limiting**: Respects platform guidelines through TikHub
- **Error Handling**: Graceful failures with detailed logging
- **Compliance**: Follows TikHub's terms of service

### Cost Estimation
Typical costs with TikHub API (varies by plan):
- **Small Scale**: 100 videos tracked = ~$X/month
- **Medium Scale**: 1000 videos tracked = ~$Y/month  
- **Enterprise**: Custom pricing available

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect your repository** to Vercel
2. **Configure environment variables** in Vercel dashboard
3. **Enable cron jobs** for automated scraping (Pro plan required)
4. **Deploy** - automatic deployments on push

### Manual Deployment

See `DEPLOYMENT.md` for detailed manual deployment instructions.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

- **TikHub Help**: [TikHub Documentation](https://api.tikhub.io/docs)
- **Next.js**: [Next.js Documentation](https://nextjs.org/docs)
- **Prisma**: [Prisma Documentation](https://www.prisma.io/docs)

## 📄 License

MIT License - see LICENSE file for details.

**Built with ❤️ using Next.js, TypeScript, and TikHub API**
# Trigger deployment to fix Prisma schema sync
