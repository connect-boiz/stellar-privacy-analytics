import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Copy, Download, Shield, Key, RotateCcw, ShieldCheck } from 'lucide-react';
import { WebCryptoService } from '../lib/webCrypto';

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  status: 'success' | 'warning' | 'error';
}

const KeyManagementPage: React.FC = () => {
  const [cryptoSupported, setCryptoSupported] = useState(true);
  const [wasmSupported, setWasmSupported] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [publicKeyPem, setPublicKeyPem] = useState<string>('');
  const [privateKeyPem, setPrivateKeyPem] = useState<string>('');
  const [importPem, setImportPem] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing key management interface...');
  const [isHsmEnabled, setIsHsmEnabled] = useState(false);

  useEffect(() => {
    const cryptoAvailable = !!window.crypto?.subtle;
    const wasmAvailable = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
    setCryptoSupported(cryptoAvailable);
    setWasmSupported(wasmAvailable);
    setIsLoading(false);
    setStatusMessage(cryptoAvailable ? 'Ready to manage encryption keys.' : 'Web Crypto API not available.');
  }, []);

  const addAuditLog = (action: string, status: AuditEntry['status']) => {
    setAuditLogs((prev) => [
      {
        id: `${Date.now()}`,
        timestamp: new Date().toISOString(),
        action,
        status
      },
      ...prev
    ]);
  };

  const exportPrivateKey = async (key: CryptoKey) => {
    const exported = await window.crypto.subtle.exportKey('pkcs8', key);
    const exportedAsString = String.fromCharCode(...new Uint8Array(exported));
    const exportedAsBase64 = btoa(exportedAsString);
    return `-----BEGIN PRIVATE KEY-----\n${exportedAsBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
  };

  const downloadBackup = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerateKeys = async () => {
    try {
      setStatusMessage('Generating secure RSA key pair...');
      const keyPair = await WebCryptoService.generateRSAKeyPair();
      const exportedPublic = await WebCryptoService.exportRSAPublicKey(keyPair.publicKey);
      const exportedPrivate = await exportPrivateKey(keyPair.privateKey);
      setPublicKeyPem(exportedPublic);
      setPrivateKeyPem(exportedPrivate);
      setStatusMessage('Key pair generated successfully.');
      addAuditLog('Generated new RSA key pair', 'success');
    } catch (error) {
      console.error(error);
      setStatusMessage('Key generation failed.');
      addAuditLog('Key generation failed', 'error');
    }
  };

  const handleRotateKeys = async () => {
    try {
      setStatusMessage('Rotating encryption keys...');
      await handleGenerateKeys();
      setStatusMessage('Key rotation completed successfully.');
      addAuditLog('Rotated keys', 'success');
    } catch (error) {
      setStatusMessage('Key rotation failed.');
      addAuditLog('Key rotation failed', 'error');
    }
  };

  const handleExportBackup = () => {
    if (!publicKeyPem || !privateKeyPem) {
      setStatusMessage('Generate keys before exporting backup.');
      return;
    }

    const payload = {
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      backupTimestamp: new Date().toISOString(),
      source: isHsmEnabled ? 'HSM-Integrated' : 'Local Browser Crypto'
    };

    downloadBackup(`stellar-key-backup-${Date.now()}.json`, JSON.stringify(payload, null, 2));
    setStatusMessage('Backup downloaded successfully.');
    addAuditLog('Exported key backup', 'success');
  };

  const handleImportKey = async () => {
    try {
      if (!importPem.trim()) {
        setStatusMessage('Paste a public key PEM to import.');
        return;
      }

      await WebCryptoService.importRSAPublicKey(importPem);
      setStatusMessage('Public key imported successfully.');
      addAuditLog('Imported public key', 'success');
      setImportPem('');
    } catch (error) {
      console.error(error);
      setStatusMessage('Failed to import public key.');
      addAuditLog('Public key import failed', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-blue-600">
              <Key className="h-6 w-6" />
              <h1 className="text-2xl font-semibold text-slate-900">Encryption Key Management</h1>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              Manage encryption, rotation, backup, and import/export operations with fallback support for non-WASM browsers.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {cryptoSupported ? 'Browser Crypto Supported' : 'Fallback Mode Active'}
          </Badge>
        </div>
      </div>

      {!cryptoSupported && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertTitle className="text-yellow-800 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Fallback Mode
          </AlertTitle>
          <AlertDescription>
            Your browser does not support the Web Crypto API. Key management remains available in read-only mode, but full generation and export may be limited.
          </AlertDescription>
        </Alert>
      )}

      {!wasmSupported && (
        <Alert className="bg-blue-50 border-blue-200">
          <AlertTitle className="text-blue-800">WASM Unsupported</AlertTitle>
          <AlertDescription>
            WebAssembly is not available in this browser. The interface will still work using browser-native cryptography and audited fallback behavior.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Key Status</CardTitle>
            <CardDescription>Track the current key and protection state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Public Key</p>
              <p className="break-words text-xs text-slate-700 bg-slate-50 p-3 rounded-lg min-h-[120px]">
                {publicKeyPem || 'No public key generated yet.'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Private Key</p>
              <p className="break-words text-xs text-slate-700 bg-slate-50 p-3 rounded-lg min-h-[120px]">
                {privateKeyPem ? 'A private key is available locally for backup.' : 'Generate keys to enable backup and export.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="default" onClick={handleGenerateKeys} className="touch-target">
                <Key className="h-4 w-4" />
                Generate Keys
              </Button>
              <Button variant="secondary" onClick={handleRotateKeys} className="touch-target">
                <RotateCcw className="h-4 w-4" />
                Rotate Keys
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Key Backup</CardTitle>
            <CardDescription>Securely export keys for safe storage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={handleExportBackup} className="w-full touch-target">
              <Download className="h-4 w-4" />
              Download Backup
            </Button>
            <div className="text-sm text-slate-600">
              Keep backups in a secure location and never share private keys publicly.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>HSM Integration</CardTitle>
            <CardDescription>Simulated support for hardware security modules.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={isHsmEnabled ? 'default' : 'secondary'}>
                {isHsmEnabled ? 'HSM Enabled' : 'HSM Disabled'}
              </Badge>
              <Button variant="ghost" onClick={() => setIsHsmEnabled((prev) => !prev)} className="touch-target">
                {isHsmEnabled ? 'Disable' : 'Enable'} HSM
              </Button>
            </div>
            <p className="text-sm text-slate-600">
              When HSM mode is enabled, key operations are treated as if they are backed by secure hardware with audit tracing.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Import Public Key</CardTitle>
            <CardDescription>Paste a PEM-formatted public key for validation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              rows={6}
              value={importPem}
              onChange={(event) => setImportPem(event.target.value)}
              className="w-full min-h-[160px] rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="-----BEGIN PUBLIC KEY-----\n..."
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="default" onClick={handleImportKey} className="touch-target">
                <Shield className="h-4 w-4" />
                Import Public Key
              </Button>
              <Button variant="secondary" onClick={() => setImportPem('')} className="touch-target">
                <Copy className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>Recent key management operations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[420px] overflow-y-auto">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-slate-600">No key operations recorded yet.</p>
            ) : (
              auditLogs.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{entry.action}</p>
                    <Badge variant={entry.status === 'success' ? 'default' : entry.status === 'warning' ? 'secondary' : 'destructive'}>
                      {entry.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{new Date(entry.timestamp).toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl bg-slate-950 p-6 text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Operational Status</h2>
            <p className="text-sm text-slate-300">{statusMessage}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-800 p-4 text-sm">
              <p className="font-medium">Browser Crypto Support</p>
              <p>{cryptoSupported ? 'Enabled' : 'Unavailable'}</p>
            </div>
            <div className="rounded-xl bg-slate-800 p-4 text-sm">
              <p className="font-medium">WebAssembly Support</p>
              <p>{wasmSupported ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KeyManagementPage;
