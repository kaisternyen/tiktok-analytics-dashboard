import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    console.log('🔧 Debug cron endpoint hit');
    
    return NextResponse.json({
        success: true,
        message: 'Debug cron endpoint accessible',
        timestamp: new Date().toISOString(),
        headers: {
            userAgent: process.env.HTTP_USER_AGENT || 'unknown',
            vercelCron: process.env.VERCEL_CRON || 'false'
        }
    });
}

export async function POST() {
    console.log('🔧 Debug cron POST endpoint hit');
    return GET();
} 