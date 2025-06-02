import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        console.log('🔗 Discord verification attempt');
        
        const body = await request.json();
        console.log('📋 Discord body:', body);
        
        // Handle Discord verification ping (type 1)
        if (body.type === 1) {
            console.log('✅ Discord ping received - responding with pong');
            return NextResponse.json({ type: 1 });
        }
        
        // Handle slash command (type 2)
        if (body.type === 2 && body.data?.name === 's') {
            const url = body.data.options?.[0]?.value;
            const user = body.member?.user || body.user;
            
            console.log(`🎬 /s command received: ${url} from ${user?.username}`);
            
            return NextResponse.json({
                type: 4,
                data: {
                    content: `🎉 Discord integration working!\n\n📋 **Received:**\n🔗 URL: ${url}\n👤 User: ${user?.username}\n\n🔧 **Next:** Add environment variables to enable full video processing!`,
                    flags: 0
                }
            });
        }
        
        console.log('❓ Unknown Discord interaction type:', body.type);
        return NextResponse.json({ error: 'Unknown interaction' }, { status: 400 });
        
    } catch (error) {
        console.error('💥 Discord verification error:', error);
        return NextResponse.json(
            { 
                error: 'Verification failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }, 
            { status: 500 }
        );
    }
} 