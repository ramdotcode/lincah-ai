'use client';

import Sidebar from './Sidebar';
import TopNav from './TopNav';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-app transition-colors">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative bg-app">
          {children}
        </main>
      </div>
    </div>
  );
}
