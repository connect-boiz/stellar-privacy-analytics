import { Env, Address, BytesN, String, Vec, xdr } from '@stellar/stellar-sdk';
import { UpgradeableProxy } from '../src/upgradeable_proxy';

describe('UpgradeableProxy', () => {
  let env: Env;
  let admin: Address;
  let user: Address;
  let implementation: BytesN<32>;
  let newImplementation: BytesN<32>;

  beforeEach(() => {
    env = new Env();
    admin = new Address('GD5DJQD2KG4E4JZ2WHXKHPQQJ6QZVJQR5A2F4QJQJQJQJQJQJQJQJQJQ');
    user = new Address('GDTGNRQG3M6M2YMFQPNHPYFQNR3VWMOJ6G6YQRJQJQJQJQJQJQJQJQJQ');
    implementation = new BytesN(env, Array(32).fill(1));
    newImplementation = new BytesN(env, Array(32).fill(2));
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      UpgradeableProxy.initialize(env, implementation, admin);
      
      const storedImplementation = UpgradeableProxy.implementation(env);
      const storedAdmin = UpgradeableProxy.admin(env);
      
      expect(storedImplementation).toEqual(implementation);
      expect(storedAdmin).toEqual(admin);
    });

    it('should fail to initialize twice', () => {
      UpgradeableProxy.initialize(env, implementation, admin);
      
      expect(() => {
        UpgradeableProxy.initialize(env, implementation, admin);
      }).toThrow('AlreadyInitialized');
    });

    it('should fail with invalid implementation', () => {
      const invalidImpl = new BytesN(env, Array(32).fill(0));
      
      expect(() => {
        UpgradeableProxy.initialize(env, invalidImpl, admin);
      }).toThrow('InvalidImplementation');
    });

    it('should fail when not initialized', () => {
      expect(() => {
        UpgradeableProxy.implementation(env);
      }).toThrow('NotInitialized');
    });
  });

  describe('upgrade process', () => {
    beforeEach(() => {
      UpgradeableProxy.initialize(env, implementation, admin);
    });

    it('should initiate upgrade successfully', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      
      const pendingUpgrade = UpgradeableProxy.pending_upgrade(env);
      expect(pendingUpgrade).toBeDefined();
      expect(pendingUpgrade.new_implementation).toEqual(newImplementation);
    });

    it('should fail to initiate upgrade as non-admin', () => {
      expect(() => {
        UpgradeableProxy.initiate_upgrade(env, newImplementation, user);
      }).toThrow('NotAdmin');
    });

    it('should fail to initiate upgrade with invalid implementation', () => {
      const invalidImpl = new BytesN(env, Array(32).fill(0));
      
      expect(() => {
        UpgradeableProxy.initiate_upgrade(env, invalidImpl, admin);
      }).toThrow('InvalidImplementation');
    });

    it('should fail when upgrade already initiated', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      
      expect(() => {
        UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      }).toThrow('UpgradeAlreadyInitiated');
    });

    it('should complete upgrade after delay', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      
      // Fast forward time (simulate delay)
      env.jump_time(86400); // 24 hours
      
      UpgradeableProxy.complete_upgrade(env, admin);
      
      const currentImplementation = UpgradeableProxy.implementation(env);
      expect(currentImplementation).toEqual(newImplementation);
      
      const pendingUpgrade = UpgradeableProxy.pending_upgrade(env);
      expect(pendingUpgrade).toBeNull();
    });

    it('should fail to complete upgrade before delay', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      
      expect(() => {
        UpgradeableProxy.complete_upgrade(env, admin);
      }).toThrow('UpgradeNotReady');
    });

    it('should fail to complete upgrade as non-admin', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      env.jump_time(86400);
      
      expect(() => {
        UpgradeableProxy.complete_upgrade(env, user);
      }).toThrow('NotAdmin');
    });

    it('should cancel pending upgrade', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      
      UpgradeableProxy.cancel_upgrade(env, admin);
      
      const pendingUpgrade = UpgradeableProxy.pending_upgrade(env);
      expect(pendingUpgrade).toBeNull();
    });

    it('should fail to cancel upgrade as non-admin', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      
      expect(() => {
        UpgradeableProxy.cancel_upgrade(env, user);
      }).toThrow('NotAdmin');
    });
  });

  describe('upgrade delay management', () => {
    beforeEach(() => {
      UpgradeableProxy.initialize(env, implementation, admin);
    });

    it('should set upgrade delay successfully', () => {
      const newDelay = 172800; // 48 hours
      
      UpgradeableProxy.set_upgrade_delay(env, newDelay, admin);
      
      const delay = UpgradeableProxy.upgrade_delay(env);
      expect(delay).toEqual(newDelay);
    });

    it('should fail to set delay below minimum', () => {
      const invalidDelay = 3600; // 1 hour (below 24h minimum)
      
      expect(() => {
        UpgradeableProxy.set_upgrade_delay(env, invalidDelay, admin);
      }).toThrow('InvalidDelay');
    });

    it('should fail to set delay as non-admin', () => {
      expect(() => {
        UpgradeableProxy.set_upgrade_delay(env, 172800, user);
      }).toThrow('NotAdmin');
    });
  });

  describe('admin management', () => {
    beforeEach(() => {
      UpgradeableProxy.initialize(env, implementation, admin);
    });

    it('should transfer admin successfully', () => {
      const newAdmin = new Address('GC5SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
      
      UpgradeableProxy.transfer_admin(env, newAdmin, admin);
      
      const currentAdmin = UpgradeableProxy.admin(env);
      expect(currentAdmin).toEqual(newAdmin);
    });

    it('should fail to transfer admin as non-admin', () => {
      const newAdmin = new Address('GC5SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
      
      expect(() => {
        UpgradeableProxy.transfer_admin(env, newAdmin, user);
      }).toThrow('NotAdmin');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      UpgradeableProxy.initialize(env, implementation, admin);
    });

    it('should handle multiple upgrade cycles', () => {
      const impl1 = new BytesN(env, Array(32).fill(1));
      const impl2 = new BytesN(env, Array(32).fill(2));
      const impl3 = new BytesN(env, Array(32).fill(3));
      
      // First upgrade
      UpgradeableProxy.initiate_upgrade(env, impl2, admin);
      env.jump_time(86400);
      UpgradeableProxy.complete_upgrade(env, admin);
      
      // Second upgrade
      UpgradeableProxy.initiate_upgrade(env, impl3, admin);
      env.jump_time(86400);
      UpgradeableProxy.complete_upgrade(env, admin);
      
      const finalImplementation = UpgradeableProxy.implementation(env);
      expect(finalImplementation).toEqual(impl3);
    });

    it('should handle upgrade cancellation and re-initiation', () => {
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      UpgradeableProxy.cancel_upgrade(env, admin);
      
      // Should be able to initiate again
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      
      const pendingUpgrade = UpgradeableProxy.pending_upgrade(env);
      expect(pendingUpgrade).toBeDefined();
    });

    it('should maintain state across upgrades', () => {
      // Set some custom delay
      UpgradeableProxy.set_upgrade_delay(env, 172800, admin);
      
      // Perform upgrade
      UpgradeableProxy.initiate_upgrade(env, newImplementation, admin);
      env.jump_time(86400);
      UpgradeableProxy.complete_upgrade(env, admin);
      
      // Check that delay is preserved
      const delay = UpgradeableProxy.upgrade_delay(env);
      expect(delay).toEqual(172800);
    });
  });
});
