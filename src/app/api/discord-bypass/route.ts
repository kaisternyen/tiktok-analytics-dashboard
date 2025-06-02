import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        console.log('🔗 === DISCORD BYPASS TEST ===');
        console.log('📅 Timestamp:', new Date().toISOString());
        
        const body = await request.json();
        console.log('📋 Body received:', JSON.stringify(body, null, 2));
        
        // Always respond to ping regardless of signature
        if (body.type === 1) {
            console.log('✅ Ping received - responding with pong (NO SIGNATURE CHECK)');
            return NextResponse.json({ type: 1 });
        }
        
        if (body.type === 2) {
            console.log('🎬 Slash command received');
            return NextResponse.json({
                type: 4,
                data: {
                    content: '🎉 BYPASS TEST SUCCESSFUL! Discord integration working without signature verification.',
                    flags: 0
                }
            });
        }
        
        console.log('❓ Unknown type:', body.type);
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
        
    } catch (error) {
        console.error('💥 Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
} 