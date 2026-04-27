import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';

/**
 * Legal Requirements Database Service
 * Manages legal requirements from various privacy regulations
 */

export interface LegalRequirement {
  id: string;
  requirementId: string;
  regulationId: string;
  title: string;
  description: string;
  requirementText: string;
  category: string;
  mandatory: boolean;
  applicableJurisdictions: string[];
  effectiveDate: Date;
  lastUpdated: Date;
  sourceUrl?: string;
  relatedRequirements?: string[];
  tags?: string[];
}

export interface RequirementMapping {
  requirementId: string;
  complianceRuleId: string;
  mappingType: 'direct' | 'partial' | 'related';
  notes?: string;
}

export class LegalRequirementsService {
  private requirements: Map<string, LegalRequirement> = new Map();
  private requirementMappings: RequirementMapping[] = [];

  constructor() {
    this.initializeLegalRequirements();
  }

  /**
   * Initialize legal requirements database
   */
  private initializeLegalRequirements(): void {
    // GDPR Requirements
    const gdprRequirements: LegalRequirement[] = [
      {
        id: 'req_gdpr_001',
        requirementId: 'gdpr_art_5_1_c',
        regulationId: 'gdpr',
        title: 'Data Minimization Principle',
        description: 'Personal data shall be adequate, relevant and limited to what is necessary',
        requirementText: 'Personal data shall be adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed (data minimisation)',
        category: 'Data Processing Principles',
        mandatory: true,
        applicableJurisdictions: ['EU', 'EEA'],
        effectiveDate: new Date('2018-05-25'),
        lastUpdated: new Date('2018-05-25'),
        sourceUrl: 'https://gdpr-info.eu/art-5-gdpr/',
        tags: ['data minimization', 'processing principles']
      },
      {
        id: 'req_gdpr_002',
        requirementId: 'gdpr_art_6',
        regulationId: 'gdpr',
        title: 'Lawfulness of Processing',
        description: 'Processing shall be lawful only if and to the extent that at least one legal basis applies',
        requirementText: 'Processing shall be lawful only if and to the extent that at least one of the following applies: consent, contract, legal obligation, vital interests, public task, or legitimate interests',
        category: 'Lawful Basis',
        mandatory: true,
        applicableJurisdictions: ['EU', 'EEA'],
        effectiveDate: new Date('2018-05-25'),
        lastUpdated: new Date('2018-05-25'),
        sourceUrl: 'https://gdpr-info.eu/art-6-gdpr/',
        tags: ['consent', 'lawful basis', 'processing']
      },
      {
        id: 'req_gdpr_003',
        requirementId: 'gdpr_art_17',
        regulationId: 'gdpr',
        title: 'Right to Erasure (Right to be Forgotten)',
        description: 'Data subject has the right to obtain erasure of personal data',
        requirementText: 'The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay',
        category: 'Data Subject Rights',
        mandatory: true,
        applicableJurisdictions: ['EU', 'EEA'],
        effectiveDate: new Date('2018-05-25'),
        lastUpdated: new Date('2018-05-25'),
        sourceUrl: 'https://gdpr-info.eu/art-17-gdpr/',
        tags: ['right to erasure', 'data subject rights', 'deletion']
      },
      {
        id: 'req_gdpr_004',
        requirementId: 'gdpr_art_33',
        regulationId: 'gdpr',
        title: 'Notification of Personal Data Breach',
        description: 'Controller must notify supervisory authority of breach within 72 hours',
        requirementText: 'In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach to the supervisory authority',
        category: 'Security and Breach Notification',
        mandatory: true,
        applicableJurisdictions: ['EU', 'EEA'],
        effectiveDate: new Date('2018-05-25'),
        lastUpdated: new Date('2018-05-25'),
        sourceUrl: 'https://gdpr-info.eu/art-33-gdpr/',
        tags: ['breach notification', 'security', '72 hours']
      },
      {
        id: 'req_gdpr_005',
        requirementId: 'gdpr_art_35',
        regulationId: 'gdpr',
        title: 'Data Protection Impact Assessment',
        description: 'DPIA required when processing is likely to result in high risk',
        requirementText: 'Where a type of processing in particular using new technologies, and taking into account the nature, scope, context and purposes of the processing, is likely to result in a high risk to the rights and freedoms of natural persons, the controller shall, prior to the processing, carry out an assessment of the impact of the envisaged processing operations on the protection of personal data',
        category: 'Risk Assessment',
        mandatory: true,
        applicableJurisdictions: ['EU', 'EEA'],
        effectiveDate: new Date('2018-05-25'),
        lastUpdated: new Date('2018-05-25'),
        sourceUrl: 'https://gdpr-info.eu/art-35-gdpr/',
        tags: ['DPIA', 'risk assessment', 'high risk processing']
      }
    ];

    // CCPA Requirements
    const ccpaRequirements: LegalRequirement[] = [
      {
        id: 'req_ccpa_001',
        requirementId: 'ccpa_1798_100',
        regulationId: 'ccpa',
        title: 'Right to Know About Personal Information Collected',
        description: 'Consumer has right to request disclosure of personal information collected',
        requirementText: 'A consumer shall have the right to request that a business that collects a consumer's personal information disclose to that consumer the categories and specific pieces of personal information the business has collected',
        category: 'Consumer Rights',
        mandatory: true,
        applicableJurisdictions: ['California'],
        effectiveDate: new Date('2020-01-01'),
        lastUpdated: new Date('2020-01-01'),
        sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.100',
        tags: ['right to know', 'disclosure', 'transparency']
      },
      {
        id: 'req_ccpa_002',
        requirementId: 'ccpa_1798_105',
        regulationId: 'ccpa',
        title: 'Right to Delete Personal Information',
        description: 'Consumer has right to request deletion of personal information',
        requirementText: 'A consumer shall have the right to request that a business delete any personal information about the consumer which the business has collected from the consumer',
        category: 'Consumer Rights',
        mandatory: true,
        applicableJurisdictions: ['California'],
        effectiveDate: new Date('2020-01-01'),
        lastUpdated: new Date('2020-01-01'),
        sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.105',
        tags: ['right to delete', 'deletion', 'consumer rights']
      },
      {
        id: 'req_ccpa_003',
        requirementId: 'ccpa_1798_120',
        regulationId: 'ccpa',
        title: 'Right to Opt-Out of Sale of Personal Information',
        description: 'Consumer has right to opt-out of sale of personal information',
        requirementText: 'A consumer shall have the right, at any time, to direct a business that sells personal information about the consumer to third parties not to sell the consumer's personal information',
        category: 'Consumer Rights',
        mandatory: true,
        applicableJurisdictions: ['California'],
        effectiveDate: new Date('2020-01-01'),
        lastUpdated: new Date('2020-01-01'),
        sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.120',
        tags: ['opt-out', 'sale', 'do not sell']
      },
      {
        id: 'req_ccpa_004',
        requirementId: 'ccpa_1798_125',
        regulationId: 'ccpa',
        title: 'Non-Discrimination',
        description: 'Business cannot discriminate against consumers for exercising rights',
        requirementText: 'A business shall not discriminate against a consumer because the consumer exercised any of the consumer's rights under this title',
        category: 'Consumer Protection',
        mandatory: true,
        applicableJurisdictions: ['California'],
        effectiveDate: new Date('2020-01-01'),
        lastUpdated: new Date('2020-01-01'),
        sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.125',
        tags: ['non-discrimination', 'equal treatment', 'consumer protection']
      }
    ];

    // HIPAA Requirements
    const hipaaRequirements: LegalRequirement[] = [
      {
        id: 'req_hipaa_001',
        requirementId: 'hipaa_164_308',
        regulationId: 'hipaa',
        title: 'Administrative Safeguards',
        description: 'Implement administrative safeguards to protect ePHI',
        requirementText: 'A covered entity must implement administrative safeguards including security management process, assigned security responsibility, workforce security, information access management, security awareness and training, security incident procedures, contingency plan, evaluation, and business associate contracts',
        category: 'Administrative Safeguards',
        mandatory: true,
        applicableJurisdictions: ['United States'],
        effectiveDate: new Date('2003-04-14'),
        lastUpdated: new Date('2013-09-23'),
        sourceUrl: 'https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html',
        tags: ['administrative safeguards', 'ePHI', 'security']
      },
      {
        id: 'req_hipaa_002',
        requirementId: 'hipaa_164_310',
        regulationId: 'hipaa',
        title: 'Physical Safeguards',
        description: 'Implement physical safeguards to protect ePHI',
        requirementText: 'A covered entity must implement physical safeguards including facility access controls, workstation use, workstation security, and device and media controls',
        category: 'Physical Safeguards',
        mandatory: true,
        applicableJurisdictions: ['United States'],
        effectiveDate: new Date('2003-04-14'),
        lastUpdated: new Date('2013-09-23'),
        sourceUrl: 'https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html',
        tags: ['physical safeguards', 'facility access', 'device security']
      },
      {
        id: 'req_hipaa_003',
        requirementId: 'hipaa_164_312',
        regulationId: 'hipaa',
        title: 'Technical Safeguards',
        description: 'Implement technical safeguards to protect ePHI',
        requirementText: 'A covered entity must implement technical safeguards including access control, audit controls, integrity, person or entity authentication, and transmission security',
        category: 'Technical Safeguards',
        mandatory: true,
        applicableJurisdictions: ['United States'],
        effectiveDate: new Date('2003-04-14'),
        lastUpdated: new Date('2013-09-23'),
        sourceUrl: 'https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html',
        tags: ['technical safeguards', 'encryption', 'access control', 'audit']
      },
      {
        id: 'req_hipaa_004',
        requirementId: 'hipaa_164_410',
        regulationId: 'hipaa',
        title: 'Breach Notification to Individuals',
        description: 'Notify affected individuals of breach within 60 days',
        requirementText: 'Following the discovery of a breach of unsecured protected health information, a covered entity shall notify each individual whose unsecured protected health information has been, or is reasonably believed by the covered entity to have been, accessed, acquired, used, or disclosed as a result of such breach',
        category: 'Breach Notification',
        mandatory: true,
        applicableJurisdictions: ['United States'],
        effectiveDate: new Date('2009-09-23'),
        lastUpdated: new Date('2013-09-23'),
        sourceUrl: 'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html',
        tags: ['breach notification', 'PHI', '60 days']
      },
      {
        id: 'req_hipaa_005',
        requirementId: 'hipaa_164_502',
        regulationId: 'hipaa',
        title: 'Business Associate Agreements',
        description: 'Execute BAA with business associates who handle PHI',
        requirementText: 'A covered entity may disclose protected health information to a business associate and may allow a business associate to create or receive protected health information on its behalf, if the covered entity obtains satisfactory assurance that the business associate will appropriately safeguard the information',
        category: 'Business Associate Requirements',
        mandatory: true,
        applicableJurisdictions: ['United States'],
        effectiveDate: new Date('2003-04-14'),
        lastUpdated: new Date('2013-09-23'),
        sourceUrl: 'https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html',
        tags: ['BAA', 'business associate', 'contracts']
      }
    ];

    // Store all requirements
    [...gdprRequirements, ...ccpaRequirements, ...hipaaRequirements].forEach(req => {
      this.requirements.set(req.requirementId, req);
    });

    // Initialize requirement mappings
    this.initializeRequirementMappings();

    logger.info('Legal requirements database initialized', {
      totalRequirements: this.requirements.size,
      gdpr: gdprRequirements.length,
      ccpa: ccpaRequirements.length,
      hipaa: hipaaRequirements.length
    });
  }

