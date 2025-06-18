-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "videoId" TEXT,
    "username" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'tiktok',
    "currentViews" INTEGER NOT NULL DEFAULT 0,
    "currentLikes" INTEGER NOT NULL DEFAULT 0,
    "currentComments" INTEGER NOT NULL DEFAULT 0,
    "currentShares" INTEGER NOT NULL DEFAULT 0,
    "scrapingCadence" TEXT NOT NULL DEFAULT 'hourly',
    "lastDailyViews" INTEGER,
    "dailyViewsGrowth" INTEGER,
    "needsCadenceCheck" BOOLEAN NOT NULL DEFAULT false,
    "hashtags" TEXT,
    "music" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics_history" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "views" INTEGER NOT NULL,
    "likes" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "shares" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_accounts" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'all',
    "keyword" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVideoId" TEXT,

    CONSTRAINT "tracked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videos_url_key" ON "videos"("url");

-- CreateIndex
CREATE UNIQUE INDEX "videos_videoId_platform_key" ON "videos"("videoId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_accounts_username_platform_key" ON "tracked_accounts"("username", "platform");

-- AddForeignKey
ALTER TABLE "metrics_history" ADD CONSTRAINT "metrics_history_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
