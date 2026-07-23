/**
 * Frozen-archive build flag. Set ARCHIVE_MODE=1 when rendering the post-tournament
 * static snapshot: auth is bypassed (every visitor sees the viewer experience),
 * payment nudges are hidden, and auto-refresh is disabled. The output of an archive
 * build is crawled to static HTML — this flag is never set on a live deployment.
 */
export const isArchive = process.env.ARCHIVE_MODE === "1";