  /**
   * Initialize mappings between legal requirements and compliance rules
   */
  private initializeRequirementMappings(): void {
    this.requirementMappings = [
      { requirementId: 'gdpr_art_5_1_c', complianceRuleId: 'gdpr-001', mappingType: 'direct' },
      { requirementId: 'gdpr_art_6', complianceRuleId: 'gdpr-002', mappingType: 'direct' },
      { requirementId: 'gdpr_art_17', complianceRuleId: 'gdpr-003', mappingType: 'direct' },
      { requirementId: 'gdpr_art_33', complianceRuleId: 'gdpr-004', mappingType: 'direct' },
      { requirementId: 'gdpr_art_35', complianceRuleId: 'gdpr-005', mappingType: 'direct' },
      { requirementId: 'ccpa_1798_100', complianceRuleId: 'ccpa-001', mappingType: 'direct' },
      { requirementId: 'ccpa_1798_105', complianceRuleId: 'ccpa-002', mappingType: 'direct' },
      { requirementId: 'ccpa_1798_120', complianceRuleId: 'ccpa-003', mappingType: 'direct' },
      { requirementId: 'ccpa_1798_125', complianceRuleId: 'ccpa-004', mappingType: 'direct' },
      { requirementId: 'hipaa_164_308', complianceRuleId: 'hipaa-001', mappingType: 'direct' },
      { requirementId: 'hipaa_164_310', complianceRuleId: 'hipaa-002', mappingType: 'direct' },
      { requirementId: 'hipaa_164_312', complianceRuleId: 'hipaa-003', mappingType: 'direct' },
      { requirementId: 'hipaa_164_410', complianceRuleId: 'hipaa-004', mappingType: 'direct' },
      { requirementId: 'hipaa_164_502', complianceRuleId: 'hipaa-005', mappingType: 'direct' }
    ];
  }

