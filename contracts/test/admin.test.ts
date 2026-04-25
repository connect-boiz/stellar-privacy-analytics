import { Env, Address, BytesN, String, Vec, xdr } from '@stellar/stellar-sdk';
import { MultiSigAdmin } from '../src/admin';

describe('MultiSigAdmin', () => {
  let env: Env;
  let owner1: Address;
  let owner2: Address;
  let owner3: Address;
  let nonOwner: Address;
  let destination: Address;

  beforeEach(() => {
    env = new Env();
    owner1 = new Address('GD5DJQD2KG4E4JZ2WHXKHPQQJ6QZVJQR5A2F4QJQJQJQJQJQJQJQJQJQ');
    owner2 = new Address('GDTGNRQG3M6M2YMFQPNHPYFQNR3VWMOJ6G6YQRJQJQJQJQJQJQJQJQJQ');
    owner3 = new Address('GC5SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
    nonOwner = new Address('GB5SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
    destination = new Address('GD7SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      const owners = Vec.fromArray(env, [owner1, owner2, owner3]);
      const threshold = 2;
      
      MultiSigAdmin.initialize(env, owners, threshold);
      
      const storedOwners = MultiSigAdmin.get_owners(env);
      const storedThreshold = MultiSigAdmin.get_threshold(env);
      
      expect(storedOwners).toEqual(owners);
      expect(storedThreshold).toEqual(threshold);
    });

    it('should fail to initialize twice', () => {
      const owners = Vec.fromArray(env, [owner1, owner2]);
      MultiSigAdmin.initialize(env, owners, 2);
      
      expect(() => {
        MultiSigAdmin.initialize(env, owners, 2);
      }).toThrow('AlreadyInitialized');
    });

    it('should fail with insufficient owners', () => {
      const owners = Vec.fromArray(env, []);
      
      expect(() => {
        MultiSigAdmin.initialize(env, owners, 1);
      }).toThrow('InvalidOwner');
    });

    it('should fail with too many owners', () => {
      const owners = Vec.fromArray(env, Array(51).fill(owner1));
      
      expect(() => {
        MultiSigAdmin.initialize(env, owners, 25);
      }).toThrow('InvalidOwner');
    });

    it('should fail with invalid threshold', () => {
      const owners = Vec.fromArray(env, [owner1, owner2]);
      
      expect(() => {
        MultiSigAdmin.initialize(env, owners, 3); // Higher than number of owners
      }).toThrow('InvalidThreshold');
    });

    it('should fail with duplicate owners', () => {
      const owners = Vec.fromArray(env, [owner1, owner1]);
      
      expect(() => {
        MultiSigAdmin.initialize(env, owners, 2);
      }).toThrow('OwnerExists');
    });

    it('should fail when not initialized', () => {
      expect(() => {
        MultiSigAdmin.get_owners(env);
      }).toThrow('NotInitialized');
    });
  });

  describe('owner management', () => {
    beforeEach(() => {
      const owners = Vec.fromArray(env, [owner1, owner2, owner3]);
      MultiSigAdmin.initialize(env, owners, 2);
    });

    it('should add owner successfully', () => {
      const newOwner = new Address('GD8SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
      
      MultiSigAdmin.add_owner(env, newOwner, owner1);
      
      const owners = MultiSigAdmin.get_owners(env);
      expect(owners.contains(newOwner)).toBe(true);
    });

    it('should fail to add owner as non-owner', () => {
      const newOwner = new Address('GD8SXL4AMFKPRUF2EVBEWVUR5Q5US2IZN2QAA5S2Z2Z2Z2Z2Z2Z2Z2Z2');
      
      expect(() => {
        MultiSigAdmin.add_owner(env, newOwner, nonOwner);
      }).toThrow('NotOwner');
    });

    it('should fail to add existing owner', () => {
      expect(() => {
        MultiSigAdmin.add_owner(env, owner1, owner1);
      }).toThrow('OwnerExists');
    });

    it('should fail to add owner when at maximum', () => {
      // Add owners until we reach maximum
      for (let i = 0; i < 47; i++) { // We already have 3, so add 47 more to reach 50
        const newOwner = new Address(`GD${i.toString().padStart(39, '0')}`);
        MultiSigAdmin.add_owner(env, newOwner, owner1);
      }
      
      const maxOwner = new Address('GD9999999999999999999999999999999999999999');
      expect(() => {
        MultiSigAdmin.add_owner(env, maxOwner, owner1);
      }).toThrow('InvalidOwner');
    });

    it('should remove owner successfully', () => {
      MultiSigAdmin.remove_owner(env, owner3, owner1);
      
      const owners = MultiSigAdmin.get_owners(env);
      expect(owners.contains(owner3)).toBe(false);
      expect(owners.length()).toEqual(2);
    });

    it('should fail to remove owner as non-owner', () => {
      expect(() => {
        MultiSigAdmin.remove_owner(env, owner3, nonOwner);
      }).toThrow('NotOwner');
    });

    it('should fail to remove non-existent owner', () => {
      const fakeOwner = new Address('GD9999999999999999999999999999999999999999');
      
      expect(() => {
        MultiSigAdmin.remove_owner(env, fakeOwner, owner1);
      }).toThrow('OwnerNotFound');
    });

    it('should fail to remove last owner', () => {
      // Remove all but one owner
      MultiSigAdmin.remove_owner(env, owner3, owner1);
      MultiSigAdmin.remove_owner(env, owner2, owner1);
      
      expect(() => {
        MultiSigAdmin.remove_owner(env, owner1, owner1);
      }).toThrow('InvalidOwner');
    });

    it('should change threshold successfully', () => {
      MultiSigAdmin.change_threshold(env, 3, owner1);
      
      const threshold = MultiSigAdmin.get_threshold(env);
      expect(threshold).toEqual(3);
    });

    it('should fail to change threshold as non-owner', () => {
      expect(() => {
        MultiSigAdmin.change_threshold(env, 3, nonOwner);
      }).toThrow('NotOwner');
    });

    it('should fail to set invalid threshold', () => {
      expect(() => {
        MultiSigAdmin.change_threshold(env, 4, owner1); // Higher than number of owners
      }).toThrow('InvalidThreshold');
    });
  });

  describe('transaction management', () => {
    beforeEach(() => {
      const owners = Vec.fromArray(env, [owner1, owner2, owner3]);
      MultiSigAdmin.initialize(env, owners, 2);
    });

    it('should submit transaction successfully', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      
      expect(txHash).toBeDefined();
      expect(txHash.length).toEqual(32);
      
      const transaction = MultiSigAdmin.get_transaction(env, txHash);
      expect(transaction.destination).toEqual(destination);
      expect(transaction.value).toEqual(value);
      expect(transaction.executed).toEqual(false);
    });

    it('should fail to submit transaction as non-owner', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      expect(() => {
        MultiSigAdmin.submit_transaction(env, destination, value, data, nonOwner);
      }).toThrow('NotOwner');
    });

    it('should confirm transaction successfully', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      MultiSigAdmin.confirm_transaction(env, txHash, owner2);
      
      const confirmations = MultiSigAdmin.get_confirmations(env, txHash);
      expect(confirmations.contains(owner2)).toBe(true);
    });

    it('should fail to confirm transaction as non-owner', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      
      expect(() => {
        MultiSigAdmin.confirm_transaction(env, txHash, nonOwner);
      }).toThrow('NotOwner');
    });

    it('should fail to confirm twice', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      
      expect(() => {
        MultiSigAdmin.confirm_transaction(env, txHash, owner1);
      }).toThrow('AlreadyConfirmed');
    });

    it('should execute transaction with sufficient confirmations', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      MultiSigAdmin.confirm_transaction(env, txHash, owner2);
      
      MultiSigAdmin.execute_transaction(env, txHash, owner1);
      
      const transaction = MultiSigAdmin.get_transaction(env, txHash);
      expect(transaction.executed).toEqual(true);
    });

    it('should fail to execute with insufficient confirmations', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      
      expect(() => {
        MultiSigAdmin.execute_transaction(env, txHash, owner1);
      }).toThrow('InsufficientConfirmations');
    });

    it('should fail to execute as non-owner', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      MultiSigAdmin.confirm_transaction(env, txHash, owner2);
      
      expect(() => {
        MultiSigAdmin.execute_transaction(env, txHash, nonOwner);
      }).toThrow('NotOwner');
    });

    it('should fail to execute already executed transaction', () => {
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      MultiSigAdmin.confirm_transaction(env, txHash, owner2);
      MultiSigAdmin.execute_transaction(env, txHash, owner1);
      
      expect(() => {
        MultiSigAdmin.execute_transaction(env, txHash, owner1);
      }).toThrow('TransactionAlreadyExecuted');
    });

    it('should handle non-existent transaction', () => {
      const fakeHash = new BytesN(env, Array(32).fill(9));
      
      expect(() => {
        MultiSigAdmin.get_transaction(env, fakeHash);
      }).toThrow('TransactionNotFound');
    });
  });

  describe('utility functions', () => {
    beforeEach(() => {
      const owners = Vec.fromArray(env, [owner1, owner2, owner3]);
      MultiSigAdmin.initialize(env, owners, 2);
    });

    it('should correctly identify owners', () => {
      expect(MultiSigAdmin.is_owner(env, owner1)).toBe(true);
      expect(MultiSigAdmin.is_owner(env, nonOwner)).toBe(false);
    });

    it('should increment nonce for each transaction', () => {
      const data = new BytesN(env, Array(32).fill(1));
      
      const initialNonce = MultiSigAdmin.get_nonce(env);
      
      MultiSigAdmin.submit_transaction(env, destination, 1000n, data, owner1);
      expect(MultiSigAdmin.get_nonce(env)).toEqual(initialNonce + 1);
      
      MultiSigAdmin.submit_transaction(env, destination, 2000n, data, owner1);
      expect(MultiSigAdmin.get_nonce(env)).toEqual(initialNonce + 2);
    });
  });

  describe('edge cases', () => {
    it('should handle threshold adjustment when removing owners', () => {
      const owners = Vec.fromArray(env, [owner1, owner2, owner3]);
      MultiSigAdmin.initialize(env, owners, 3); // 3 of 3 required
      
      // Remove one owner - threshold should be adjusted to 2
      MultiSigAdmin.remove_owner(env, owner3, owner1);
      
      const threshold = MultiSigAdmin.get_threshold(env);
      expect(threshold).toEqual(2);
    });

    it('should handle single owner with threshold 1', () => {
      const owners = Vec.fromArray(env, [owner1]);
      MultiSigAdmin.initialize(env, owners, 1);
      
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      MultiSigAdmin.execute_transaction(env, txHash, owner1); // Should work with single confirmation
      
      const transaction = MultiSigAdmin.get_transaction(env, txHash);
      expect(transaction.executed).toEqual(true);
    });

    it('should handle maximum threshold scenario', () => {
      const owners = Vec.fromArray(env, [owner1, owner2, owner3]);
      MultiSigAdmin.initialize(env, owners, 3); // All owners must confirm
      
      const value = 1000n;
      const data = new BytesN(env, Array(32).fill(1));
      
      const txHash = MultiSigAdmin.submit_transaction(env, destination, value, data, owner1);
      MultiSigAdmin.confirm_transaction(env, txHash, owner2);
      MultiSigAdmin.confirm_transaction(env, txHash, owner3);
      
      MultiSigAdmin.execute_transaction(env, txHash, owner1);
      
      const transaction = MultiSigAdmin.get_transaction(env, txHash);
      expect(transaction.executed).toEqual(true);
    });
  });
});
