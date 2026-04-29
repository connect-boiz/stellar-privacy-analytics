import React from 'react';
import { Tooltip } from '../components/ui/enhanced-tooltip';
import { Button } from '../components/ui/button';

const TooltipTestPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Tooltip Positioning Test</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Test various tooltip positions */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Position Tests</h2>
            <div className="space-y-4">
              <Tooltip content="Top tooltip content" side="top">
                <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                  Top Tooltip
                </button>
              </Tooltip>
              
              <Tooltip content="Right tooltip content" side="right">
                <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
                  Right Tooltip
                </button>
              </Tooltip>
              
              <Tooltip content="Bottom tooltip content" side="bottom">
                <button className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">
                  Bottom Tooltip
                </button>
              </Tooltip>
              
              <Tooltip content="Left tooltip content" side="left">
                <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                  Left Tooltip
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Test tooltip variants */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Variant Tests</h2>
            <div className="space-y-4">
              <Tooltip content="Default tooltip" variant="default">
                <button className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                  Default
                </button>
              </Tooltip>
              
              <Tooltip content="Info tooltip" variant="info">
                <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                  Info
                </button>
              </Tooltip>
              
              <Tooltip content="Warning tooltip" variant="warning">
                <button className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">
                  Warning
                </button>
              </Tooltip>
              
              <Tooltip content="Error tooltip" variant="error">
                <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                  Error
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Test long content */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Long Content Tests</h2>
            <div className="space-y-4">
              <Tooltip 
                content="This is a very long tooltip content that should be truncated properly to avoid overflow issues on small screens."
                maxLines={2}
                maxWidth={200}
              >
                <button className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">
                  Truncated
                </button>
              </Tooltip>
              
              <Tooltip 
                content="This tooltip has no truncation and should show all content even if it's very long."
                truncate={false}
                maxWidth={300}
              >
                <button className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600">
                  Full Content
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Test accessibility */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Accessibility Tests</h2>
            <div className="space-y-4">
              <Tooltip 
                content="Keyboard accessible tooltip. Try tabbing to this button and pressing Enter."
                ariaLabel="Keyboard accessible tooltip"
                keyboardAccessible={true}
              >
                <button className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600">
                  Keyboard Accessible
                </button>
              </Tooltip>
              
              <Tooltip 
                content="Screen reader friendly tooltip with proper ARIA attributes."
                showOnFocus={true}
                ariaLabel="Screen reader friendly tooltip"
              >
                <button className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600">
                  Screen Reader Friendly
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Test performance */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Performance Tests</h2>
            <div className="space-y-4">
              <Tooltip 
                content="Tooltip with animations enabled"
                disableAnimations={false}
              >
                <button className="px-4 py-2 bg-pink-500 text-white rounded hover:bg-pink-600">
                  With Animations
                </button>
              </Tooltip>
              
              <Tooltip 
                content="Tooltip with animations disabled for better performance"
                disableAnimations={true}
              >
                <button className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                  Without Animations
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Test edge cases */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Edge Cases</h2>
            <div className="space-y-4">
              <Tooltip 
                content="This tooltip should automatically flip position if there's not enough space."
                side="top"
              >
                <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                  Auto-flip Tooltip
                </button>
              </Tooltip>
              
              <Tooltip 
                content="This tooltip is disabled and should not appear."
                disabled={true}
              >
                <button className="px-4 py-2 bg-gray-300 text-gray-600 rounded cursor-not-allowed" disabled>
                  Disabled Tooltip
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-white rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Mobile Testing Instructions</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <p>• Test on different screen sizes by resizing the browser window</p>
            <p>• On mobile devices, tooltips should stay open on touch</p>
            <p>• Tooltips should automatically flip position when near screen edges</p>
            <p>• Long content should be truncated to prevent overflow</p>
            <p>• Use Tab key to test keyboard accessibility</p>
            <p>• Test with screen readers for accessibility compliance</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TooltipTestPage;
