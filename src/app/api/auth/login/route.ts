import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  // Set the authentication cookie with more robust settings
  response.cookies.set('isAuthenticated', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
    maxAge: 60 * 60 * 24 * 30, // 30 days instead of 7
    path: '/',
    // Add domain if needed for production
    ...(process.env.NODE_ENV === 'production' && process.env.COOKIE_DOMAIN && {
      domain: process.env.COOKIE_DOMAIN
    })
  });

  console.log('🔐 Authentication cookie set successfully');
  return response;
} 