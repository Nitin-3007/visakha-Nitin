import { useState, useEffect } from 'react';
import type { Conversation, PaginatedResponse } from '../types';

interface UseConversationsResult {
    conversations: Conversation[];
    loading: boolean;
    error: string | null;
    total: number;
    totalPages: number;
    page: number;
    setPage: (page: number) => void;
    refresh: () => void;
}

export function useConversations(limit: number = 20, filter: string = 'all'): UseConversationsResult {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [page, setPage] = useState(1);

    const fetchConversations = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(`/feedback-conversations?page=${page}&limit=${limit}&filter=${filter}`);
            if (!response.ok) {
                throw new Error('Failed to fetch conversations');
            }
            const data: PaginatedResponse<Conversation> = await response.json();
            setConversations(data.data);
            setTotal(data.total);
            setTotalPages(data.totalPages);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConversations();
    }, [page, limit, filter]);

    return {
        conversations,
        loading,
        error,
        total,
        totalPages,
        page,
        setPage,
        refresh: fetchConversations
    };
}
