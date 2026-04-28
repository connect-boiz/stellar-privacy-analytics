import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert, AlertDescription } from './ui/Alert';
import { Switch } from './ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';
import { Loader2, Play, Settings, Database, Network, CreditCard, AlertTriangle, CheckCircle } from 'lucide-react';

interface SandboxConfig {
  enabled: boolean;
  environment: 'mainnet' | 'testnet' | 'sandbox';
  stellarNetwork: {
    rpcUrl: string;
    networkPassphrase: string;
    horizonUrl: string;
  };
  database: {
    schemaPrefix: string;
    isolationEnabled: boolean;
  };
  features: {
    mockPayments: boolean;
    failureSimulation: boolean;
    zeroValueTokens: boolean;
    enhancedLogging: boolean;
  };
  mockData: {
    subscriptionBilledEvents: boolean;
    gracePeriods: boolean;
    dunningProcesses: boolean;
    webhookDelays: boolean;
  };
}

interface MockPayment {
  paymentId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: 'success' | 'failed' | 'pending';
  failureType?: string;
  timestamp: string;
}

export const SandboxDashboard: React.FC = () => {
  const [config, setConfig] = useState<SandboxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mockPayments, setMockPayments] = useState<MockPayment[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    subscriptionId: '',
    amount: '10.00',
    currency: 'USD',
    shouldFail: false,
    failureType: 'insufficient_funds'
  });

  useEffect(() => {
    fetchSandboxConfig();
    fetchMockPayments();
  }, []);

  const fetchSandboxConfig = async () => {
    try {
      const response = await fetch('/api/v1/sandbox/config');
      if (!response.ok) throw new Error('Failed to fetch sandbox config');
      const data = await response.json();
      setConfig(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMockPayments = async () => {
    try {
      const response = await fetch('/api/v1/sandbox/mock-payments?limit=10');
      if (!response.ok) throw new Error('Failed to fetch mock payments');
      const data = await response.json();
      setMockPayments(data.data.payments);
    } catch (err) {
      console.error('Failed to fetch mock payments:', err);
    }
  };

  const toggleSandbox = async (enabled: boolean) => {
    try {
      const response = await fetch('/api/v1/sandbox/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) throw new Error('Failed to toggle sandbox');
      await fetchSandboxConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const switchEnvironment = async (environment: 'mainnet' | 'testnet' | 'sandbox') => {
    try {
      const response = await fetch('/api/v1/sandbox/environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment })
      });
      if (!response.ok) throw new Error('Failed to switch environment');
      await fetchSandboxConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const createMockPayment = async () => {
    try {
      const response = await fetch('/api/v1/sandbox/mock-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      });
      if (!response.ok) throw new Error('Failed to create mock payment');
      await fetchMockPayments();
      setPaymentForm({
        subscriptionId: '',
        amount: '10.00',
        currency: 'USD',
        shouldFail: false,
        failureType: 'insufficient_funds'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!config) {
    return <div>No sandbox configuration available</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Developer Sandbox</h1>
        <Badge variant={config.enabled ? 'default' : 'secondary'}>
          {config.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Mock Payments</TabsTrigger>
          <TabsTrigger value="events">Event Simulation</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sandbox Mode</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={toggleSandbox}
                  />
                  <span className="text-sm">
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Environment</CardTitle>
                <Network className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Select value={config.environment} onValueChange={switchEnvironment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mainnet">Mainnet</SelectItem>
                    <SelectItem value="testnet">Testnet</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Database</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <div>Schema: {config.database.schemaPrefix || 'default'}</div>
                  <div>Isolation: {config.database.isolationEnabled ? 'Enabled' : 'Disabled'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Mock Features</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className={`h-3 w-3 ${config.features.mockPayments ? 'text-green-500' : 'text-gray-300'}`} />
                    <span>Mock Payments</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className={`h-3 w-3 ${config.features.failureSimulation ? 'text-green-500' : 'text-gray-300'}`} />
                    <span>Failure Simulation</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Network Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">RPC URL</label>
                  <div className="text-sm text-muted-foreground mt-1">{config.stellarNetwork.rpcUrl}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Horizon URL</label>
                  <div className="text-sm text-muted-foreground mt-1">{config.stellarNetwork.horizonUrl}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Network</label>
                  <div className="text-sm text-muted-foreground mt-1">{config.environment}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Mock Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Subscription ID</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    value={paymentForm.subscriptionId}
                    onChange={(e) => setPaymentForm({...paymentForm, subscriptionId: e.target.value})}
                    placeholder="Enter subscription UUID"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <Select value={paymentForm.currency} onValueChange={(value) => setPaymentForm({...paymentForm, currency: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Simulate Failure</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <Switch
                      checked={paymentForm.shouldFail}
                      onCheckedChange={(checked) => setPaymentForm({...paymentForm, shouldFail: checked})}
                    />
                    <span className="text-sm">Enable failure simulation</span>
                  </div>
                </div>
                {paymentForm.shouldFail && (
                  <div>
                    <label className="text-sm font-medium">Failure Type</label>
                    <Select value={paymentForm.failureType} onValueChange={(value) => setPaymentForm({...paymentForm, failureType: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="insufficient_funds">Insufficient Funds</SelectItem>
                        <SelectItem value="network_error">Network Error</SelectItem>
                        <SelectItem value="timeout">Timeout</SelectItem>
                        <SelectItem value="invalid_signature">Invalid Signature</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <Button onClick={createMockPayment} disabled={!paymentForm.subscriptionId}>
                <Play className="h-4 w-4 mr-2" />
                Create Mock Payment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Mock Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mockPayments.map((payment) => (
                  <div key={payment.paymentId} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">{payment.paymentId}</div>
                      <div className="text-sm text-muted-foreground">
                        {payment.amount} {payment.currency} • {new Date(payment.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant={payment.status === 'success' ? 'default' : payment.status === 'failed' ? 'destructive' : 'secondary'}>
                      {payment.status}
                      {payment.failureType && ` (${payment.failureType})`}
                    </Badge>
                  </div>
                ))}
                {mockPayments.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No mock payments created yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event Simulation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline">
                  Simulate Subscription Billed
                </Button>
                <Button variant="outline">
                  Simulate Grace Period
                </Button>
                <Button variant="outline">
                  Simulate Dunning Process
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feature Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(config.features).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <Switch checked={value} disabled />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
