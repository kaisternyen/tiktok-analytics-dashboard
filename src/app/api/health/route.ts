import { NextResponse } from 'next/server';

export async function GET() {
    console.log('🏥 Health check endpoint hit');

    try {
        // Check environment variables
        const apiKey = process.env.TIKHUB_API_KEY;
        const hasApiKey = !!apiKey;
        const apiKeyLength = apiKey?.length || 0;
        const apiKeyPreview = apiKey ? apiKey.substring(0, 10) + '...' : 'NOT_FOUND';

        console.log('🔍 Environment check:', {
            nodeEnv: process.env.NODE_ENV,
            hasApiKey,
            apiKeyLength,
            apiKeyPreview
        });

        // Test TikHub API connection with a simple test
        let tikHubStatus = 'UNKNOWN';
        let tikHubError = null;
        let tikHubResponse = null;

        if (hasApiKey) {
            try {
                console.log('🌐 Testing TikHub API connection...');

                // Use a simple test endpoint or the same endpoint we use normally
                const testUrl = 'https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=7494355764417547551';

                const response = await fetch(testUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
                    }
                });

                console.log('📡 TikHub test response:', {
                    status: response.status,
                    statusText: response.statusText,
                    ok: response.ok
                });

                if (response.ok) {
                    tikHubStatus = 'CONNECTED';
                    tikHubResponse = {
                        status: response.status,
                        statusText: response.statusText
                    };
                } else {
                    tikHubStatus = 'ERROR';
                    const errorText = await response.text();
                    tikHubError = `${response.status} ${response.statusText}: ${errorText}`;
                }
            } catch (error) {
                console.error('❌ TikHub API test failed:', error);
                tikHubStatus = 'FAILED';
                tikHubError = error instanceof Error ? error.message : String(error);
            }
        } else {
            tikHubStatus = 'NO_API_KEY';
            tikHubError = 'TIKHUB_API_KEY environment variable not found';
        }

        // Return comprehensive health status
        return NextResponse.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'unknown',
            deployment: {
                vercel: !!process.env.VERCEL,
                region: process.env.VERCEL_REGION || 'unknown',
                url: process.env.VERCEL_URL || 'unknown'
            },
            apiKey: {
                configured: hasApiKey,
                length: apiKeyLength,
                preview: apiKeyPreview
            },
            tikHub: {
                status: tikHubStatus,
                error: tikHubError,
                response: tikHubResponse
            },
            database: {
                configured: !!process.env.DATABASE_URL,
                preview: process.env.DATABASE_URL ?
                    process.env.DATABASE_URL.substring(0, 20) + '...' : 'NOT_FOUND'
            }
        });

    } catch (error) {
        console.error('💥 Health check failed:', error);
        return NextResponse.json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
} 