import { logger } from '../utils/logger';
import { Certification } from '../types/certification';

export interface BadgeOptions {
  format: 'svg' | 'png' | 'json';
  size: 'small' | 'medium' | 'large';
}

class BadgeService {
  private readonly sizeDimensions = {
    small: { width: 120, height: 40 },
    medium: { width: 180, height: 60 },
    large: { width: 240, height: 80 },
  };

  async generateBadge(certification: Certification, options: BadgeOptions): Promise<string | object> {
    try {
      switch (options.format) {
        case 'svg':
          return this.generateSVGBadge(certification, options.size);
        case 'png':
          return this.generatePNGBadge(certification, options.size);
        case 'json':
          return this.generateJSONBadge(certification, options.size);
        default:
          throw new Error(`Unsupported format: ${options.format}`);
      }
    } catch (error) {
      logger.error('Error generating badge:', error);
      throw error;
    }
  }

  private generateSVGBadge(certification: Certification, size: 'small' | 'medium' | 'large'): string {
    const dimensions = this.sizeDimensions[size];
    const colors = this.getCertificationColors(certification.certificationType);
    const fontSize = size === 'small' ? 10 : size === 'medium' ? 12 : 14;

    return `
<svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${dimensions.width}" height="${dimensions.height}" rx="4" fill="url(#grad)"/>
  <text x="10" y="${dimensions.height / 2 + fontSize / 3}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white" font-weight="bold">
    ${certification.certificationType}
  </text>
  <text x="${dimensions.width - 10}" y="${dimensions.height / 2 + fontSize / 3}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white" text-anchor="end">
    ✓ Valid
  </text>
</svg>`.trim();
  }

  private generatePNGBadge(certification: Certification, size: 'small' | 'medium' | 'large'): string {
    // For demo purposes, return a base64 encoded PNG placeholder
    // In production, this would use a proper image generation library
    const dimensions = this.sizeDimensions[size];
    return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
  }

  private generateJSONBadge(certification: Certification, size: 'small' | 'medium' | 'large'): object {
    const dimensions = this.sizeDimensions[size];
    const colors = this.getCertificationColors(certification.certificationType);

    return {
      id: certification.id,
      type: certification.certificationType,
      organization: certification.organizationName,
      status: certification.status,
      issued: certification.issuedDate,
      expires: certification.expiryDate,
      verificationCode: certification.verificationCode,
      badge: {
        format: 'json',
        size,
        dimensions,
        colors,
        text: {
          primary: certification.certificationType,
          secondary: certification.status === 'validated' ? '✓ Valid' : certification.status,
        },
      },
    };
  }

  private getCertificationColors(certificationType: string): { primary: string; secondary: string } {
    const colorMap: Record<string, { primary: string; secondary: string }> = {
      'GDPR': { primary: '#003399', secondary: '#0066cc' },
      'CCPA': { primary: '#ff6b35', secondary: '#ff8c42' },
      'HIPAA': { primary: '#2c5aa0', secondary: '#4a7bc8' },
      'ISO27001': { primary: '#00a652', secondary: '#00c853' },
      'SOC2': { primary: '#6a1b9a', secondary: '#9c27b0' },
      'CUSTOM': { primary: '#546e7a', secondary: '#78909c' },
    };

    return colorMap[certificationType] || colorMap['CUSTOM'];
  }

  async getBadgeEmbedCode(certificationId: string, options: BadgeOptions): Promise<string> {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
      const badgeUrl = `${baseUrl}/api/v1/certification/${certificationId}/badge?format=${options.format}&size=${options.size}`;

      if (options.format === 'svg') {
        return `<img src="${badgeUrl}" alt="Privacy Certification Badge" />`;
      } else if (options.format === 'png') {
        return `<img src="${badgeUrl}" alt="Privacy Certification Badge" />`;
      } else {
        return `<script src="${badgeUrl}"></script>`;
      }
    } catch (error) {
      logger.error('Error generating embed code:', error);
      throw error;
    }
  }

  async validateBadgeRequest(certificationId: string, options: BadgeOptions): Promise<boolean> {
    try {
      // In production, this would validate the certification exists and is valid
      // For demo purposes, we'll return true
      return true;
    } catch (error) {
      logger.error('Error validating badge request:', error);
      return false;
    }
  }
}

export const badgeService = new BadgeService();
