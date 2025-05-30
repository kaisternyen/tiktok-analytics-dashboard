# 🔑 TikHub API Setup Guide

## Get Your TikHub API Key

### Step 1: Create TikHub Account
1. **Visit**: [https://tikhub.io](https://tikhub.io)
2. **Click**: "Get API Key" or "Start Free Trial"
3. **Sign up**: Create account with email verification
4. **Verify**: Check your email and verify your account

### Step 2: Choose Your Plan

#### 🆓 **FREE OPTION** (Recommended to Start)
- **Daily free credits** through check-in feature
- **No credit card required**
- Perfect for testing and development
- Credits never expire

#### 💰 **Paid Plans** (For Production)
- **$0.001 per request** (most endpoints)
- **Volume discounts** up to 50% off
- **Pay-as-you-go** model (no subscriptions)

### Step 3: Generate API Key
1. **Login** to [TikHub Dashboard](https://tikhub.io)
2. **Go to**: Profile → API Settings
3. **Click**: "Generate API Key"
4. **⚠️ SAVE IMMEDIATELY**: Key is only shown once!
5. **Copy** the API key (starts with "Bearer" or similar)

## Configure Your Environment

### Step 4: Set Environment Variable

Create a `.env.local` file in your project root:

```bash
# TikHub API Configuration
TIKHUB_API_KEY="your_actual_api_key_here"

# Database (if not already set)
DATABASE_URL="postgresql://username:password@localhost:5432/analytics_dashboard"

# Next.js (if not already set)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"
```

### Step 5: Verify Setup

Run this command to test your setup:

```bash
npm run build
```

If successful, your TikHub API key is configured correctly!

## Quick Test

You can test your API key by making a simple request:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.tikhub.io/api/v1/tiktok/web/fetch_video?aweme_id=7304809083817774382"
```

## Cost Estimation

### For Your Analytics Dashboard:
- **Single video**: ~$0.001 per scrape
- **Batch scraping**: More efficient with multi-video endpoint
- **Daily costs**: Depends on how many videos you track
- **Free tier**: Should cover initial testing

### Example Monthly Costs:
- **100 videos/day**: ~$3/month
- **500 videos/day**: ~$15/month  
- **1000 videos/day**: ~$25/month (with volume discounts)

## Support & Resources

- **Documentation**: [TikHub API Docs](https://docs.tikhub.io)
- **Support**: Available through TikHub dashboard
- **Community**: Developer community for help
- **Status**: Check [API Status](https://status.tikhub.io)

## Next Steps

1. ✅ Get your TikHub API key
2. ✅ Add to `.env.local` file
3. ✅ Test with `npm run build`
4. ✅ Deploy to Vercel with environment variable
5. ✅ Start scraping TikTok data!

## Troubleshooting

### Common Issues:
- **401 Unauthorized**: Check API key format
- **Rate limiting**: Respect API limits
- **Invalid response**: Verify endpoint URLs

### Need Help?
- Check the `MIGRATION_GUIDE.md` for detailed migration info
- Contact TikHub support through their dashboard
- Review the updated `README.md` for usage examples 