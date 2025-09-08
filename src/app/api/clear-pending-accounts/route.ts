import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkTrackedAccount } from '@/lib/account-scrapers';

// Force dynamic rendering for cron jobs
export const dynamic = 'force-dynamic';

interface AccountResult {
    status: 'success' | 'failed' | 'skipped';
    username: string;
    platform: string;
    newVideos?: number;
    error?: string;
    reason?: string;
}

interface ProcessingResult {
    results: AccountResult[];
    successful: number;
    failed: number;
    skipped: number;
    totalNewVideos: number;
}

// CLEAR ALL PENDING ACCOUNTS - Force check everything regardless of timing
async function clearAllPendingAccounts(): Promise<ProcessingResult> {
    const startTime = Date.now();
    const results: AccountResult[] = [];
    let successful = 0;
    let failed = 0;
    const skipped = 0;
    let totalNewVideos = 0;

    console.log(`🚀 ===== CLEARING ALL PENDING ACCOUNTS =====`);

    try {
        // Get ALL active accounts - ignore timing completely
        const accounts = await prisma.trackedAccount.findMany({
            where: { 
                isActive: true
            },
            select: {
                id: true,
                username: true,
                platform: true,
                accountType: true,
                keyword: true,
                lastChecked: true,
                lastVideoId: true,
                lastPostAdded: true
            }
        });

        console.log(`📊 Found ${accounts.length} active accounts to process`);

        if (accounts.length === 0) {
            console.log('❌ No accounts found to process');
            return { results, successful, failed, skipped, totalNewVideos };
        }

        // Process accounts in smaller batches with timeout protection
        const batchSize = 3; // Smaller batches for accounts
        console.log(`🚀 Processing ${accounts.length} accounts in batches of ${batchSize}`);

        for (let i = 0; i < accounts.length; i += batchSize) {
            const batch = accounts.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(accounts.length / batchSize);
            
            console.log(`📦 Processing account batch ${batchNum}/${totalBatches}: ${batch.map(a => `@${a.username}`).join(', ')}`);

            const batchPromises = batch.map(async (account, index) => {
                try {
                    console.log(`👤 [${i + index + 1}/${accounts.length}] Processing @${account.username} (${account.platform})...`);

                    // Add timeout protection for individual account checks
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Account check timeout after 30 seconds')), 30000);
                    });

                    const checkPromise = checkTrackedAccount({
                        id: account.id,
                        username: account.username,
                        platform: account.platform,
                        accountType: account.accountType as 'all' | 'keyword',
                        keyword: account.keyword || undefined
                    });

                    const result = await Promise.race([checkPromise, timeoutPromise]) as {
                        status: 'success' | 'failed' | 'no_new_content';
                        newVideos: number;
                        error?: string;
                    };

                    if (result.status === 'success' || result.status === 'no_new_content') {
                        // Update account last checked time
                        await prisma.trackedAccount.update({
                            where: { id: account.id },
                            data: {
                                lastChecked: new Date(),
                                lastVideoId: account.lastVideoId, // Keep existing since we don't track this in the result
                                lastPostAdded: result.newVideos > 0 ? new Date() : account.lastPostAdded
                            }
                        });

                        totalNewVideos += result.newVideos;
                        console.log(`✅ [${i + index + 1}] @${account.username}: ${result.newVideos} new videos added`);

                        return {
                            status: 'success' as const,
                            username: account.username,
                            platform: account.platform,
                            newVideos: result.newVideos,
                            reason: 'Account checked successfully'
                        };
                    } else {
                        console.error(`❌ [${i + index + 1}] @${account.username} failed: ${result.error}`);
                        return {
                            status: 'failed' as const,
                            username: account.username,
                            platform: account.platform,
                            error: result.error || 'Unknown error'
                        };
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`💥 [${i + index + 1}] @${account.username} crashed: ${errorMessage}`);
                    return {
                        status: 'failed' as const,
                        username: account.username,
                        platform: account.platform,
                        error: errorMessage
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(result => {
                results.push(result);
                if (result.status === 'success') successful++;
                else if (result.status === 'failed') failed++;
            });
        }

        const totalDuration = Date.now() - startTime;
        console.log(`🏁 ===== ACCOUNT CLEARING COMPLETED =====`);
        console.log(`📊 Results: ${successful} successful, ${failed} failed, ${skipped} skipped`);
        console.log(`📊 Total new videos added: ${totalNewVideos}`);
        console.log(`⏱️ Total duration: ${totalDuration}ms`);

        return { results, successful, failed, skipped, totalNewVideos };

    } catch (error) {
        console.error('💥 Error clearing pending accounts:', error);
        throw error;
    }
}

export async function POST() {
    const startTime = Date.now();
    console.log(`🚀 ===== CLEAR ALL PENDING ACCOUNTS REQUESTED =====`);

    try {
        const result = await clearAllPendingAccounts();
        const duration = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            message: `Cleared ${result.successful} accounts successfully, added ${result.totalNewVideos} new videos`,
            status: {
                totalProcessed: result.successful + result.failed,
                successful: result.successful,
                failed: result.failed,
                skipped: result.skipped,
                totalNewVideos: result.totalNewVideos,
                duration
            },
            results: result.results.slice(0, 20) // Limit results in response
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 CLEAR PENDING ACCOUNTS FAILED:', errorMessage);
        
        return NextResponse.json({
            success: false,
            error: errorMessage,
            status: {
                duration,
                crashed: true
            }
        }, { status: 500 });
    }
}
