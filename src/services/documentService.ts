import { supabase } from '../lib/supabase';
import { extractTextFromPDF } from './pdfService';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_PDF_SIZE = 100; // 100 bytes
const VALID_PDF_TYPES = ['application/pdf'];

export async function uploadPolicyDocument(
  file: File,
  title: string,
  documentType: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate file type and size
    if (!VALID_PDF_TYPES.includes(file.type)) {
      throw new Error('Invalid file type. Please upload a PDF file.');
    }

    if (file.size > MAX_PDF_SIZE) {
      throw new Error(`File size must be less than ${MAX_PDF_SIZE / 1024 / 1024}MB`);
    }

    if (file.size < MIN_PDF_SIZE) {
      throw new Error('File appears to be empty or corrupted');
    }

    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();
    
    // Create a copy for text extraction
    const textBuffer = buffer.slice(0);
    const textUint8Array = new Uint8Array(textBuffer);

    // Validate PDF header
    const header = new TextDecoder().decode(textUint8Array.slice(0, 5));
    if (!header.startsWith('%PDF-')) {
      throw new Error('Invalid PDF format. File does not appear to be a valid PDF.');
    }

    // Extract text content from PDF
    const textContent = await extractTextFromPDF(textUint8Array);

    // Validate text content
    if (!textContent || !textContent.trim()) {
      throw new Error('Could not extract text from PDF. The file might be empty, corrupted, or contain only images.');
    }

    if (textContent.length < 10) { // Arbitrary minimum length
      throw new Error('PDF appears to contain no meaningful text content');
    }

    // Convert ArrayBuffer to base64 for storage
    const base64Data = await arrayBufferToBase64(buffer);

    // Validate base64 data
    if (!isValidBase64(base64Data)) {
      throw new Error('Failed to convert PDF to valid base64 format');
    }

    console.log('Processing PDF:', {
      originalSize: file.size,
      textLength: textContent.length,
      base64Size: base64Data.length
    });

    const { error } = await supabase
      .from('policy_documents')
      .insert({
        title,
        document_type: documentType,
        content: textContent,
        pdf_data: base64Data
      });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error uploading policy document:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function getPolicyDocuments() {
  const { data, error } = await supabase
    .from('policy_documents')
    .select('id, title, document_type, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getPolicyDocumentContent(id: string): Promise<string> {
  const { data, error } = await supabase
    .from('policy_documents')
    .select('content')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data.content;
}

export async function getPolicyDocumentPDF(id: string): Promise<Blob> {
  try {
    if (!id) {
      const error = new Error('Invalid document ID');
      console.error('Error in getPolicyDocumentPDF:', error);
      throw error;
    }

    const { data, error: dbError } = await supabase
      .from('policy_documents')
      .select('pdf_data, title')
      .eq('id', id)
      .single();

    if (dbError) {
      console.error('Database error in getPolicyDocumentPDF:', dbError);
      throw new Error('Failed to retrieve PDF data from database');
    }

    if (!data || !data.pdf_data) {
      const error = new Error('PDF data not found');
      console.error('Error in getPolicyDocumentPDF:', error);
      throw error;
    }

    // Clean and validate base64 data
    const cleanBase64 = cleanBase64String(data.pdf_data);
    if (!isValidBase64(cleanBase64)) {
      const error = new Error('Invalid base64 data format');
      console.error('Error in getPolicyDocumentPDF:', error);
      throw error;
    }

    // Convert base64 to binary data
    const binaryData = base64ToUint8Array(cleanBase64);
    
    // Validate the binary data
    if (binaryData.length === 0) {
      const error = new Error('PDF data is empty');
      console.error('Error in getPolicyDocumentPDF:', error);
      throw error;
    }

    if (binaryData.length < MIN_PDF_SIZE) {
      const error = new Error('PDF data appears to be truncated');
      console.error('Error in getPolicyDocumentPDF:', error);
      throw error;
    }

    if (binaryData.length > MAX_PDF_SIZE) {
      const error = new Error('PDF data exceeds maximum allowed size');
      console.error('Error in getPolicyDocumentPDF:', error);
      throw error;
    }

    // Check PDF header
    const header = new TextDecoder().decode(binaryData.slice(0, 5));
    if (!header.startsWith('%PDF-')) {
      const error = new Error('Invalid PDF format');
      console.error('Error in getPolicyDocumentPDF:', error);
      throw error;
    }

    // Create blob from binary data
    const blob = new Blob([binaryData], { 
      type: 'application/pdf'
    });
    
    console.log('PDF blob created successfully:', {
      size: blob.size,
      type: blob.type,
      title: data.title
    });

    return blob;
  } catch (error) {
    // Ensure error is properly logged with details
    console.error('Error in getPolicyDocumentPDF:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    throw new Error(
      error instanceof Error 
        ? error.message 
        : 'Failed to load PDF document'
    );
  }
}

// Helper function to convert ArrayBuffer to base64
async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const reader = new FileReader();
      
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix and clean the base64 string
        const base64 = cleanBase64String(result.split(',')[1]);
        
        if (!isValidBase64(base64)) {
          reject(new Error('Generated invalid base64 data'));
          return;
        }
        
        resolve(base64);
      };
      
      reader.onerror = () => reject(new Error('Failed to convert PDF to base64'));
      reader.readAsDataURL(blob);
    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  try {
    const cleanData = cleanBase64String(base64);
    const binaryString = atob(cleanData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    throw new Error('Failed to convert base64 to binary data');
  }
}

// Helper function to validate base64 string
function isValidBase64(str: string): boolean {
  if (!str) return false;
  
  try {
    // Remove any whitespace
    const cleanStr = cleanBase64String(str);
    
    // Check if the string contains only valid base64 characters
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanStr)) {
      return false;
    }
    
    // Check if the string length is valid (multiple of 4)
    if (cleanStr.length % 4 !== 0) {
      return false;
    }
    
    // Try to decode a small sample to verify it's valid base64
    const testDecode = atob(cleanStr.slice(0, 100));
    return testDecode.length > 0;
  } catch {
    return false;
  }
}

// Helper function to clean base64 string
function cleanBase64String(str: string): string {
  return str
    .replace(/\s/g, '') // Remove all whitespace
    .replace(/[^\w+/=]/g, '') // Remove invalid characters
    .replace(/={1,2}$/, match => match); // Preserve trailing equals signs
}