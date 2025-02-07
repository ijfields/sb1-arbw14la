import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, X } from 'lucide-react';
import { uploadPolicyDocument } from '../services/documentService';
import type { PolicyType } from '../services/assessmentService';

interface DocumentUploadProps {
  onUploadComplete: () => void;
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PolicyType>('project2025');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a valid PDF file');
        setFile(null);
        return;
      }
      
      if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
        setError('File size must be less than 10MB');
        setFile(null);
        return;
      }

      // Basic PDF header check
      const header = await readFileHeader(selectedFile);
      if (!header.startsWith('%PDF-')) {
        setError('Invalid PDF file format');
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
    }
  };

  const readFileHeader = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const header = e.target?.result as string;
        resolve(header.slice(0, 5));
      };
      reader.readAsBinaryString(file.slice(0, 5));
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!file || !title.trim()) {
      setError('Please provide both a title and a PDF file');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // Start progress animation
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90;
          return prev + 5;
        });
      }, 500);

      const result = await uploadPolicyDocument(file, title.trim(), type);
      
      clearInterval(progressInterval);

      if (!result.success) {
        if (result.error?.includes('request entity too large')) {
          throw new Error('File is too large for processing. Please try a smaller file or split the document.');
        }
        throw new Error(result.error || 'Failed to upload document');
      }

      setProgress(100);
      setTimeout(() => {
        onUploadComplete();
        setFile(null);
        setTitle('');
        setType('project2025');
        setProgress(0);
      }, 500);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload document');
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Upload Policy Document</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Document Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PolicyType)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            disabled={loading}
          >
            <option value="project2025">Project 2025</option>
            <option value="agenda47">Agenda 47</option>
            <option value="attack_on_power">Attack on our Power</option>
            <option value="peoples_response">People's Response</option>
            <option value="contract_black_america">Contract with Black America</option>
            <option value="harris_economic_plan">Harris's Economic Plan for Black Men</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Document Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter document title"
            disabled={loading}
          />
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <div className="flex flex-col items-center">
            {file ? (
              <>
                <FileText className="w-8 h-8 text-blue-500 mb-2" />
                <p className="text-sm text-gray-600">{file.name}</p>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-sm text-red-600 hover:text-red-800 mt-2"
                  disabled={loading}
                >
                  Remove file
                </button>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <label className={`cursor-pointer ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <span className="text-blue-600 hover:text-blue-500">Choose PDF file</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </label>
                <p className="text-sm text-gray-500 mt-1">PDF files only (max 10MB)</p>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-between bg-red-50 border-l-4 border-red-500 p-4">
            <div className="flex items-center text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 text-center">
              {progress < 100 ? 'Processing document...' : 'Upload complete!'}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !file || !title.trim()}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <FileText className="animate-spin -ml-1 mr-2 h-4 w-4" />
              Processing...
            </>
          ) : (
            'Upload Document'
          )}
        </button>
      </form>
    </div>
  );
}