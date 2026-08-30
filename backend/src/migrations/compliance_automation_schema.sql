-- Compliance Automation Database Schema
-- This schema supports automated compliance checking for GDPR, CCPA, HIPAA

-- Compliance Scans Table
CREATE TABLE IF NOT EXISTS compliance_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id VARCHAR(255) UNIQUE NOT NULL,
    regulation VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('compliant', 'non-compliant', 'partial', 'error')),
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    violations JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    audit_trail JSONB DEFAULT '[]'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    alert_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Compliance Violations Table
CREATE TABLE IF NOT EXISTS compliance_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_id VARCHAR(255) UNIQUE NOT NULL,
    scan_id VARCHAR(255) NOT NULL,
    rule_id VARCHAR(100) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    description TEXT NOT NULL,
    affected_resources JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    FOREIGN KEY (scan_id) REFERENCES compliance_scans(scan_id) ON DELETE CASCADE
);

-- Compliance Rules Table (enhanced)
CREATE TABLE IF NOT EXISTS compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id VARCHAR(100) UNIQUE NOT NULL,
    regulation_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    check_function VARCHAR(255) NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    remediation TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Regulations Table (enhanced)
CREATE TABLE IF NOT EXISTS regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regulation_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    version VARCHAR(50),
    effective_date DATE,
    jurisdiction VARCHAR(100),
    category VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Compliance Alerts Table
CREATE TABLE IF NOT EXISTS compliance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id VARCHAR(255) UNIQUE NOT NULL,
    scan_id VARCHAR(255) NOT NULL,
    regulation_id VARCHAR(50) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    message TEXT NOT NULL,
    violations JSONB DEFAULT '[]'::jsonb,
    notified BOOLEAN DEFAULT FALSE,
    notification_channels JSONB DEFAULT '[]'::jsonb,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scan_id) REFERENCES compliance_scans(scan_id) ON DELETE CASCADE
);

-- Compliance Audit Trail Table
CREATE TABLE IF NOT EXISTS compliance_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id VARCHAR(255) UNIQUE NOT NULL,
    scan_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    resource VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scan_id) REFERENCES compliance_scans(scan_id) ON DELETE SET NULL
);

-- Compliance Policies Table
CREATE TABLE IF NOT EXISTS compliance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    regulation_id VARCHAR(50) NOT NULL,
    policy_document JSONB NOT NULL,
    version VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    effective_date DATE,
    review_date DATE,
    owner VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (regulation_id) REFERENCES regulations(regulation_id) ON DELETE CASCADE
);

-- Compliance Workflow Table
CREATE TABLE IF NOT EXISTS compliance_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) UNIQUE NOT NULL,
    violation_id VARCHAR(255) NOT NULL,
    workflow_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    assigned_to VARCHAR(255),
    priority VARCHAR(50) CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    due_date TIMESTAMP WITH TIME ZONE,
    steps JSONB DEFAULT '[]'::jsonb,
    current_step INTEGER DEFAULT 0,
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (violation_id) REFERENCES compliance_violations(violation_id) ON DELETE CASCADE
);

-- Legal Requirements Database Table
CREATE TABLE IF NOT EXISTS legal_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id VARCHAR(100) UNIQUE NOT NULL,
    regulation_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requirement_text TEXT NOT NULL,
    category VARCHAR(100),
    mandatory BOOLEAN DEFAULT TRUE,
    applicable_jurisdictions JSONB DEFAULT '[]'::jsonb,
    effective_date DATE,
    last_updated DATE,
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (regulation_id) REFERENCES regulations(regulation_id) ON DELETE CASCADE
);

