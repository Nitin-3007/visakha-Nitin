import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
    requireSuperAdmin?: boolean;
    requireModeratorOrAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requireSuperAdmin, requireModeratorOrAdmin }) => {
    const { isAuthenticated, isSuperAdmin, isModerator } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requireSuperAdmin && !isSuperAdmin) {
        return <Navigate to="/" replace />;
    }

    if (requireModeratorOrAdmin && !isSuperAdmin && !isModerator) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};
