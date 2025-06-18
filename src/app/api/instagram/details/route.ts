import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramAccountDetails } from '@/lib/account-scrapers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username parameter is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Fetching detailed Instagram data for @${username}...`);

    const instagramData = await fetchInstagramAccountDetails(username);

    return NextResponse.json({
      success: true,
      data: instagramData,
      message: `Successfully fetched Instagram details for @${username}`
    });

  } catch (error) {
    console.error('Instagram details API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Instagram details',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 