import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        
        // Simple ping response for Discord verification
        if (body.type === 1) {
            return NextResponse.json({ type: 1 });
        }
        
        // Handle slash command
        if (body.type === 2 && body.data?.name === 's') {
            const url = body.data.options?.[0]?.value;
            const user = body.member?.user || body.user;
            
            return NextResponse.json({
                type: 4,
                data: {
                    content: `✅ Received URL: ${url}\n👤 From: ${user?.username}\n🔧 Processing system coming soon!`,
                    flags: 0
                }
            });
        }
        
        return NextResponse.json({ error: 'Unknown interaction' }, { status: 400 });
        
    } catch (error) {
        console.error('Discord error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
} 