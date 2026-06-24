import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '@/lib/AdminAuthContext';

export default function AdminProtectedRoute({ children }) {
  const { isAdmin, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  return children;
}
