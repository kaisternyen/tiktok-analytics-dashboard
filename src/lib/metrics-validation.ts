/**
 * Utility functions to validate and sanitize metrics before saving to database
 * Prevents negative values and other data corruption issues
 */

export interface MetricsData {
    views: number;
    likes: number;
    comments: number;
    shares: number;
}

export interface SanitizedMetricsData {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    warnings: string[];
}

/**
 * Sanitizes metrics data to prevent negative values and other corruption
 * @param metrics Raw metrics data from API
 * @param previousMetrics Previous metrics for comparison (optional)
 * @returns Sanitized metrics with warnings
 */
export function sanitizeMetrics(
    metrics: MetricsData, 
    previousMetrics?: Partial<MetricsData>
): SanitizedMetricsData {
    const warnings: string[] = [];
    
    // Ensure all values are non-negative
    const sanitizedViews = Math.max(0, Math.floor(metrics.views) || 0);
    const sanitizedLikes = Math.max(0, Math.floor(metrics.likes) || 0);
    const sanitizedComments = Math.max(0, Math.floor(metrics.comments) || 0);
    const sanitizedShares = Math.max(0, Math.floor(metrics.shares) || 0);
    
    // Check for negative values in original data
    if (metrics.views < 0) {
        warnings.push(`Negative views detected: ${metrics.views}, sanitized to ${sanitizedViews}`);
    }
    if (metrics.likes < 0) {
        warnings.push(`Negative likes detected: ${metrics.likes}, sanitized to ${sanitizedLikes}`);
    }
    if (metrics.comments < 0) {
        warnings.push(`Negative comments detected: ${metrics.comments}, sanitized to ${sanitizedComments}`);
    }
    if (metrics.shares < 0) {
        warnings.push(`Negative shares detected: ${metrics.shares}, sanitized to ${sanitizedShares}`);
    }
    
    // Check for NaN or Infinity values
    if (!isFinite(metrics.views)) {
        warnings.push(`Invalid views value: ${metrics.views}, sanitized to ${sanitizedViews}`);
    }
    if (!isFinite(metrics.likes)) {
        warnings.push(`Invalid likes value: ${metrics.likes}, sanitized to ${sanitizedLikes}`);
    }
    if (!isFinite(metrics.comments)) {
        warnings.push(`Invalid comments value: ${metrics.comments}, sanitized to ${sanitizedComments}`);
    }
    if (!isFinite(metrics.shares)) {
        warnings.push(`Invalid shares value: ${metrics.shares}, sanitized to ${sanitizedShares}`);
    }
    
    // Check for suspiciously large values (potential overflow)
    const MAX_REASONABLE_VALUE = 1000000000; // 1 billion
    if (sanitizedViews > MAX_REASONABLE_VALUE) {
        warnings.push(`Suspiciously large views: ${sanitizedViews}, capping at ${MAX_REASONABLE_VALUE}`);
    }
    if (sanitizedLikes > MAX_REASONABLE_VALUE) {
        warnings.push(`Suspiciously large likes: ${sanitizedLikes}, capping at ${MAX_REASONABLE_VALUE}`);
    }
    if (sanitizedComments > MAX_REASONABLE_VALUE) {
        warnings.push(`Suspiciously large comments: ${sanitizedComments}, capping at ${MAX_REASONABLE_VALUE}`);
    }
    if (sanitizedShares > MAX_REASONABLE_VALUE) {
        warnings.push(`Suspiciously large shares: ${sanitizedShares}, capping at ${MAX_REASONABLE_VALUE}`);
    }
    
    // Check for dramatic decreases (potential data corruption)
    if (previousMetrics) {
        const DECREASE_THRESHOLD = 0.5; // 50% decrease threshold
        
        if (previousMetrics.views && sanitizedViews < previousMetrics.views * DECREASE_THRESHOLD) {
            warnings.push(`Dramatic views decrease: ${previousMetrics.views} → ${sanitizedViews} (${Math.round((1 - sanitizedViews / previousMetrics.views) * 100)}% decrease)`);
        }
        if (previousMetrics.likes && sanitizedLikes < previousMetrics.likes * DECREASE_THRESHOLD) {
            warnings.push(`Dramatic likes decrease: ${previousMetrics.likes} → ${sanitizedLikes} (${Math.round((1 - sanitizedLikes / previousMetrics.likes) * 100)}% decrease)`);
        }
        if (previousMetrics.comments && sanitizedComments < previousMetrics.comments * DECREASE_THRESHOLD) {
            warnings.push(`Dramatic comments decrease: ${previousMetrics.comments} → ${sanitizedComments} (${Math.round((1 - sanitizedComments / previousMetrics.comments) * 100)}% decrease)`);
        }
        if (previousMetrics.shares && sanitizedShares < previousMetrics.shares * DECREASE_THRESHOLD) {
            warnings.push(`Dramatic shares decrease: ${previousMetrics.shares} → ${sanitizedShares} (${Math.round((1 - sanitizedShares / previousMetrics.shares) * 100)}% decrease)`);
        }
    }
    
    return {
        views: Math.min(sanitizedViews, MAX_REASONABLE_VALUE),
        likes: Math.min(sanitizedLikes, MAX_REASONABLE_VALUE),
        comments: Math.min(sanitizedComments, MAX_REASONABLE_VALUE),
        shares: Math.min(sanitizedShares, MAX_REASONABLE_VALUE),
        warnings
    };
}

/**
 * Logs sanitization warnings to console
 * @param username Video username for context
 * @param warnings Array of warning messages
 */
export function logSanitizationWarnings(username: string, warnings: string[]): void {
    if (warnings.length > 0) {
        console.warn(`⚠️ METRICS SANITIZATION WARNINGS for @${username}:`);
        warnings.forEach(warning => {
            console.warn(`  - ${warning}`);
        });
    }
}
