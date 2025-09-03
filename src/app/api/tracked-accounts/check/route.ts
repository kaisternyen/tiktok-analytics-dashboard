import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkTrackedAccount } from '@/lib/account-scrapers';

export const dynamic = 'force-dynamic';

// GET endpoint for manual triggering and cron jobs
export async function GET() {
    const startTime = Date.now();
    console.log(`🚀 ===== TRACKED ACCOUNTS CHECK STARTED (${new Date().toISOString()}) =====`);

    try {
        // Fetch all active tracked accounts
        const accounts = await prisma.trackedAccount.findMany({
            where: { isActive: true },
            orderBy: { lastChecked: 'asc' } // Check oldest first
        });

        console.log(`📋 Found ${accounts.length} active tracked accounts to check`);

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

        for (const account of accounts) {
            const result = await checkTrackedAccount({
                id: account.id,
                username: account.username,
                platform: account.platform,
                accountType: account.accountType as 'all' | 'keyword',
                keyword: account.keyword || undefined
            });
            results.push(result);
            totalNewVideos += result.newVideos;

            // Increased delay between accounts to prevent rate limiting
            console.log(`⏱️ Rate limiting: waiting 5 seconds before next account...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
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