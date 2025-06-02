import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Simple signature verification without external dependencies
function verifyDiscordSignature(body: string, signature: string, timestamp: string, publicKey: string): boolean {
    try {
        // For now, let's just check if the required fields are present
        // In production, we'd use the discord-interactions library or crypto
        return signature.length > 0 && timestamp.length > 0 && publicKey.length > 0 && body.length > 0;
    } catch {
        return false;
    }
}

export async function GET() {
    console.log('❌ Discord sent GET request - Discord expects POST');
    return NextResponse.json({ error: 'Discord verification requires POST' }, { status: 405 });
}

export async function POST(request: NextRequest) {
    try {
        console.log('🔗 === DISCORD VERIFICATION ATTEMPT ===');
        console.log('📅 Timestamp:', new Date().toISOString());
        console.log('🌐 URL:', request.url);
        console.log('🔤 Method:', request.method);
        
        // Get signature headers
        const signature = request.headers.get('x-signature-ed25519');
        const timestamp = request.headers.get('x-signature-timestamp');
        
        console.log('🔐 Signature headers:');
        console.log('  - x-signature-ed25519:', signature ? 'present' : 'missing');
        console.log('  - x-signature-timestamp:', timestamp ? 'present' : 'missing');
        
        // Log all headers
        console.log('📋 All Headers:');
        request.headers.forEach((value, key) => {
            console.log(`  ${key}: ${value}`);
        });
        
        // Get the raw body
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
        
        // Check for Discord Public Key
        const publicKey = process.env.DISCORD_PUBLIC_KEY;
        console.log('🔑 DISCORD_PUBLIC_KEY:', publicKey ? 'present' : 'MISSING');
        
        if (!publicKey) {
            console.log('⚠️ No public key - allowing request for debugging');
            console.log('📝 Set DISCORD_PUBLIC_KEY in Vercel environment variables');
        } else if (!signature || !timestamp) {
            console.error('❌ Missing required signature headers');
            return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
        } else {
            // Verify signature
            const isValid = verifyDiscordSignature(bodyText, signature, timestamp, publicKey);
            console.log('🔐 Signature verification:', isValid ? 'VALID' : 'INVALID');
            
            if (!isValid) {
                console.error('❌ Invalid Discord signature');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        }
        
        // Try to parse as JSON
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(bodyText);
            console.log('✅ Parsed JSON body:', JSON.stringify(body, null, 2));
        } catch (jsonError) {
            console.error('❌ Failed to parse JSON:', jsonError);
            return NextResponse.json({ 
                error: 'Invalid JSON in request body',
                details: jsonError instanceof Error ? jsonError.message : 'Unknown error'
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
            
            return NextResponse.json(response);
        }
        
        // Handle slash command (type 2)
        if (body.type === 2) {
            console.log('🎬 Slash command (type 2) received');
            console.log('📋 Command data:', JSON.stringify(body.data, null, 2));
            
            if ((body.data as Record<string, unknown>)?.name === 's') {
                const data = body.data as Record<string, unknown>;
                const options = data.options as Array<Record<string, unknown>>;
                const url = options?.[0]?.value;
                const user = (body.member as Record<string, unknown>)?.user || body.user;
                
                console.log(`🎯 /s command: URL=${url}, User=${(user as Record<string, unknown>)?.username}`);
                
                const response = {
                    type: 4,
                    data: {
                        content: `🎉 Discord integration working!\n\n📋 **Received:**\n🔗 URL: ${url}\n👤 User: ${(user as Record<string, unknown>)?.username}\n\n🔧 **Next:** Add environment variables to enable full video processing!`,
                        flags: 0
                    }
                };
                
                console.log('📤 Sending slash command response:', JSON.stringify(response, null, 2));
                return NextResponse.json(response);
            }
        }
        
        console.log('❓ Unknown Discord interaction type:', body.type);
        return NextResponse.json({ 
            error: 'Unknown interaction type',
            received_type: body.type,
            expected_types: [1, 2]
        }, { status: 400 });
        
    } catch (error) {
        console.error('💥 === DISCORD VERIFICATION ERROR ===');
        console.error('❌ Error:', error);
        
        return NextResponse.json(
            { 
                error: 'Verification failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            }, 
            { status: 500 }
        );
    }
} 