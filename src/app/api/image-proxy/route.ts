import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const imageUrl = searchParams.get('url');

        if (!imageUrl) {
            return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
        }

        console.log('🖼️ Proxying image:', imageUrl);

        // Determine if this is an Instagram image
        const isInstagramImage = imageUrl.includes('instagram.f') || imageUrl.includes('cdninstagram.com');
        
        // Try multiple strategies for Instagram images
        let response;
        let lastError = null;

        if (isInstagramImage) {
            console.log('📸 Detected Instagram image, trying enhanced headers...');
            
            // Strategy 1: Instagram-like headers
            try {
                response = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Instagram 219.0.0.12.117 Android',
                        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': 'https://www.instagram.com/',
                        'Origin': 'https://www.instagram.com',
                        'Sec-Fetch-Dest': 'image',
                        'Sec-Fetch-Mode': 'no-cors',
                        'Sec-Fetch-Site': 'cross-site',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    redirect: 'follow'
                });
                
                if (response.ok) {
                    console.log('✅ Instagram strategy 1 successful');
                } else {
                    throw new Error(`Strategy 1 failed: ${response.status}`);
                }
            } catch (error) {
                console.log('❌ Instagram strategy 1 failed:', error);
                lastError = error;
                
                // Strategy 2: Mobile browser headers
                try {
                    response = await fetch(imageUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
                            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Referer': 'https://www.instagram.com/',
                            'Sec-Fetch-Dest': 'image',
                            'Sec-Fetch-Mode': 'no-cors',
                            'Sec-Fetch-Site': 'cross-site'
                        },
                        redirect: 'follow'
                    });
                    
                    if (response.ok) {
                        console.log('✅ Instagram strategy 2 successful');
                    } else {
                        throw new Error(`Strategy 2 failed: ${response.status}`);
                    }
                } catch (error2) {
                    console.log('❌ Instagram strategy 2 failed:', error2);
                    lastError = error2;
                    
                    // Strategy 3: Minimal headers
                    try {
                        response = await fetch(imageUrl, {
                            headers: {
                                'Accept': '*/*',
                            },
                            redirect: 'follow'
                        });
                        
                        if (response.ok) {
                            console.log('✅ Instagram strategy 3 successful');
                        } else {
                            throw new Error(`Strategy 3 failed: ${response.status}`);
                        }
                    } catch (error3) {
                        console.log('❌ All Instagram strategies failed:', error3);
                        lastError = error3;
                        response = null;
                    }
                }
            }
        } else {
            // For non-Instagram images, use standard headers
            response = await fetch(imageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                }
            });
        }

        if (!response) {
            console.error('❌ All image fetching strategies failed:', lastError);
            
            // For Instagram images that fail, return a placeholder instead of an error
            if (isInstagramImage) {
                console.log('📸 Returning Instagram placeholder for failed image');
                
                // Create a simple SVG placeholder
                const placeholderSvg = `
                <svg width="150" height="150" xmlns="http://www.w3.org/2000/svg">
                    <rect width="150" height="150" fill="#f0f0f0" stroke="#ddd" stroke-width="1"/>
                    <text x="75" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#666">
                        Instagram Image
                    </text>
                    <text x="75" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#999">
                        (Unavailable)
                    </text>
                </svg>`;
                
                return new NextResponse(placeholderSvg, {
                    status: 200,
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes only
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
            
            return NextResponse.json({ 
                error: 'Image unavailable',
                details: lastError instanceof Error ? lastError.message : 'Unknown error',
                isInstagram: isInstagramImage
            }, { status: 404 }); // Changed from 403 to 404
        }

        if (!response.ok) {
            console.error('❌ Failed to fetch image:', response.status, response.statusText);
            
            // For Instagram images, return placeholder instead of error
            if (isInstagramImage) {
                console.log('📸 Returning Instagram placeholder for HTTP error:', response.status);
                
                const placeholderSvg = `
                <svg width="150" height="150" xmlns="http://www.w3.org/2000/svg">
                    <rect width="150" height="150" fill="#f0f0f0" stroke="#ddd" stroke-width="1"/>
                    <text x="75" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#666">
                        Instagram Image
                    </text>
                    <text x="75" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#999">
                        (${response.status})
                    </text>
                </svg>`;
                
                return new NextResponse(placeholderSvg, {
                    status: 200,
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Cache-Control': 'public, max-age=300',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
            
            return NextResponse.json({ 
                error: 'Failed to fetch image',
                status: response.status,
                statusText: response.statusText,
                isInstagram: isInstagramImage
            }, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const imageBuffer = await response.arrayBuffer();

        console.log('✅ Image fetched successfully:', {
            contentType,
            size: imageBuffer.byteLength,
            status: response.status,
            isInstagram: isInstagramImage,
            url: imageUrl.substring(0, 100) + '...'
        });

        // Return the image with proper headers
        return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });

    } catch (error) {
        console.error('💥 Error in image proxy:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 