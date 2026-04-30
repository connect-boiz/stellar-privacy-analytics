import React, { useState } from 'react';
import { Tooltip } from './enhanced-tooltip';
import { Button } from './button';
import { Card } from './card';
import { Info, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

const TooltipDemo: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Tooltip Component Demo</h1>
        <p className="text-gray-600">
          Testing responsive tooltips with various positioning and accessibility features
        </p>
        <div className="mt-2 text-sm text-gray-500">
          Current viewport: {isMobile ? 'Mobile' : 'Desktop'} ({window.innerWidth}px)
        </div>
      </div>

      {/* Basic Tooltips */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Basic Tooltips</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Tooltip content="This is a default tooltip" side="top">
            <Button variant="outline" className="w-full">Top Tooltip</Button>
          </Tooltip>
          
          <Tooltip content="Right side tooltip with longer content" side="right">
            <Button variant="outline" className="w-full">Right Tooltip</Button>
          </Tooltip>
          
          <Tooltip content="Bottom side tooltip" side="bottom">
            <Button variant="outline" className="w-full">Bottom Tooltip</Button>
          </Tooltip>
          
          <Tooltip content="Left side tooltip" side="left">
            <Button variant="outline" className="w-full">Left Tooltip</Button>
          </Tooltip>
        </div>
      </Card>

      {/* Variant Tooltips */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Tooltip Variants</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Tooltip content="Default information tooltip" variant="default">
            <Button variant="outline" className="w-full">Default</Button>
          </Tooltip>
          
          <Tooltip content="Information message" variant="info">
            <Button variant="outline" className="w-full flex items-center gap-2">
              <Info className="w-4 h-4" />
              Info
            </Button>
          </Tooltip>
          
          <Tooltip content="Warning message" variant="warning">
            <Button variant="outline" className="w-full flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Warning
            </Button>
          </Tooltip>
          
          <Tooltip content="Error occurred" variant="error">
            <Button variant="outline" className="w-full flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Error
            </Button>
          </Tooltip>
        </div>
      </Card>

      {/* Long Content Tooltips */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Long Content Handling</h2>
        <div className="space-y-4">
          <Tooltip 
            content="This is a very long tooltip content that should be truncated properly and handled gracefully on smaller screens. It demonstrates the text truncation and overflow handling features."
            maxLines={2}
            maxWidth={250}
          >
            <Button variant="outline">Truncated Tooltip (2 lines)</Button>
          </Tooltip>
          
          <Tooltip 
            content="This tooltip has no truncation and should show all content even if it's very long and might overflow the screen boundaries. The positioning system should handle this automatically."
            truncate={false}
            maxWidth={400}
          >
            <Button variant="outline">Full Content Tooltip</Button>
          </Tooltip>
        </div>
      </Card>

      {/* Form Field Tooltips */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Form Field Integration</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Email Address</label>
            <div className="relative">
              <Tooltip 
                content="Enter your work email address. We'll use this for account verification and notifications."
                side="right"
                align="start"
              >
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="pr-10"
                />
              </Tooltip>
              <HelpCircle className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <Tooltip 
              content="Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters."
              variant="info"
              side="top"
              maxWidth={300}
            >
              <Input
                type="password"
                placeholder="Enter your password"
              />
            </Tooltip>
          </div>
        </div>
      </Card>

      {/* Accessibility Features */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Accessibility Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Tooltip 
            content="This tooltip is keyboard accessible. Try tabbing to this button and pressing Enter or Space."
            ariaLabel="Keyboard accessible tooltip"
            keyboardAccessible={true}
          >
            <Button variant="outline">Keyboard Accessible</Button>
          </Tooltip>
          
          <Tooltip 
            content="This tooltip shows on focus and has proper ARIA attributes for screen readers."
            showOnFocus={true}
            ariaLabel="Screen reader friendly tooltip"
          >
            <Button variant="outline">Screen Reader Friendly</Button>
          </Tooltip>
        </div>
        
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
          <h3 className="font-medium mb-2">Accessibility Instructions:</h3>
          <ul className="text-sm space-y-1 text-gray-600">
            <li>• Use Tab key to navigate to tooltip triggers</li>
            <li>• Press Enter or Space to activate tooltips</li>
            <li>• Press Escape to close open tooltips</li>
            <li>• Screen readers will announce tooltip content</li>
          </ul>
        </div>
      </Card>

      {/* Performance Testing */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Performance Testing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Tooltip 
            content="This tooltip has animations enabled for smooth transitions."
            disableAnimations={false}
          >
            <Button variant="outline">With Animations</Button>
          </Tooltip>
          
          <Tooltip 
            content="This tooltip has animations disabled for better performance."
            disableAnimations={true}
          >
            <Button variant="outline">Without Animations</Button>
          </Tooltip>
        </div>
      </Card>

      {/* Edge Cases */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Edge Cases</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Tooltip 
            content="This tooltip should automatically flip position if there's not enough space."
            side="top"
          >
            <Button variant="outline">Auto-flip Tooltip</Button>
          </Tooltip>
          
          <Tooltip 
            content="This tooltip is disabled and should not appear."
            disabled={true}
          >
            <Button variant="outline" disabled>Disabled Tooltip</Button>
          </Tooltip>
        </div>
      </Card>
    </div>
  );
};

export default TooltipDemo;
