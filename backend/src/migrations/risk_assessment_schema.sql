-- Privacy Risk Assessment Database Schema
-- This file contains the database schema for the privacy risk assessment system

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    organization_id UUID,
    data_types JSONB NOT NULL,
    processing_steps JSONB NOT NULL,
    retention_period INTEGER NOT NULL,
    data_subjects JSONB NOT NULL,
    purposes JSONB NOT NULL,
    legal_basis VARCHAR(255),
    cross_border_transfer BOOLEAN DEFAULT FALSE,
    encryption_level VARCHAR(20) NOT NULL CHECK (encryption_level IN ('none', 'basic', 'standard', 'advanced')),
    anonymization_techniques JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- Risk Assessments table
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    overall_score DECIMAL(5,4) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),
    category VARCHAR(10) NOT NULL CHECK (category IN ('low', 'medium', 'high', 'critical')),
    risk_factors JSONB NOT NULL,
    mitigation_strategies JSONB NOT NULL,
    assessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assessor_id UUID NOT NULL,
    compliance_frameworks JSONB NOT NULL,
    recommendations JSONB NOT NULL,
    historical_trend JSONB DEFAULT '[]',
    version INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'approved', 'rejected')),
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE
);

-- Assessment Criteria table
CREATE TABLE IF NOT EXISTS assessment_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    criteria_data JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- Risk Mitigation Tracking table
CREATE TABLE IF NOT EXISTS risk_mitigations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
    mitigation_id VARCHAR(255) NOT NULL,
    strategy VARCHAR(255) NOT NULL,
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    effort VARCHAR(10) NOT NULL CHECK (effort IN ('low', 'medium', 'high')),
    impact INTEGER NOT NULL CHECK (impact >= 0 AND impact <= 100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- Compliance Frameworks table
CREATE TABLE IF NOT EXISTS compliance_frameworks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    requirements JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow Compliance Mapping table
CREATE TABLE IF NOT EXISTS workflow_compliance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    framework_id UUID NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
    compliance_score DECIMAL(5,4) NOT NULL CHECK (compliance_score >= 0 AND compliance_score <= 1),
    gaps JSONB DEFAULT '[]',
    last_assessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_id, framework_id)
);

-- Risk Trends table
CREATE TABLE IF NOT EXISTS risk_trends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    assessment_date DATE NOT NULL,
    overall_score DECIMAL(5,4) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('low', 'medium', 'high', 'critical')),
    changes JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Custom Risk Factors table
