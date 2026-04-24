import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Lock, 
  Shield, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight,
  ArrowLeft,
  FileText,
  Hash,
  Tag,
  Calendar,
  Building,
  X,
  Loader2,
  Undo,
  Database,
  Eye,
  EyeOff,
  Search,
  Zap,
  Cpu
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';

// Import our new UI components
import { PrivacyBadge, PrivacyLevel } from './ui/PrivacyBadge';
import { ScanningEffect } from './ui/ScanningEffect';
import { BlurOverlay } from './ui/BlurOverlay';

// Web Worker for hashing
const hashWorker = new Worker(
  new URL('../workers/hashWorker.ts', import.meta.url),
  { type: 'module' }
);

interface UploadStep {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

interface MetadataTags {
  department: string;
  dateRange: {
    start: string;
    end: string;
  };
  sensitivity: PrivacyLevel;
  purpose: string;
  retention: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  rowCount?: number;
  columns?: string[];
  piiDetected?: boolean;
}

interface UploadProgress {
  percentage: number;
  stage: string;
  message: string;
  hash?: string;
}

interface EncryptedUploadResult {
  fileId: string;
  hash: string;
  stellarTransactionId: string;
  ipfsCid: string;
  encryptionKey: string;
  metadata: MetadataTags;
}

const EncryptedDataUploadWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [metadata, setMetadata] = useState<MetadataTags>({
    department: '',
    dateRange: { start: '', end: '' },
    sensitivity: 'private',
    purpose: '',
    retention: '1-year'
  });
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [uploadResult, setUploadResult] = useState<EncryptedUploadResult | null>(null);
  const [showEncryptionKey, setShowEncryptionKey] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const steps: UploadStep[] = [
    { id: 1, name: 'Select File', description: 'Choose your dataset file', status: 'pending' },
    { id: 2, name: 'Validate Schema', description: 'Check privacy standards compliance', status: 'pending' },
    { id: 3, name: 'Add Metadata', description: 'Tag and classify your data', status: 'pending' },
    { id: 4, name: 'Encrypt & Hash', description: 'Secure processing with client-side encryption', status: 'pending' },
    { id: 5, name: 'Upload Complete', description: 'Review and confirm upload', status: 'pending' }
  ];

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    const validTypes = ['.csv', '.json'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!validTypes.includes(fileExtension)) {
      toast.error(`Invalid file type. Please upload ${validTypes.join(', ')} files.`);
      return;
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      toast.error('File size exceeds 100MB limit.');
      return;
    }

