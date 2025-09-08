import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Manual trigger for cron jobs
export async function POST(req: Request) {
    const { job } = await req.json();
    
    try {
        let result;
        const baseUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}` 
            : 'http://localhost:3000';
        
        if (job === 'scrape-all' || job === 'all') {
            console.log('🔧 Manually triggering scrape-all...');
            const response = await fetch(`${baseUrl}/api/scrape-all`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Manual-Trigger/1.0'
                }
            });
            
            if (response.ok) {
                result = await response.json();
                console.log('✅ Scrape-all completed:', result);
            } else {
                const error = await response.text();
                console.error('❌ Scrape-all failed:', error);
                throw new Error(`Scrape-all failed: ${response.status} - ${error}`);
            }
        }
        
        if (job === 'tracked-accounts' || job === 'all') {
            console.log('🔧 Manually triggering tracked-accounts check...');
            const response = await fetch(`${baseUrl}/api/tracked-accounts/check`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Manual-Trigger/1.0'
                }
            });
            
            if (response.ok) {
                const accountResult = await response.json();
                console.log('✅ Tracked accounts check completed:', accountResult);
                result = { ...result, trackedAccounts: accountResult };
            } else {
                const error = await response.text();
                console.error('❌ Tracked accounts check failed:', error);
                throw new Error(`Tracked accounts check failed: ${response.status} - ${error}`);
            }
        }
        
        return NextResponse.json({
            success: true,
            message: `Manual ${job} trigger completed`,
            result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('💥 Manual cron trigger failed:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// Get status of manual triggers
export async function GET() {
    return NextResponse.json({
        availableJobs: ['scrape-all', 'tracked-accounts', 'all'],
        usage: 'POST with {"job": "scrape-all|tracked-accounts|all"}',
        timestamp: new Date().toISOString()
    });
}
