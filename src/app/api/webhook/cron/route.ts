import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        // Simple auth check - you can set this in Vercel env vars
        const authHeader = request.headers.get('authorization');
        const expectedAuth = process.env.CRON_SECRET || 'your-secret-key';

        if (authHeader !== `Bearer ${expectedAuth}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`🔔 Webhook cron triggered at ${new Date().toISOString()}`);

        // Call our scrape-all endpoint internally
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000';

        const response = await fetch(`${baseUrl}/api/scrape-all`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Webhook-Cron/1.0'
            }
        });

        const result = await response.json();

        console.log(`✅ Webhook scrape completed:`, result.message);

        return NextResponse.json({
            success: true,
            message: 'Webhook cron executed successfully',
            scrapeResult: result
        });

    } catch (error) {
        console.error('💥 Webhook cron failed:', error);
        return NextResponse.json(
            {
                error: 'Webhook cron failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    return GET(request); // Support both GET and POST
} 