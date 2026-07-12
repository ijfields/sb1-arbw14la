import { useState, useEffect } from 'react';
import { Scale } from 'lucide-react';
import { getLatestPolicyDocuments } from '../services/documentService';

interface PolicyNavItem {
  id: string;
  title: string;
  document_type: string;
}

export function Header() {
  const [policies, setPolicies] = useState<PolicyNavItem[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const docs = await getLatestPolicyDocuments();
        if (active && docs) {
          setPolicies(docs as PolicyNavItem[]);
        }
      } catch (error) {
        console.error('Failed to load policy documents for header:', error);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="bg-slate-900 text-white py-6 px-4 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Scale className="w-8 h-8" />
          <h1 className="text-2xl font-bold">Executive Policy Tracker</h1>
        </div>
        <nav>
          <ul className="flex flex-wrap justify-end gap-x-6 gap-y-1">
            <li><a href="#orders" className="hover:text-blue-300 transition-colors">Executive Orders</a></li>
            {policies.map(policy => (
              <li key={policy.id}>
                <a
                  href={`#${policy.document_type}`}
                  className="hover:text-blue-300 transition-colors"
                >
                  {policy.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
