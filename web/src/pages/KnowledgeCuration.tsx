import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageBubble } from '../components/MessageBubble';
import { BookOpen, AlertCircle, CheckCircle, MessageSquare, ThumbsDown, ThumbsUp, Circle, Clock, Search, X } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import type { Conversation } from '../types';

export const KnowledgeCuration: React.FC = () => {
    const [filter, setFilter] = useState<'all' | 'thumbsUp' | 'thumbsDown' | 'autoAnswered'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset to page 1 on search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { conversations, loading: loadingConversations, page, totalPages, setPage, refresh } = useConversations(20, filter, debouncedSearch);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

    useEffect(() => {
        // 1-minute auto-refresh
        const interval = setInterval(() => {
            refresh();
        }, 60000);

        return () => clearInterval(interval);
    }, [refresh]);

    return (
        <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
            {/* 1. Conversation Sidebar */}
            <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-brand-card flex flex-col transition-colors">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-brand-surface/20">
                    <h2 className="font-semibold text-sm flex items-center gap-2 mb-4">
                        <MessageSquare className="w-4 h-4 text-brand-primary" />
                        Feedback Inbox
                    </h2>

                    {/* Search Bar */}
                    <div className="relative mb-4 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-brand-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search questions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-brand-surface border-transparent focus:border-brand-primary focus:bg-white dark:focus:bg-brand-card focus:ring-1 focus:ring-brand-primary rounded-lg text-xs transition-all outline-none"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-3 h-3 text-gray-400" />
                            </button>
                        )}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-brand-surface rounded-lg">
                        {[
                            { id: 'all', label: 'All', icon: MessageSquare },
                            { id: 'thumbsUp', label: 'Helpful', icon: ThumbsUp, color: 'text-green-500' },
                            { id: 'thumbsDown', label: 'Needs Improvement', icon: ThumbsDown, color: 'text-red-500' },
                            { id: 'autoAnswered', label: 'Auto-Answered', icon: CheckCircle, color: 'text-blue-500' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setFilter(tab.id as any);
                                    setPage(1);
                                    setSelectedConvId(null);
                                    setSearchTerm(''); // Reset search on filter change
                                }}
                                className={clsx(
                                    "flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-md transition-all text-[10px] font-medium border",
                                    filter === tab.id
                                        ? "bg-white dark:bg-brand-card shadow-sm border-gray-200 dark:border-gray-700 text-brand-primary"
                                        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                )}
                            >
                                <tab.icon className={clsx("w-3.5 h-3.5 mb-1", tab.color && filter === tab.id ? tab.color : "")} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loadingConversations ? (
                        <div className="p-8 text-center animate-pulse text-gray-400">Loading inbox...</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <Circle className="w-8 h-8 mb-2 mx-auto opacity-20" />
                            <p className="text-sm">No items found</p>
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <div
                                key={conv.conversationId}
                                onClick={() => setSelectedConvId(conv.conversationId)}
                                className={clsx(
                                    "p-4 border-b border-gray-100 dark:border-gray-700/50 cursor-pointer transition-colors",
                                    selectedConvId === conv.conversationId ? "bg-brand-primary/5 border-l-4 border-l-brand-primary" : "hover:bg-gray-50 dark:hover:bg-brand-surface/30"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className={clsx(
                                        "font-medium text-sm truncate pr-2",
                                        selectedConvId === conv.conversationId ? "text-brand-primary" : "text-gray-900 dark:text-gray-100"
                                    )}>
                                        {conv.title || "Untitled Conversation"}
                                    </h3>
                                    {conv.resolved && <CheckCircle size={14} className="text-green-500" />}
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-gray-500 mt-1">
                                    <span>{conv.messages.length} messages</span>
                                    <span>{format(new Date(conv.latestFeedbackDate || conv.updatedAt), 'MMM d, h:mm a')}</span>
                                </div>
                                {/* Feedback Markers */}
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {conv.messages.some(m => m.feedback?.rating === 'thumbsDown') && (
                                        <div className="inline-flex items-center gap-1 text-[9px] text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30">
                                            <ThumbsDown size={10} /> Needs Improvement
                                        </div>
                                    )}
                                    {conv.messages.some(m => m.feedback?.tag === 'not_matched') && (
                                        <div className="inline-flex items-center gap-1 text-[9px] text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded border border-orange-100 dark:border-orange-900/30">
                                            <AlertCircle size={10} /> Unmatched
                                        </div>
                                    )}
                                    {conv.messages.some(m => m.feedback?.rating === 'thumbsUp') && (
                                        <div className="inline-flex items-center gap-1 text-[9px] text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded border border-green-100 dark:border-green-900/30">
                                            <ThumbsUp size={10} /> Helpful
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                {/* Pagination */}
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-[10px] bg-gray-50/50 dark:bg-brand-surface/20">
                    <button onClick={() => setPage(page - 1)} disabled={page === 1} className="hover:text-brand-primary disabled:opacity-30">Prev</button>
                    <span>Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="hover:text-brand-primary disabled:opacity-30">Next</button>
                </div>
            </div>

            {/* 2. Conversation Detail & Curate Action */}
            <div className="flex-1 flex flex-col bg-gray-50 dark:bg-brand-dark overflow-hidden">
                {selectedConvId ? (
                    <div className="flex h-full">
                        <div className="flex-1 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-brand-card overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <ConversationDetailProxy
                                    conversationId={selectedConvId}
                                    onRefresh={refresh}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12 text-center">
                        <BookOpen className="w-16 h-16 mb-4 opacity-10" />
                        <h2 className="text-xl font-bold text-gray-600 dark:text-gray-400">Knowledge Curation Module</h2>
                        <p className="max-w-md mt-2">Select a conversation from the sidebar to review messages and promote corrections to the Golden DB.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper component to wrap ConversationDetail
const ConversationDetailProxy: React.FC<{
    conversationId: string;
    onRefresh: () => void;
}> = ({ conversationId, onRefresh }) => {
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchConv = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`/feedback-conversations/${conversationId}`);
                setConversation(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchConv();
    }, [conversationId]);

    const toggleResolved = async () => {
        if (!conversation) return;
        const newStatus = !conversation.resolved;

        // Optimistic update
        setConversation(prev => prev ? { ...prev, resolved: newStatus } : null);

        try {
            await axios.patch(`/feedback-conversations/${conversation.conversationId}/resolved`, {
                resolved: newStatus
            });
            onRefresh();
        } catch (err) {
            console.error(err);
            setConversation(prev => prev ? { ...prev, resolved: !newStatus } : null);
            alert('Failed to update resolution status');
        }
    };

    if (loading) return <div className="animate-pulse text-gray-400 text-center py-8">Loading messages...</div>;
    if (!conversation) return <div className="text-center py-8">Conversation not found.</div>;

    return (
        <div className="flex flex-col h-full">
            {/* Header with Resolved Toggle */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-brand-card flex justify-between items-start transition-colors">
                <div>
                    <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                        {conversation.title || 'Untitled Conversation'}
                    </h1>
                    <div className="flex items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {format(new Date(conversation.createdAt), 'MMM d, yyyy h:mm a')}
                        </span>
                        <span className="flex items-center gap-1">
                            <MessageSquare size={12} />
                            {conversation.messages.length} messages
                        </span>
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleResolved();
                    }}
                    className={clsx(
                        "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-medium transition-colors border",
                        conversation.resolved
                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/30"
                            : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-brand-surface dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-brand-surface/80"
                    )}
                >
                    {conversation.resolved ? (
                        <>
                            <CheckCircle size={14} />
                            Resolved
                        </>
                    ) : (
                        <>
                            <Circle size={14} />
                            Mark Resolved
                        </>
                    )}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {conversation.messages.map((msg) => (
                    <div key={msg.messageId} className="rounded-lg transition-all">
                        <MessageBubble message={msg} />
                    </div>
                ))}
            </div>
        </div>
    );
};
