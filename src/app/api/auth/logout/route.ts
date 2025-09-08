import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  
  // Clear the authentication cookie
  response.cookies.set('isAuthenticated', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
    path: '/',
    // Add domain if needed for production
    ...(process.env.NODE_ENV === 'production' && process.env.COOKIE_DOMAIN && {
      domain: process.env.COOKIE_DOMAIN
    })
  });

  console.log('🔐 Authentication cookie cleared successfully');
  return response;
}
