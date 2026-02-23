import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BookOpen, AlertCircle, ArrowRight, Save, CheckCircle, RefreshCcw, MessageSquare, ThumbsDown, ThumbsUp, Circle, Clock } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import type { Conversation, Message, ContentBlock } from '../types';

interface GoldenKnowledge {
    _id?: string;
    question: string;
    answer: string;
    tags: string[];
}

// Helper to extract text from message content
const getMessageText = (content?: string | ContentBlock[]): string => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return content
        .filter(block => block.type === 'text' || block.type === 'think')
        .map(block => block.text || block.think || '')
        .join('\n');
};

export const KnowledgeCuration: React.FC = () => {
    const [filter, setFilter] = useState<'all' | 'thumbsUp' | 'thumbsDown' | 'unanswered'>('all');
    const { conversations, loading: loadingConversations, page, totalPages, setPage, refresh } = useConversations(20, filter);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [goldenKnowledge, setGoldenKnowledge] = useState<GoldenKnowledge[]>([]);

    // Editor State
    const [editorQuestion, setEditorQuestion] = useState('');
    const [editorAnswer, setEditorAnswer] = useState('');
    const [editorTags, setEditorTags] = useState('');
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchGoldenKnowledge();
    }, []);

    const fetchGoldenKnowledge = async () => {
        try {
            const res = await axios.get('/admin/knowledge');
            setGoldenKnowledge(res.data);
        } catch (err) {
            console.error("Failed to fetch knowledge", err);
        }
    };

    const handleSelectMessage = (msg: Message) => {
        setSelectedMessage(msg);
        setEditorQuestion(msg.text || '');
        setEditorAnswer(getMessageText(msg.content));
        setEditorTags('curated, feedback-fix');
        setMessage(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            await axios.post('/admin/knowledge', {
                question: editorQuestion,
                answer: editorAnswer,
                tags: editorTags.split(',').map(t => t.trim()).filter(Boolean),
                sourceMessageId: selectedMessage?.messageId
            });

            setMessage({ type: 'success', text: 'Saved to Golden Knowledge Base!' });
            setEditorQuestion('');
            setEditorAnswer('');
            setEditorTags('');
            setSelectedMessage(null);
            fetchGoldenKnowledge();
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to save knowledge.' });
        } finally {
            setSaving(false);
        }
    };

    const handleSyncToRAG = async () => {
        setSyncing(true);
        setMessage(null);
        try {
            const res = await axios.post('/admin/knowledge/sync');
            setMessage({ type: 'success', text: res.data.message || 'Synced to RAG DB!' });
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to sync to RAG DB.' });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
            {/* 1. Conversation Sidebar */}
            <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-brand-card flex flex-col transition-colors">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-brand-surface/20">
                    <h2 className="font-semibold text-sm flex items-center gap-2 mb-4">
                        <MessageSquare className="w-4 h-4 text-brand-primary" />
                        Feedback Inbox
                    </h2>

                    {/* Filter Tabs */}
                    <div className="flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-brand-surface rounded-lg">
                        {[
                            { id: 'all', label: 'All', icon: MessageSquare },
                            { id: 'thumbsUp', label: 'Positive', icon: ThumbsUp, color: 'text-green-500' },
                            { id: 'thumbsDown', label: 'Negative', icon: ThumbsDown, color: 'text-red-500' },
                            { id: 'unanswered', label: 'Unanswered', icon: AlertCircle, color: 'text-orange-500' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setFilter(tab.id as any);
                                    setPage(1);
                                    setSelectedConvId(null);
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
                                            <ThumbsDown size={10} /> Needs Fix
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
                            {/* Override ConversationDetail to allow selecting messages for curation */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <ConversationDetailProxy
                                    conversationId={selectedConvId}
                                    onSelectMessage={handleSelectMessage}
                                    selectedMessageId={selectedMessage?.messageId}
                                    onRefresh={refresh}
                                />
                            </div>
                        </div>

                        {/* 3. Curator Column */}
                        <div className="w-96 flex flex-col p-6 space-y-6 overflow-y-auto">
                            <div className="bg-white dark:bg-brand-card p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm shadow-brand-primary/5">
                                <h3 className="font-bold mb-4 flex items-center gap-2">
                                    <Save className="w-4 h-4 text-brand-primary" />
                                    Curator Editor
                                </h3>

                                {selectedMessage ? (
                                    <form onSubmit={handleSave} className="space-y-4">
                                        <div className="text-[10px] uppercase font-bold text-gray-400">Context Source</div>
                                        <div className="p-3 bg-gray-50 dark:bg-brand-surface rounded text-xs border border-gray-100 dark:border-gray-700 italic">
                                            "{selectedMessage.text?.length || 0 > 100 ? selectedMessage.text?.substring(0, 100) + '...' : selectedMessage.text}"
                                        </div>

                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Standardized Question</label>
                                            <input
                                                className="w-full px-3 py-2 border rounded-md dark:bg-brand-surface dark:border-gray-600 text-sm"
                                                value={editorQuestion}
                                                onChange={e => setEditorQuestion(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Golden Answer</label>
                                            <textarea
                                                className="w-full px-3 py-2 border rounded-md dark:bg-brand-surface dark:border-gray-600 h-32 text-sm"
                                                value={editorAnswer}
                                                onChange={e => setEditorAnswer(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Tags</label>
                                            <input
                                                className="w-full px-3 py-2 border rounded-md dark:bg-brand-surface dark:border-gray-600 text-sm"
                                                value={editorTags}
                                                onChange={e => setEditorTags(e.target.value)}
                                            />
                                        </div>

                                        <div className="flex flex-col gap-3 pt-2">
                                            {message && (
                                                <div className={clsx("text-xs p-2 rounded", message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
                                                    {message.text}
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setSelectedMessage(null)} className="flex-1 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                                                <button type="submit" disabled={saving} className="flex-1 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/20">{saving ? 'Saving...' : 'Save Entry'}</button>
                                            </div>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400 space-y-3">
                                        <AlertCircle className="w-10 h-10 opacity-20" />
                                        <p className="text-sm">Select a message with feedback to begin curation.</p>
                                    </div>
                                )}
                            </div>

                            {/* RAG DB Sync Card */}
                            <div className="bg-white dark:bg-brand-card p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                <h3 className="font-bold mb-2 flex items-center gap-2">
                                    <RefreshCcw className="w-4 h-4 text-purple-500" />
                                    Pipeline Control
                                </h3>
                                <p className="text-xs text-gray-500 mb-4">Sync verified golden knowledge to the search-optimized RAG database.</p>
                                <button
                                    onClick={handleSyncToRAG}
                                    disabled={syncing || goldenKnowledge.length === 0}
                                    className="w-full py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium shadow-lg shadow-purple-500/20"
                                >
                                    <RefreshCcw className={clsx("w-4 h-4", syncing && "animate-spin")} />
                                    {syncing ? 'Syncing...' : 'Sync to RAG DB'}
                                </button>
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

// Helper component to wrap ConversationDetail and add click handlers to message bubbles
const ConversationDetailProxy: React.FC<{
    conversationId: string;
    onSelectMessage: (msg: Message) => void;
    selectedMessageId?: string;
    onRefresh: () => void;
}> = ({ conversationId, onSelectMessage, selectedMessageId, onRefresh }) => {
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

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {conversation.messages.map((msg) => (
                    <div
                        key={msg.messageId}
                        onClick={() => msg.feedback ? onSelectMessage(msg) : null}
                        className={clsx(
                            "rounded-lg transition-all",
                            msg.feedback && "cursor-pointer ring-1 ring-red-200 dark:ring-red-900/30 hover:ring-brand-primary hover:shadow-lg",
                            selectedMessageId === msg.messageId && "ring-2 ring-brand-primary bg-brand-primary/5"
                        )}
                    >
                        <div className={clsx(
                            "p-4 rounded-lg",
                            msg.sender === 'User' ? "bg-gray-100 dark:bg-brand-surface ml-8" : "bg-white dark:bg-brand-card mr-8 border border-gray-100 dark:border-gray-800"
                        )}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{msg.sender}</span>
                                {msg.model && <span className="text-[10px] text-gray-500 bg-gray-200 dark:bg-gray-800 px-1 rounded">{msg.model}</span>}
                            </div>
                            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{getMessageText(msg.content) || msg.text}</div>
                            {msg.feedback && (
                                <div className={clsx(
                                    "mt-3 p-2 rounded-md text-[11px] flex items-center justify-between",
                                    msg.feedback.rating === 'thumbsDown' ? "bg-red-50 text-red-700 dark:bg-red-900/20" : "bg-green-50 text-green-700 dark:bg-green-900/20"
                                )}>
                                    <div className="flex items-center gap-2">
                                        {msg.feedback.rating === 'thumbsDown' ? <ThumbsDown size={12} /> : <ThumbsUp size={12} />}
                                        <span>{msg.feedback.text || (msg.feedback.rating === 'thumbsDown' ? "Issue reported" : "Helpful")}</span>
                                    </div>
                                    <span className="font-bold flex items-center gap-1 uppercase tracking-tighter">
                                        <ArrowRight size={10} /> Curate
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
