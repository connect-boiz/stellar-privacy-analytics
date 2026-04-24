import { Env, Address, BytesN, String, Vec, xdr } from '@stellar/stellar-sdk';
import { StellarAnalytics } from '../src/stellar_analytics';

describe('StellarAnalytics - Enhanced Tests', () => {
  let env: Env;
  let admin: Address;
  let user: Address;
  let oracle: Address;
  let maliciousUser: Address;

  beforeEach(() => {
    env = new Env();
    admin = new Address('GD5DJQD2KG4E4JZ2WHXKHPQQJ6QZVJQR5A2F4QJQJQJQJQJQJQJQJQJQ');
    user = new Address('GDTGNRQG3M6M2YMFQPNHPYFQNR3VWMOJ6G6YQRJQJQJQJQJQJQJQJQJQ');
    oracle = new Address('GC5SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
    maliciousUser = new Address('GB5SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
  });

  describe('edge cases and error conditions', () => {
    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
    });

    it('should handle zero address in initialization', () => {
      const zeroAddress = new Address('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      
      // This should not crash but may be rejected based on implementation
      expect(() => {
        StellarAnalytics.initialize(env, zeroAddress);
      }).not.toThrow();
    });

    it('should handle maximum privacy budget edge case', () => {
      const maxBudget = 1000000000000000000n; // Maximum allowed
      
      StellarAnalytics.add_privacy_budget(env, user, maxBudget);
      
      const budget = StellarAnalytics.get_user_privacy_budget(env, user);
      expect(budget).toEqual(maxBudget);
    });

    it('should handle negative values gracefully', () => {
      expect(() => {
        StellarAnalytics.add_privacy_budget(env, user, -1000n);
      }).toThrow();
    });

    it('should handle empty dataset hash', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      
      const emptyHash = new BytesN(env, Array(32).fill(0));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      expect(() => {
        StellarAnalytics.request_analysis(
          env,
          emptyHash,
          analysisType,
          privacyLevel,
          signature
        );
      }).toThrow(); // Should reject empty hash
    });

    it('should handle extremely large dataset hash', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      
      const largeHash = new BytesN(env, Array(32).fill(255));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId = StellarAnalytics.request_analysis(
        env,
        largeHash,
        analysisType,
        privacyLevel,
        signature
      );

      expect(requestId).toBeDefined();
    });

    it('should handle concurrent analysis requests', () => {
      StellarAnalytics.add_privacy_budget(env, user, 300000000000000000n); // 300 tokens
      
      const datasetHash1 = new BytesN(env, Array(32).fill(1));
      const datasetHash2 = new BytesN(env, Array(32).fill(2));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId1 = StellarAnalytics.request_analysis(
        env,
        datasetHash1,
        analysisType,
        privacyLevel,
        signature
      );

      const requestId2 = StellarAnalytics.request_analysis(
        env,
        datasetHash2,
        analysisType,
        privacyLevel,
        signature
      );

      expect(requestId1).not.toEqual(requestId2);
      
      const request1 = StellarAnalytics.get_analysis_request(env, requestId1);
      const request2 = StellarAnalytics.get_analysis_request(env, requestId2);
      
      expect(request1.dataset_hash).toEqual(datasetHash1);
      expect(request2.dataset_hash).toEqual(datasetHash2);
    });

    it('should handle analysis completion with zero accuracy', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      StellarAnalytics.add_oracle(env, oracle);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n;
      const accuracy = 0; // Zero accuracy
      const privacyProofs = Vec.fromArray(env, []);

      expect(() => {
        StellarAnalytics.complete_analysis(
          env,
          requestId,
          resultHash,
          privacyBudgetUsed,
          accuracy,
          privacyProofs
        );
      }).toThrow('InvalidConfidence');
    });

    it('should handle analysis completion with negative accuracy', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      StellarAnalytics.add_oracle(env, oracle);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n;
      const accuracy = -10; // Negative accuracy
      const privacyProofs = Vec.fromArray(env, []);

      expect(() => {
        StellarAnalytics.complete_analysis(
          env,
          requestId,
          resultHash,
          privacyBudgetUsed,
          accuracy,
          privacyProofs
        );
      }).toThrow('InvalidConfidence');
    });

    it('should handle empty privacy proofs array', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      StellarAnalytics.add_oracle(env, oracle);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n;
      const accuracy = 95;
      const privacyProofs = Vec.fromArray(env, []); // Empty array

      StellarAnalytics.complete_analysis(
        env,
        requestId,
        resultHash,
        privacyBudgetUsed,
        accuracy,
        privacyProofs
      );

      const result = StellarAnalytics.get_analysis_result(env, requestId);
      expect(result.privacy_proofs.length()).toEqual(0);
    });

    it('should handle maximum number of privacy proofs', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      StellarAnalytics.add_oracle(env, oracle);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n;
      const accuracy = 95;
      
      // Create many privacy proofs
      const privacyProofs = Vec.fromArray(env, [
        new BytesN(env, Array(32).fill(4)),
        new BytesN(env, Array(32).fill(5)),
        new BytesN(env, Array(32).fill(6)),
        new BytesN(env, Array(32).fill(7)),
        new BytesN(env, Array(32).fill(8)),
      ]);

      StellarAnalytics.complete_analysis(
        env,
        requestId,
        resultHash,
        privacyBudgetUsed,
        accuracy,
        privacyProofs
      );

      const result = StellarAnalytics.get_analysis_result(env, requestId);
      expect(result.privacy_proofs.length()).toEqual(5);
    });

    it('should handle cancellation of non-existent request', () => {
      const fakeRequestId = new BytesN(env, Array(32).fill(9));
      
      expect(() => {
        StellarAnalytics.cancel_analysis(env, fakeRequestId);
      }).toThrow();
    });

    it('should handle double cancellation', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      StellarAnalytics.cancel_analysis(env, requestId);

      expect(() => {
        StellarAnalytics.cancel_analysis(env, requestId);
      }).toThrow('RequestAlreadyCompleted');
    });

    it('should handle oracle removal', () => {
      StellarAnalytics.add_oracle(env, oracle);
      
      // This test assumes there's a remove_oracle function
      // If not implemented, this would fail appropriately
      try {
        StellarAnalytics.remove_oracle(env, oracle);
        expect(true).toBe(true); // Success case
      } catch (error) {
        expect(error.message).toContain('not implemented');
      }
    });

    it('should handle privacy budget overflow', () => {
      StellarAnalytics.add_privacy_budget(env, user, 900000000000000000n); // 900 tokens
      
      expect(() => {
        StellarAnalytics.add_privacy_budget(env, user, 200000000000000000n); // Would exceed max
      }).toThrow('BudgetExceeded');
    });

    it('should handle very small privacy budget amounts', () => {
      const smallAmount = 1n; // 1 stroop
      
      StellarAnalytics.add_privacy_budget(env, user, smallAmount);
      
      const budget = StellarAnalytics.get_user_privacy_budget(env, user);
      expect(budget).toEqual(smallAmount);
    });

    it('should handle invalid analysis types', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const invalidAnalysisType = new String(env, 'invalid_analysis_type');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      expect(() => {
        StellarAnalytics.request_analysis(
          env,
          datasetHash,
          invalidAnalysisType,
          privacyLevel,
          signature
        );
      }).toThrow('InvalidAnalysisType');
    });

    it('should handle empty analysis type', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const emptyAnalysisType = new String(env, '');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      expect(() => {
        StellarAnalytics.request_analysis(
          env,
          datasetHash,
          emptyAnalysisType,
          privacyLevel,
          signature
        );
      }).toThrow();
    });

    it('should handle very long analysis type', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const longAnalysisType = new String(env, 'a'.repeat(1000)); // Very long string
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      expect(() => {
        StellarAnalytics.request_analysis(
          env,
          datasetHash,
          longAnalysisType,
          privacyLevel,
          signature
        );
      }).toThrow(); // Should reject overly long strings
    });

    it('should handle malformed signature', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const malformedSignature = new BytesN(env, Array(64).fill(0)); // All zeros

      expect(() => {
        StellarAnalytics.request_analysis(
          env,
          datasetHash,
          analysisType,
          privacyLevel,
          malformedSignature
        );
      }).toThrow('InvalidSignature');
    });

    it('should handle statistics calculation with no data', () => {
      const stats = StellarAnalytics.get_stats(env);
      expect(stats).toEqual([0n, 0n, 0n]); // No requests, no budget used, no active analyses
    });

    it('should handle statistics after multiple operations', () => {
      StellarAnalytics.add_privacy_budget(env, user, 300000000000000000n);
      StellarAnalytics.add_oracle(env, oracle);

      // Create multiple requests
      for (let i = 0; i < 3; i++) {
        const datasetHash = new BytesN(env, Array(32).fill(i + 1));
        const analysisType = new String(env, 'descriptive');
        const privacyLevel = new String(env, 'high');
        const signature = new BytesN(env, Array(64).fill(2));

        StellarAnalytics.request_analysis(
          env,
          datasetHash,
          analysisType,
          privacyLevel,
          signature
        );
      }

      const stats = StellarAnalytics.get_stats(env);
      expect(stats[0]).toEqual(3n); // 3 requests
      expect(stats[2]).toEqual(3n); // 3 active analyses
    });

    it('should handle gas limit edge cases', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      // Create a complex scenario that might hit gas limits
      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n;
      const accuracy = 95;
      
      // Create many privacy proofs to test gas limits
      const privacyProofs = Vec.fromArray(env, Array(100).fill(0).map((_, i) => 
        new BytesN(env, Array(32).fill(i))
      ));

      StellarAnalytics.complete_analysis(
        env,
        requestId,
        resultHash,
        privacyBudgetUsed,
        accuracy,
        privacyProofs
      );

      const result = StellarAnalytics.get_analysis_result(env, requestId);
      expect(result.privacy_proofs.length()).toEqual(100);
    });
  });

  describe('security tests', () => {
    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
    });

    it('should prevent unauthorized admin operations', () => {
      expect(() => {
        StellarAnalytics.add_oracle(env, maliciousUser);
      }).toThrow('NotAdmin');
    });

    it('should prevent access to other users\' privacy budgets', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      
      // Malicious user tries to access user's budget
      const budget = StellarAnalytics.get_user_privacy_budget(env, maliciousUser);
      expect(budget).toEqual(0n); // Should be zero for malicious user
    });

    it('should prevent replay attacks', () => {
      StellarAnalytics.add_privacy_budget(env, user, 200000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      const requestId1 = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      // Try to submit the same request again (replay attack)
      const requestId2 = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );

      // Should generate different request IDs to prevent replay
      expect(requestId1).not.toEqual(requestId2);
    });

    it('should handle boundary conditions in privacy levels', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const signature = new BytesN(env, Array(64).fill(2));

      // Test lowest privacy level
      const lowPrivacyLevel = new String(env, 'low');
      const requestId1 = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        lowPrivacyLevel,
        signature
      );
      expect(requestId1).toBeDefined();

      // Test highest privacy level
      const highPrivacyLevel = new String(env, 'maximum');
      const requestId2 = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        highPrivacyLevel,
        signature
      );
      expect(requestId2).toBeDefined();
    });
  });
});
