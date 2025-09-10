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
  newPhase: VideoPhase
): boolean {
  // Only send notifications for phase transitions, not for staying in the same phase
  if (oldPhase === newPhase) {
    return false;
  }

  // Send notification for any phase transition
  return true;
}

export function getPhaseNotificationMessage(
  username: string,
  platform: string,
  url: string,
  oldPhase: string,
  newPhase: VideoPhase,
  views: number,
  comments: number
): string {
  const platformEmoji = platform === 'tiktok' ? '🎵' : platform === 'instagram' ? '📸' : '🎬';
  
  switch (newPhase) {
    case 'In PHS 1':
      return `🚀 **PHASE 1 ALERT** ${platformEmoji}\n@${username} is now **IN PHASE 1**!\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
    
    case 'PHS 1 Complete':
      return `✅ **PHASE 1 COMPLETE** ${platformEmoji}\n@${username} has completed Phase 1!\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
    
    case 'In PHS 2':
      return `🔥 **PHASE 2 ALERT** ${platformEmoji}\n@${username} is now **IN PHASE 2**!\n📊 ${views.toLocaleString()} views, ${comments} comments\n🔗 ${url}`;
    
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
