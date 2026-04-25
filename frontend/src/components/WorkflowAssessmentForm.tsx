import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, X, Shield, Database, Lock, Globe } from 'lucide-react';

interface ProcessingStep {
  id: string;
  name: string;
  type: 'collection' | 'storage' | 'processing' | 'sharing' | 'deletion';
  description: string;
  dataAccess: string[];
  thirdParties: string[];
  securityMeasures: string[];
  retentionTime: number;
}

interface WorkflowFormData {
  name: string;
  description: string;
  dataTypes: string[];
  processingSteps: ProcessingStep[];
  retentionPeriod: number;
  dataSubjects: string[];
  purposes: string[];
  legalBasis: string;
  crossBorderTransfer: boolean;
  encryptionLevel: 'none' | 'basic' | 'standard' | 'advanced';
  anonymizationTechniques: string[];
}

interface WorkflowAssessmentFormProps {
  onSubmit: (workflow: any, assessorId: string) => void;
  loading?: boolean;
}

const WorkflowAssessmentForm: React.FC<WorkflowAssessmentFormProps> = ({ onSubmit, loading = false }) => {
  const [formData, setFormData] = useState<WorkflowFormData>({
    name: '',
    description: '',
    dataTypes: [],
    processingSteps: [],
    retentionPeriod: 365,
    dataSubjects: [],
    purposes: [],
    legalBasis: '',
    crossBorderTransfer: false,
    encryptionLevel: 'standard',
    anonymizationTechniques: []
  });

  const [newStep, setNewStep] = useState<Partial<ProcessingStep>>({
    name: '',
    type: 'processing',
    description: '',
    dataAccess: [],
    thirdParties: [],
    securityMeasures: [],
    retentionTime: 30
  });

  const [currentDataType, setCurrentDataType] = useState('');
  const [currentDataSubject, setCurrentDataSubject] = useState('');
  const [currentPurpose, setCurrentPurpose] = useState('');
  const [currentTechnique, setCurrentTechnique] = useState('');

  const dataTypeOptions = [
    'personal_identifiable_info',
    'special_category_data',
    'financial_data',
    'health_data',
    'biometric_data',
    'location_data',
    'communication_data',
    'behavioral_data',
    'technical_data',
    'anonymous_data'
  ];

  const dataSubjectOptions = [
    'customers',
    'employees',
    'partners',
    'suppliers',
    'eu_data_subjects',
    'california_residents',
    'minors'
  ];

  const purposeOptions = [
    'service_delivery',
    'marketing',
    'analytics',
    'research',
    'compliance',
    'consent_management',
    'fraud_detection',
    'personalization'
  ];

  const anonymizationTechniqueOptions = [
    'data_masking',
    'pseudonymization',
    'aggregation',
    'generalization',
    'differential_privacy',
    'k_anonymity',
    'l_diversity',
    't_closeness'
  ];

  const securityMeasureOptions = [
    'encryption',
    'pseudonymization',
    'access_controls',
    'audit_logging',
    'data_minimization',
    'privacy_by_design',
    'secure_storage',
    'transmission_security'
  ];

  const legalBasisOptions = [
    'consent',
    'contract',
    'legal_obligation',
    'vital_interests',
    'public_task',
    'legitimate_interests'
  ];

  const addDataType = () => {
    if (currentDataType && !formData.dataTypes.includes(currentDataType)) {
      setFormData(prev => ({
        ...prev,
        dataTypes: [...prev.dataTypes, currentDataType]
      }));
      setCurrentDataType('');
    }
  };

  const removeDataType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      dataTypes: prev.dataTypes.filter(t => t !== type)
    }));
  };

  const addDataSubject = () => {
    if (currentDataSubject && !formData.dataSubjects.includes(currentDataSubject)) {
      setFormData(prev => ({
        ...prev,
        dataSubjects: [...prev.dataSubjects, currentDataSubject]
      }));
      setCurrentDataSubject('');
    }
  };

  const removeDataSubject = (subject: string) => {
    setFormData(prev => ({
      ...prev,
      dataSubjects: prev.dataSubjects.filter(s => s !== subject)
    }));
  };

  const addPurpose = () => {
    if (currentPurpose && !formData.purposes.includes(currentPurpose)) {
      setFormData(prev => ({
        ...prev,
        purposes: [...prev.purposes, currentPurpose]
      }));
      setCurrentPurpose('');
    }
  };

  const removePurpose = (purpose: string) => {
    setFormData(prev => ({
      ...prev,
      purposes: prev.purposes.filter(p => p !== purpose)
    }));
  };

  const addTechnique = () => {
    if (currentTechnique && !formData.anonymizationTechniques.includes(currentTechnique)) {
      setFormData(prev => ({
        ...prev,
        anonymizationTechniques: [...prev.anonymizationTechniques, currentTechnique]
      }));
      setCurrentTechnique('');
    }
  };

  const removeTechnique = (technique: string) => {
    setFormData(prev => ({
      ...prev,
      anonymizationTechniques: prev.anonymizationTechniques.filter(t => t !== technique)
    }));
  };

  const addProcessingStep = () => {
    if (newStep.name && newStep.type) {
      const step: ProcessingStep = {
        id: `step_${Date.now()}`,
        name: newStep.name,
        type: newStep.type as any,
        description: newStep.description || '',
        dataAccess: newStep.dataAccess || [],
        thirdParties: newStep.thirdParties || [],
        securityMeasures: newStep.securityMeasures || [],
        retentionTime: newStep.retentionTime || 30
      };

      setFormData(prev => ({
        ...prev,
        processingSteps: [...prev.processingSteps, step]
      }));

      setNewStep({
        name: '',
        type: 'processing',
        description: '',
        dataAccess: [],
        thirdParties: [],
        securityMeasures: [],
        retentionTime: 30
      });
    }
  };

  const removeProcessingStep = (stepId: string) => {
    setFormData(prev => ({
      ...prev,
      processingSteps: prev.processingSteps.filter(s => s.id !== stepId)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const workflow = {
      id: `workflow_${Date.now()}`,
      ...formData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSubmit(workflow, 'current_user'); // This would come from authentication
  };

  const getEncryptionIcon = (level: string) => {
    switch (level) {
      case 'none': return <X className="h-4 w-4 text-red-500" />;
      case 'basic': return <Lock className="h-4 w-4 text-yellow-500" />;
      case 'standard': return <Lock className="h-4 w-4 text-blue-500" />;
      case 'advanced': return <Shield className="h-4 w-4 text-green-500" />;
      default: return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Provide basic information about the data workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name">Workflow Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter workflow name"
                required
              />
            </div>
            <div>
              <Label htmlFor="retentionPeriod">Retention Period (days)</Label>
              <Input
                id="retentionPeriod"
                type="number"
                value={formData.retentionPeriod}
                onChange={(e) => setFormData(prev => ({ ...prev, retentionPeriod: parseInt(e.target.value) }))}
                min="1"
                required
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the purpose and scope of this workflow"
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="legalBasis">Legal Basis</Label>
              <Select value={formData.legalBasis} onValueChange={(value) => setFormData(prev => ({ ...prev, legalBasis: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select legal basis" />
                </SelectTrigger>
                <SelectContent>
                  {legalBasisOptions.map(option => (
                    <SelectItem key={option} value={option}>
                      {option.replace('_', ' ').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="encryptionLevel">Encryption Level</Label>
              <div className="flex items-center space-x-2">
                <Select value={formData.encryptionLevel} onValueChange={(value: any) => setFormData(prev => ({ ...prev, encryptionLevel: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
                {getEncryptionIcon(formData.encryptionLevel)}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="crossBorderTransfer"
              checked={formData.crossBorderTransfer}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, crossBorderTransfer: !!checked }))}
            />
            <Label htmlFor="crossBorderTransfer" className="flex items-center space-x-2">
              <span>Cross-border data transfer</span>
              <Globe className="h-4 w-4" />
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Types</CardTitle>
          <CardDescription>
            Select the types of data processed in this workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Select value={currentDataType} onValueChange={setCurrentDataType}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select data type" />
              </SelectTrigger>
              <SelectContent>
                {dataTypeOptions.map(option => (
                  <SelectItem key={option} value={option}>
                    {option.replace('_', ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addDataType} disabled={!currentDataType}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {formData.dataTypes.map(type => (
              <Badge key={type} variant="secondary" className="flex items-center space-x-1">
                <span>{type.replace('_', ' ').toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => removeDataType(type)}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Subjects</CardTitle>
          <CardDescription>
            Who are the data subjects in this workflow?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Select value={currentDataSubject} onValueChange={setCurrentDataSubject}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select data subject" />
              </SelectTrigger>
              <SelectContent>
                {dataSubjectOptions.map(option => (
                  <SelectItem key={option} value={option}>
                    {option.replace('_', ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addDataSubject} disabled={!currentDataSubject}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {formData.dataSubjects.map(subject => (
              <Badge key={subject} variant="secondary" className="flex items-center space-x-1">
                <span>{subject.replace('_', ' ').toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => removeDataSubject(subject)}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purposes</CardTitle>
          <CardDescription>
            What are the purposes for processing this data?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Select value={currentPurpose} onValueChange={setCurrentPurpose}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select purpose" />
              </SelectTrigger>
              <SelectContent>
                {purposeOptions.map(option => (
                  <SelectItem key={option} value={option}>
                    {option.replace('_', ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addPurpose} disabled={!currentPurpose}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {formData.purposes.map(purpose => (
              <Badge key={purpose} variant="secondary" className="flex items-center space-x-1">
                <span>{purpose.replace('_', ' ').toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => removePurpose(purpose)}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Processing Steps</CardTitle>
          <CardDescription>
            Define the processing steps in this workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="stepName">Step Name</Label>
              <Input
                id="stepName"
                value={newStep.name}
                onChange={(e) => setNewStep(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter step name"
              />
            </div>
            <div>
              <Label htmlFor="stepType">Step Type</Label>
              <Select value={newStep.type} onValueChange={(value: any) => setNewStep(prev => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collection">Collection</SelectItem>
                  <SelectItem value="storage">Storage</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="sharing">Sharing</SelectItem>
                  <SelectItem value="deletion">Deletion</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="stepDescription">Description</Label>
            <Textarea
              id="stepDescription"
              value={newStep.description}
              onChange={(e) => setNewStep(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe this processing step"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="retentionTime">Retention Time (days)</Label>
            <Input
              id="retentionTime"
              type="number"
              value={newStep.retentionTime}
              onChange={(e) => setNewStep(prev => ({ ...prev, retentionTime: parseInt(e.target.value) }))}
              min="1"
            />
          </div>

          <Button type="button" onClick={addProcessingStep} disabled={!newStep.name}>
            <Plus className="h-4 w-4 mr-2" />
            Add Processing Step
          </Button>

          <Separator />

          <div className="space-y-2">
            {formData.processingSteps.map((step) => (
              <Card key={step.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{step.name}</h4>
                      <p className="text-sm text-muted-foreground">{step.type}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeProcessingStep(step.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {step.description && (
                    <p className="text-sm mt-2">{step.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anonymization Techniques</CardTitle>
          <CardDescription>
            Select anonymization techniques applied in this workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Select value={currentTechnique} onValueChange={setCurrentTechnique}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select technique" />
              </SelectTrigger>
              <SelectContent>
                {anonymizationTechniqueOptions.map(option => (
                  <SelectItem key={option} value={option}>
                    {option.replace('_', ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addTechnique} disabled={!currentTechnique}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {formData.anonymizationTechniques.map(technique => (
              <Badge key={technique} variant="secondary" className="flex items-center space-x-1">
                <span>{technique.replace('_', ' ').toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => removeTechnique(technique)}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {formData.dataTypes.length === 0 && (
        <Alert>
          <AlertDescription>
            Please add at least one data type to proceed with the assessment.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline">
          Save as Draft
        </Button>
        <Button type="submit" disabled={loading || formData.dataTypes.length === 0}>
          {loading ? 'Assessing...' : 'Start Risk Assessment'}
        </Button>
      </div>
    </form>
  );
};

export default WorkflowAssessmentForm;
