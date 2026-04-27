import { ThresholdCryptography } from '../ThresholdCryptography';
import { randomBytes } from 'crypto';

describe('ThresholdCryptography', () => {
  let thresholdCrypto: ThresholdCryptography;

  beforeEach(() => {
    thresholdCrypto = new ThresholdCryptography();
  });

  describe('createShares', () => {
    it('should create shares successfully', async () => {
      const secret = randomBytes(32);
      const threshold = 3;
      const totalShares = 5;
      const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

      const shares = await thresholdCrypto.createShares(
        secret,
        threshold,
        totalShares,
        shareHolders
      );

      expect(shares).toHaveLength(5);
      expect(shares[0]).toHaveProperty('shareId');
      expect(shares[0]).toHaveProperty('holder');
      expect(shares[0]).toHaveProperty('share');
      expect(shares[0].holder).toBe('holder1');
    });

    it('should reject threshold > totalShares', async () => {
      const secret = randomBytes(32);

      await expect(
        thresholdCrypto.createShares(
          secret,
          6,
          5,
          ['h1', 'h2', 'h3', 'h4', 'h5']
        )
      ).rejects.toThrow();
    });

    it('should reject threshold < 2', async () => {
      const secret = randomBytes(32);

      await expect(
        thresholdCrypto.createShares(
          secret,
          1,
          5,
          ['h1', 'h2', 'h3', 'h4', 'h5']
        )
      ).rejects.toThrow();
    });

    it('should reject mismatched shareHolders length', async () => {
      const secret = randomBytes(32);

      await expect(
        thresholdCrypto.createShares(
          secret,
          3,
          5,
          ['h1', 'h2', 'h3'] // Only 3 holders for 5 shares
        )
      ).rejects.toThrow();
    });

    it('should reject empty secret', async () => {
      await expect(
        thresholdCrypto.createShares(
          Buffer.from([]),
          3,
          5,
          ['h1', 'h2', 'h3', 'h4', 'h5']
        )
      ).rejects.toThrow();
    });
  });

  describe('reconstructSecret', () => {
    it('should reconstruct secret from threshold shares', async () => {
      const secret = randomBytes(32);
      const threshold = 3;
      const totalShares = 5;
      const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

      // Create shares
      const shares = await thresholdCrypto.createShares(
        secret,
        threshold,
        totalShares,
        shareHolders
      );

      // Reconstruct from first 3 shares
      const reconstructed = await thresholdCrypto.reconstructSecret(
        shares.slice(0, 3),
        threshold
      );

      expect(reconstructed).toEqual(secret);
    });

    it('should reconstruct from any threshold combination', async () => {
      const secret = randomBytes(32);
      const threshold = 3;
      const totalShares = 5;
      const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

      const shares = await thresholdCrypto.createShares(
        secret,
        threshold,
        totalShares,
        shareHolders
      );

      // Try different combinations
      const combo1 = await thresholdCrypto.reconstructSecret(
        [shares[0], shares[2], shares[4]],
        threshold
      );
      expect(combo1).toEqual(secret);

      const combo2 = await thresholdCrypto.reconstructSecret(
        [shares[1], shares[3], shares[4]],
        threshold
      );
      expect(combo2).toEqual(secret);
    });

    it('should reject insufficient shares', async () => {
      const secret = randomBytes(32);
      const threshold = 3;
      const totalShares = 5;
      const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

      const shares = await thresholdCrypto.createShares(
        secret,
        threshold,
        totalShares,
        shareHolders
      );

      await expect(
        thresholdCrypto.reconstructSecret(
          shares.slice(0, 2), // Only 2 shares
          threshold
        )
      ).rejects.toThrow('Insufficient shares');
    });
  });

  describe('verifyShare', () => {
    it('should verify valid share', async () => {
      const secret = randomBytes(32);
      const shares = await thresholdCrypto.createShares(
        secret,
        3,
        5,
        ['h1', 'h2', 'h3', 'h4', 'h5']
      );

      const isValid = await thresholdCrypto.verifyShare(shares[0]);
      expect(isValid).toBe(true);
    });

    it('should reject invalid share format', async () => {
      const invalidShare = {
        shareId: 'test',
        holder: 'holder1',
        share: 'invalid-base64'
      };

      const isValid = await thresholdCrypto.verifyShare(invalidShare);
      expect(isValid).toBe(false);
    });
  });

  describe('refreshShares', () => {
    it('should refresh shares without changing secret', async () => {
      const secret = randomBytes(32);
      const threshold = 3;
      const totalShares = 5;
      const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

      // Create original shares
      const originalShares = await thresholdCrypto.createShares(
        secret,
        threshold,
        totalShares,
        shareHolders
      );

      // Refresh shares
      const refreshedShares = await thresholdCrypto.refreshShares(
        originalShares,
        threshold
      );

      // Verify refreshed shares reconstruct to same secret
      const reconstructed = await thresholdCrypto.reconstructSecret(
        refreshedShares.slice(0, threshold),
        threshold
      );

      expect(reconstructed).toEqual(secret);
      
      // Verify shares are different
      expect(refreshedShares[0].share).not.toBe(originalShares[0].share);
    });
  });
});
