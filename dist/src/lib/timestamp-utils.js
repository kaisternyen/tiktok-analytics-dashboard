"use strict";
/**
 * Timestamp normalization utilities for standardized data collection intervals
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CADENCE_INTERVALS = void 0;
exports.normalizeTimestamp = normalizeTimestamp;
exports.getCurrentNormalizedTimestamp = getCurrentNormalizedTimestamp;
exports.isCurrentInterval = isCurrentInterval;
exports.getIntervalForCadence = getIntervalForCadence;
/**
 * Normalizes a timestamp to the nearest interval boundary
 * @param timestamp - The timestamp to normalize (Date object or ISO string)
 * @param interval - The interval to round to
 * @returns ISO string of the normalized timestamp
 */
function normalizeTimestamp(timestamp, interval = '5min') {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    // Clone the date to avoid mutating the original
    const normalized = new Date(date);
    // Reset seconds and milliseconds to 0
    normalized.setSeconds(0);
    normalized.setMilliseconds(0);
    const minutes = normalized.getMinutes();
    switch (interval) {
        case 'minute':
            // Already normalized by resetting seconds/milliseconds
            break;
        case '5min':
            // Round to nearest 5-minute boundary: 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
            normalized.setMinutes(Math.floor(minutes / 5) * 5);
            break;
        case '15min':
            // Round to nearest 15-minute boundary: 0, 15, 30, 45
            normalized.setMinutes(Math.floor(minutes / 15) * 15);
            break;
        case '30min':
            // Round to nearest 30-minute boundary: 0, 30
            normalized.setMinutes(Math.floor(minutes / 30) * 30);
            break;
        case '60min':
            // Round to hour boundary: 0
            normalized.setMinutes(0);
            break;
        default:
            throw new Error(`Unsupported interval: ${interval}`);
    }
    return normalized.toISOString();
}
/**
 * Get the current normalized timestamp for data collection
 * @param interval - The interval to normalize to
 * @returns ISO string of the current normalized timestamp
 */
function getCurrentNormalizedTimestamp(interval = '5min') {
    return normalizeTimestamp(new Date(), interval);
}
/**
 * Check if a timestamp falls within the current interval
 * @param timestamp - The timestamp to check
 * @param interval - The interval to check against
 * @returns True if the timestamp is already normalized to the current interval
 */
function isCurrentInterval(timestamp, interval = '5min') {
    const normalized = normalizeTimestamp(new Date(), interval);
    const timestampNormalized = normalizeTimestamp(timestamp, interval);
    return normalized === timestampNormalized;
}
/**
 * Configuration for different scraping cadences
 */
exports.CADENCE_INTERVALS = {
    'testing': 'minute', // For rapid testing (every minute)
    'hourly': '60min', // Active videos: hourly intervals (every hour at :00)
    'daily': '60min', // Inactive videos: daily intervals (every hour at :00, but only scraped once per day)
    'manual': '5min', // Manual scrapes: 5-minute intervals for immediate feedback
};
/**
 * Get the appropriate interval for a video's scraping cadence
 * @param cadence - The scraping cadence of the video
 * @returns The timestamp interval to use
 */
function getIntervalForCadence(cadence) {
    if (!cadence)
        return '5min'; // Default
    return exports.CADENCE_INTERVALS[cadence] || '5min';
}
/**
 * Examples and documentation for timestamp intervals:
 *
 * minute:  2024-01-15T12:34:00.000Z, 2024-01-15T12:35:00.000Z, 2024-01-15T12:36:00.000Z
 * 5min:    2024-01-15T12:30:00.000Z, 2024-01-15T12:35:00.000Z, 2024-01-15T12:40:00.000Z
 * 15min:   2024-01-15T12:15:00.000Z, 2024-01-15T12:30:00.000Z, 2024-01-15T12:45:00.000Z
 * 30min:   2024-01-15T12:00:00.000Z, 2024-01-15T12:30:00.000Z, 2024-01-15T13:00:00.000Z
 * 60min:   2024-01-15T12:00:00.000Z, 2024-01-15T13:00:00.000Z, 2024-01-15T14:00:00.000Z
 */ 
