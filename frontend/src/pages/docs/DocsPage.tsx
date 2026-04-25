import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Search, Book, Code, Shield, ChevronRight, MessageSquare, Globe, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const DocsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Getting Started');

  const categories = [
    { name: 'Getting Started', icon: <Book className="w-4 h-4" /> },
    { name: 'API Reference', icon: <Code className="w-4 h-4" /> },
    { name: 'Privacy Protocols', icon: <Shield className="w-4 h-4" /> },
    { name: 'Developer Guides', icon: <ChevronRight className="w-4 h-4" /> },
    { name: 'Best Practices', icon: <Globe className="w-4 h-4" /> },
  ];

  const featuredGuides = [
    { title: 'Integrating SMPC with Stellar', description: 'Learn how to set up multi-party computation nodes for private transactions.' },
    { title: 'Zero-Knowledge Proofs 101', description: 'A comprehensive guide to implementing ZKPs in your privacy-first application.' },
    { title: 'Data Encryption Standards', description: 'Our recommended encryption protocols for secure data storage and transit.' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-cyber-dark text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-obsidian-800 bg-white dark:bg-obsidian-900 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-600 dark:text-cyber-blue" />
            <h1 className="text-xl font-bold tracking-tight">Privacy Portal</h1>
          </div>
          
          <div className="relative max-w-md w-full hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search documentation..."
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-obsidian-800 border-none rounded-lg focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm">v1.2.0</Button>
            <Button size="sm">Get Started</Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <nav className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === cat.name
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-cyber-blue"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-obsidian-800"
                )}
              >
                {cat.icon}
                {cat.name}
              </button>
            ))}
          </nav>

          <hr className="my-6 border-slate-200 dark:border-obsidian-800" />

          <div className="px-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Resources</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm hover:text-blue-600 flex items-center gap-2"><Download className="w-4 h-4" /> SDK Downloads</a></li>
              <li><a href="#" className="text-sm hover:text-blue-600 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Community Forum</a></li>
            </ul>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="mb-10">
            <h2 className="text-3xl font-bold mb-4">{activeCategory}</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
              Welcome to the Stellar Privacy Analytics documentation. Explore our guides and API reference to build secure, privacy-preserving applications.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {featuredGuides.map((guide) => (
              <Card key={guide.title} className="p-6 hover:shadow-xl transition-shadow cursor-pointer dark:bg-obsidian-900 dark:border-obsidian-800">
                <h3 className="text-lg font-bold mb-2 flex items-center justify-between">
                  {guide.title}
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  {guide.description}
                </p>
                <div className="flex gap-2">
                  <span className="text-[10px] px-2 py-1 bg-slate-100 dark:bg-obsidian-800 rounded-full font-mono uppercase">Guide</span>
                  <span className="text-[10px] px-2 py-1 bg-slate-100 dark:bg-obsidian-800 rounded-full font-mono uppercase">Intermadiate</span>
                </div>
              </Card>
            ))}
          </div>

          <article className="prose dark:prose-invert max-w-none">
            <h3>Quick Start Code Example</h3>
            <div className="bg-slate-900 rounded-xl p-6 mb-8 overflow-x-auto">
              <pre className="text-blue-400 font-mono text-sm">
                {`// Initialize the Stellar Privacy SDK
import { PrivacyClient } from '@stellar/privacy-sdk';

const client = new PrivacyClient({
  network: 'testnet',
  apiKey: process.env.STELLAR_PRIVACY_API_KEY
});

// Create a private transaction using ZKP
const tx = await client.createPrivateTransaction({
  from: 'G...',
  to: 'G...',
  amount: '100',
  asset: 'XLM',
  memo: 'Confidential'
});

console.log('Transaction proof generated:', tx.proof);`}
              </pre>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/10 border-l-4 border-blue-600 p-4 rounded-r-lg mb-8">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                <strong>Pro Tip:</strong> Always use environmental variables for your API keys. Never hardcode them in your frontend application.
              </p>
            </div>
          </article>
        </main>
      </div>

      {/* Footer / Feedback */}
      <footer className="bg-white dark:bg-obsidian-900 border-t border-slate-200 dark:border-obsidian-800 py-8">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">
            Was this page helpful? 
            <button className="ml-4 px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">Yes</button>
            <button className="ml-2 px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">No</button>
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-sm text-slate-500 hover:text-blue-600">Privacy Policy</a>
            <a href="#" className="text-sm text-slate-500 hover:text-blue-600">Terms of Service</a>
            <a href="#" className="text-sm text-slate-500 hover:text-blue-600">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DocsPage;
