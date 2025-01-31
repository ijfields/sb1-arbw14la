import * as pdfjs from 'pdfjs-dist';
import { TextItem } from 'pdfjs-dist/types/src/display/api';

// Set worker source path
const workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractTextFromPDF(pdfData: Uint8Array): Promise<string> {
  try {
    console.log('Starting PDF text extraction...');

    // Load the PDF document with better error handling
    const loadingTask = pdfjs.getDocument({
      data: pdfData,
      useSystemFonts: true, // Enable system fonts
      disableFontFace: true, // Disable custom font loading
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });

    console.log('PDF loading task created');
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully. Pages: ${pdf.numPages}`);
    
    let fullText = '';
    let hasExtractedText = false;
    
    // Iterate through each page
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Processing page ${i}/${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Extract and join text items
      const pageText = textContent.items
        .map((item: TextItem) => item.str)
        .join(' ')
        .trim();
      
      if (pageText) {
        hasExtractedText = true;
        fullText += pageText + '\n\n';
      }
      
      console.log(`Page ${i} processed. Characters extracted: ${pageText.length}`);
    }
    
    // Validate extracted text
    if (!hasExtractedText) {
      throw new Error('No readable text found in the PDF. The document might be scanned or image-based.');
    }

    const finalText = fullText.trim();
    console.log(`Text extraction completed. Total characters: ${finalText.length}`);
    
    return finalText;
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF structure')) {
        throw new Error('The PDF file appears to be corrupted or invalid.');
      } else if (error.message.includes('No readable text found')) {
        throw new Error('Could not extract text from the PDF. The document might be scanned or image-based.');
      }
    }
    
    throw new Error('Failed to extract text from PDF. Please ensure the file is a valid PDF with readable text.');
  }
}