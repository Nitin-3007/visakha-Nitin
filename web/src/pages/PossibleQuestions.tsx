import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileQuestion, AlertCircle, CheckCircle, Clock, Copy } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';

interface QuestionInstance {
    conversationId: string;
    userMessageId: string;
    createdAt: string;
}

interface PossibleQuestion {
    _id: string; // The lowercased text
    count: number;
    originalText: string;
    latestDate: string;
    instances: QuestionInstance[];
}

export const PossibleQuestions: React.FC = () => {
    const [questions, setQuestions] = useState<PossibleQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedQuestion, setSelectedQuestion] = useState<PossibleQuestion | null>(null);

    // Form state
    const [framedText, setFramedText] = useState('');
    const [answerText, setAnswerText] = useState('');
    const [tagsText, setTagsText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchQuestions = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/admin/possible-questions?page=${page}&limit=20`);
            setQuestions(res.data.data || []);
            setTotalPages(res.data.totalPages || 1);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQuestions();
        // 1-minute auto-refresh
        const interval = setInterval(fetchQuestions, 60000);
        return () => clearInterval(interval);
    }, [page]);

    const handleSelect = (q: PossibleQuestion) => {
        setSelectedQuestion(q);
        setFramedText(q.originalText);
        setAnswerText(''); // Reset form
        setTagsText('');
    };

    const handlePromote = async () => {
        if (!selectedQuestion) return;
        if (!framedText.trim() || !answerText.trim()) {
            alert('Question and Answer are required.');
            return;
        }

        setSubmitting(true);
        try {
            // 1. Add to Golden DB
            await axios.post('/admin/knowledge', {
                question: framedText,
                answer: answerText,
                tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
            });

            // 2. Mark all those conversations as resolved so they disappear from here
            // We use Promise.allSettled to not fail entirely if one conversation fails
            const resolvePromises = selectedQuestion.instances.map(inst =>
                axios.patch(`/feedback-conversations/${inst.conversationId}/resolved`, { resolved: true })
            );
            await Promise.allSettled(resolvePromises);
            
            alert('Successfully added to Knowledge Database!');
            
            // 3. Clear form and refresh
            setSelectedQuestion(null);
            setAnswerText('');
            setTagsText('');
            fetchQuestions();
        } catch (err) {
            console.error('Failed to promote question:', err);
            alert('An error occurred while adding to the database.');
        } finally {
            setSubmitting(false);
        }
    };
    
    // Quick mark as resolved without adding to DB (if it was a bad question)
    const handleReject = async () => {
        if (!selectedQuestion) return;
        if (!window.confirm('Are you sure you want to dismiss this question? It will not be added to the knowledge base.')) return;
        
        setSubmitting(true);
        try {
            const resolvePromises = selectedQuestion.instances.map(inst =>
                axios.patch(`/feedback-conversations/${inst.conversationId}/resolved`, { resolved: true })
            );
            await Promise.allSettled(resolvePromises);
            
            setSelectedQuestion(null);
            fetchQuestions();
        } catch (err) {
            console.error('Failed to dismiss question:', err);
            alert('An error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
            {/* 1. Sidebar - Questions List */}
            <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-brand-card flex flex-col transition-colors">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-brand-surface/20">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                        <FileQuestion className="w-4 h-4 text-brand-primary" />
                        Possible Questions
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Queries the bot couldn't answer</p>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading && questions.length === 0 ? (
                        <div className="p-8 text-center animate-pulse text-gray-400">Loading questions...</div>
                    ) : questions.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <CheckCircle className="w-8 h-8 mb-2 mx-auto text-green-500/50" />
                            <p className="text-sm">All caught up!</p>
                        </div>
                    ) : (
                        questions.map((q) => (
                            <div
                                key={q._id}
                                onClick={() => handleSelect(q)}
                                className={clsx(
                                    "p-4 border-b border-gray-100 dark:border-gray-700/50 cursor-pointer transition-colors relative",
                                    selectedQuestion?._id === q._id 
                                        ? "bg-brand-primary/5 border-l-4 border-l-brand-primary" 
                                        : "hover:bg-gray-50 dark:hover:bg-brand-surface/30"
                                )}
                            >
                                <h3 className={clsx(
                                    "font-medium text-sm line-clamp-2",
                                    selectedQuestion?._id === q._id ? "text-brand-primary" : "text-gray-900 dark:text-gray-100"
                                )}>
                                    {q.originalText || "No content"}
                                </h3>
                                
                                <div className="flex justify-between items-center text-[10px] text-gray-500 mt-2">
                                    <span className="flex flex-wrap gap-1">
                                        {q.count > 1 ? (
                                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.5 rounded font-medium">
                                                <Copy size={10} /> Duplicate ({q.count})
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded">
                                                Unique
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {format(new Date(q.latestDate), 'MMM d, h:mm a')}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-[10px] bg-gray-50/50 dark:bg-brand-surface/20">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="hover:text-brand-primary disabled:opacity-30">Prev</button>
                    <span>Page {page} of {totalPages || 1}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="hover:text-brand-primary disabled:opacity-30">Next</button>
                </div>
            </div>

            {/* 2. Curation Panel */}
            <div className="flex-1 flex flex-col bg-gray-50 dark:bg-brand-dark overflow-hidden">
                {selectedQuestion ? (
                    <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col">
                        <div className="bg-white dark:bg-brand-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden max-w-3xl w-full mx-auto flex flex-col">
                            
                            <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-brand-surface/10 flex justify-between items-center">
                                <div>
                                    <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Curate Question</h1>
                                    <p className="text-sm text-gray-500">Edit the question and provide an answer.</p>
                                </div>
                            </div>

                            <div className="p-6 space-y-6 flex-1">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Question <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={framedText}
                                        onChange={(e) => setFramedText(e.target.value)}
                                        className="w-full p-3 bg-white dark:bg-brand-dark border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary outline-none transition-all text-sm font-medium"
                                        required
                                    />
                                    {selectedQuestion.count > 1 && (
                                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                            <AlertCircle size={12} />
                                            This question was asked {selectedQuestion.count} times.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Draft Answer <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        value={answerText}
                                        onChange={(e) => setAnswerText(e.target.value)}
                                        placeholder="Write a clear, concise answer..."
                                        className="w-full h-40 p-4 bg-white dark:bg-brand-dark border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary outline-none transition-all resize-none text-sm"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Tags <span className="text-gray-400 font-normal">(comma separated, optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={tagsText}
                                        onChange={(e) => setTagsText(e.target.value)}
                                        placeholder="e.g. login, troubleshooting, billing"
                                        className="w-full p-3 bg-white dark:bg-brand-dark border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary outline-none transition-all text-sm"
                                    />
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-brand-surface/20 flex justify-between items-center">
                                <button 
                                    onClick={handleReject}
                                    disabled={submitting}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                >
                                    Dismiss & Resolve
                                </button>
                                
                                <button
                                    onClick={handlePromote}
                                    disabled={submitting || !answerText.trim()}
                                    className="px-6 py-2 bg-brand-primary hover:bg-brand-secondary text-white text-sm font-semibold rounded-lg shadow-sm focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                                >
                                    {submitting ? 'Saving...' : 'Add to Knowledge'}
                                    <CheckCircle size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12 text-center h-full">
                        <FileQuestion className="w-16 h-16 mb-4 opacity-10 text-brand-primary" />
                        <h2 className="text-xl font-bold text-gray-600 dark:text-gray-400">Knowledge Gap Detection</h2>
                        <p className="max-w-md mt-2">
                            Select an unanswered question from the sidebar to provide an answer. Once submitted, 
                            it will automatically learn and resolve the related conversations.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
