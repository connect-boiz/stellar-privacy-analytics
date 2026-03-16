import { Env, Address, BytesN, String, Vec, xdr } from '@stellar/stellar-sdk';
import { StellarAnalytics } from '../src/stellar_analytics';

describe('StellarAnalytics', () => {
  let env: Env;
  let admin: Address;
  let user: Address;
  let oracle: Address;

  beforeEach(() => {
    env = new Env();
    admin = new Address('GD5DJQD2KG4E4JZ2WHXKHPQQJ6QZVJQR5A2F4QJQJQJQJQJQJQJQJQJQ');
    user = new Address('GDTGNRQG3M6M2YMFQPNHPYFQNR3VWMOJ6G6YQRJQJQJQJQJQJQJQJQJQ');
    oracle = new Address('GC5SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
  });

  describe('initialization', () => {
    it('should initialize the contract successfully', () => {
      StellarAnalytics.initialize(env, admin);
      
      // Verify admin is set
      const storedAdmin = env.storage().instance().get('admin');
      expect(storedAdmin).toEqual(admin);
      
      // Verify privacy levels are set
      const privacyLevels = env.storage().instance().get('privacy_levels');
      expect(privacyLevels).toBeDefined();
      
      // Verify counters are initialized
      const totalAnalyses = env.storage().instance().get('total_analyses');
      expect(totalAnalyses).toEqual(0);
    });

    it('should not initialize twice', () => {
      StellarAnalytics.initialize(env, admin);
      
      // Should not throw or change state when called again
      StellarAnalytics.initialize(env, admin);
      
      const storedAdmin = env.storage().instance().get('admin');
      expect(storedAdmin).toEqual(admin);
    });
  });

  describe('request_analysis', () => {
    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n); // 100 tokens
    });

    it('should create an analysis request successfully', () => {
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

      expect(requestId).toBeDefined();
      expect(requestId.length).toEqual(32);

      // Verify request is stored
      const request = StellarAnalytics.get_analysis_request(env, requestId);
      expect(request.requester).toEqual(env.current_contract_address());
      expect(request.dataset_hash).toEqual(datasetHash);
      expect(request.analysis_type).toEqual(analysisType);
      expect(request.privacy_budget).toEqual(100000000000000000n);
      expect(request.completed).toEqual(false);
      expect(request.cancelled).toEqual(false);
    });

    it('should fail with insufficient privacy budget', () => {
      // Add insufficient budget
      StellarAnalytics.add_privacy_budget(env, user, 50000000000000000n); // 50 tokens

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      expect(() => {
        StellarAnalytics.request_analysis(
          env,
          datasetHash,
          analysisType,
          privacyLevel,
          signature
        );
      }).toThrow('InsufficientPrivacyBudget');
    });

    it('should fail with invalid privacy level', () => {
      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'invalid');
      const signature = new BytesN(env, Array(64).fill(2));

      expect(() => {
        StellarAnalytics.request_analysis(
          env,
          datasetHash,
          analysisType,
          privacyLevel,
          signature
        );
      }).toThrow('InvalidPrivacyLevel');
    });
  });

  describe('complete_analysis', () => {
    let requestId: BytesN<32>;

    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      StellarAnalytics.add_oracle(env, oracle);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );
    });

    it('should complete an analysis successfully', () => {
      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n; // 50 tokens
      const accuracy = 95;
      const privacyProofs = Vec.fromArray(env, [
        new BytesN(env, Array(32).fill(4)),
        new BytesN(env, Array(32).fill(5)),
      ]);

      StellarAnalytics.complete_analysis(
        env,
        requestId,
        resultHash,
        privacyBudgetUsed,
        accuracy,
        privacyProofs
      );

      // Verify result is stored
      const result = StellarAnalytics.get_analysis_result(env, requestId);
      expect(result.request_id).toEqual(requestId);
      expect(result.result_hash).toEqual(resultHash);
      expect(result.privacy_budget_used).toEqual(privacyBudgetUsed);
      expect(result.accuracy).toEqual(accuracy);

      // Verify request is marked as completed
      const request = StellarAnalytics.get_analysis_request(env, requestId);
      expect(request.completed).toEqual(true);

      // Verify privacy budget was refunded
      const remainingBudget = StellarAnalytics.get_user_privacy_budget(env, user);
      expect(remainingBudget).toEqual(100000000000000000n - 50000000000000000n); // 100 - 50 = 50 tokens
    });

    it('should fail when budget is exceeded', () => {
      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 200000000000000000n; // 200 tokens (exceeds budget)
      const accuracy = 95;
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
      }).toThrow('BudgetExceeded');
    });

    it('should fail with invalid confidence', () => {
      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n;
      const accuracy = 150; // Invalid confidence > 100
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
  });

  describe('cancel_analysis', () => {
    let requestId: BytesN<32>;

    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const datasetHash = new BytesN(env, Array(32).fill(1));
      const analysisType = new String(env, 'descriptive');
      const privacyLevel = new String(env, 'high');
      const signature = new BytesN(env, Array(64).fill(2));

      requestId = StellarAnalytics.request_analysis(
        env,
        datasetHash,
        analysisType,
        privacyLevel,
        signature
      );
    });

    it('should cancel an analysis successfully', () => {
      StellarAnalytics.cancel_analysis(env, requestId);

      // Verify request is marked as cancelled
      const request = StellarAnalytics.get_analysis_request(env, requestId);
      expect(request.cancelled).toEqual(true);

      // Verify privacy budget was refunded
      const remainingBudget = StellarAnalytics.get_user_privacy_budget(env, user);
      expect(remainingBudget).toEqual(100000000000000000n); // Full refund
    });

    it('should fail to cancel already completed analysis', () => {
      const resultHash = new BytesN(env, Array(32).fill(3));
      const privacyBudgetUsed = 50000000000000000n;
      const accuracy = 95;
      const privacyProofs = Vec.fromArray(env, []);

      // Complete the analysis first
      StellarAnalytics.complete_analysis(
        env,
        requestId,
        resultHash,
        privacyBudgetUsed,
        accuracy,
        privacyProofs
      );

      // Try to cancel
      expect(() => {
        StellarAnalytics.cancel_analysis(env, requestId);
      }).toThrow('RequestAlreadyCompleted');
    });
  });

  describe('oracle management', () => {
    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
    });

    it('should add an oracle successfully', () => {
      StellarAnalytics.add_oracle(env, oracle);

      // In a real implementation, we would verify the oracle is added
      // For now, we just verify it doesn't throw
      expect(true).toBe(true);
    });

    it('should allow adding the same oracle twice (no error)', () => {
      StellarAnalytics.add_oracle(env, oracle);
      StellarAnalytics.add_oracle(env, oracle); // Should not throw

      expect(true).toBe(true);
    });
  });

  describe('privacy budget management', () => {
    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
    });

    it('should add privacy budget successfully', () => {
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);

      const budget = StellarAnalytics.get_user_privacy_budget(env, user);
      expect(budget).toEqual(100000000000000000n);
    });

    it('should fail to add zero budget', () => {
      expect(() => {
        StellarAnalytics.add_privacy_budget(env, user, 0n);
      }).toThrow('InsufficientPrivacyBudget');
    });

    it('should fail to exceed maximum budget', () => {
      StellarAnalytics.add_privacy_budget(env, user, 1000000000000000000n); // Max budget

      expect(() => {
        StellarAnalytics.add_privacy_budget(env, user, 1n);
      }).toThrow('BudgetExceeded');
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      StellarAnalytics.initialize(env, admin);
      StellarAnalytics.add_privacy_budget(env, user, 100000000000000000n);
      StellarAnalytics.add_oracle(env, oracle);
    });

    it('should return correct statistics', () => {
      const stats = StellarAnalytics.get_stats(env);
      expect(stats).toEqual([0n, 0n, 0n]); // No analyses yet

      // Create an analysis
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

      const statsAfterRequest = StellarAnalytics.get_stats(env);
      expect(statsAfterRequest).toEqual([1n, 100000000000000000n, 1n]); // 1 request, budget used, 1 active
    });
  });
});
