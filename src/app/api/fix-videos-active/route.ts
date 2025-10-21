import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        console.log('🔧 Setting all videos to isActive: true');
        
        const result = await prisma.video.updateMany({
            where: {
                isActive: false
            },
            data: {
                isActive: true
            }
        });
        
        console.log(`✅ Updated ${result.count} videos to active`);
        
        return NextResponse.json({
            success: true,
            message: `Updated ${result.count} videos to active`,
            count: result.count
        });
        
    } catch (error) {
        console.error('❌ Error fixing videos:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fix videos'
        }, { status: 500 });
    }
}
