import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    return NextResponse.json({
        success: true,
        timestamp: now.toISOString(),
        estTime: estTime.toISOString(),
        currentHour: estTime.getHours(),
        currentMinute: estTime.getMinutes(),
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            VERCEL: process.env.VERCEL,
            VERCEL_URL: process.env.VERCEL_URL,
            VERCEL_CRON_SECRET: process.env.VERCEL_CRON_SECRET ? 'Set' : 'Not Set'
        },
        cronStatus: {
            isVercelCron: !!process.env.VERCEL_CRON_SECRET,
            expectedSchedule: '0 * * * * (every hour at minute 0)',
            actualTime: `${estTime.getHours()}:${estTime.getMinutes().toString().padStart(2, '0')}`,
            isOnSchedule: estTime.getMinutes() === 0
        },
        message: 'This endpoint can be called manually to test cron job timing'
    });
}
