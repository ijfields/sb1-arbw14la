import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visiblePages = getVisiblePages(currentPage, totalPages);

  function getVisiblePages(current: number, total: number) {
    if (total <= 7) return pages;

    if (current <= 4) {
      return [...pages.slice(0, 5), '...', total];
    }

    if (current >= total - 3) {
      return [1, '...', ...pages.slice(total - 5)];
    }

    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  return (
    <nav className="flex items-center justify-between border-t border-gray-200 px-4 sm:px-0 mt-6">
      <div className="flex w-0 flex-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="inline-flex items-center pt-4 pr-1 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="mr-3 h-5 w-5" aria-hidden="true" />
          Previous
        </button>
      </div>
      <div className="hidden md:flex">
        {visiblePages.map((page, index) => (
          <React.Fragment key={index}>
            {page === '...' ? (
              <span className="inline-flex items-center px-4 pt-4 text-sm font-medium text-gray-500">
                ...
              </span>
            ) : (
              <button
                onClick={() => onPageChange(page as number)}
                className={`inline-flex items-center px-4 pt-4 text-sm font-medium ${
                  currentPage === page
                    ? 'text-blue-600 border-t-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-700 hover:border-t-2 hover:border-gray-300'
                }`}
              >
                {page}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="flex w-0 flex-1 justify-end">
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="inline-flex items-center pt-4 pl-1 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="ml-3 h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}