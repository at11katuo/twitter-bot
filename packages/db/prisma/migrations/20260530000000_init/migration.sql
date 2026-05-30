CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slot" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "theme" TEXT NOT NULL,
    "themeName" TEXT NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "tweetText" TEXT NOT NULL,
    "imagePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "tweetId" TEXT,
    "postedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
