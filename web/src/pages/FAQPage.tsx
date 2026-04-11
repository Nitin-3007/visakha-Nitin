import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    Plus,
    Pencil,
    Trash2,
    X,
    Save,
    Loader2,
    AlertCircle,
    HelpCircle,
    Upload,
    Search,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';

interface FAQ {
    _id: string;
    question: string;
    answer: string;
    keys?: string[];
    category?: string;
}

export const FAQPage = () => {
    const { token } = useAuth();
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter & Pagination State
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<{ question: string; answer: string; keys: string[] }>({ question: '', answer: '', keys: [] });
    const [keyInput, setKeyInput] = useState('');

    const fetchFAQs = async () => {
        setLoading(true);
        setError(null);
        try {
            // Using the generic DB endpoint for faqs collection
            // Increased limit to 200 to ensure all 98+ are visible for now
            const response = await fetch('/admin/db/faqs?limit=200', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch FAQs');

            const result = await response.json();
            // result.data contains the array
            setFaqs(result.data || []);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFAQs();
    }, [token]);

    // Derived Data
    const filteredFaqs = useMemo(() => {
        return faqs.filter(faq =>
            faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [faqs, searchTerm]);

    const totalPages = Math.ceil(filteredFaqs.length / itemsPerPage);
    const paginatedFaqs = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredFaqs.slice(start, start + itemsPerPage);
    }, [filteredFaqs, currentPage, itemsPerPage]);

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, itemsPerPage]);

    const handleEdit = (faq: FAQ) => {
        setEditingId(faq._id);
        
        let initialKeys = faq.keys || [];
        let initialAnswer = faq.answer;
        
        // Backward compatibility: If no explicit keys exist, extract from the answer text
        if (initialKeys.length === 0 && initialAnswer) {
            const lines = initialAnswer.split('\n');
            const newAnswerLines = [];
            
            for (const line of lines) {
                const lower = line.trim().toLowerCase();
                if (lower.startsWith('keys:') || lower.startsWith('tags:')) {
                    const keysString = line.substring(line.indexOf(':') + 1);
                    initialKeys = keysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
                } else {
                    newAnswerLines.push(line);
                }
            }
            // Strip tags line out of the editable answer to avoid duplication
            initialAnswer = newAnswerLines.join('\n').trim();
        }

        // Second fallback: Use category if available
        if (initialKeys.length === 0 && faq.category) {
            initialKeys = [faq.category];
        }

        setFormData({ question: faq.question, answer: initialAnswer, keys: initialKeys });
        setKeyInput('');
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingId(null);
        setFormData({ question: '', answer: '', keys: [] });
        setKeyInput('');
        setIsModalOpen(true);
    };

    const handleAddKey = (e?: React.KeyboardEvent<HTMLInputElement>) => {
        if (e && e.key !== 'Enter') return;
        if (e) e.preventDefault();
        
        const trimmedKey = keyInput.trim();
        if (trimmedKey && !formData.keys.includes(trimmedKey)) {
            setFormData(prev => ({ ...prev, keys: [...prev.keys, trimmedKey] }));
            setKeyInput('');
        }
    };

    const handleRemoveKey = (keyToRemove: string) => {
        setFormData(prev => ({ ...prev, keys: prev.keys.filter(k => k !== keyToRemove) }));
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `/admin/db/faqs/${editingId}`
                : `/admin/db/faqs`;

            const method = editingId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) throw new Error('Failed to save FAQ');

            setIsModalOpen(false);
            fetchFAQs();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this FAQ?')) return;

        try {
            const response = await fetch(`/admin/db/faqs/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to delete FAQ');

            fetchFAQs();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleBulkReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!window.confirm('This will DELETE all current FAQs and replace them with the contents of this file. Continue?')) {
            e.target.value = '';
            return;
        }

        setLoading(true);
        try {
            const text = await file.text();
            const response = await fetch('/admin/db/faqs/bulk-replace', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ markdown: text })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to bulk replace FAQs');
            }

            const result = await response.json();
            alert(`Successfully imported ${result.count} FAQs.`);
            fetchFAQs();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
            e.target.value = '';
        }
    };

    return (
        <div className="flex h-full bg-gray-50 dark:bg-brand-dark flex-col transition-colors duration-300">
            {/* Header */}
            <header className="bg-white dark:bg-brand-card border-b border-gray-200 dark:border-gray-700 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors duration-300">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                        <HelpCircle className="w-8 h-8 mr-3 text-brand-primary" />
                        FAQ Management
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage frequently asked questions for your users</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search questions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-brand-surface border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent text-sm transition-all w-64"
                        />
                    </div>

                    <label className="flex items-center px-4 py-2 bg-white dark:bg-brand-surface text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors shadow-sm cursor-pointer text-sm">
                        <Upload className="w-4 h-4 mr-2" />
                        Bulk Replace (.md)
                        <input
                            type="file"
                            accept=".md"
                            className="hidden"
                            onChange={handleBulkReplace}
                        />
                    </label>
                    <button
                        onClick={handleAddNew}
                        className="flex items-center px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-teal-700 transition-colors shadow-sm text-sm"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add FAQ
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-auto p-8">
                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center dark:bg-red-900 dark:border-red-700 dark:text-red-200">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto space-y-6">
                        <div className="grid gap-6">
                            {paginatedFaqs.map((faq) => (
                                <div key={faq._id} className="bg-white dark:bg-brand-card rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-all hover:shadow-md dark:hover:border-gray-600">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 pr-4">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{faq.question || 'No Question'}</h3>
                                            {/* Render Keys */}
                                            {(() => {
                                                const hasExplicitKeys = faq.keys && faq.keys.length > 0;
                                                let displayKeys: string[] = faq.keys || [];
                                                let displayAnswer = faq.answer || 'No Answer';
                                                
                                                // If no explicit keys, try to parse from answer text for backward compatibility
                                                if (!hasExplicitKeys && faq.answer) {
                                                    const lines = faq.answer.split('\n');
                                                    const newAnswerLines = [];
                                                    for (const line of lines) {
                                                        const lower = line.trim().toLowerCase();
                                                        if (lower.startsWith('keys:') || lower.startsWith('tags:')) {
                                                            const keysString = line.substring(line.indexOf(':') + 1);
                                                            displayKeys = keysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
                                                        } else {
                                                            newAnswerLines.push(line);
                                                        }
                                                    }
                                                    displayAnswer = newAnswerLines.join('\n').trim() || 'No Answer';
                                                }

                                                // Second fallback logic: Use category if it exists
                                                if (displayKeys.length === 0 && faq.category) {
                                                    displayKeys = [faq.category];
                                                }

                                                return (
                                                    <>
                                                        <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-3">{displayAnswer}</p>
                                                        {displayKeys.length > 0 && (
                                                            <div className="flex flex-wrap gap-2 mt-2">
                                                                {displayKeys.map((key, index) => (
                                                                    <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-teal-400">
                                                                        {key}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex space-x-2 flex-shrink-0">
                                            <button
                                                onClick={() => handleEdit(faq)}
                                                className="text-gray-400 hover:text-brand-primary dark:hover:text-brand-primary p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-full transition-colors"
                                                title="Edit"
                                            >
                                                <Pencil className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(faq._id)}
                                                className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {filteredFaqs.length === 0 && !loading && (
                                <div className="text-center py-20 bg-white dark:bg-brand-card rounded-lg border border-dashed border-gray-300 dark:border-gray-700 transition-colors duration-300">
                                    <HelpCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                    <p className="text-gray-500 dark:text-gray-400 text-lg">
                                        {searchTerm ? `No FAQs found matching "${searchTerm}"` : "No FAQs found."}
                                    </p>
                                    {!searchTerm && (
                                        <button
                                            onClick={handleAddNew}
                                            className="mt-2 text-brand-primary hover:text-teal-700 font-medium"
                                        >
                                            Create your first FAQ
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Pagination Controls */}
                        {filteredFaqs.length > 0 && (
                            <div className="bg-white dark:bg-brand-card border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors duration-300">
                                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <span>Show</span>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                        className="bg-gray-50 dark:bg-brand-surface border border-gray-200 dark:border-gray-600 rounded px-2 py-1 focus:ring-1 focus:ring-brand-primary outline-none"
                                    >
                                        <option value={5}>5</option>
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                    </select>
                                    <span>per page</span>
                                    <span className="mx-2">|</span>
                                    <span>Total: {filteredFaqs.length} items</span>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <div className="flex items-center px-4 py-1.5 bg-gray-50 dark:bg-brand-surface border border-gray-200 dark:border-gray-600 rounded-md text-sm font-medium">
                                        Page {currentPage} of {totalPages || 1}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="p-2 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-opacity-70 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-brand-card rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] transition-colors duration-300">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                {editingId ? 'Edit FAQ' : 'Add New FAQ'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Question</label>
                                <input
                                    type="text"
                                    value={formData.question}
                                    onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                                    className="w-full px-4 py-2 bg-white dark:bg-brand-surface border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent text-gray-900 dark:text-gray-100 transition-all placeholder-gray-400 dark:placeholder-gray-500"
                                    placeholder="e.g., How do I reset my password?"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Answer</label>
                                <textarea
                                    value={formData.answer}
                                    onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                                    className="w-full px-4 py-2 bg-white dark:bg-brand-surface border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent text-gray-900 dark:text-gray-100 h-40 resize-y transition-all placeholder-gray-400 dark:placeholder-gray-500"
                                    placeholder="Enter the answer here..."
                                />
                            </div>
                            
                            {/* Keys / Tags Section */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keys / Tags</label>
                                <div className="flex space-x-2 mb-3">
                                    <input
                                        type="text"
                                        value={keyInput}
                                        onChange={(e) => setKeyInput(e.target.value)}
                                        onKeyDown={handleAddKey}
                                        className="flex-1 px-4 py-2 bg-white dark:bg-brand-surface border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent text-gray-900 dark:text-gray-100 transition-all placeholder-gray-400 dark:placeholder-gray-500"
                                        placeholder="Add a key (e.g., login) and press Enter"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddKey()}
                                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {formData.keys.map((key, index) => (
                                        <span key={index} className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-teal-400">
                                            {key}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveKey(key)}
                                                className="ml-1.5 flex-shrink-0 text-brand-primary hover:text-teal-700 focus:outline-none"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </span>
                                    ))}
                                    {formData.keys.length === 0 && (
                                        <span className="text-sm text-gray-500 dark:text-gray-400 italic">No keys added yet.</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end space-x-3 bg-gray-50 dark:bg-brand-surface rounded-b-xl transition-colors duration-300">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-brand-card hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formData.question || !formData.answer}
                                className="px-5 py-2.5 bg-brand-primary text-white rounded-lg hover:bg-teal-700 flex items-center font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Save FAQ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
