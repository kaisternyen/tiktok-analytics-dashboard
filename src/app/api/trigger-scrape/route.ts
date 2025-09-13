import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        console.log(`🚀 ===== MANUAL SCRAPE TRIGGER STARTED (${new Date().toISOString()}) =====`);
        
        // Trigger the scrape-all endpoint
        const baseUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}` 
            : 'http://localhost:3000';
        
        const scrapeUrl = `${baseUrl}/api/scrape-all`;
        console.log(`📡 Triggering scrape-all endpoint: ${scrapeUrl}`);
        
        const response = await fetch(scrapeUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'ManualTrigger',
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        console.log(`✅ Scrape-all response:`, result);
        
        return NextResponse.json({
            success: true,
            message: 'Scrape-all triggered successfully',
            timestamp: new Date().toISOString(),
            scrapeResult: result
        });
        
    } catch (error) {
        console.error(`❌ MANUAL TRIGGER ERROR:`, error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