CREATE TABLE IF NOT EXISTS custom_risk_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    weight DECIMAL(5,4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    evaluation_function TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    organization_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- Risk Assessment Notifications table
CREATE TABLE IF NOT EXISTS risk_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID REFERENCES risk_assessments(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    is_read BOOLEAN DEFAULT FALSE,
    recipient_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE
);

-- Audit Log for Risk Assessments
CREATE TABLE IF NOT EXISTS risk_assessment_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID REFERENCES risk_assessments(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    performed_by UUID NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workflows_organization_id ON workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_workflow_id ON risk_assessments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_assessor_id ON risk_assessments(assessor_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_category ON risk_assessments(category);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_assessed_at ON risk_assessments(assessed_at);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_overall_score ON risk_assessments(overall_score);

CREATE INDEX IF NOT EXISTS idx_risk_mitigations_assessment_id ON risk_mitigations(assessment_id);
CREATE INDEX IF NOT EXISTS idx_risk_mitigations_status ON risk_mitigations(status);
CREATE INDEX IF NOT EXISTS idx_risk_mitigations_priority ON risk_mitigations(priority);
CREATE INDEX IF NOT EXISTS idx_risk_mitigations_assigned_to ON risk_mitigations(assigned_to);

CREATE INDEX IF NOT EXISTS idx_workflow_compliance_workflow_id ON workflow_compliance(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_compliance_framework_id ON workflow_compliance(framework_id);
CREATE INDEX IF NOT EXISTS idx_workflow_compliance_score ON workflow_compliance(compliance_score);

CREATE INDEX IF NOT EXISTS idx_risk_trends_workflow_id ON risk_trends(workflow_id);
CREATE INDEX IF NOT EXISTS idx_risk_trends_assessment_date ON risk_trends(assessment_date);
CREATE INDEX IF NOT EXISTS idx_risk_trends_category ON risk_trends(category);

CREATE INDEX IF NOT EXISTS idx_custom_risk_factors_organization_id ON custom_risk_factors(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_risk_factors_category ON custom_risk_factors(category);
CREATE INDEX IF NOT EXISTS idx_custom_risk_factors_is_active ON custom_risk_factors(is_active);

CREATE INDEX IF NOT EXISTS idx_risk_notifications_recipient_id ON risk_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_risk_notifications_is_read ON risk_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_risk_notifications_created_at ON risk_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_audit_assessment_id ON risk_assessment_audit(assessment_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessment_audit_performed_by ON risk_assessment_audit(performed_by);
CREATE INDEX IF NOT EXISTS idx_risk_assessment_audit_performed_at ON risk_assessment_audit(performed_at);

-- Create trigger for updating updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessment_criteria_updated_at BEFORE UPDATE ON assessment_criteria
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_risk_mitigations_updated_at BEFORE UPDATE ON risk_mitigations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compliance_frameworks_updated_at BEFORE UPDATE ON compliance_frameworks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_risk_factors_updated_at BEFORE UPDATE ON custom_risk_factors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default compliance frameworks
INSERT INTO compliance_frameworks (name, version, description, requirements) VALUES
('GDPR', '2018', 'General Data Protection Regulation', '[
    {
        "article": "Article 6",
        "title": "Lawfulness of processing",
        "description": "Processing shall be lawful only if based on valid legal basis",
        "mandatory": true
    },
    {
        "article": "Article 7",
        "title": "Conditions for consent",
        "description": "Consent must be freely given, specific, informed and unambiguous",
        "mandatory": true
    },
    {
        "article": "Article 25",
        "title": "Data protection by design and by default",
        "description": "Implement appropriate technical and organizational measures",
        "mandatory": true
    }
]'),
('CCPA', '2020', 'California Consumer Privacy Act', '[
    {
        "article": "Section 1798.120",
        "title": "Right to Opt-Out",
        "description": "Consumers have the right to opt-out of the sale of their personal information",
        "mandatory": true
    },
    {
        "article": "Section 1798.100",
        "title": "Right to Know",
        "description": "Consumers have the right to request what personal information is being collected",
        "mandatory": true
    }
]'),
('HIPAA', '1996', 'Health Insurance Portability and Accountability Act', '[
    {
        "article": "164.502",
        "title": "Uses and disclosures of protected health information",
        "description": "Standards for uses and disclosures of PHI",
        "mandatory": true
    }
]') ON CONFLICT DO NOTHING;

-- Insert default assessment criteria
INSERT INTO assessment_criteria (criteria_data, version) VALUES
('{
    "dataSensitivityWeights": {
        "personal_identifiable_info": 0.9,
        "special_category_data": 1.0,
        "financial_data": 0.8,
        "health_data": 0.95,
        "biometric_data": 1.0,
        "location_data": 0.7,
        "communication_data": 0.6,
        "behavioral_data": 0.5,
        "technical_data": 0.3,
        "anonymous_data": 0.1
    },
    "processingWeights": {
        "collection": 0.6,
        "storage": 0.4,
        "processing": 0.8,
        "sharing": 0.9,
        "cross_border_transfer": 1.0,
        "automated_decision_making": 0.85,
        "profiling": 0.8
    },
    "securityWeights": {
        "encryption": -0.3,
        "pseudonymization": -0.2,
        "access_controls": -0.25,
        "audit_logging": -0.15,
        "data_minimization": -0.2,
        "privacy_by_design": -0.3
    },
    "complianceWeights": {
        "gdpr": 0.8,
        "ccpa": 0.7,
        "hipaa": 0.9,
        "pci_dss": 0.6,
        "sox": 0.5
    },
    "customFactors": []
}', 1) ON CONFLICT DO NOTHING;

-- Create views for common queries
CREATE OR REPLACE VIEW risk_summary AS
SELECT 
    w.id as workflow_id,
    w.name as workflow_name,
    ra.id as latest_assessment_id,
    ra.overall_score,
    ra.category,
    ra.assessed_at,
    ra.assessor_id,
    COUNT(rm.id) as pending_mitigations,
    COUNT(CASE WHEN rm.priority IN ('high', 'urgent') THEN 1 END) as high_priority_mitigations
FROM workflows w
LEFT JOIN LATERAL (
    SELECT * FROM risk_assessments 
    WHERE workflow_id = w.id 
    ORDER BY assessed_at DESC 
    LIMIT 1
) ra ON true
LEFT JOIN risk_mitigations rm ON ra.id = rm.assessment_id AND rm.status != 'completed'
GROUP BY w.id, w.name, ra.id, ra.overall_score, ra.category, ra.assessed_at, ra.assessor_id;

CREATE OR REPLACE VIEW compliance_overview AS
SELECT 
    w.id as workflow_id,
    w.name as workflow_name,
    cf.name as framework_name,
    cf.version as framework_version,
    wc.compliance_score,
    wc.gaps,
    wc.last_assessed_at
FROM workflows w
JOIN workflow_compliance wc ON w.id = wc.workflow_id
JOIN compliance_frameworks cf ON wc.framework_id = cf.id
WHERE cf.is_active = true;

-- Create function to calculate risk trends
CREATE OR REPLACE FUNCTION calculate_risk_trend(p_workflow_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    assessment_date DATE,
    overall_score DECIMAL(5,4),
    category VARCHAR(10),
    score_change DECIMAL(5,4)
) AS $$
BEGIN
    RETURN QUERY
    WITH ranked_assessments AS (
        SELECT 
            DATE(ra.assessed_at) as assessment_date,
            ra.overall_score,
            ra.category,
            LAG(ra.overall_score) OVER (ORDER BY ra.assessed_at) as previous_score
        FROM risk_assessments ra
        WHERE ra.workflow_id = p_workflow_id
            AND ra.assessed_at >= NOW() - INTERVAL '1 day' * p_days
        ORDER BY ra.assessed_at DESC
    )
    SELECT 
        assessment_date,
        overall_score,
        category,
        COALESCE(overall_score - previous_score, 0) as score_change
    FROM ranked_assessments
    ORDER BY assessment_date DESC;
END;
$$ LANGUAGE plpgsql;
