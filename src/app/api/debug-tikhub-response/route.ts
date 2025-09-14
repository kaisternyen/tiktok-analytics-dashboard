import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();
        
        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Extract video ID
        const videoIdMatch = url.match(/\/video\/(\d+)/);
        if (!videoIdMatch) {
            return NextResponse.json({ error: 'Invalid TikTok URL' }, { status: 400 });
        }

        const videoId = videoIdMatch[1];
        const apiKey = process.env.TIKHUB_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: 'TIKHUB_API_KEY not configured' }, { status: 500 });
        }

        // Call TikHub API
        const tikHubUrl = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${videoId}`;
        
        const response = await fetch(tikHubUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'User-Agent': 'TikTok-Analytics-Dashboard/1.0'
            }
        });

        const responseText = await response.text();
        let apiResponse;
        
        try {
            apiResponse = JSON.parse(responseText);
        } catch (parseError) {
            return NextResponse.json({ 
                error: 'Failed to parse API response',
                rawResponse: responseText,
                parseError: parseError instanceof Error ? parseError.message : 'Unknown error'
            }, { status: 500 });
        }

        // Return the full response structure for debugging
        return NextResponse.json({
            success: true,
            tikHubUrl,
            videoId,
            responseStatus: response.status,
            responseHeaders: Object.fromEntries(response.headers.entries()),
            apiResponse,
            videoData: apiResponse.data?.aweme_status?.[0],
            dataKeys: apiResponse.data ? Object.keys(apiResponse.data) : [],
            videoDataKeys: apiResponse.data?.aweme_status?.[0] ? Object.keys(apiResponse.data.aweme_status[0]) : []
        });

    } catch (error) {
        console.error('Debug TikHub response error:', error);
        return NextResponse.json({ 
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
