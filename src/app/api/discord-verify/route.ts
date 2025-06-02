import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    console.log('❌ Discord sent GET request - Discord expects POST');
    return NextResponse.json({ error: 'Discord verification requires POST' }, { status: 405 });
}

export async function POST(request: NextRequest) {
    try {
        console.log('🔗 === DISCORD VERIFICATION ATTEMPT ===');
        console.log('📅 Timestamp:', new Date().toISOString());
        console.log('🌐 URL:', request.url);
        console.log('🔤 Method:', request.method);
        
        // Log all headers
        console.log('📋 Headers:');
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
            console.log(`  ${key}: ${value}`);
        });
        
        // Try to get the raw body first
        let bodyText: string;
        try {
            bodyText = await request.text();
            console.log('📝 Raw body text:', bodyText);
            console.log('📏 Body length:', bodyText.length);
        } catch (textError) {
            console.error('❌ Failed to read body as text:', textError);
            return NextResponse.json({ 
                error: 'Could not read request body',
                details: textError instanceof Error ? textError.message : 'Unknown error'
            }, { status: 400 });
        }
        
        // Try to parse as JSON
        let body: any;
        try {
            body = JSON.parse(bodyText);
            console.log('✅ Parsed JSON body:', JSON.stringify(body, null, 2));
        } catch (jsonError) {
            console.error('❌ Failed to parse JSON:', jsonError);
            console.log('🔍 Raw body was:', bodyText);
            return NextResponse.json({ 
                error: 'Invalid JSON in request body',
                details: jsonError instanceof Error ? jsonError.message : 'Unknown error',
                rawBody: bodyText
            }, { status: 400 });
        }
        
        // Check for required Discord fields
        console.log('🔍 Body analysis:');
        console.log('  - type:', body.type, '(type:', typeof body.type, ')');
        console.log('  - id:', body.id);
        console.log('  - application_id:', body.application_id);
        console.log('  - token:', body.token ? 'present' : 'missing');
        
        // Handle Discord verification ping (type 1)
        if (body.type === 1) {
            console.log('✅ Discord ping (type 1) received - responding with pong');
            
            const response = { type: 1 };
            console.log('📤 Sending response:', JSON.stringify(response));
            
            const nextResponse = NextResponse.json(response);
            console.log('✅ Response created successfully');
            
            return nextResponse;
        }
        
        // Handle slash command (type 2)
        if (body.type === 2) {
            console.log('🎬 Slash command (type 2) received');
            console.log('📋 Command data:', JSON.stringify(body.data, null, 2));
            
            if (body.data?.name === 's') {
                const url = body.data.options?.[0]?.value;
                const user = body.member?.user || body.user;
                
                console.log(`🎯 /s command: URL=${url}, User=${user?.username}`);
                
                const response = {
                    type: 4,
                    data: {
                        content: `🎉 Discord integration working!\n\n📋 **Received:**\n🔗 URL: ${url}\n👤 User: ${user?.username}\n\n🔧 **Next:** Add environment variables to enable full video processing!`,
                        flags: 0
                    }
                };
                
                console.log('📤 Sending slash command response:', JSON.stringify(response, null, 2));
                return NextResponse.json(response);
            }
        }
        
        console.log('❓ Unknown Discord interaction type:', body.type);
        console.log('🔍 Full body for unknown type:', JSON.stringify(body, null, 2));
        
        return NextResponse.json({ 
            error: 'Unknown interaction type',
            received_type: body.type,
            expected_types: [1, 2]
        }, { status: 400 });
        
    } catch (error) {
        console.error('💥 === DISCORD VERIFICATION ERROR ===');
        console.error('❌ Error type:', error?.constructor?.name);
        console.error('❌ Error message:', error instanceof Error ? error.message : 'Unknown error');
        console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('🕐 Error timestamp:', new Date().toISOString());
        
        return NextResponse.json(
            { 
                error: 'Verification failed',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            }, 
            { status: 500 }
        );
    }
} 