import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        console.log('🔧 Starting database migration for adaptive cadence fields...');

        // Add the new columns to the videos table
        await prisma.$executeRaw`
            ALTER TABLE videos 
            ADD COLUMN IF NOT EXISTS "scrapingCadence" TEXT DEFAULT 'hourly',
            ADD COLUMN IF NOT EXISTS "lastDailyViews" INTEGER,
            ADD COLUMN IF NOT EXISTS "dailyViewsGrowth" INTEGER,
            ADD COLUMN IF NOT EXISTS "needsCadenceCheck" BOOLEAN DEFAULT false
        `;

        console.log('✅ Successfully added adaptive cadence fields to database');

        // Update existing videos to have default cadence using raw SQL
        const updateResult = await prisma.$executeRaw`
            UPDATE videos 
            SET "scrapingCadence" = 'hourly', "needsCadenceCheck" = false 
            WHERE "scrapingCadence" IS NULL
        `;

        console.log(`✅ Updated existing videos with default cadence`);

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
            error: errorMessage
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Use POST to run database migration for adaptive cadence fields',
        fields: ['scrapingCadence', 'lastDailyViews', 'dailyViewsGrowth', 'needsCadenceCheck']
    });
} 