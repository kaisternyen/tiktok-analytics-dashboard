import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - List all tracked accounts
export async function GET() {
    try {
        console.log('📋 Fetching tracked accounts...');
        
        const accounts = await prisma.trackedAccount.findMany({
            orderBy: { createdAt: 'desc' }
        });

        console.log(`✅ Found ${accounts.length} tracked accounts`);

        return NextResponse.json({
            success: true,
            accounts: accounts.map(account => ({
                id: account.id,
                username: account.username,
                platform: account.platform,
                accountType: account.accountType,
                keyword: account.keyword,
                isActive: account.isActive,
                lastChecked: account.lastChecked.toISOString(),
                createdAt: account.createdAt.toISOString(),
                lastVideoId: account.lastVideoId
            }))
        });

    } catch (error) {
        console.error('💥 Error fetching tracked accounts:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch tracked accounts'
        }, { status: 500 });
    }
}

// POST - Create a new tracked account
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { username, platform, accountType, keyword } = body;

        console.log('➕ Creating new tracked account:', { username, platform, accountType, keyword });

        // Validate required fields
        if (!username || !platform) {
            return NextResponse.json({
                success: false,
                error: 'Username and platform are required'
            }, { status: 400 });
        }

        // Validate platform
        if (!['tiktok', 'instagram', 'youtube'].includes(platform)) {
            return NextResponse.json({
                success: false,
                error: 'Platform must be tiktok, instagram, or youtube'
            }, { status: 400 });
        }

        // Validate account type
        if (!['all', 'keyword'].includes(accountType)) {
            return NextResponse.json({
                success: false,
                error: 'Account type must be "all" or "keyword"'
            }, { status: 400 });
        }

        // Validate keyword for keyword type accounts
        if (accountType === 'keyword' && !keyword) {
            return NextResponse.json({
                success: false,
                error: 'Keyword is required for keyword type accounts'
            }, { status: 400 });
        }

        // Check if account already exists
        const existingAccount = await prisma.trackedAccount.findUnique({
            where: {
                username_platform: {
                    username: username.toLowerCase(),
                    platform
                }
            }
        });

        if (existingAccount) {
            return NextResponse.json({
                success: false,
                error: `Account @${username} on ${platform} is already being tracked`
            }, { status: 409 });
        }

        // Create the tracked account
        const newAccount = await prisma.trackedAccount.create({
            data: {
                username: username.toLowerCase(),
                platform,
                accountType,
                keyword: keyword ? keyword.toLowerCase() : null,
                isActive: true
            }
        });

        console.log('✅ Created tracked account:', newAccount.id);

        return NextResponse.json({
            success: true,
            message: `Started tracking @${username} on ${platform}`,
            account: {
                id: newAccount.id,
                username: newAccount.username,
                platform: newAccount.platform,
                accountType: newAccount.accountType,
                keyword: newAccount.keyword,
                isActive: newAccount.isActive,
                lastChecked: newAccount.lastChecked.toISOString(),
                createdAt: newAccount.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('💥 Error creating tracked account:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to create tracked account'
        }, { status: 500 });
    }
}

// PUT - Update a tracked account
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, isActive, accountType, keyword } = body;

        console.log('✏️ Updating tracked account:', { id, isActive, accountType, keyword });

        if (!id) {
            return NextResponse.json({
                success: false,
                error: 'Account ID is required'
            }, { status: 400 });
        }

        // Validate account type if provided
        if (accountType && !['all', 'keyword'].includes(accountType)) {
            return NextResponse.json({
                success: false,
                error: 'Account type must be "all" or "keyword"'
            }, { status: 400 });
        }

        // Validate keyword for keyword type accounts
        if (accountType === 'keyword' && !keyword) {
            return NextResponse.json({
                success: false,
                error: 'Keyword is required for keyword type accounts'
            }, { status: 400 });
        }

        // Update the account
        const updatedAccount = await prisma.trackedAccount.update({
            where: { id },
            data: {
                ...(isActive !== undefined && { isActive }),
                ...(accountType && { accountType }),
                ...(keyword !== undefined && { keyword: keyword ? keyword.toLowerCase() : null })
            }
        });

        console.log('✅ Updated tracked account:', updatedAccount.id);

        return NextResponse.json({
            success: true,
            message: 'Account updated successfully',
            account: {
                id: updatedAccount.id,
                username: updatedAccount.username,
                platform: updatedAccount.platform,
                accountType: updatedAccount.accountType,
                keyword: updatedAccount.keyword,
                isActive: updatedAccount.isActive,
                lastChecked: updatedAccount.lastChecked.toISOString(),
                createdAt: updatedAccount.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('💥 Error updating tracked account:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to update tracked account'
        }, { status: 500 });
    }
}

// DELETE - Delete a tracked account
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({
                success: false,
                error: 'Account ID is required'
            }, { status: 400 });
        }

        console.log('🗑️ Deleting tracked account:', id);

        // Delete the account
        const deletedAccount = await prisma.trackedAccount.delete({
            where: { id }
        });

        console.log('✅ Deleted tracked account:', deletedAccount.username);

        return NextResponse.json({
            success: true,
            message: `Stopped tracking @${deletedAccount.username} on ${deletedAccount.platform}`
        });

    } catch (error) {
        console.error('💥 Error deleting tracked account:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to delete tracked account'
        }, { status: 500 });
    }
} 