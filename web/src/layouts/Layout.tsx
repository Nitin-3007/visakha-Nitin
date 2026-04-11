import React from 'react';
import {
    LayoutDashboard,
    LogOut,
    Users,
    Download,
    HelpCircle,
    BookOpen
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const location = useLocation();
    const { logout, user, isSuperAdmin, isViewer } = useAuth();

    React.useEffect(() => {
        document.title = "Alchemist";
    }, []);

    const navigation = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Team', href: '/team', icon: Users },
        ...(!isViewer ? [
            { name: 'Knowledge', href: '/knowledge', icon: BookOpen },
            { name: 'FAQs', href: '/faqs', icon: HelpCircle }
        ] : [])
    ];

    const handleExport = async () => {
        try {
            const response = await fetch('/conversations/export');
            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'conversations.md';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export conversations');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-brand-dark flex transition-colors duration-300">
            {/* Sidebar */}
            <div className="w-64 bg-white dark:bg-brand-card border-r border-gray-200 dark:border-gray-700 flex flex-col fixed h-full z-10 transition-colors duration-300">
                <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700 bg-brand-primary/10 dark:bg-brand-primary/20">
                    <img src="/logo.png" alt="Alchemist" className="w-8 h-8 mr-3 object-contain" />
                    <span className="text-xl font-bold text-brand-primary dark:text-brand-primary">Alchemist</span>
                </div>

                <nav className="flex-1 px-4 py-6 space-y-1">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={clsx(
                                    'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                                    isActive
                                        ? 'bg-brand-primary/10 text-brand-primary dark:text-brand-primary'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white'
                                )}
                            >
                                <item.icon className={clsx('mr-3 w-5 h-5', isActive ? 'text-brand-primary' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400')} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                    {isSuperAdmin && (
                        <button
                            onClick={handleExport}
                            className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            <Download className="mr-3 w-5 h-5 text-gray-400 dark:text-gray-500" />
                            Export Chats
                        </button>
                    )}
                    <div className="mt-2 flex justify-center">
                        <ThemeToggle />
                    </div>
                </div>

                {/* User Profile & Logout */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center mb-4 px-2">
                        <div className="w-8 h-8 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center text-brand-primary font-bold text-xs uppercase">
                            {user?.email?.slice(0, 2)}
                        </div>
                        <div className="ml-3 overflow-hidden">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={user?.email}>{user?.email}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                        <LogOut className="mr-3 w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 ml-64 bg-gray-50 dark:bg-brand-dark transition-colors duration-300">
                {children}
            </div>
        </div>
    );
};
