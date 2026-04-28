import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Eye, Trash2, Sparkles, Loader2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import localforage from 'localforage';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfResource {
  id: string;
  name: string;
  url: string; 
  text: string;
  buffer?: ArrayBuffer;
  pages?: { number: number, text: string }[];
  numPages?: number;
}

interface PdfManagerProps {
  onExtractText: (text: string) => void;
}

export function PdfManager({ onExtractText }: PdfManagerProps) {
  const [pdfs, setPdfs] = useState<PdfResource[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<PdfResource | null>(null);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load PDFs from IndexedDB on startup
    const loadSaved = async () => {
      const saved = await localforage.getItem<PdfResource[]>('grammarbd_pdfs');
      if (saved && saved.length > 0) {
        // Recreate Blob URLs for stored buffers to prevent them from breaking across sessions
        const restored = saved.map(p => {
          if (p.buffer) {
            const blob = new Blob([p.buffer], { type: 'application/pdf' });
            return { ...p, url: URL.createObjectURL(blob) };
          }
          return p;
        });
        setPdfs(restored);
      }
    };
    loadSaved();
  }, []);

  const saveToStorage = async (newPdfs: PdfResource[]) => {
    setPdfs(newPdfs);
    await localforage.setItem('grammarbd_pdfs', newPdfs);
  };

  const extractPagesFromPdf = async (file: File): Promise<{ pages: { number: number, text: string }[], fullText: string, numPages: number }> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const pagesList = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .filter(str => str.trim().length > 0)
        .join(' ');
      pagesList.push({ number: i, text: pageText });
      fullText += `[Page ${i}]\n${pageText}\n\n`;
    }
    
    return { pages: pagesList, fullText, numPages: pdf.numPages };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setIsExtracting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { pages, fullText, numPages } = await extractPagesFromPdf(file);
      
      if (!fullText.trim()) {
         alert("Could not extract any text from this PDF. It might be scanned or protected. Please try another file.");
         setIsExtracting(false);
         return;
      }

      const url = URL.createObjectURL(file);
      
      const newPdf: PdfResource = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        url,
        text: fullText,
        pages,
        numPages,
        buffer: arrayBuffer
      };
      
      const newPdfs = [...pdfs, newPdf];
      await saveToStorage(newPdfs);
      setSelectedPdf(newPdf);
    } catch (error) {
      console.error("PDF processing failed:", error);
      alert("PDF processing failed. Please try a different file.");
    } finally {
      setIsExtracting(false);
    }
  };

  const removePdf = async (id: string) => {
    const newPdfs = pdfs.filter(p => p.id !== id);
    await saveToStorage(newPdfs);
    if (selectedPdf?.id === id) setSelectedPdf(null);
  };

  const handleExtractPage = () => {
    if (!selectedPdf || !selectedPdf.pages) return;
    const pageData = selectedPdf.pages.find(p => p.number === selectedPage);
    if (pageData && pageData.text.trim()) {
      onExtractText(pageData.text);
    } else {
      alert("This page appears to have no selectable text. It may be an image-only PDF.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">PDF Study Center</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Library Management</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="px-4 py-2 bg-slate-800 dark:bg-indigo-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg flex items-center gap-2 hover:scale-105 transition-all disabled:opacity-50"
          >
            {isExtracting ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
            Upload PDF
          </button>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf" 
          onChange={handleFileUpload} 
        />
      </div>

      <div className="max-w-2xl mx-auto w-full">
        {/* PDF List */}
        <div className="space-y-3">
          <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 text-left">Library ({pdfs.length})</h4>
          {pdfs.length === 0 ? (
            <div className="p-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center bg-slate-50/30 dark:bg-slate-900/10">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4">
                <FileText className="text-indigo-500" size={32} />
              </div>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No PDFs uploaded yet</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Upload a PDF to start extracting content</p>
            </div>
          ) : (
            pdfs.map(pdf => (
              <motion.div 
                key={pdf.id}
                layoutId={pdf.id}
                className={`p-3 bg-white dark:bg-slate-800/50 border-2 rounded-2xl flex flex-col group transition-all cursor-pointer ${
                  selectedPdf?.id === pdf.id ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-50 dark:border-slate-800'
                }`}
                onClick={() => setSelectedPdf(pdf)}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="truncate text-left">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{pdf.name}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{Math.round(pdf.text.length / 1024)} KB • {pdf.numPages} Pages</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onExtractText(pdf.text); }}
                      title="Send to AI Generator"
                      className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 rounded-xl transition-all flex items-center gap-2"
                    >
                      <Sparkles size={16} />
                      <span className="text-[9px] font-black uppercase tracking-tighter">Extract All</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removePdf(pdf.id); }}
                      title="Remove"
                      className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/20 rounded-xl transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                {selectedPdf?.id === pdf.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">Page</span>
                       <input 
                         type="number" 
                         min="1" 
                         max={pdf.numPages || 1} 
                         value={selectedPage}
                         onChange={(e) => setSelectedPage(parseInt(e.target.value) || 1)}
                         onClick={(e) => e.stopPropagation()}
                         className="w-16 h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-center focus:outline-none focus:border-indigo-500 shadow-sm"
                       />
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleExtractPage(); }}
                      className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest shadow-sm hover:bg-indigo-600 transition-all flex items-center gap-1.5"
                    >
                      <Sparkles size={12} />
                      Extract Selected Page
                    </button>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
