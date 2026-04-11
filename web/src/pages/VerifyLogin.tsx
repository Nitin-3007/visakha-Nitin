import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export const VerifyLogin: React.FC = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { login } = useAuth();
    
    const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
    const [errorMsg, setErrorMsg] = useState<string>('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMsg('No verification token provided in the link.');
            return;
        }

        const verifyToken = async () => {
            try {
                const response = await axios.post('/auth/verify-link', { token });
                if (response.data.success) {
                    setStatus('success');
                    // We can also log them in this tab. The original tab will also poll and log in.
                    login(response.data.token, response.data.user);
                    // Redirect after a few seconds
                    setTimeout(() => {
                        navigate('/');
                    }, 3000);
                }
            } catch (err: any) {
                console.error("Verification failed:", err);
                setStatus('error');
                setErrorMsg(err.response?.data?.error || "Verification failed. The link may have expired or is invalid.");
            }
        };

        verifyToken();
    }, [token, navigate, login]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#1e1e1e] flex flex-col items-center justify-center p-4">
            <div className="bg-white dark:bg-brand-card rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-100 dark:border-gray-800">
                {status === 'verifying' && (
                    <div className="flex flex-col items-center">
                        <Loader2 className="w-16 h-16 text-brand-primary animate-spin mb-6" />
                        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Verifying Login...</h2>
                        <p className="text-gray-500 dark:text-gray-400">Please wait while we secure your access.</p>
                    </div>
                )}
                
                {status === 'success' && (
                    <div className="flex flex-col items-center animate-fade-in">
                        <CheckCircle className="w-16 h-16 text-green-500 mb-6" />
                        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Successfully Verified!</h2>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">You have been logged in across your tabs.</p>
                        <button 
                            onClick={() => navigate('/')}
                            className="px-6 py-2 bg-brand-primary text-white rounded hover:bg-brand-primary/90 transition-colors font-medium"
                        >
                            Go to Dashboard Automatically...
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex flex-col items-center animate-fade-in">
                        <XCircle className="w-16 h-16 text-red-500 mb-6" />
                        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Verification Failed</h2>
                        <p className="text-red-500 mb-6">{errorMsg}</p>
                        <button 
                            onClick={() => navigate('/login')}
                            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                        >
                            Back to Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
