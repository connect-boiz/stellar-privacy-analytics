import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  Share2, 
  Link, 
  Mail, 
  Copy, 
  CheckCircle,
  Clock,
  MessageSquare,
  Eye,
  Lock,
  Globe,
  UserPlus
} from 'lucide-react';

interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  avatar?: string;
  lastActive: string;
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  nodeId?: string;
}

export const CollaborationPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'share' | 'comments'>('share');
  const [shareLink, setShareLink] = useState('https://stellar.app/workflow/abc123');
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<'editor' | 'viewer'>('viewer');
  const [newComment, setNewComment] = useState('');

  const collaborators: CollaborationUser[] = [
    {
      id: '1',
      name: 'Alex Chen',
      email: 'alex@company.com',
      role: 'owner',
      lastActive: '2 min ago'
    },
    {
      id: '2', 
      name: 'Sarah Johnson',
      email: 'sarah@company.com',
      role: 'editor',
      lastActive: '1 hour ago'
    },
    {
      id: '3',
      name: 'Mike Davis',
      email: 'mike@company.com', 
      role: 'viewer',
      lastActive: '3 hours ago'
    }
  ];

  const comments: Comment[] = [
    {
      id: '1',
      userId: '2',
      userName: 'Sarah Johnson',
      content: 'Great workflow! I think we should add a data validation step after the privacy filter.',
      timestamp: '2 hours ago',
      nodeId: 'privacy-filter-1'
    },
    {
      id: '2',
      userId: '3',
      userName: 'Mike Davis',
      content: 'The differential privacy epsilon value seems a bit high for this use case.',
      timestamp: '4 hours ago',
      nodeId: 'differential-privacy-1'
    }
  ];

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const sendInvite = () => {
    if (!inviteEmail) return;
    // In real implementation, this would send an invite
    console.log('Inviting:', inviteEmail, 'as', selectedRole);
    setInviteEmail('');
  };

  const addComment = () => {
    if (!newComment.trim()) return;
    // In real implementation, this would add the comment
    console.log('Adding comment:', newComment);
    setNewComment('');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Lock className="h-4 w-4 text-purple-500" />;
      case 'editor':
        return <Users className="h-4 w-4 text-blue-500" />;
      case 'viewer':
        return <Eye className="h-4 w-4 text-gray-500" />;
      default:
        return <Users className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-700';
      case 'editor':
        return 'bg-blue-100 text-blue-700';
      case 'viewer':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900">Collaboration</h3>
        <p className="text-sm text-gray-600 mt-1">Share and work together on this workflow</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('share')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'share'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </div>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center">
              <Users className="h-4 w-4 mr-2" />
              Users ({collaborators.length})
            </div>
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'comments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center justify-center">
              <MessageSquare className="h-4 w-4 mr-2" />
              Comments ({comments.length})
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'share' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Share Link
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
                <button
                  onClick={copyShareLink}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {linkCopied ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invite by Email
              </label>
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as 'editor' | 'viewer')}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="viewer">Can view</option>
                    <option value="editor">Can edit</option>
                  </select>
                  <button
                    onClick={sendInvite}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Mail className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-start">
                <Globe className="h-5 w-5 text-blue-500 mt-0.5" />
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-blue-900">Sharing Permissions</h4>
                  <ul className="mt-2 text-sm text-blue-700 space-y-1">
                    <li>• <strong>Viewers:</strong> Can view and comment</li>
                    <li>• <strong>Editors:</strong> Can edit and share</li>
                    <li>• <strong>Owner:</strong> Full control and permissions</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-3">
            {collaborators.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <Users className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">{user.name}</span>
                      {getRoleIcon(user.role)}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${getRoleBadgeColor(user.role)}`}>
                    {user.role}
                  </span>
                  <div className="text-xs text-gray-500 mt-1 flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {user.lastActive}
                  </div>
                </div>
              </motion.div>
            ))}

            <button className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors">
              <UserPlus className="h-5 w-5 mx-auto mb-1" />
              <span className="text-sm">Add Collaborator</span>
            </button>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {comments.map((comment) => (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <Users className="h-4 w-4 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{comment.userName}</span>
                        <span className="text-xs text-gray-500">{comment.timestamp}</span>
                      </div>
                      {comment.nodeId && (
                        <div className="text-xs text-blue-600 mt-1">
                          On node: {comment.nodeId}
                        </div>
                      )}
                      <p className="text-sm text-gray-700 mt-2">{comment.content}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addComment()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={addComment}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <MessageSquare className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
