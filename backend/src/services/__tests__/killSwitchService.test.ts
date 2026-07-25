import { KillSwitchService } from '../killSwitchService';
import { HSMService } from '../hsmService';
import { MasterKeyManager } from '../masterKeyManager';
import { AuditService } from '../auditService';

// Mock dependencies
jest.mock('../hsmService');
jest.mock('../masterKeyManager');
jest.mock('../auditService');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('KillSwitchService - Evasion-Resistant Windowing', () => {
  let killSwitchService: KillSwitchService;
  let mockHSMService: jest.Mocked<HSMService>;
  let mockMasterKeyManager: jest.Mocked<MasterKeyManager>;
  let mockAuditService: jest.Mocked<AuditService>;

  beforeEach(() => {
    // Create mock instances
    mockHSMService = new HSMService({} as any) as jest.Mocked<HSMService>;
    mockMasterKeyManager = new MasterKeyManager({} as any, {} as any) as jest.Mocked<MasterKeyManager>;
    mockAuditService = new AuditService({} as any) as jest.Mocked<AuditService>;

    // Mock methods
    mockHSMService.on = jest.fn().mockReturnThis();
    mockHSMService.activateKillSwitch = jest.fn();
    mockHSMService.deactivateKillSwitch = jest.fn();
    mockHSMService.getSystemStatus = jest.fn().mockReturnValue({
      connectionHealth: true,
      killSwitchActive: false,
    });

    mockMasterKeyManager.on = jest.fn().mockReturnThis();
    mockMasterKeyManager.clearCache = jest.fn();
    mockMasterKeyManager.healthCheck = jest.fn().mockResolvedValue({
      healthy: true,
      issues: [],
    });

    mockAuditService.on = jest.fn().mockReturnThis();
    mockAuditService.logSecurityViolation = jest.fn().mockResolvedValue(undefined);
    mockAuditService.logSystemEvent = jest.fn().mockResolvedValue(undefined);

    // Create service with test configuration
    killSwitchService = new KillSwitchService(
      mockHSMService,
      mockMasterKeyManager,
      mockAuditService,
      {
        thresholds: {
          maxFailedAuth: 10,
          maxSuspiciousRequests: 5,
          maxKeyAnomalies: 3,
          maxSystemErrors: 15,
          metricsWindow: 5, // 5 minutes
        },
      }
    );
  });

  afterEach(async () => {
    await killSwitchService.shutdown();
    jest.clearAllMocks();
  });

  describe('Sliding Window Implementation', () => {
    test('should track events with timestamps in sliding window', async () => {
      // Record events
      for (let i = 0; i < 5; i++) {
        (killSwitchService as any).recordFailedAuthentication();
      }

      const metrics = killSwitchService.getSecurityMetrics();
      expect(metrics.failedAuthentications).toBe(5);
    });

    test('should count only events within the current window', async () => {
      // Record 5 events
      for (let i = 0; i < 5; i++) {
        (killSwitchService as any).recordFailedAuthentication();
      }

      // Manually simulate time passing by modifying timestamps
      const service = killSwitchService as any;
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago (outside 5-minute window)
      
      service.eventTimestamps.forEach((event: any) => {
        event.timestamp = oldTimestamp;
      });

      // Add new event
      service.recordFailedAuthentication();

      // Force cleanup
      service.cleanupOldEvents();

      const metrics = killSwitchService.getSecurityMetrics();
      // Only the recent event should be counted
      expect(metrics.failedAuthentications).toBe(1);
    });

    test('should prevent single-window threshold breach', async () => {
      const thresholds = killSwitchService.getThresholds();
      
      // Record events up to threshold
      for (let i = 0; i < thresholds.maxFailedAuth; i++) {
        (killSwitchService as any).recordFailedAuthentication();
      }

      // Trigger threshold check
      (killSwitchService as any).checkThresholds('security_incident', 'Test breach');

      const status = killSwitchService.getStatus();
      expect(status.active).toBe(true);
      expect(mockHSMService.activateKillSwitch).toHaveBeenCalled();
    });
  });

  describe('Distributed Attack Prevention - Cumulative Threshold', () => {
    test('should trigger kill switch when cumulative threshold is exceeded across windows', async () => {
      const thresholds = killSwitchService.getThresholds();
      const service = killSwitchService as any;

      // Simulate window 1: maxFailedAuth - 1 events (not enough to trigger)
      for (let i = 0; i < thresholds.maxFailedAuth - 1; i++) {
        service.recordFailedAuthentication();
      }

      // Check that kill switch is NOT activated
      service.checkThresholds('security_incident', 'Window 1');
      expect(killSwitchService.getStatus().active).toBe(false);

      // Simulate window reset by aging out events
      const oldTimestamp = Date.now() - (6 * 60 * 1000);
      service.eventTimestamps.forEach((event: any) => {
        event.timestamp = oldTimestamp;
      });
      service.cleanupOldEvents();

      // Verify sliding window is clear
      expect(killSwitchService.getSecurityMetrics().failedAuthentications).toBe(0);

      // Simulate window 2: maxFailedAuth - 1 events (not enough individually)
      for (let i = 0; i < thresholds.maxFailedAuth - 1; i++) {
        service.recordFailedAuthentication();
      }

      // Check that kill switch is NOT activated by sliding window alone
      const slidingMetrics = killSwitchService.getSecurityMetrics();
      expect(slidingMetrics.failedAuthentications).toBe(thresholds.maxFailedAuth - 1);

      // Age out window 2 events
      service.eventTimestamps.forEach((event: any) => {
        event.timestamp = oldTimestamp;
      });
      service.cleanupOldEvents();

      // Simulate window 3: Add one more event to exceed cumulative threshold (3x)
      for (let i = 0; i < thresholds.maxFailedAuth - 1; i++) {
        service.recordFailedAuthentication();
      }

      // Add one more to push cumulative over 3x threshold
      service.recordFailedAuthentication();

      const cumulativeMetrics = killSwitchService.getCumulativeMetrics();
      const cumulativeThreshold = thresholds.maxFailedAuth * 3;
      expect(cumulativeMetrics.failedAuthentications).toBeGreaterThanOrEqual(cumulativeThreshold);

      // Now check thresholds - should trigger on cumulative
      service.checkThresholds('security_incident', 'Cumulative attack detected');

      const status = killSwitchService.getStatus();
      expect(status.active).toBe(true);
      expect(mockHSMService.activateKillSwitch).toHaveBeenCalled();
    });

    test('should track cumulative metrics independently across all event types', async () => {
      const service = killSwitchService as any;
      const thresholds = killSwitchService.getThresholds();

      // Distribute attacks across different metric types
      for (let i = 0; i < 5; i++) {
        service.recordFailedAuthentication();
        service.recordSuspiciousRequest();
        service.recordKeyAnomaly();
        service.recordSystemError();
      }

      const cumulative = killSwitchService.getCumulativeMetrics();
      expect(cumulative.failedAuthentications).toBe(5);
      expect(cumulative.suspiciousRequests).toBe(5);
      expect(cumulative.keyAccessAnomalies).toBe(5);
      expect(cumulative.systemErrors).toBe(5);
    });
  });

  describe('Half-Window Decaying Metrics', () => {
    test('should maintain decaying metrics from previous half-window', async () => {
      const service = killSwitchService as any;
      const thresholds = killSwitchService.getThresholds();

      // Record events in first half-window
      for (let i = 0; i < 5; i++) {
        service.recordFailedAuthentication();
      }

      // Manually trigger half-window update
      const halfWindowMs = (thresholds.metricsWindow * 60 * 1000) / 2;
      service.decayingMetrics.windowStart = Date.now() - halfWindowMs - 1000; // Past half-window
      service.updateDecayingMetrics();

      const decaying = killSwitchService.getDecayingMetrics();
      // Should have 50% of the 5 events = 2 (floor)
      expect(decaying.failedAuthentications).toBe(2);
    });

    test('should combine sliding window and decaying metrics for threshold check', async () => {
      const service = killSwitchService as any;
      const thresholds = killSwitchService.getThresholds();

      // Set up decaying metrics manually
      service.decayingMetrics = {
        failedAuthentications: 5,
        suspiciousRequests: 0,
        keyAccessAnomalies: 0,
        systemErrors: 0,
        windowStart: Date.now(),
      };

      // Add current window events (5 + 5 = 10, which equals threshold)
      for (let i = 0; i < 5; i++) {
        service.recordFailedAuthentication();
      }

      // Check thresholds - combined should trigger (5 decaying + 5 current = 10)
      service.checkThresholds('security_incident', 'Combined threshold breach');

      const status = killSwitchService.getStatus();
      expect(status.active).toBe(true);
    });

    test('should prevent burst attacks just after window reset', async () => {
      const service = killSwitchService as any;
      const thresholds = killSwitchService.getThresholds();

      // Simulate attack burst at end of window 1
      for (let i = 0; i < 6; i++) {
        service.recordFailedAuthentication();
      }

      // Trigger half-window decay
      const halfWindowMs = (thresholds.metricsWindow * 60 * 1000) / 2;
      service.decayingMetrics.windowStart = Date.now() - halfWindowMs - 1000;
      service.updateDecayingMetrics();

      const decaying = killSwitchService.getDecayingMetrics();
      expect(decaying.failedAuthentications).toBe(3); // 50% of 6 = 3

      // Age out the sliding window events
      const oldTimestamp = Date.now() - (6 * 60 * 1000);
      service.eventTimestamps.forEach((event: any) => {
        event.timestamp = oldTimestamp;
      });
      service.cleanupOldEvents();

      // Attacker tries burst after reset (7 events, normally under threshold of 10)
      for (let i = 0; i < 7; i++) {
        service.recordFailedAuthentication();
      }

      // But combined with decaying: 7 current + 3 decaying = 10, triggers threshold
      service.checkThresholds('security_incident', 'Post-reset burst');

      const status = killSwitchService.getStatus();
      expect(status.active).toBe(true);
    });
  });

  describe('Genuine Single-Window Breaches', () => {
    test('should still activate on legitimate single-window threshold breach', async () => {
      const service = killSwitchService as any;
      const thresholds = killSwitchService.getThresholds();

      // Genuine attack in single window
      for (let i = 0; i < thresholds.maxFailedAuth; i++) {
        service.recordFailedAuthentication();
      }

      service.checkThresholds('security_incident', 'Legitimate breach');

      const status = killSwitchService.getStatus();
      expect(status.active).toBe(true);
      expect(mockHSMService.activateKillSwitch).toHaveBeenCalled();
    });

    test('should activate immediately when any metric exceeds its threshold', async () => {
      const service = killSwitchService as any;
      const thresholds = killSwitchService.getThresholds();

      // Test each metric type
      const testCases = [
        { 
          method: 'recordFailedAuthentication', 
          threshold: thresholds.maxFailedAuth,
          name: 'failedAuth'
        },
        { 
          method: 'recordSuspiciousRequest', 
          threshold: thresholds.maxSuspiciousRequests,
          name: 'suspiciousRequest'
        },
        { 
          method: 'recordKeyAnomaly', 
          threshold: thresholds.maxKeyAnomalies,
          name: 'keyAnomaly'
        },
        { 
          method: 'recordSystemError', 
          threshold: thresholds.maxSystemErrors,
          name: 'systemError'
        },
      ];

      for (const testCase of testCases) {
        // Reset for each test
        await killSwitchService.shutdown();
        killSwitchService = new KillSwitchService(
          mockHSMService,
          mockMasterKeyManager,
          mockAuditService,
          {
            thresholds: {
              maxFailedAuth: thresholds.maxFailedAuth,
              maxSuspiciousRequests: thresholds.maxSuspiciousRequests,
              maxKeyAnomalies: thresholds.maxKeyAnomalies,
              maxSystemErrors: thresholds.maxSystemErrors,
              metricsWindow: 5,
            },
          }
        );
        const serviceInstance = killSwitchService as any;

        // Trigger threshold
        for (let i = 0; i < testCase.threshold; i++) {
          serviceInstance[testCase.method]();
        }

        serviceInstance.checkThresholds('security_incident', `${testCase.name} breach`);

        const status = killSwitchService.getStatus();
        expect(status.active).toBe(true);
      }
    });
  });

  describe('API Methods', () => {
    test('should expose getCumulativeMetrics', () => {
      const service = killSwitchService as any;
      
      for (let i = 0; i < 5; i++) {
        service.recordFailedAuthentication();
      }

      const cumulative = killSwitchService.getCumulativeMetrics();
      expect(cumulative.failedAuthentications).toBe(5);
      expect(cumulative).toHaveProperty('suspiciousRequests');
      expect(cumulative).toHaveProperty('keyAccessAnomalies');
      expect(cumulative).toHaveProperty('systemErrors');
    });

    test('should expose getDecayingMetrics', () => {
      const decaying = killSwitchService.getDecayingMetrics();
      expect(decaying).toHaveProperty('failedAuthentications');
      expect(decaying).toHaveProperty('suspiciousRequests');
      expect(decaying).toHaveProperty('keyAccessAnomalies');
      expect(decaying).toHaveProperty('systemErrors');
      expect(decaying).not.toHaveProperty('windowStart'); // Should be omitted
    });

    test('should allow resetting cumulative metrics', () => {
      const service = killSwitchService as any;
      
      for (let i = 0; i < 10; i++) {
        service.recordFailedAuthentication();
      }

      expect(killSwitchService.getCumulativeMetrics().failedAuthentications).toBe(10);

      killSwitchService.resetCumulativeMetrics();

      expect(killSwitchService.getCumulativeMetrics().failedAuthentications).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid event recording', async () => {
      const service = killSwitchService as any;
      
      // Record many events in quick succession
      for (let i = 0; i < 100; i++) {
        service.recordFailedAuthentication();
      }

      const metrics = killSwitchService.getSecurityMetrics();
      expect(metrics.failedAuthentications).toBe(100);
      
      const cumulative = killSwitchService.getCumulativeMetrics();
      expect(cumulative.failedAuthentications).toBe(100);
    });

    test('should handle service restart with clean state', async () => {
      const service = killSwitchService as any;
      
      for (let i = 0; i < 5; i++) {
        service.recordFailedAuthentication();
      }

      await killSwitchService.shutdown();

      // Create new service
      killSwitchService = new KillSwitchService(
        mockHSMService,
        mockMasterKeyManager,
        mockAuditService,
        {
          thresholds: {
            maxFailedAuth: 10,
            metricsWindow: 5,
          },
        }
      );

      const metrics = killSwitchService.getSecurityMetrics();
      expect(metrics.failedAuthentications).toBe(0);
      
      const cumulative = killSwitchService.getCumulativeMetrics();
      expect(cumulative.failedAuthentications).toBe(0);
    });
  });
});
