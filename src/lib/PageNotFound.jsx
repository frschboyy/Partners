import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
      <div className="inline-flex p-4 rounded-full bg-destructive/10 text-destructive mb-6">
        <AlertCircle size={32} />
      </div>
      <h1 className="text-3xl font-semibold mb-2">Page not found</h1>
      <p className="text-sm text-muted-foreground mb-6">The page you are looking for does not exist.</p>
      <Link to="/" className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition">
        Go back home
      </Link>
    </div>
  );
}
