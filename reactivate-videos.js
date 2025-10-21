// Reactivate all orphaned videos
const reactivateOrphaned = async () => {
    const result = await prisma.video.updateMany({
        where: { 
            isActive: false, 
            trackingMode: 'orphaned' 
        },
        data: {
            isActive: true,
            trackingMode: null,
            lastScrapedAt: new Date()
        }
    });
    console.log(`Reactivated ${result.count} orphaned videos`);
};

// Reactivate all paused videos
const reactivateAll = async () => {
    const result = await prisma.video.updateMany({
        where: { isActive: false },
        data: {
            isActive: true,
            trackingMode: null,
            lastScrapedAt: new Date()
        }
    });
    console.log(`Reactivated ${result.count} videos`);
};

// Reactivate specific videos by ID
const reactivateSpecific = async (videoIds: string[]) => {
    const result = await prisma.video.updateMany({
        where: { 
            id: { in: videoIds },
            isActive: false 
        },
        data: {
            isActive: true,
            trackingMode: null,
            lastScrapedAt: new Date()
        }
    });
    console.log(`Reactivated ${result.count} specific videos`);
};
