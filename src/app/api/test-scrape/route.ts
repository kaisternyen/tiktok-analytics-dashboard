import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Simple test endpoint to verify scrape-all prerequisites
export async function GET() {
    const results = {
        timestamp: new Date().toISOString(),
        tests: {} as Record<string, unknown>
    };

    console.log('🧪 ===== SCRAPE-ALL PREREQUISITE TEST =====');

    // Test 1: Basic response
    try {
        results.tests.basicResponse = { status: 'ok', message: 'Endpoint reachable' };
        console.log('✅ Test 1: Basic response - OK');
    } catch (error) {
        results.tests.basicResponse = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
        console.log('❌ Test 1: Basic response - FAILED');
    }

    // Test 2: Prisma import
    try {
        if (prisma) {
            results.tests.prismaImport = { status: 'ok', message: 'Prisma client imported' };
            console.log('✅ Test 2: Prisma import - OK');
        } else {
            results.tests.prismaImport = { status: 'error', message: 'Prisma client is null/undefined' };
            console.log('❌ Test 2: Prisma import - NULL');
        }
    } catch (error) {
        results.tests.prismaImport = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
        console.log('❌ Test 2: Prisma import - FAILED:', error);
    }

    // Test 3: Database connection
    try {
        const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
        results.tests.databaseConnection = { status: 'ok', result: dbTest };
        console.log('✅ Test 3: Database connection - OK:', dbTest);
    } catch (error) {
        results.tests.databaseConnection = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
        console.log('❌ Test 3: Database connection - FAILED:', error);
    }

    // Test 4: Environment variables
    try {
        const envVars = {
            NODE_ENV: process.env.NODE_ENV,
            VERCEL: process.env.VERCEL,
            DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Missing',
            TIKHUB_API_KEY: process.env.TIKHUB_API_KEY ? 'Set' : 'Missing',
            YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ? 'Set' : 'Missing'
        };
        results.tests.environmentVariables = { status: 'ok', vars: envVars };
        console.log('✅ Test 4: Environment variables:', envVars);
    } catch (error) {
        results.tests.environmentVariables = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
        console.log('❌ Test 4: Environment variables - FAILED:', error);
    }

    // Test 5: Video count
    try {
        const videoCount = await prisma.video.count({ where: { isActive: true } });
        results.tests.videoCount = { status: 'ok', count: videoCount };
        console.log(`✅ Test 5: Video count - ${videoCount} active videos`);
    } catch (error) {
        results.tests.videoCount = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
        console.log('❌ Test 5: Video count - FAILED:', error);
    }

    // Test 6: Memory and process info
    try {
        const processInfo = {
            pid: process.pid,
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            uptime: Math.round(process.uptime())
        };
        results.tests.processInfo = { status: 'ok', info: processInfo };
        console.log('✅ Test 6: Process info:', processInfo);
    } catch (error) {
        results.tests.processInfo = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
        console.log('❌ Test 6: Process info - FAILED:', error);
    }

    console.log('🧪 ===== TEST COMPLETE =====');

    return NextResponse.json(results);
}
