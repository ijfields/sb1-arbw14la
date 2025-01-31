import React from 'react';
import { Scale } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-slate-900 text-white py-6 px-4 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Scale className="w-8 h-8" />
          <h1 className="text-2xl font-bold">Executive Policy Tracker</h1>
        </div>
        <nav>
          <ul className="flex space-x-6">
            <li><a href="#orders" className="hover:text-blue-300 transition-colors">Executive Orders</a></li>
            <li><a href="#project2025" className="hover:text-blue-300 transition-colors">Project 2025</a></li>
            <li><a href="#agenda45" className="hover:text-blue-300 transition-colors">Agenda 45</a></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}