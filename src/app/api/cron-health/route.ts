import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    return NextResponse.json({
        status: 'healthy',
        timestamp: now.toISOString(),
        estTime: estTime.toISOString(),
        currentHour: estTime.getHours(),
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            VERCEL: process.env.VERCEL,
            VERCEL_URL: process.env.VERCEL_URL,
            VERCEL_CRON_SECRET: process.env.VERCEL_CRON_SECRET ? 'Set' : 'Not Set'
        },
        cronJobs: {
            scrapeAll: {
                path: '/api/scrape-all',
                schedule: '0 * * * *',
                description: 'Scrapes hourly and daily videos every hour'
            },
            trackedAccounts: {
                path: '/api/tracked-accounts/check',
                schedule: '0 * * * *',
                description: 'Checks for new posts from tracked accounts every hour'
            }
        },
        message: 'Cron health check endpoint - use /api/cron-diagnostic for detailed analysis'
    });
}
