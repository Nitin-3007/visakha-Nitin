import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Lock, Terminal, Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    const [verifyingToken, setVerifyingToken] = useState<string | null>(null);

    React.useEffect(() => {
        if (!verifyingToken) return;
        const interval = setInterval(async () => {
             try {
                 const response = await axios.get(`/auth/check-verification?token=${verifyingToken}`);
                 if (response.data.verified) {
                     clearInterval(interval);
                     login(response.data.token, response.data.user);
                     navigate('/');
                 }
             } catch (err) {
                 console.error('Polling error:', err);
             }
        }, 3000);
        return () => clearInterval(interval);
    }, [verifyingToken, login, navigate]);

    const handleGoogleLogin = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const token = await result.user.getIdToken();

            const response = await axios.post('/auth/google', {
                token: token
            });

            if (response.data.requireVerification) {
                setVerifyingToken(response.data.token);
                return;
            }

            const { token: jwtToken, user } = response.data;
            login(jwtToken, user);
            navigate('/');
        } catch (err: any) {
            console.error("Login Failed:", err);
            if (err.response?.status === 403) {
                setError("Access Denied: You are not authorized to access this portal.");
            } else {
                const detailedError = err.response?.data?.details || err.response?.data?.error || err.message || "Unknown error occurred";
                setError(`Login failed: ${detailedError}`);
            }
        }
    };

    if (verifyingToken) {
        return (
            <div className="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center p-4 transition-colors relative" style={{ backgroundImage: `url('/visakha-bg.png')` }}>
                <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]"></div>
                <div className="relative bg-white/95 dark:bg-brand-card/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 dark:border-white/10 p-8 max-w-md w-full text-center z-10">
                    <Loader2 className="w-16 h-16 text-brand-primary animate-spin mx-auto mb-6" />
                    <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white line-clamp-1">Check Your Email</h2>
                    <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
                        For your security, we've sent a verification link to your email address. Please click the "Verify Login" button in the email to proceed.
                    </p>
                    <p className="text-xs text-brand-primary animate-pulse font-semibold">Waiting for verification...</p>
                </div>
            </div>
        );
    }

    return (
        <div 
            className="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center p-4 transition-colors relative"
            style={{ backgroundImage: `url('/visakha-bg.png')` }}
        >
            <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]"></div>
            
            <div className="relative bg-white/95 dark:bg-brand-card/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 dark:border-white/10 p-8 max-w-md w-full text-center z-10">
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-brand-primary/10 dark:bg-brand-primary/20 rounded-full shadow-inner">
                        <Lock className="w-10 h-10 text-brand-primary" />
                    </div>
                </div>

                <h1 className="text-3xl font-extrabold mb-2 text-gray-900 dark:text-white tracking-tight">Alchemist</h1>
                <p className="text-gray-600 dark:text-gray-300 mb-8 text-sm leading-relaxed">
                    Welcome to the ViSakha command center. Sign in securely to analyze conversations, manage user feedback, and unlock intelligent insights.
                </p>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-4 justify-center">
                    <div className="flex justify-center">
                        <button
                            onClick={handleGoogleLogin}
                            className="flex items-center justify-center gap-3 h-10 bg-white dark:bg-[#131314] border border-gray-300 dark:border-gray-600 rounded shadow-sm hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors w-full"
                        >
                            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                            <span className="text-sm font-medium text-[#3c4043] dark:text-[#e3e3e3]" style={{ fontFamily: 'Roboto, sans-serif' }}>
                                Sign in with Google
                            </span>
                        </button>
                    </div>

                        <>
                            <div className="flex items-center justify-center my-2 opacity-50">
                                <div className="border-t border-gray-400 dark:border-gray-500 w-12"></div>
                                <span className="mx-4 text-xs text-gray-500 dark:text-gray-400">OR</span>
                                <div className="border-t border-gray-400 dark:border-gray-500 w-12"></div>
                            </div>
                            <div className="flex justify-center">
                                <button
                                    onClick={async () => {
                                        const pwd = window.prompt("Enter Dev Password:");
                                        if (pwd !== "vled@iitrpr") {
                                            setError("Invalid Dev Password");
                                            return;
                                        }
                                        try {
                                            const response = await axios.post('/auth/dev-login');
                                            const { token, user } = response.data;
                                            login(token, user);
                                            navigate('/');
                                        } catch (err) {
                                            setError("Dev Login Failed");
                                        }
                                    }}
                                    className="flex items-center justify-center gap-3 h-10 bg-white dark:bg-[#131314] border border-gray-300 dark:border-gray-600 rounded shadow-sm hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors w-[220px]"
                                >
                                    <Terminal className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                                    <span className="text-sm font-medium text-[#3c4043] dark:text-[#e3e3e3]" style={{ fontFamily: 'Roboto, sans-serif' }}>
                                        Dev Login (Bypass)
                                    </span>
                                </button>
                            </div>
                        </>
                </div>

                <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
                    Only authorized administrators and moderators can access this system.
                </p>
            </div>
        </div>
    );
};
