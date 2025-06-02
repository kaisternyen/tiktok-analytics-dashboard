import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        message: 'Use POST to run database migration for adaptive cadence fields',
        fields: ['scrapingCadence', 'lastDailyViews', 'dailyViewsGrowth', 'needsCadenceCheck']
    });
}

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        const testMode = url.searchParams.get('test');
        
        if (testMode === 'true') {
            // Temporarily set all videos to testing cadence
            const updateResult = await prisma.video.updateMany({
                where: { isActive: true },
                data: {
                    scrapingCadence: 'testing'
                }
            });
            
            return NextResponse.json({
                success: true,
                message: 'All videos updated to testing cadence',
                videosUpdated: updateResult.count
            });
        }
        
        // Regular migration logic
        console.log('🔄 Starting database migration for adaptive cadence fields...');
        
        // Check if fields exist by trying to query them
        let fieldsNeedAdding = false;
        try {
            await prisma.video.findFirst({
                select: {
                    scrapingCadence: true,
                    lastDailyViews: true,
                    dailyViewsGrowth: true,
                    needsCadenceCheck: true
                }
            });
            console.log('✅ Cadence fields already exist in database');
        } catch {
            fieldsNeedAdding = true;
            console.log('⚠️ Cadence fields need to be added to database');
        }

        // If migration is needed, update existing videos with default values
        if (fieldsNeedAdding || true) {  // Force update for now
            console.log('🔄 Updating existing videos with default cadence values...');
            
            const updateResult = await prisma.video.updateMany({
                where: { isActive: true },
                data: {
                    scrapingCadence: 'hourly',  // Default to hourly for existing videos
                    lastDailyViews: null,
                    dailyViewsGrowth: null,
                    needsCadenceCheck: false
                }
            });
            
            console.log(`✅ Updated ${updateResult.count} videos with cadence fields`);
        }

        return NextResponse.json({
            success: true,
            message: 'Database migration completed successfully',
            details: {
                fieldsAdded: ['scrapingCadence', 'lastDailyViews', 'dailyViewsGrowth', 'needsCadenceCheck'],
                updateExecuted: true
            }
        });

    } catch (error) {
        console.error('💥 Database migration failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        return NextResponse.json({
            success: false,
            error: 'Database migration failed',
            details: errorMessage
        }, { status: 500 });
    }
} 