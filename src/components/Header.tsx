import { useState, useEffect } from 'react';
import { Scale, ExternalLink } from 'lucide-react';
import { getLatestPolicyDocuments } from '../services/documentService';
import { POLICY_SOURCE_URLS } from '../config/policySources';

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
            {policies.map(policy => {
              const sourceUrl = POLICY_SOURCE_URLS[policy.document_type];
              return (
                <li key={policy.id}>
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`View the original document: ${policy.title}`}
                      className="inline-flex items-center hover:text-blue-300 transition-colors"
                    >
                      {policy.title}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  ) : (
                    <span className="text-slate-300">{policy.title}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
