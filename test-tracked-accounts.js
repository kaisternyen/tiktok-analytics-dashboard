const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testTrackedAccounts() {
    try {
        console.log('🧪 Testing Tracked Accounts System...\n');

        // Test 1: Create a tracked account
        console.log('1. Creating a test tracked account...');
        const testAccount = await prisma.trackedAccount.create({
            data: {
                username: 'testuser',
                platform: 'tiktok',
                accountType: 'all',
                isActive: true
            }
        });
        console.log('✅ Created account:', testAccount.id);

        // Test 2: Create a keyword-filtered account
        console.log('\n2. Creating a keyword-filtered account...');
        const keywordAccount = await prisma.trackedAccount.create({
            data: {
                username: 'blokcreator',
                platform: 'instagram',
                accountType: 'keyword',
                keyword: 'blok',
                isActive: true
            }
        });
        console.log('✅ Created keyword account:', keywordAccount.id);

        // Test 3: List all accounts
        console.log('\n3. Listing all tracked accounts...');
        const accounts = await prisma.trackedAccount.findMany({
            orderBy: { createdAt: 'desc' }
        });
        console.log(`✅ Found ${accounts.length} accounts:`);
        accounts.forEach(account => {
            console.log(`   - @${account.username} (${account.platform}) - ${account.accountType}${account.keyword ? ` - keyword: ${account.keyword}` : ''}`);
        });

        // Test 4: Update an account
        console.log('\n4. Updating account...');
        const updatedAccount = await prisma.trackedAccount.update({
            where: { id: testAccount.id },
            data: { isActive: false }
        });
        console.log('✅ Updated account:', updatedAccount.isActive ? 'Active' : 'Inactive');

        // Test 5: Clean up test data
        console.log('\n5. Cleaning up test data...');
        await prisma.trackedAccount.deleteMany({
            where: {
                username: { in: ['testuser', 'blokcreator'] }
            }
        });
        console.log('✅ Cleaned up test accounts');

        console.log('\n🎉 All tests passed! Tracked accounts system is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        if (error.message.includes('trackedAccount')) {
            console.log('\n💡 Note: You need to run the database migration first:');
            console.log('   npx prisma db push');
            console.log('   npx prisma generate');
        }
    } finally {
        await prisma.$disconnect();
    }
}

testTrackedAccounts(); 