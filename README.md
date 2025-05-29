# 📊 TikTok Performance Tracker

A powerful analytics dashboard for tracking TikTok video performance over time using real-time scraping via Apify.

## ✨ Features

- **Real-time TikTok Scraping**: Powered by Apify's robust TikTok scrapers
- **Performance Tracking**: Monitor views, likes, comments, and shares over time
- **Interactive Charts**: Beautiful visualizations of performance metrics
- **Video-specific Insights**: Detailed analytics for each tracked video
- **Automated Updates**: Hourly tracking with smart frequency adjustment
- **Modern UI**: Built with Next.js, TypeScript, and Tailwind CSS

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Apify account (free tier available)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd analytics_dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Apify**
   - Create a free account at [Apify](https://apify.com)
   - Go to [Settings > Integrations](https://console.apify.com/settings/integrations)
   - Copy your API token

4. **Configure environment variables**
   ```bash
   # Create .env.local file
   echo "APIFY_API_TOKEN=your_apify_api_token_here" > .env.local
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 How to Use

### Adding Videos to Track

1. **Paste TikTok URL**: Copy any TikTok video URL (e.g., `https://www.tiktok.com/@user/video/123`)
2. **Click "Start Tracking"**: The app will scrape the video data using Apify
3. **View Results**: The video appears in your tracked videos list with current metrics

### Viewing Insights

1. **Click on any video card** in the "Tracked Videos" tab
2. **Automatic switch** to the "Insights" tab for that specific video
3. **Explore metrics**: View performance overview and time-series charts

### Supported URL Formats

- `https://www.tiktok.com/@username/video/1234567890`
- `https://tiktok.com/@username/video/1234567890`
- `https://vm.tiktok.com/shortcode`

## 🔧 Technical Architecture

### Frontend
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **shadcn/ui** for components
- **Recharts** for data visualization

### Backend
- **Apify Integration** for TikTok scraping
- **API Routes** for server-side logic
- **Real-time data processing**

### Data Flow
1. User submits TikTok URL
2. Frontend calls `/api/scrape` endpoint
3. Backend uses Apify's TikTok Video Scraper
4. Data is processed and returned to frontend
5. Video added to tracking list with initial metrics

## 📊 Apify Integration Details

### Scrapers Used
- **Primary**: `clockworks/tiktok-video-scraper`
- **Fallback**: `clockworks/tiktok-scraper`

### Data Extracted
- **Video Metrics**: Views, likes, comments, shares
- **Author Info**: Username, verification status, follower count
- **Video Details**: Duration, description, upload time
- **Engagement Data**: Historical performance tracking

### Cost Efficiency
- **~$0.35-0.40** per 1000 video scrapes
- **Free tier** available for testing
- **Batch processing** for multiple videos

## 🔄 Future Enhancements

### Planned Features
- **Database Storage**: Persistent data with PostgreSQL/MongoDB
- **Automated Scheduling**: Cron jobs for regular updates
- **Smart Frequency**: Adjust tracking frequency based on video age/performance
- **Export Features**: CSV/JSON data export
- **Alerts**: Notifications for performance milestones
- **Competitor Analysis**: Track multiple creators
- **Advanced Analytics**: Growth rates, engagement rates, trending detection

### Tracking Logic (Planned)
- **First Week**: Hourly updates
- **After 1 Week**: Every 6 hours
- **After 1 Month**: Daily updates
- **Flatlined Videos**: Weekly updates

## 🛠️ Development

### Project Structure
```
src/
├── app/
│   ├── api/scrape/          # Scraping API endpoint
│   └── page.tsx             # Main page
├── components/
│   ├── ui/                  # shadcn/ui components
│   └── TikTokTracker.tsx    # Main tracker component
└── lib/
    └── apify.ts             # Apify integration service
```

### Environment Variables
```bash
APIFY_API_TOKEN=your_token_here    # Required for scraping
DATABASE_URL=your_db_url           # Optional, for future use
```

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

## 🔒 Privacy & Ethics

- **Public Data Only**: Only scrapes publicly available TikTok data
- **Rate Limiting**: Respects platform guidelines through Apify
- **No Authentication**: Doesn't require TikTok login
- **Compliance**: Follows Apify's terms of service

## 📝 License

This project is for educational and research purposes. Please ensure compliance with TikTok's terms of service and applicable laws in your jurisdiction.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

- **Issues**: Create a GitHub issue
- **Apify Help**: [Apify Documentation](https://docs.apify.com)
- **TikTok API**: [TikTok for Developers](https://developers.tiktok.com)

---

**Built with ❤️ using Next.js, TypeScript, and Apify**
# Force deployment trigger
