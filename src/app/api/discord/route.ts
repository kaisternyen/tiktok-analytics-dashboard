import { NextRequest, NextResponse } from 'next/server';

// Discord signature verification dependencies
import nacl from 'tweetnacl';

// Helper to verify Discord signature
function verifyDiscordRequest(req: NextRequest, body: Buffer) {
  const signature = req.headers.get('x-signature-ed25519');
  const timestamp = req.headers.get('x-signature-timestamp');
  const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
  if (!signature || !timestamp || !PUBLIC_KEY) return false;
  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body.toString()),
    Buffer.from(signature, 'hex'),
    Buffer.from(PUBLIC_KEY, 'hex')
  );
}

export async function POST(req: NextRequest) {
  // Discord sends raw body, so we need to buffer it
  const body = await req.arrayBuffer();
  const buf = Buffer.from(body);

  // Verify signature
  if (!verifyDiscordRequest(req, buf)) {
    return new NextResponse('Invalid request signature', { status: 401 });
  }

  // Parse interaction
  const json = JSON.parse(buf.toString());

  // Discord PING check
  if (json.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Handle /submit command
  if (json.data && json.data.name === 'submit') {
    const urlOption = json.data.options?.find((opt: { name: string; value: string }) => opt.name === 'url');
    const url = urlOption?.value;
    if (!url) {
      return NextResponse.json({
        type: 4,
        data: { content: 'Please provide a video URL.' }
      });
    }
    // Immediate response to Discord
    return NextResponse.json({
      type: 4,
      data: { content: `Received! We'll review and add: ${url}` }
    });
  }

  return NextResponse.json({ type: 4, data: { content: 'Unknown command.' } });
} 