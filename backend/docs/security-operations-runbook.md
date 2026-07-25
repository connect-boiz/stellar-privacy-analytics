# Security Operations Runbook

## Table of Contents
- [Kill Switch System](#kill-switch-system)
- [Evasion-Resistant Windowing Algorithm](#evasion-resistant-windowing-algorithm)
- [Security Monitoring](#security-monitoring)
- [Incident Response](#incident-response)
- [Maintenance Procedures](#maintenance-procedures)

## Kill Switch System

### Overview
The Kill Switch Service provides automated protection against security threats by monitoring system metrics and triggering emergency shutdown procedures when thresholds are exceeded.

### Architecture
The kill switch operates on three defensive layers:

1. **Sliding Window Monitoring** - Real-time tracking of security events
2. **Decaying Metrics** - Half-window overlap to prevent boundary exploitation
3. **Cumulative Tracking** - Long-term pattern detection across all windows

---

## Evasion-Resistant Windowing Algorithm

### Problem Statement
Traditional fixed-window metrics can be exploited by attackers who:
- Distribute attacks across window boundaries
- Submit bursts just after resets
- Spread activity across multiple metric types
- Probe the system indefinitely without triggering thresholds

### Solution: Triple-Layer Defense

#### Layer 1: Sliding Window (Real-Time)
Instead of resetting metrics every N minutes, the system maintains a sliding window of events with timestamps.

**Implementation Details:**
- Each security event is stored with a precise timestamp
- Events are counted only if they occurred within the last N minutes
- Old events outside the window are automatically pruned
- Window continuously slides forward in real-time

**Example:**
```
Window: 5 minutes
Current Time: 10:15:00

Events:
- 10:14:30 - Failed Auth ✓ (within window)
- 10:13:45 - Failed Auth ✓ (within window)
- 10:11:20 - Failed Auth ✓ (within window)
- 10:09:50 - Failed Auth ✗ (outside window, ignored)

Current Count: 3
```

**Configuration:**
```typescript
thresholds: {
  maxFailedAuth: 10,
  maxSuspiciousRequests: 5,
  maxKeyAnomalies: 3,
  maxSystemErrors: 15,
  metricsWindow: 5, // minutes
}
```

#### Layer 2: Half-Window Decaying Metrics
Prevents attackers from exploiting the gap when sliding window events age out.

**Implementation Details:**
- Every half-window period (N/2 minutes), the system captures current metrics
- Previous half-window counts are preserved with 50% decay factor
- These decaying metrics are added to current window counts for threshold checks
- Creates overlapping protection that bridges window transitions

**Example:**
```
Window: 5 minutes (half-window: 2.5 minutes)

Time 10:00 - 10:02:30 (first half):
  6 failed auth events

Time 10:02:30 (half-window update):
  Decaying metrics set to: 6 × 0.5 = 3

Time 10:02:30 - 10:05:00 (second half):
  7 new failed auth events
  
Effective count for threshold check:
  Current window: 7
  + Decaying: 3
  = 10 total (triggers threshold)

Without decaying metrics, attacker could:
  - Send 9 events in first half (no trigger)
  - Wait for window to slide
  - Send 9 events in second half (no trigger)
  - Repeat indefinitely
```

**Algorithm:**
```typescript
// Every minute, check if half-window has passed
if (now - decayingMetrics.windowStart >= halfWindowMs) {
  // Set decaying metrics to 50% of current window
  decayingMetrics = {
    failedAuthentications: floor(currentCount * 0.5),
    ...
    windowStart: now
  };
}

// When checking thresholds
effectiveCount = currentWindowCount + decayingMetrics.count;
if (effectiveCount >= threshold) {
  activateKillSwitch();
}
```

#### Layer 3: Cumulative Threshold (Long-Term)
Detects distributed attacks across multiple windows and metric types.

**Implementation Details:**
- Separate cumulative counters track total events across all time
- Never reset automatically (only on manual maintenance)
- Cumulative threshold set at 3× the sliding window threshold
- Any metric exceeding cumulative threshold triggers kill switch

**Example:**
```
Sliding Window Threshold: 10 failed auth
Cumulative Threshold: 30 failed auth

Attacker Strategy (attempting to evade sliding window):
- Window 1: 9 events (below threshold) ✓
- Wait for window reset
- Window 2: 9 events (below threshold) ✓
- Wait for window reset
- Window 3: 9 events (below threshold) ✓
- Wait for window reset
- Window 4: 9 events
  Cumulative total: 36 events
  KILL SWITCH ACTIVATED ✗

Without cumulative tracking, attacker could:
- Stay below threshold in each window
- Continue indefinitely without detection
```

**All Metric Types Tracked:**
```typescript
cumulativeMetrics: {
  failedAuthentications: number;
  suspiciousRequests: number;
  keyAccessAnomalies: number;
  systemErrors: number;
}
```

### Threshold Check Logic

The system activates the kill switch when ANY of these conditions are met:

1. **Sliding Window Breach:** Current window count + decaying metrics ≥ threshold
2. **Cumulative Breach:** Total events across all windows ≥ threshold × 3
3. **Combined Breach:** Multiple metrics approaching thresholds simultaneously

```typescript
// Pseudo-code for threshold checking
function checkThresholds() {
  const current = getCurrentWindowMetrics();
  const effective = current + decayingMetrics;
  const cumulative = getCumulativeMetrics();
  
  const triggers = [];
  
  // Check each metric type
  for (const metric of ['failedAuth', 'suspiciousRequest', ...]) {
    // Layer 1 & 2: Sliding window + decaying
    if (effective[metric] >= threshold[metric]) {
      triggers.push(`${metric} sliding window`);
    }
    
    // Layer 3: Cumulative
    if (cumulative[metric] >= threshold[metric] * 3) {
      triggers.push(`${metric} cumulative`);
    }
  }
  
  if (triggers.length > 0) {
    activateKillSwitch(triggers);
  }
}
```

---

## Security Monitoring

### Metrics Tracked

#### 1. Failed Authentications
**Source:** Access control failures, invalid API keys, expired tokens
**Threshold:** 10 per 5-minute window, 30 cumulative
**Risk:** Brute force attacks, credential stuffing

#### 2. Suspicious Requests
**Source:** Malformed queries, unauthorized data access attempts
**Threshold:** 5 per 5-minute window, 15 cumulative
**Risk:** Injection attacks, enumeration

#### 3. Key Access Anomalies
**Source:** Unusual key operations, unauthorized key access
**Threshold:** 3 per 5-minute window, 9 cumulative
**Risk:** Key compromise, insider threats

#### 4. System Errors
**Source:** HSM connection failures, service crashes
**Threshold:** 15 per 5-minute window, 45 cumulative
**Risk:** System instability, DoS attacks

### Monitoring Dashboard

Access metrics in real-time:

```typescript
// Get current sliding window metrics
const metrics = killSwitchService.getSecurityMetrics();
console.log('Sliding window:', metrics);

// Get cumulative metrics
const cumulative = killSwitchService.getCumulativeMetrics();
console.log('Cumulative:', cumulative);

// Get decaying metrics from previous half-window
const decaying = killSwitchService.getDecayingMetrics();
console.log('Decaying:', decaying);

// Get configured thresholds
const thresholds = killSwitchService.getThresholds();
console.log('Thresholds:', thresholds);
```

### Logging

All security events are logged with:
- Timestamp (precise to millisecond)
- Event type
- Current counts (sliding, decaying, cumulative)
- Threshold values
- Source information

Example log entry:
```json
{
  "level": "warn",
  "message": "Failed authentication recorded",
  "slidingWindowCount": 7,
  "cumulativeCount": 23,
  "threshold": 10,
  "cumulativeThreshold": 30,
  "timestamp": "2024-01-15T10:15:23.456Z"
}
```

---

## Incident Response

### Kill Switch Activation

When the kill switch activates:

1. **Immediate Actions:**
   - HSM connection locked
   - Master key cache cleared
   - All cryptographic operations suspended
   - Security event logged to audit trail

2. **Notification:**
   - Alert sent to security team
   - Incident record created
   - Metrics snapshot captured

3. **System State:**
   ```typescript
   {
     active: true,
     activatedAt: Date,
     lastTrigger: {
       id: "ks-1234567890-abc",
       reason: "Failed auth cumulative threshold: 31/30",
       severity: "high",
       source: "automated",
       triggers: [...]
     },
     totalActivations: N
   }
   ```

### Investigation Procedure

1. **Analyze Trigger:**
   ```typescript
   const status = killSwitchService.getStatus();
   const trigger = status.lastTrigger;
   console.log('Activation reason:', trigger.reason);
   console.log('Trigger details:', trigger.metadata);
   ```

2. **Review Metrics:**
   ```typescript
   const metrics = killSwitchService.getSecurityMetrics();
   const cumulative = killSwitchService.getCumulativeMetrics();
   const decaying = killSwitchService.getDecayingMetrics();
   
   // Identify which layer triggered
   if (trigger.reason.includes('cumulative')) {
     console.log('Distributed attack detected');
     console.log('Cumulative counts:', cumulative);
   } else if (trigger.reason.includes('sliding window')) {
     console.log('Burst attack detected');
     console.log('Window counts:', metrics);
     console.log('Decaying contribution:', decaying);
   }
   ```

3. **Check Audit Logs:**
   ```typescript
   // Review audit trail for security violations
   const auditLogs = await auditService.getRecentEvents({
     category: 'security_violation',
     timeRange: last30Minutes
   });
   ```

4. **Identify Attack Pattern:**
   - Single burst vs. distributed across windows
   - Single metric type vs. multiple types
   - Geographic distribution
   - Source IP analysis

### Recovery Procedure

1. **Verify Threat Mitigation:**
   - Confirm attack has stopped
   - Block malicious IPs/keys
   - Rotate compromised credentials

2. **System Health Check:**
   ```typescript
   const health = await killSwitchService.forceHealthCheck();
   if (!health.healthy) {
     console.log('Issues:', health.issues);
     console.log('Recommendations:', health.recommendations);
     // Address issues before deactivation
   }
   ```

3. **Manual Deactivation:**
   ```typescript
   await killSwitchService.deactivate(
     'Threat mitigated, system verified healthy',
     'admin-user-id'
   );
   ```

4. **Optional: Reset Cumulative Metrics:**
   ```typescript
   // Only after confirmed resolution and system maintenance
   killSwitchService.resetCumulativeMetrics();
   ```
   
   ⚠️ **Warning:** Only reset cumulative metrics after:
   - Confirmed threat elimination
   - System security review
   - Proper documentation of incident

---

## Maintenance Procedures

### Adjusting Thresholds

```typescript
// Update thresholds based on system behavior
killSwitchService.updateThresholds({
  maxFailedAuth: 15,      // Increase if false positives
  maxSuspiciousRequests: 3, // Decrease if threats detected
  metricsWindow: 10,      // Widen window for larger systems
});
```

### Threshold Tuning Guidelines

**Too Many False Positives:**
- Increase single-metric thresholds by 25-50%
- Widen metrics window (5 → 10 minutes)
- Review event classification logic

**Threats Slipping Through:**
- Decrease thresholds by 25-50%
- Reduce cumulative multiplier (3× → 2×)
- Add additional metric types
- Narrow metrics window (5 → 3 minutes)

### Regular Maintenance

**Daily:**
- Review security metrics trends
- Check for anomalies in cumulative counts
- Verify kill switch responsiveness

**Weekly:**
- Analyze kill switch activation patterns
- Tune thresholds based on false positive rate
- Review audit logs for missed threats

**Monthly:**
- Full security review
- Test kill switch activation/deactivation
- Update incident response procedures
- Consider cumulative metrics reset (if appropriate)

### Testing

Test the kill switch without production impact:

```typescript
// Create test instance
const testKillSwitch = new KillSwitchService(
  mockHSM,
  mockKeyManager,
  mockAudit,
  {
    thresholds: {
      maxFailedAuth: 5, // Lower thresholds for testing
      metricsWindow: 1, // Shorter window
    }
  }
);

// Simulate attack
for (let i = 0; i < 5; i++) {
  testKillSwitch.recordFailedAuthentication();
}

// Verify activation
testKillSwitch.checkThresholds('security_incident', 'Test attack');
console.assert(testKillSwitch.getStatus().active === true);
```

---

## API Reference

### Core Methods

```typescript
// Record security events
recordFailedAuthentication(): void
recordSuspiciousRequest(): void
recordKeyAnomaly(): void
recordSystemError(): void

// Get current state
getStatus(): KillSwitchStatus
getSecurityMetrics(): SecurityMetrics
getCumulativeMetrics(): CumulativeMetrics
getDecayingMetrics(): Omit<DecayingMetrics, 'windowStart'>
getThresholds(): ThresholdConfig

// Control
activate(reason, source, severity, triggeredBy): Promise<void>
deactivate(reason, triggeredBy): Promise<void>
updateThresholds(newThresholds): void
resetCumulativeMetrics(): void
forceHealthCheck(): Promise<HealthReport>
```

### Events

```typescript
// Listen to kill switch events
killSwitchService.on('activated', (data) => {
  console.log('Kill switch activated:', data.trigger);
});

killSwitchService.on('deactivated', (data) => {
  console.log('Kill switch deactivated:', data.reason);
});

killSwitchService.on('autoRecovered', (data) => {
  console.log('Auto-recovery successful:', data.attempt);
});

killSwitchService.on('autoRecoveryFailed', (data) => {
  console.log('Auto-recovery failed:', data.error);
});
```

---

## Troubleshooting

### Kill Switch Won't Activate

1. Check event recording:
   ```typescript
   const metrics = killSwitchService.getSecurityMetrics();
   console.log('Current counts:', metrics);
   ```

2. Verify thresholds:
   ```typescript
   const thresholds = killSwitchService.getThresholds();
   console.log('Thresholds:', thresholds);
   ```

3. Check if already active:
   ```typescript
   if (killSwitchService.getStatus().active) {
     console.log('Kill switch already active');
   }
   ```

### Kill Switch Won't Deactivate

1. Check HSM connection:
   ```typescript
   const hsmStatus = hsmService.getSystemStatus();
   if (!hsmStatus.connectionHealth) {
     console.log('HSM unhealthy, cannot deactivate');
   }
   ```

2. Verify manual deactivation:
   ```typescript
   await killSwitchService.deactivate('Manual override', 'admin-id');
   ```

### Unexpected Activations

1. Review trigger reason:
   ```typescript
   const trigger = killSwitchService.getStatus().lastTrigger;
   console.log('Triggered by:', trigger.reason);
   ```

2. Check decaying metrics contribution:
   ```typescript
   const decaying = killSwitchService.getDecayingMetrics();
   console.log('Decaying metrics:', decaying);
   // If high, previous half-window had many events
   ```

3. Review cumulative metrics:
   ```typescript
   const cumulative = killSwitchService.getCumulativeMetrics();
   console.log('Cumulative metrics:', cumulative);
   // If approaching 3x threshold, consider reset after review
   ```

---

## Security Best Practices

1. **Never disable the kill switch in production**
2. **Monitor cumulative metrics regularly** - reset only after thorough review
3. **Tune thresholds based on your traffic patterns**
4. **Test recovery procedures regularly**
5. **Document all manual activations/deactivations**
6. **Review audit logs after each activation**
7. **Keep threshold values confidential** - prevents attackers from optimizing evasion
8. **Enable auto-recovery only in dev/staging** - production requires manual verification
9. **Alert on approaching thresholds** - don't wait for activation (e.g., 70% of threshold)
10. **Coordinate with incident response team** - ensure 24/7 coverage for activation events

---

## Contact and Escalation

**Security Team:** security@example.com
**On-Call:** +1-XXX-XXX-XXXX
**Incident Response:** incidents@example.com

**Escalation Path:**
1. L1: Security Operations Center (SOC)
2. L2: Security Engineering Team
3. L3: CISO / Security Leadership
4. Critical: Executive Team + Legal