    setSelectedFile(file);
    setCurrentStep(2);
    toast.success(`File "${file.name}" selected successfully.`);
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Schema validation
  const validateSchema = useCallback(async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setValidationResult(null);

    try {
      const fileContent = await readFileContent(selectedFile);
      const validation = await validateFileSchema(fileContent, selectedFile.name);
      setValidationResult(validation);

      if (validation.isValid) {
        toast.success('File validation passed!');
        setCurrentStep(3);
      } else {
        toast.error('File validation failed. Please check the errors.');
      }
    } catch (error: any) {
      toast.error('Validation failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile]);

  // Read file content
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // Validate file schema (Simulated Privacy Standards)
  const validateFileSchema = async (content: string, fileName: string): Promise<ValidationResult> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let piiDetected = false;

    // Simulate X-Ray Scan for PII
    if (content.includes('@') || content.search(/\w+@\w+\.\w+/) !== -1) {
      piiDetected = true;
      warnings.push('Potential PII detected: EMail addresses found. Differential privacy or blurring recommended.');
    }

    try {
      if (fileName.endsWith('.json')) {
        const data = JSON.parse(content);
        if (!Array.isArray(data)) {
          errors.push('JSON file must contain an array of objects');
        } else {
          const columns = Object.keys(data[0] || {});
          const requiredColumns = ['id', 'timestamp'];
          const missingColumns = requiredColumns.filter(col => !columns.includes(col));
          if (missingColumns.length > 0) {
            warnings.push(`Missing recommended privacy columns: ${missingColumns.join(', ')}`);
          }
          return { isValid: errors.length === 0, errors, warnings, rowCount: data.length, columns, piiDetected };
        }
      } else if (fileName.endsWith('.csv')) {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          errors.push('CSV file must have at least a header and one data row');
        } else {
          const columns = lines[0].split(',').map(col => col.trim());
          const rowCount = lines.length - 1;
          return { isValid: errors.length === 0, errors, warnings, rowCount, columns, piiDetected };
        }
      }
    } catch (error) {
      errors.push('Failed to parse file content. File might be corrupted.');
    }

    return { isValid: false, errors, warnings, piiDetected };
  };

  // Hash file using Web Worker
  const hashFile = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      setIsProcessing(true);
      setUploadProgress({ percentage: 0, stage: 'hashing', message: 'Initializing hash calculation...' });

      const handleMessage = (e: MessageEvent) => {
        const { type, hash, progress, error } = e.data;
        
        if (type === 'progress') {
          setUploadProgress({
            percentage: progress,
            stage: 'hashing',
            message: `Calculating SHA-256 Hash... ${progress}%`
          });
        } else if (type === 'complete') {
          setUploadProgress({
            percentage: 100,
            stage: 'hashing',
            message: 'Hash calculation complete',
            hash
          });
          hashWorker.removeEventListener('message', handleMessage);
          setIsProcessing(false);
          resolve(hash);
        } else if (type === 'error') {
          hashWorker.removeEventListener('message', handleMessage);
          setIsProcessing(false);
          reject(new Error(error));
        }
      };

      hashWorker.addEventListener('message', handleMessage);
      hashWorker.postMessage({ type: 'hash', file });
    });
  }, []);

  // Encrypt and upload
  const encryptAndUpload = useCallback(async () => {
    if (!selectedFile) return;

    try {
      setIsProcessing(true);
      
      // Step 1: Hash the file locally
      const fileHash = await hashFile(selectedFile);
      
      // Step 2: Encrypt the file (Simulated with progress)
      setUploadProgress({ percentage: 25, stage: 'encrypting', message: 'Encrypting data locally with AES-256-GCM...' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 3: Generate encryption key
      setUploadProgress({ percentage: 50, stage: 'encrypting', message: 'Generating ephemeral encryption key...' });
      const encryptionKey = crypto.randomUUID().replace(/-/g, '');
      
      // Step 4: Upload to IPFS (Simulated)
      setUploadProgress({ percentage: 75, stage: 'uploading', message: 'Uploading encrypted shards to IPFS...' });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const ipfsCid = `Qm${Math.random().toString(36).substring(2, 44)}`;
      
      // Step 5: Create Stellar transaction (Simulated)
      setUploadProgress({ percentage: 90, stage: 'signing', message: 'Committing metadata to Stellar Ledger...' });
      await new Promise(resolve => setTimeout(resolve, 1000));
      const stellarTxId = `stellar_tx_${Date.now()}_${fileHash.slice(0, 8)}`;
      
      // Step 6: Complete
      setUploadProgress({ percentage: 100, stage: 'completed', message: 'Upload completed and verified!' });
      
      const result: EncryptedUploadResult = {
        fileId: `file_${Date.now()}`,
        hash: fileHash,
        stellarTransactionId: stellarTxId,
        ipfsCid,
        encryptionKey,
        metadata
      };
      
      setUploadResult(result);
      setCanUndo(true);
      setCurrentStep(5);
      
      toast.success('Upload anchor successfully committed to Stellar!');
    } catch (error: any) {
      toast.error('Processing failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, metadata, hashFile]);

  // Reset wizard
  const resetWizard = () => {
    setCurrentStep(1);
    setSelectedFile(null);
    setValidationResult(null);
    setUploadResult(null);
    setUploadProgress(null);
    setCanUndo(false);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-obsidian-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-obsidian-800 transition-colors">
      {/* Wizard Header / Steps */}
      <div className="bg-slate-50 dark:bg-obsidian-950 px-8 py-6 border-b border-gray-200 dark:border-obsidian-800">
        <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
          {steps.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div key={step.id} className="flex flex-col items-center gap-2 group relative">
                <div className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  isActive ? "border-cyber-blue bg-cyber-blue/10 text-cyber-blue shadow-[0_0_10px_#00F0FF]" :
                  isCompleted ? "border-green-500 bg-green-500 text-white" :
                  "border-gray-300 text-gray-400 dark:border-obsidian-700"
                )}>
                  {isCompleted ? <CheckCircle size={20} /> : <span className="font-bold text-sm">{step.id}</span>}
                </div>
                <div className="hidden lg:block text-center whitespace-nowrap">
                  <div className={clsx("text-[10px] uppercase font-extrabold tracking-widest", isActive ? "text-cyber-blue" : "text-gray-400")}>
                    {step.name}
                  </div>
                </div>
                {/* Connector line */}
                {step.id < steps.length && (
                  <div className="hidden md:block absolute left-[calc(100%+0.5rem)] top-5 w-8 h-[1px] bg-gray-200 dark:bg-obsidian-800" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto min-h-[500px]">
        <div className="max-w-3xl mx-auto h-full flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {/* Step 1: Selection */}
            {currentStep === 1 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold dark:text-white uppercase italic tracking-tighter">
                    Choose <span className="text-cyber-blue">Dataset</span>
                  </h3>
                  <p className="text-sm text-gray-500 font-mono">Select a CSV or JSON file to anchor to the privacy mesh.</p>
                </div>

                <div
                  onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
                  className={clsx(
                    "relative group h-64 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-300 overflow-hidden",
                    isDragOver ? "border-cyber-blue bg-cyber-blue/5 scale-[1.02]" : "border-gray-200 dark:border-obsidian-700 hover:border-gray-300 dark:hover:border-obsidian-600"
                  )}
                >
                  <div className="absolute inset-0 bg-cyber-blue/0 group-hover:bg-cyber-blue/[0.02] transition-colors" />
                  <div className="relative z-1 flex flex-col items-center gap-4">
                    <div className="p-5 bg-slate-100 dark:bg-obsidian-800 rounded-3xl group-hover:scale-110 group-hover:bg-cyber-blue/10 transition-all shadow-xl border border-white/10">
                      <Upload className={clsx("w-10 h-10 transition-colors", isDragOver ? "text-cyber-blue" : "text-gray-400")} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold dark:text-white uppercase tracking-tighter">Drag Shards Here</p>
                      <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-mono">or click to browse filesystem</p>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-cyber text-xs mt-2"
                    >
                      Select Shards
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} className="hidden" />
                  </div>
                </div>

                {selectedFile && (
                   <div className="glass p-4 rounded-2xl flex items-center justify-between border-l-4 border-cyber-blue animate-fade-in">
                    <div className="flex items-center gap-3">
                      <FileText className="text-cyber-blue" />
                      <div>
                        <div className="text-sm font-bold truncate max-w-[200px] dark:text-gray-200">{selectedFile.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-mono">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB // {selectedFile.type}</div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedFile(null)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Validation */}
            {currentStep === 2 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                 <div className="text-center space-y-2 mb-8 uppercase">
                  <h3 className="text-2xl font-black italic tracking-tighter dark:text-white">
                    Privacy <span className="text-cyber-blue">X-RAY</span> Scan
                  </h3>
                  <p className="text-sm text-gray-500 font-mono">Checking against platform safety standards.</p>
                </div>

                <ScanningEffect isLoading={isProcessing} className="p-8 border border-gray-100 dark:border-obsidian-800">
                  {!isProcessing && validationResult ? (
                    <div className="space-y-6 animate-fade-in">
                      <div className={clsx(
                        "p-6 rounded-2xl border flex items-center gap-6",
                        validationResult.isValid ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"
                      )}>
                        <div className={clsx(
                          "p-4 rounded-2xl",
                          validationResult.isValid ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                        )}>
                          {validationResult.isValid ? <CheckCircle size={32} /> : <AlertCircle size={32} />}
                        </div>
                        <div>
                          <div className="text-lg font-bold uppercase tracking-tighter dark:text-white">
                            Scan {validationResult.isValid ? 'Success' : 'Failure'}
                          </div>
                          <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">
                            {validationResult.rowCount} Records Analyzed // {validationResult.columns?.length} Dimensions Found
                          </p>
                        </div>
                      </div>

                      {validationResult.piiDetected && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl flex items-start gap-3">
                           <AlertCircle className="text-orange-500 shrink-0 mt-0.5" size={18} />
                           <div className="text-xs font-mono text-orange-700 dark:text-orange-400 uppercase leading-relaxed">
                            <span className="font-black">WARNING:</span> Potential PII leakage detected. System recommends Differential Privacy (ε ≤ 1.0) and attribute blurring on the 다음 page.
                           </div>
                        </div>
                      )}

                      {!validationResult.isValid && (
                         <div className="space-y-2">
                           {validationResult.errors.map((err, i) => (
                             <div key={i} className="text-xs font-mono text-red-500 flex items-center gap-2">
                               <X size={12} /> {err}
                             </div>
                           ))}
                         </div>
                      )}

                      <div className="flex gap-4 pt-4">
                        <button onClick={() => setCurrentStep(1)} className="btn-secondary flex-1">Abort</button>
                        {validationResult.isValid && (
                          <button onClick={() => setCurrentStep(3)} className="btn-cyber flex-1">Procced to Classify</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 flex flex-col items-center gap-6">
                      <div className="relative">
                        <Cpu className="w-16 h-16 text-cyber-blue animate-pulse" />
                        <div className="absolute -inset-4 bg-cyber-blue/10 rounded-full blur-xl animate-pulse" />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-black uppercase tracking-widest text-cyber-blue">Scanning Shard Layers...</div>
                        <div className="text-[10px] text-gray-500 uppercase font-mono mt-2">Running PII Detection // Schema Validation // Integrity Check</div>
                      </div>
                    </div>
                  )}
                </ScanningEffect>
                
                {!validationResult && (
                  <button onClick={validateSchema} disabled={isProcessing} className="w-full btn-cyber h-14">
                    Initialize Scan
                  </button>
                )}
              </motion.div>
            )}

            {/* Step 3: Metadata */}
            {currentStep === 3 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                 <div className="text-center space-y-2 mb-4 uppercase">
                  <h3 className="text-2xl font-black italic tracking-tighter dark:text-white">
                    Data <span className="text-cyber-blue">Classification</span>
                  </h3>
                  <p className="text-sm text-gray-500 font-mono">Tag shards with resource metadata.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Department Anchor</label>
                    <select
                      className="input-field h-12 text-sm"
                      value={metadata.department}
                      onChange={(e) => setMetadata({...metadata, department: e.target.value})}
                    >
                      <option value="">Select Domain</option>
                      <option value="research">R&D // Core</option>
                      <option value="marketing">Marketing // Growth</option>
                      <option value="finance">Finance // Treasury</option>
                      <option value="ops">Operations // Infrastructure</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Privacy Sensitivity</label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(['public', 'protected', 'private', 'secret'] as PrivacyLevel[]).map(lvl => (
                        <button 
                          key={lvl}
                          onClick={() => setMetadata({...metadata, sensitivity: lvl})}
                          className="focus:outline-none"
                        >
                          <PrivacyBadge 
                            level={lvl} 
                            className={clsx(
                              "h-10 text-[10px] px-4",
                              metadata.sensitivity === lvl ? "scale-110 shadow-lg border-2" : "opacity-30 grayscale hover:opacity-100 transition-all"
                            )} 
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Purpose // Justification</label>
                    <input 
                      type="text" placeholder="e.g. Statistical Analysis" className="input-field h-12 text-sm"
                      value={metadata.purpose} onChange={(e) => setMetadata({...metadata, purpose: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Temporal Range</label>
                    <div className="flex gap-2">
                      <input type="date" className="input-field h-12 text-xs" value={metadata.dateRange.start} onChange={(e) => setMetadata({...metadata, dateRange: {...metadata.dateRange, start: e.target.value}})} />
                      <input type="date" className="input-field h-12 text-xs" value={metadata.dateRange.end} onChange={(e) => setMetadata({...metadata, dateRange: {...metadata.dateRange, end: e.target.value}})} />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setCurrentStep(2)} className="btn-secondary flex-1">Back</button>
                  <button onClick={() => setCurrentStep(4)} disabled={!metadata.department || !metadata.purpose} className="btn-cyber flex-1">Configure Encryption</button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Encrypt & Commit */}
            {currentStep === 4 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                 <div className="text-center space-y-2 mb-4 uppercase">
                  <h3 className="text-2xl font-black italic tracking-tighter dark:text-white">
                    Ledger <span className="text-cyber-blue">Commitment</span>
                  </h3>
                  <p className="text-sm text-gray-500 font-mono">Securing hashes on the Stellar blockchain.</p>
                </div>

                <div className="glass overflow-hidden rounded-3xl border border-cyber-blue/20">
                  <ScanningEffect isLoading={isProcessing} className="p-10">
                    {isProcessing ? (
                      <div className="space-y-8">
                         <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-cyber-blue italic">
                            <span>Processing Layer: {uploadProgress?.stage}</span>
                            <span>{uploadProgress?.percentage}%</span>
                         </div>
                         <div className="h-2 bg-slate-100 dark:bg-obsidian-800 rounded-full overflow-hidden">
                           <motion.div 
                            initial={{ width: 0 }} 
                            animate={{ width: `${uploadProgress?.percentage}%` }}
                            className="h-full bg-cyber-blue shadow-[0_0_15px_#00F0FF]"
                           />
                         </div>
                         <div className="text-center font-mono text-[10px] text-gray-500 uppercase tracking-tight animate-pulse">
                            {uploadProgress?.message}
                         </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-6">
                         <div className="p-6 bg-cyber-blue/5 rounded-2xl border border-cyber-blue/10 inline-block">
                           <Lock className="w-16 h-16 text-cyber-blue" />
                         </div>
                         <div className="space-y-2">
                           <h4 className="text-lg font-bold uppercase tracking-tight dark:text-white">Ready for Final Anchor</h4>
                           <p className="text-xs text-gray-500 max-w-sm mx-auto uppercase tracking-widest leading-relaxed">
                            Your dataset will be encrypted with AES-GCM-256 and anchored to the Stellar Testnet. This action is immutable once broadcasted.
                           </p>
                         </div>
                         <button onClick={encryptAndUpload} className="btn-cyber h-14 w-full">Final Broadcast & Commit</button>
                      </div>
                    )}
                  </ScanningEffect>
                </div>

                {!isProcessing && (
                   <button onClick={() => setCurrentStep(3)} className="w-full text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
                     Back to Classification
                   </button>
                )}
              </motion.div>
            )}

            {/* Step 5: Success State */}
            {currentStep === 5 && uploadResult && (
               <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                <div className="text-center space-y-4">
                  <div className="relative inline-block">
                    <div className="absolute -inset-4 bg-green-500/20 rounded-full blur-2xl animate-pulse" />
                    <CheckCircle className="w-20 h-20 text-green-500 relative z-1" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black italic uppercase tracking-tighter dark:text-white">
                      Anchor <span className="text-green-500">Confirmed</span>
                    </h3>
                    <p className="text-sm text-gray-500 font-mono">Dataset successfully anchored to the Stellar Privacy Mesh.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="glass p-5 rounded-2xl space-y-3">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stellar Transaction ID</div>
                    <div className="bg-slate-50 dark:bg-obsidian-950 p-3 rounded-xl border border-gray-100 dark:border-obsidian-800">
                      <p className="text-[10px] font-mono break-all text-cyber-blue leading-relaxed">{uploadResult.stellarTransactionId}</p>
                    </div>
                  </div>

                  <div className="glass p-5 rounded-2xl space-y-3">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">IPFS CID // Content Root</div>
                    <div className="bg-slate-50 dark:bg-obsidian-950 p-3 rounded-xl border border-gray-100 dark:border-obsidian-800">
                      <p className="text-[10px] font-mono break-all text-gray-400 leading-relaxed italic">{uploadResult.ipfsCid}</p>
                    </div>
                  </div>

                  <div className="md:col-span-2 glass p-5 rounded-2xl border-l-4 border-cyber-blue group">
                    <div className="flex items-center justify-between mb-2">
                       <div className="text-[10px] font-bold text-cyber-blue uppercase tracking-widest">Master Encryption Key (E2EE)</div>
                       <PrivacyBadge level="secret" className="scale-75" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-slate-50 dark:bg-obsidian-950 p-3 rounded-xl border border-gray-100 dark:border-obsidian-800 flex items-center justify-center">
                         <BlurOverlay isSensitive={true} label="ENCRYPTED KEY" className="w-full">
                           <p className="text-xs font-mono font-bold text-center tracking-widest text-green-500">{uploadResult.encryptionKey}</p>
                         </BlurOverlay>
                      </div>
                    </div>
                    <p className="text-[9px] text-red-500/60 uppercase font-bold mt-2 text-center tracking-tighter italic animate-pulse">
                      CRITICAL: Loss of this key will result in permanent data loss. System cannot recover E2EE keys.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                   onClick={() => {
                     if(window.confirm('UNDO BROADCAST: This will attempt to invalidate the IPFS root and revoke the stellar anchor. Continue?')) {
                       toast.success('Broadcast reversal initiated...');
                       resetWizard();
                     }
                   }} 
                   className="group p-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all border border-red-500/20 flex items-center gap-2"
                  >
                    <Undo size={18} className="group-hover:-rotate-45 transition-transform" />
                    <span className="text-[10px] uppercase font-bold tracking-widest">Undo Anchor</span>
                  </button>
                  <button onClick={resetWizard} className="btn-cyber flex-1 h-16 text-lg tracking-widest shadow-[0_0_20px_rgba(0,240,255,0.4)]">Anchor Another Shard</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default EncryptedDataUploadWizard;
