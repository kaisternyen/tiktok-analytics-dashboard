import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkTrackedAccount } from '@/lib/account-scrapers';

export const dynamic = 'force-dynamic';

// GET endpoint for manual triggering and cron jobs
export async function GET() {
    const startTime = Date.now();
    console.log(`🚀 ===== TRACKED ACCOUNTS CHECK STARTED (${new Date().toISOString()}) =====`);
    console.log(`🔧 Process info: PID ${process.pid}, Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`🔧 Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}`);
    
    // Test database connection immediately
    try {
        console.log(`📊 Step 1: Testing database connection...`);
        const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
        console.log(`✅ Database connection successful:`, dbTest);
    } catch (error) {
        console.error(`❌ CRITICAL: Database connection failed:`, error);
        return NextResponse.json({ 
            error: 'Database connection failed', 
            details: error instanceof Error ? error.message : 'Unknown',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }

    try {
        // Fetch all active tracked accounts
        console.log(`📊 Step 2: Fetching active tracked accounts from database...`);
        const dbStartTime = Date.now();
        const accounts = await prisma.trackedAccount.findMany({
            where: { isActive: true },
            orderBy: { lastChecked: 'asc' } // Check oldest first
        });
        const dbDuration = Date.now() - dbStartTime;

        console.log(`📋 Found ${accounts.length} active tracked accounts to check (DB query: ${dbDuration}ms)`);
        console.log(`📊 Account breakdown: ${accounts.map(a => `${a.platform}:${a.username}`).join(', ')}`);
        
        if (accounts.length === 0) {
            console.log('❌ CRITICAL: No tracked accounts found - this explains why no new videos are being discovered!');
        }
        
        if (accounts.length > 20) {
            console.log(`⚠️ WARNING: Processing ${accounts.length} accounts - this may take significant time`);
        }

        if (accounts.length === 0) {
            console.log('⚠️ No active tracked accounts found');
            return NextResponse.json({
                success: true,
                message: 'No active tracked accounts to check',
                results: [],
                duration: Date.now() - startTime
            });
        }

        // Process accounts sequentially to avoid overwhelming APIs
        const results = [];
        let totalNewVideos = 0;
        const maxProcessingTime = 4 * 60 * 1000; // 4 minutes max
        let processed = 0;

        for (const account of accounts) {
            // Check timeout
            const elapsed = Date.now() - startTime;
            if (elapsed > maxProcessingTime) {
                console.log(`⏰ Approaching timeout (${elapsed}ms elapsed), stopping after ${processed} accounts`);
                break;
            }
            
            const accountStartTime = Date.now();
            console.log(`🔄 [${processed + 1}/${accounts.length}] Processing ${account.platform}:${account.username}...`);
            
            try {
                const result = await checkTrackedAccount({
                    id: account.id,
                    username: account.username,
                    platform: account.platform,
                    accountType: account.accountType as 'all' | 'keyword',
                    keyword: account.keyword || undefined
                });
                
                const accountDuration = Date.now() - accountStartTime;
                console.log(`✅ [${processed + 1}/${accounts.length}] ${account.platform}:${account.username} completed in ${accountDuration}ms - Status: ${result.status}, New videos: ${result.newVideos}`);
                
                results.push(result);
                totalNewVideos += result.newVideos;
                processed++;
                
                // Track slow accounts
                if (accountDuration > 5000) {
                    console.log(`🐌 SLOW ACCOUNT: ${account.platform}:${account.username} took ${accountDuration}ms`);
                }
                
            } catch (error) {
                const accountDuration = Date.now() - accountStartTime;
                console.error(`❌ [${processed + 1}/${accounts.length}] ${account.platform}:${account.username} FAILED in ${accountDuration}ms:`, error);
                
                results.push({
                    status: 'failed',
                    username: account.username,
                    platform: account.platform,
                    newVideos: 0,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                processed++;
            }

            // Add minimal delay only to prevent overwhelming external APIs
            if (processed < accounts.length) {
                console.log(`⏱️ Brief delay before next account... (${processed}/${accounts.length})`);
                await new Promise(resolve => setTimeout(resolve, 100)); // 100ms only
            }
        }

        const duration = Date.now() - startTime;
        const successfulChecks = results.filter(r => r.status === 'success').length;
        const failedChecks = results.filter(r => r.status === 'failed').length;
        const noNewContent = results.filter(r => r.status === 'no_new_content').length;

        console.log(`🏁 ===== TRACKED ACCOUNTS CHECK COMPLETED =====`);
        console.log(`📊 Results: ${successfulChecks} successful, ${failedChecks} failed, ${noNewContent} no new content`);
        console.log(`🎬 Total new videos found: ${totalNewVideos}`);
        console.log(`⏱️ Duration: ${duration}ms`);

        return NextResponse.json({
            success: true,
            message: `Checked ${accounts.length} tracked accounts`,
            results: {
                totalAccounts: accounts.length,
                successfulChecks,
                failedChecks,
                noNewContent,
                totalNewVideos,
                duration
            },
            accountResults: results
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 TRACKED ACCOUNTS CHECK CRASHED:', errorMessage);
        
        return NextResponse.json({
            success: false,
            error: errorMessage,
            results: {
                duration,
                crashed: true
            }
        }, { status: 500 });
    }
}

// POST endpoint for manual triggering
export async function POST() {
    console.log('🔧 Manual tracked accounts check triggered');
    return GET();
} 