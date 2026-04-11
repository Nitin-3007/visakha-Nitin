import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, Plus, UserPlus, Shield, ShieldAlert, Eye, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface TeamMember {
    _id: string;
    email: string;
    role: 'moderator' | 'super_admin' | 'viewer' | 'revoked';
    addedBy?: string;
    createdAt: string;
}

export const TeamManagement: React.FC = () => {
    const { user, isSuperAdmin } = useAuth();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<'moderator' | 'super_admin' | 'viewer'>('viewer');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchMembers();
    }, []);

    const fetchMembers = async () => {
        try {
            const response = await axios.get('/admin/moderators');
            console.log('Team data received:', response.data);

            if (Array.isArray(response.data)) {
                setMembers(response.data);
            } else {
                console.error('Expected array but got:', typeof response.data, response.data);
                setError('Invalid data received from server');
                // If it's HTML, it's the catch-all route issue again
                if (typeof response.data === 'string' && response.data.trim().startsWith('<')) {
                    setError('Server returned HTML. API route might be missing or shadowed.');
                }
            }
            setLoading(false);
        } catch (err: any) {
            console.error('Fetch error details:', err.response || err);
            setError(err.response?.data?.error || 'Failed to load team members');
            setLoading(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail) return;

        try {
            await axios.post('/admin/moderators', { email: newEmail, role: newRole });
            setNewEmail('');
            setNewRole('viewer'); // Reset to default
            fetchMembers();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to add member');
        }
    };

    const handleRemoveMember = async (email: string) => {
        if (email === user?.email) {
            alert("You cannot remove your own account.");
            return;
        }

        if (!confirm(`Are you sure you want to remove ${email}?`)) return;

        try {
            await axios.delete('/admin/moderators', { data: { email } });
            fetchMembers();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to remove member');
        }
    };

    const handleRevokeAccess = async (email: string) => {
        if (email === user?.email) {
            alert("You cannot revoke your own account.");
            return;
        }

        if (!confirm(`Are you sure you want to revoke access for ${email}?`)) return;

        try {
            await axios.patch('/admin/moderators/revoke', { email });
            fetchMembers();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to revoke access');
        }
    };

    if (loading) return <div className="p-8">Loading team data...</div>;

    return (
        <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <UserPlus className="w-6 h-6" />
                Team Management
            </h1>

            {isSuperAdmin && (
                <div className="bg-white dark:bg-brand-card rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8 transition-colors">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Add Team Member</h2>
                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-4">
                    <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Enter email address"
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-brand-primary focus:border-transparent bg-white dark:bg-brand-surface text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                        required
                    />
                    <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as 'moderator' | 'super_admin' | 'viewer')}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-brand-primary focus:border-transparent bg-white dark:bg-brand-surface text-gray-900 dark:text-gray-100"
                    >
                        <option value="viewer">Viewer</option>
                        <option value="moderator">Moderator</option>
                        <option value="super_admin">Super Admin</option>
                    </select>
                    <button
                        type="submit"
                        className="px-6 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-primary/90 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" />
                        Add Member
                    </button>
                </form>
                {error && <p className="text-red-600 dark:text-red-400 mt-2 text-sm">{error}</p>}
                </div>
            )}

            <div className="bg-white dark:bg-brand-card rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors flex-1 flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-brand-surface/50">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Current Team Members</h2>
                </div>

                <div className="overflow-auto flex-1">
                    {members.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            No members found.
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="sticky top-0 bg-gray-50 dark:bg-brand-surface/90 backdrop-blur-sm z-10">
                                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    <th className="px-6 py-3">Email</th>
                                    <th className="px-6 py-3">Role</th>
                                    <th className="px-6 py-3">Added By</th>
                                    <th className="px-6 py-3">Date Added</th>
                                    {isSuperAdmin && <th className="px-6 py-3 text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {members.map((member) => (
                                    <tr key={member._id} className="hover:bg-gray-50 dark:hover:bg-brand-surface/30 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {member.email}
                                            {member.email === user?.email && (
                                                <span className="ml-2 text-xs text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full">You</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold gap-1
                                                ${member.role === 'super_admin'
                                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                                                    : member.role === 'moderator' 
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                                                    : member.role === 'revoked'
                                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                                                }`}
                                            >
                                                {member.role === 'super_admin' ? <ShieldAlert size={12} /> : member.role === 'moderator' ? <Shield size={12} /> : member.role === 'revoked' ? <UserX size={12} /> : <Eye size={12} />}
                                                {member.role === 'super_admin' ? 'Super Admin' : member.role === 'moderator' ? 'Moderator' : member.role === 'revoked' ? 'Revoked' : 'Viewer'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{member.addedBy || 'System'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(member.createdAt).toLocaleDateString()}
                                        </td>
                                        {isSuperAdmin && (
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 items-center">
                                                    {member.role !== 'revoked' && (
                                                        <button
                                                            onClick={() => handleRevokeAccess(member.email)}
                                                            disabled={member.email === user?.email}
                                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${member.email === user?.email
                                                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                                                : 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-400'
                                                                }`}
                                                            title={member.email === user?.email ? "You cannot revoke yourself" : "Revoke Access"}
                                                        >
                                                            <UserX className="w-4 h-4" />
                                                            Revoke
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleRemoveMember(member.email)}
                                                        disabled={member.email === user?.email}
                                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${member.email === user?.email
                                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                                            : 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400'
                                                            }`}
                                                        title={member.email === user?.email ? "You cannot remove yourself" : "Delete Member"}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
