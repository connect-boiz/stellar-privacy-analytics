import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, User, Key, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';

const stellarPublicKeySchema = z.string().regex(/^G[A-Z0-9]{55}$/, {
  message: 'Invalid Stellar public key. Must start with "G" and be 56 characters long.'
});

const inviteSchema = z.object({
  stellarPublicKey: stellarPublicKeySchema,
  nickname: z.string().min(2, 'Nickname must be at least 2 characters').max(50, 'Nickname too long'),
  message: z.string().optional()
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InvitePartnerFormProps {
  onSubmit: (stellarPublicKey: string, nickname: string, message?: string) => void;
  onCancel: () => void;
}

export const InvitePartnerForm: React.FC<InvitePartnerFormProps> = ({
  onSubmit,
  onCancel
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    mode: 'onChange'
  });

  const handleFormSubmit = async (data: InviteFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data.stellarPublicKey, data.nickname, data.message);
      reset();
    } catch (error) {
      toast.error('Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPublicKey = (value: string) => {
    const formatted = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return formatted;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Invite Partner</h2>
              <p className="text-sm text-gray-500">Add a collaborator to MPC session</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-4">
          {/* Stellar Public Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Key className="w-4 h-4 inline mr-1" />
              Stellar Public Key
            </label>
            <input
              {...register('stellarPublicKey', {
                onChange: (e) => {
                  e.target.value = formatPublicKey(e.target.value);
                }
              })}
              type="text"
              placeholder="G..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
              disabled={isSubmitting}
            />
            {errors.stellarPublicKey && (
              <p className="mt-1 text-sm text-red-600">{errors.stellarPublicKey.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Enter the participant's Stellar public key (starts with "G")
            </p>
          </div>

          {/* Nickname */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4 inline mr-1" />
              Nickname
            </label>
            <input
              {...register('nickname')}
              type="text"
              placeholder="Enter a display name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isSubmitting}
            />
            {errors.nickname && (
              <p className="mt-1 text-sm text-red-600">{errors.nickname.message}</p>
            )}
          </div>

          {/* Optional Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="w-4 h-4 inline mr-1" />
              Message (Optional)
            </label>
            <textarea
              {...register('message')}
              placeholder="Add a personal message to the invitation..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
