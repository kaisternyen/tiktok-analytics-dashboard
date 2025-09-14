export type VideoPhase = 'PHS 0' | 'In PHS 1' | 'PHS 1 Complete' | 'In PHS 2' | 'PHS 2 Complete';

export interface PhaseThresholds {
  phase1Views: number;
  phase1Comments: number;
  phase2Views: number;
  phase2Comments: number;
}

export const DEFAULT_THRESHOLDS: PhaseThresholds = {
  phase1Views: 5000,
  phase1Comments: 5,
  phase2Views: 10000,
  phase2Comments: 20
};

export function determineVideoPhase(
  views: number,
  comments: number,
  currentPhase: string,
  thresholds: PhaseThresholds = DEFAULT_THRESHOLDS
): VideoPhase {
  // Phase 2 Complete - highest phase, no further transitions
  if (currentPhase === 'PHS 2 Complete') {
    return 'PHS 2 Complete';
  }

  // Phase 2 - check if complete
  if (currentPhase === 'In PHS 2') {
    if (views >= thresholds.phase2Views && comments >= thresholds.phase2Comments) {
      return 'PHS 2 Complete';
    }
    return 'In PHS 2';
  }

  // Phase 1 Complete - check if ready for Phase 2
  if (currentPhase === 'PHS 1 Complete') {
    if (views >= thresholds.phase2Views && comments >= thresholds.phase2Comments) {
      return 'In PHS 2';
    }
    return 'PHS 1 Complete';
  }

  // In Phase 1 - check if complete
  if (currentPhase === 'In PHS 1') {
    if (views >= thresholds.phase1Views && comments >= thresholds.phase1Comments) {
      return 'PHS 1 Complete';
    }
    return 'In PHS 1';
  }

  // PHS 0 - check if ready for Phase 1
  if (currentPhase === 'PHS 0' || !currentPhase) {
    if (views >= thresholds.phase1Views && comments >= thresholds.phase1Comments) {
      return 'In PHS 1';
    }
    return 'PHS 0';
  }

  // Default fallback
  return 'PHS 0';
}

export function shouldSendPhaseNotification(
  oldPhase: string,
  newPhase: VideoPhase,
  phase1Notified: boolean = false,
  phase2Notified: boolean = false
): boolean {
  // Only send notifications for phase transitions, not for staying in the same phase
  if (oldPhase === newPhase) {
    return false;
  }

  // Check if we've already sent notification for this phase
  if (newPhase === 'In PHS 1' || newPhase === 'PHS 1 Complete') {
    return !phase1Notified;
  }
  
  if (newPhase === 'In PHS 2' || newPhase === 'PHS 2 Complete') {
    return !phase2Notified;
  }

  return false;
}

export function determineFinalPhaseAndNotifications(
  views: number,
  comments: number,
  currentPhase: string,
  phase1Notified: boolean = false,
  phase2Notified: boolean = false,
  thresholds: PhaseThresholds = DEFAULT_THRESHOLDS,
  hourlyCommentChange: number = 0
): {
  finalPhase: VideoPhase;
  shouldNotifyPhase1: boolean;
  shouldNotifyPhase2: boolean;
  newPhase1Notified: boolean;
  newPhase2Notified: boolean;
} {
  // Determine the final phase by checking all possible transitions
  let finalPhase: VideoPhase = currentPhase as VideoPhase;
  let shouldNotifyPhase1 = false;
  let shouldNotifyPhase2 = false;
  let newPhase1Notified = phase1Notified;
  let newPhase2Notified = phase2Notified;

  // CRITICAL: Check for 10+ comments in the last hour (Phase 2 trigger)
  if (hourlyCommentChange >= 10) {
    if (currentPhase === 'PHS 0' || currentPhase === 'In PHS 1' || currentPhase === 'PHS 1 Complete') {
      finalPhase = 'In PHS 2';
      if (!phase2Notified) {
        shouldNotifyPhase2 = true;
        newPhase2Notified = true;
      }
      // If we jumped directly to Phase 2, mark Phase 1 as notified too
      if (!phase1Notified) {
        newPhase1Notified = true;
      }
    }
  }
  // Check if we can jump directly to Phase 2 (edge case handling)
  else if (views >= thresholds.phase2Views && comments >= thresholds.phase2Comments) {
    if (currentPhase === 'PHS 0' || currentPhase === 'In PHS 1' || currentPhase === 'PHS 1 Complete') {
      finalPhase = 'In PHS 2';
      if (!phase2Notified) {
        shouldNotifyPhase2 = true;
        newPhase2Notified = true;
      }
      // If we jumped directly to Phase 2, mark Phase 1 as notified too
      if (!phase1Notified) {
        newPhase1Notified = true;
      }
    }
  } else if (views >= thresholds.phase1Views && comments >= thresholds.phase1Comments) {
    // Check Phase 1 transitions
    if (currentPhase === 'PHS 0') {
      finalPhase = 'In PHS 1';
      if (!phase1Notified) {
        shouldNotifyPhase1 = true;
        newPhase1Notified = true;
      }
    } else if (currentPhase === 'In PHS 1') {
      finalPhase = 'PHS 1 Complete';
      if (!phase1Notified) {
        shouldNotifyPhase1 = true;
        newPhase1Notified = true;
      }
    }
  }

  return {
    finalPhase,
    shouldNotifyPhase1,
    shouldNotifyPhase2,
    newPhase1Notified,
    newPhase2Notified
  };
}

export function getPhaseNotificationMessage(
  username: string,
  platform: string,
  url: string,
  oldPhase: string,
  newPhase: VideoPhase,
  views: number,
  comments: number,
  hourlyCommentChange: number = 0
): string {
  const platformEmoji = platform === 'tiktok' ? '🎵' : platform === 'instagram' ? '📸' : '🎬';
  
  switch (newPhase) {
    case 'In PHS 1':
      return `🚀 **PHASE 1 ALERT** ${platformEmoji}\n@${username} is now **IN PHASE 1**!\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
    
    case 'PHS 1 Complete':
      return `✅ **PHASE 1 COMPLETE** ${platformEmoji}\n@${username} has completed Phase 1!\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
    
    case 'In PHS 2':
      const commentTrigger = hourlyCommentChange >= 10 ? `\n🔥 **TRIGGERED BY ${hourlyCommentChange} COMMENTS IN 1 HOUR!**` : '';
      return `🔥 **PHASE 2 ALERT** ${platformEmoji}\n@${username} is now **IN PHASE 2**!${commentTrigger}\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
    
    case 'PHS 2 Complete':
      return `🎉 **PHASE 2 COMPLETE** ${platformEmoji}\n@${username} has completed Phase 2!\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
    
    default:
      return `📈 **Phase Update** ${platformEmoji}\n@${username} phase: ${oldPhase} → ${newPhase}\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
  }
}

export function getNewPostMessage(
  username: string,
  platform: string,
  url: string,
  description: string,
  views: number,
  comments: number
): string {
  const platformEmoji = platform === 'tiktok' ? '🎵' : platform === 'instagram' ? '📸' : '🎬';
  const truncatedDescription = description.length > 100 ? description.substring(0, 100) + '...' : description;
  
  return `📝 **NEW POST** ${platformEmoji}\n@${username} posted a new video!\n📝 "${truncatedDescription}"\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
}
