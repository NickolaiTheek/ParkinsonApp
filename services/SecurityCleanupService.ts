import { clearExpiredSecurityRecords } from '../lib/security';

class SecurityCleanupService {
  private cleanupInterval: NodeJS.Timer | null = null;
  private readonly CLEANUP_INTERVAL = 15 * 60 * 1000; // Run every 15 minutes

  start() {
    if (this.cleanupInterval) {
      return;
    }

    // Run cleanup immediately
    this.cleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private async cleanup() {
    try {
      await clearExpiredSecurityRecords();
    } catch (error) {
      console.error('Security cleanup failed:', error);
    }
  }
}

export const securityCleanupService = new SecurityCleanupService(); 