import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Clean up videos from accounts that are no longer being tracked
async function cleanupOrphanedVideos(): Promise<{ deactivated: number; accounts: string[]; details: Array<{username: string; platform: string; videoCount: number}> }> {
    try {
        // Get all currently active tracked accounts
        const trackedAccounts = await prisma.trackedAccount.findMany({
            where: { isActive: true },
            select: { username: true, platform: true }
        });
        
        console.log(`📋 Found ${trackedAccounts.length} active tracked accounts`);
        
        // Get all active videos
        const activeVideos = await prisma.video.findMany({
            where: { isActive: true },
            select: { id: true, username: true, platform: true }
        });
        
        console.log(`📊 Found ${activeVideos.length} active videos`);
        
        // Find orphaned videos (videos from accounts no longer tracked)
        const orphanedVideos = activeVideos.filter(video => {
            return !trackedAccounts.some(acc => 
                acc.username === video.username && acc.platform === video.platform
            );
        });
        
        if (orphanedVideos.length === 0) {
            console.log(`✅ No orphaned videos found`);
            return { deactivated: 0, accounts: [], details: [] };
        }
        
        console.log(`🚨 Found ${orphanedVideos.length} orphaned videos from untracked accounts:`);
        
        // Group by account for detailed reporting
        const accountGroups = orphanedVideos.reduce((acc, video) => {
            const key = `${video.username}:${video.platform}`;
            if (!acc[key]) {
                acc[key] = { username: video.username, platform: video.platform, videoCount: 0 };
            }
            acc[key].videoCount++;
            return acc;
        }, {} as Record<string, {username: string; platform: string; videoCount: number}>);
        
        const details = Object.values(accountGroups);
        const orphanedAccounts = details.map(d => `@${d.username} (${d.platform}) - ${d.videoCount} videos`);
        
        orphanedAccounts.forEach(account => console.log(`   - ${account}`));
        
        // Don't deactivate orphaned videos - keep them active
        console.log(`🧹 Found ${orphanedVideos.length} orphaned videos (keeping active)`);
        
        return { 
            deactivated: 0, 
            accounts: orphanedAccounts,
            details
        };
        
    } catch (error) {
        console.error(`❌ Error cleaning up orphaned videos:`, error);
        throw error;
    }
}

export async function POST() {
    const startTime = Date.now();
    
    try {
        console.log('🧹 ===== ORPHANED VIDEO CLEANUP STARTED =====');
        
        const result = await cleanupOrphanedVideos();
        const duration = Date.now() - startTime;
        
        console.log('🏁 ===== CLEANUP COMPLETED =====');
        console.log(`📊 Results: ${result.deactivated} videos deactivated from ${result.details.length} accounts`);
        console.log(`⏱️ Duration: ${duration}ms`);
        
        return NextResponse.json({
            success: true,
            message: result.deactivated > 0 
                ? `Successfully deactivated ${result.deactivated} orphaned videos from ${result.details.length} untracked accounts`
                : 'No orphaned videos found - all active videos belong to tracked accounts',
            deactivated: result.deactivated,
            accountsAffected: result.details.length,
            details: result.details,
            orphanedAccounts: result.accounts,
            duration
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('💥 CLEANUP FAILED:', errorMessage);
        
        return NextResponse.json({
            success: false,
            error: errorMessage,
            duration
        }, { status: 500 });
    }
}

// Also allow GET for easy testing
export async function GET() {
    return POST();
}
