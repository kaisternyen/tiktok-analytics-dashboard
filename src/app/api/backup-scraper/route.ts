import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Backup scraper that runs more frequently to catch missed hourly videos
export async function GET() {
    const startTime = Date.now();
    const now = new Date();
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentMinute = estTime.getMinutes();
    
    console.log(`🔄 BACKUP SCRAPER STARTED (${now.toISOString()})`);
    console.log(`🕐 Current time: ${estTime.toLocaleString()} (Minute ${currentMinute})`);
    
    try {
        // Call the main scrape-all endpoint
        const baseUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}` 
            : 'http://localhost:3000';
        
        console.log(`🔧 Calling main scraper: ${baseUrl}/api/scrape-all`);
        
        const response = await fetch(`${baseUrl}/api/scrape-all`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Backup-Scraper/1.0',
                'X-Backup-Scraper': 'true'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log(`✅ Backup scraper completed successfully`);
            
            return NextResponse.json({
                success: true,
                message: 'Backup scraper completed',
                timestamp: now.toISOString(),
                duration: Date.now() - startTime,
                result: result
            });
        } else {
            const error = await response.text();
            console.error(`❌ Backup scraper failed: ${response.status} - ${error}`);
            
            return NextResponse.json({
                success: false,
                error: `Backup scraper failed: ${response.status}`,
                details: error,
                timestamp: now.toISOString(),
                duration: Date.now() - startTime
            }, { status: 500 });
        }
        
    } catch (error) {
        console.error(`💥 Backup scraper crashed:`, error);
        
        return NextResponse.json({
            success: false,
            error: 'Backup scraper crashed',
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: now.toISOString(),
            duration: Date.now() - startTime
        }, { status: 500 });
    }
}