-- Compliance Monitoring Configuration Table
CREATE TABLE IF NOT EXISTS compliance_monitoring_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regulation_id VARCHAR(50) UNIQUE NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    scan_schedule VARCHAR(100) DEFAULT '0 */6 * * *',
    alert_threshold INTEGER DEFAULT 80 CHECK (alert_threshold >= 0 AND alert_threshold <= 100),
    notification_channels JSONB DEFAULT '[]'::jsonb,
    auto_remediation BOOLEAN DEFAULT FALSE,
    retention_days INTEGER DEFAULT 90,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (regulation_id) REFERENCES regulations(regulation_id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX idx_compliance_scans_regulation ON compliance_scans(regulation);
CREATE INDEX idx_compliance_scans_timestamp ON compliance_scans(timestamp DESC);
CREATE INDEX idx_compliance_scans_status ON compliance_scans(status);
CREATE INDEX idx_compliance_scans_score ON compliance_scans(score);

CREATE INDEX idx_violations_scan_id ON compliance_violations(scan_id);
CREATE INDEX idx_violations_rule_id ON compliance_violations(rule_id);
CREATE INDEX idx_violations_severity ON compliance_violations(severity);
CREATE INDEX idx_violations_status ON compliance_violations(status);
CREATE INDEX idx_violations_detected_at ON compliance_violations(detected_at DESC);

CREATE INDEX idx_rules_regulation_id ON compliance_rules(regulation_id);
CREATE INDEX idx_rules_active ON compliance_rules(active);
CREATE INDEX idx_rules_severity ON compliance_rules(severity);

CREATE INDEX idx_alerts_scan_id ON compliance_alerts(scan_id);
CREATE INDEX idx_alerts_regulation_id ON compliance_alerts(regulation_id);
CREATE INDEX idx_alerts_severity ON compliance_alerts(severity);
CREATE INDEX idx_alerts_notified ON compliance_alerts(notified);
CREATE INDEX idx_alerts_created_at ON compliance_alerts(created_at DESC);

CREATE INDEX idx_audit_trail_scan_id ON compliance_audit_trail(scan_id);
CREATE INDEX idx_audit_trail_action ON compliance_audit_trail(action);
CREATE INDEX idx_audit_trail_timestamp ON compliance_audit_trail(timestamp DESC);

CREATE INDEX idx_workflows_violation_id ON compliance_workflows(violation_id);
CREATE INDEX idx_workflows_status ON compliance_workflows(status);
CREATE INDEX idx_workflows_assigned_to ON compliance_workflows(assigned_to);
CREATE INDEX idx_workflows_due_date ON compliance_workflows(due_date);

CREATE INDEX idx_legal_requirements_regulation_id ON legal_requirements(regulation_id);
CREATE INDEX idx_legal_requirements_mandatory ON legal_requirements(mandatory);

-- Insert default regulations
INSERT INTO regulations (regulation_id, name, description, version, effective_date, jurisdiction, category) VALUES
    ('gdpr', 'General Data Protection Regulation', 'EU regulation on data protection and privacy', '2016/679', '2018-05-25', 'European Union', 'Privacy'),
    ('ccpa', 'California Consumer Privacy Act', 'California state privacy law', '2018', '2020-01-01', 'California, USA', 'Privacy'),
    ('hipaa', 'Health Insurance Portability and Accountability Act', 'US healthcare data protection law', '1996', '2003-04-14', 'United States', 'Healthcare')
ON CONFLICT (regulation_id) DO NOTHING;

-- Insert default GDPR rules
INSERT INTO compliance_rules (rule_id, regulation_id, name, description, category, severity, check_function, parameters, remediation) VALUES
    ('gdpr-001', 'gdpr', 'Data Minimization', 'Only collect and process necessary personal data', 'data_collection', 'high', 'checkDataMinimization', '{"maxFields": 20, "requiredJustification": true}'::jsonb, 'Review data collection practices and remove unnecessary fields'),
    ('gdpr-002', 'gdpr', 'Consent Management', 'Valid consent must be obtained for data processing', 'consent', 'critical', 'checkConsentManagement', '{"requireExplicitConsent": true, "consentExpiry": 365}'::jsonb, 'Implement proper consent collection and management system'),
    ('gdpr-003', 'gdpr', 'Right to Erasure', 'Users must be able to request data deletion', 'data_rights', 'high', 'checkRightToErasure', '{"maxResponseTime": 30, "automatedProcess": true}'::jsonb, 'Implement automated data deletion workflow'),
    ('gdpr-004', 'gdpr', 'Data Breach Notification', 'Breaches must be reported within 72 hours', 'security', 'critical', 'checkBreachNotification', '{"maxNotificationHours": 72, "automatedAlerts": true}'::jsonb, 'Set up automated breach detection and notification system'),
    ('gdpr-005', 'gdpr', 'Data Protection Impact Assessment', 'DPIA required for high-risk processing', 'risk_assessment', 'high', 'checkDPIA', '{"requireDPIA": true, "reviewFrequency": 365}'::jsonb, 'Conduct and document Data Protection Impact Assessment')
ON CONFLICT (rule_id) DO NOTHING;

-- Insert default CCPA rules
INSERT INTO compliance_rules (rule_id, regulation_id, name, description, category, severity, check_function, parameters, remediation) VALUES
    ('ccpa-001', 'ccpa', 'Right to Know', 'Consumers have right to know what data is collected', 'transparency', 'high', 'checkRightToKnow', '{"requireDisclosure": true, "maxResponseDays": 45}'::jsonb, 'Implement data disclosure mechanism for consumer requests'),
    ('ccpa-002', 'ccpa', 'Right to Delete', 'Consumers can request deletion of personal information', 'data_rights', 'high', 'checkRightToDelete', '{"maxResponseDays": 45, "verificationRequired": true}'::jsonb, 'Create verified deletion request process'),
    ('ccpa-003', 'ccpa', 'Right to Opt-Out', 'Consumers can opt-out of data sale', 'consent', 'critical', 'checkOptOut', '{"requireOptOutLink": true, "honorOptOut": true}'::jsonb, 'Add "Do Not Sell My Personal Information" link and mechanism'),
    ('ccpa-004', 'ccpa', 'Non-Discrimination', 'Cannot discriminate against consumers exercising rights', 'fairness', 'high', 'checkNonDiscrimination', '{"prohibitPriceDifference": true, "prohibitServiceDenial": true}'::jsonb, 'Ensure equal treatment regardless of privacy choices')
ON CONFLICT (rule_id) DO NOTHING;

-- Insert default HIPAA rules
INSERT INTO compliance_rules (rule_id, regulation_id, name, description, category, severity, check_function, parameters, remediation) VALUES
    ('hipaa-001', 'hipaa', 'Administrative Safeguards', 'Policies and procedures to protect ePHI', 'administrative', 'critical', 'checkAdministrativeSafeguards', '{"requireSecurityOfficer": true, "requireTraining": true}'::jsonb, 'Implement comprehensive administrative safeguards program'),
    ('hipaa-002', 'hipaa', 'Physical Safeguards', 'Physical access controls for facilities and equipment', 'physical', 'high', 'checkPhysicalSafeguards', '{"requireAccessControl": true, "requireDeviceSecurity": true}'::jsonb, 'Implement physical security controls for ePHI access'),
    ('hipaa-003', 'hipaa', 'Technical Safeguards', 'Technology controls to protect ePHI', 'technical', 'critical', 'checkTechnicalSafeguards', '{"requireEncryption": true, "requireAuditControls": true}'::jsonb, 'Implement encryption and access controls for ePHI'),
    ('hipaa-004', 'hipaa', 'Breach Notification Rule', 'Notification requirements for PHI breaches', 'security', 'critical', 'checkHIPAABreachNotification', '{"maxNotificationDays": 60, "requireHHSNotification": true}'::jsonb, 'Establish breach notification procedures'),
    ('hipaa-005', 'hipaa', 'Business Associate Agreements', 'BAAs required with third-party vendors', 'contracts', 'high', 'checkBAA', '{"requireBAA": true, "requireAnnualReview": true}'::jsonb, 'Execute Business Associate Agreements with all vendors')
ON CONFLICT (rule_id) DO NOTHING;

-- Insert default monitoring configurations
INSERT INTO compliance_monitoring_config (regulation_id, enabled, scan_schedule, alert_threshold, notification_channels) VALUES
    ('gdpr', true, '0 */6 * * *', 80, '["email", "slack"]'::jsonb),
    ('ccpa', true, '0 */6 * * *', 80, '["email", "slack"]'::jsonb),
    ('hipaa', true, '0 */4 * * *', 90, '["email", "slack", "pagerduty"]'::jsonb)
ON CONFLICT (regulation_id) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_compliance_scans_updated_at BEFORE UPDATE ON compliance_scans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_compliance_violations_updated_at BEFORE UPDATE ON compliance_violations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_compliance_rules_updated_at BEFORE UPDATE ON compliance_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_regulations_updated_at BEFORE UPDATE ON regulations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_compliance_policies_updated_at BEFORE UPDATE ON compliance_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_compliance_workflows_updated_at BEFORE UPDATE ON compliance_workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_legal_requirements_updated_at BEFORE UPDATE ON legal_requirements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_compliance_monitoring_config_updated_at BEFORE UPDATE ON compliance_monitoring_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stellar_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stellar_app_user;
