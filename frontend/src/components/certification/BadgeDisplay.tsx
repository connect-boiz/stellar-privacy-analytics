import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { X, Download, Share2, Eye, Settings, Award } from 'lucide-react';
import { Certification } from '../../services/certificationService';

interface BadgeDisplayProps {
  certification: Certification;
  onClose: () => void;
}

const BadgeDisplay: React.FC<BadgeDisplayProps> = ({
  certification,
  onClose
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'svg' | 'png' | 'pdf'>('png');
  const [badgeStyle, setBadgeStyle] = useState<'shield' | 'round' | 'square'>('shield');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Mock download
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success(`Badge downloaded as ${selectedFormat.toUpperCase()}`);
    } catch (error) {
      toast.error('Failed to download badge');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      if (certification.publicVerificationUrl) {
        await navigator.clipboard.writeText(certification.publicVerificationUrl);
        toast.success('Verification link copied to clipboard');
      }
    } catch (error) {
      toast.error('Failed to copy verification link');
    }
  };

  const badgePreview = (
    <div className={`w-32 h-32 flex items-center justify-center ${
      badgeStyle === 'shield' ? 'rounded-lg' :
      badgeStyle === 'round' ? 'rounded-full' :
      'rounded'
    } bg-gradient-to-br from-blue-500 to-blue-600 text-white`}>
      <div className="text-center">
        <Award className="w-8 h-8 mx-auto mb-1" />
        <div className="text-xs font-bold">{certification.certificationType}</div>
        <div className="text-xs">CERTIFIED</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Badge Display & Sharing</h2>
            <p className="text-gray-600 mt-1">
              Customize and share your certification badge
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Badge Preview */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Preview</h3>
            <div className="bg-gray-50 p-6 rounded-lg flex items-center justify-center">
              {badgePreview}
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">Verification Code:</p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                {certification.verificationCode}
              </code>
            </div>
          </div>

          {/* Customization Options */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Customization</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Badge Style
                </label>
                <div className="flex gap-2">
                  {[
                    { value: 'shield', label: 'Shield' },
                    { value: 'round', label: 'Round' },
                    { value: 'square', label: 'Square' }
                  ].map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setBadgeStyle(style.value as any)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        badgeStyle === style.value
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Download Format
                </label>
                <div className="flex gap-2">
                  {[
                    { value: 'svg', label: 'SVG' },
                    { value: 'png', label: 'PNG' },
                    { value: 'pdf', label: 'PDF' }
                  ].map((format) => (
                    <button
                      key={format.value}
                      onClick={() => setSelectedFormat(format.value as any)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedFormat === format.value
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {format.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Include Verification Link
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">
                    Add verification link to badge
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Sharing Options */}
        <div className="mt-6 pt-6 border-t">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Sharing Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Direct Link</h4>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={certification.publicVerificationUrl || ''}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                />
                <button
                  onClick={handleShare}
                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Embed Code</h4>
              <textarea
                value={`<a href="${certification.publicVerificationUrl}" target="_blank"><img src="/api/badges/${certification.id}.svg" alt="${certification.certificationType} Certified" /></a>`}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-mono"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download Badge
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default BadgeDisplay;