  /**
   * Get all legal requirements
   */
  getAllRequirements(): LegalRequirement[] {
    return Array.from(this.requirements.values());
  }

  /**
   * Get requirements by regulation
   */
  getRequirementsByRegulation(regulationId: string): LegalRequirement[] {
    return Array.from(this.requirements.values())
      .filter(req => req.regulationId === regulationId);
  }

  /**
   * Get requirement by ID
   */
  getRequirement(requirementId: string): LegalRequirement | undefined {
    return this.requirements.get(requirementId);
  }

  /**
   * Search requirements
   */
  searchRequirements(query: string): LegalRequirement[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.requirements.values()).filter(req =>
      req.title.toLowerCase().includes(lowerQuery) ||
      req.description.toLowerCase().includes(lowerQuery) ||
      req.requirementText.toLowerCase().includes(lowerQuery) ||
      req.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get requirements by category
   */
  getRequirementsByCategory(category: string): LegalRequirement[] {
    return Array.from(this.requirements.values())
      .filter(req => req.category === category);
  }

  /**
   * Get requirements by jurisdiction
   */
  getRequirementsByJurisdiction(jurisdiction: string): LegalRequirement[] {
    return Array.from(this.requirements.values())
      .filter(req => req.applicableJurisdictions.includes(jurisdiction));
  }

  /**
   * Get mandatory requirements
   */
  getMandatoryRequirements(regulationId?: string): LegalRequirement[] {
    let requirements = Array.from(this.requirements.values()).filter(req => req.mandatory);
    
    if (regulationId) {
      requirements = requirements.filter(req => req.regulationId === regulationId);
    }

    return requirements;
  }

  /**
   * Get compliance rule for requirement
   */
  getComplianceRuleForRequirement(requirementId: string): string | undefined {
    const mapping = this.requirementMappings.find(m => m.requirementId === requirementId);
    return mapping?.complianceRuleId;
  }

  /**
   * Get requirements for compliance rule
   */
  getRequirementsForComplianceRule(complianceRuleId: string): LegalRequirement[] {
    const mappings = this.requirementMappings.filter(m => m.complianceRuleId === complianceRuleId);
    return mappings
      .map(m => this.requirements.get(m.requirementId))
      .filter((req): req is LegalRequirement => req !== undefined);
  }

  /**
   * Get requirement statistics
   */
  getRequirementStatistics(): {
    total: number;
    byRegulation: Record<string, number>;
    byCategory: Record<string, number>;
    byJurisdiction: Record<string, number>;
    mandatory: number;
    optional: number;
  } {
    const requirements = Array.from(this.requirements.values());

    const byRegulation: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byJurisdiction: Record<string, number> = {};
    let mandatory = 0;
    let optional = 0;

    requirements.forEach(req => {
      byRegulation[req.regulationId] = (byRegulation[req.regulationId] || 0) + 1;
      byCategory[req.category] = (byCategory[req.category] || 0) + 1;
      
      req.applicableJurisdictions.forEach(jurisdiction => {
        byJurisdiction[jurisdiction] = (byJurisdiction[jurisdiction] || 0) + 1;
      });

      if (req.mandatory) {
        mandatory++;
      } else {
        optional++;
      }
    });

    return {
      total: requirements.length,
      byRegulation,
      byCategory,
      byJurisdiction,
      mandatory,
      optional
    };
  }

  /**
   * Check if requirement is applicable
   */
  isRequirementApplicable(
    requirementId: string,
    jurisdiction: string,
    effectiveDate?: Date
  ): boolean {
    const requirement = this.requirements.get(requirementId);
    if (!requirement) return false;

    const jurisdictionMatch = requirement.applicableJurisdictions.includes(jurisdiction);
    
    if (effectiveDate) {
      const dateMatch = requirement.effectiveDate <= effectiveDate;
      return jurisdictionMatch && dateMatch;
    }

    return jurisdictionMatch;
  }

  /**
   * Get recent requirement updates
   */
  getRecentUpdates(days: number = 30): LegalRequirement[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return Array.from(this.requirements.values())
      .filter(req => req.lastUpdated >= cutoffDate)
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }
}

export const legalRequirementsService = new LegalRequirementsService();
