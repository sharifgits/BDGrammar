import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, FileText, Loader2, CheckCircle2, ChevronLeft, Send, AlertCircle, BookOpen, Upload, Download, RefreshCw, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateGrammarLesson } from '../services/geminiService';
import { GRAMMAR_DATA } from '../data/defaultTopics';
import { classNames } from '../lib/utils';
import localforage from 'localforage';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface SmartCreatorProps {
  onBack: () => void;
  onLessonCreated: (lesson: any) => void;
  initialText?: string;
}

export function SmartCreator({ onBack, onLessonCreated, initialText = "" }: SmartCreatorProps) {
  const [inputText, setInputText] = useState(initialText);
  const [customInstruction, setCustomInstruction] = useState("");

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draftText = await localforage.getItem('creator_draft_text');
        const draftInstruction = await localforage.getItem('creator_draft_instruction');
        if (draftText && !inputText) setInputText(draftText as string);
        if (draftInstruction) setCustomInstruction(draftInstruction as string);
      } catch (e) {
        console.error("Failed to load draft:", e);
      }
    };
    loadDraft();
  }, []);

  // Save draft on change
  useEffect(() => {
    if (inputText) {
      localforage.setItem('creator_draft_text', inputText);
    }
    localforage.setItem('creator_draft_instruction', customInstruction);
  }, [inputText, customInstruction]);

  const handleSubTopicEdit = (index: number, field: string, value: string) => {
    if (!preview) return;
    const newSubTopics = [...preview.subtopics];
    newSubTopics[index] = { ...newSubTopics[index], [field]: value };
    setPreview({ ...preview, subtopics: newSubTopics });
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [totalChunks, setTotalChunks] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [lastInitialText, setLastInitialText] = useState<string>("");
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [loadedPdf, setLoadedPdf] = useState<{ source: File | ArrayBuffer, numPages: number, name: string } | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | string>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [savedPdfs, setSavedPdfs] = useState<any[]>([]);
  const [availableTopics, setAvailableTopics] = useState<any[]>([]);
  const [appendToExisting, setAppendToExisting] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedSubTopicId, setSelectedSubTopicId] = useState<string>('');
  const [showDataSettings, setShowDataSettings] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const storedPdfs = await localforage.getItem<any[]>('grammarbd_pdfs') || [];
        setSavedPdfs(storedPdfs);
        const storedTopics = await localforage.getItem<any[]>('custom_topics') || [];
        setAvailableTopics(storedTopics);
      } catch (err) {
        console.error("Failed to load data from storage", err);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (initialText && initialText !== lastInitialText) {
      setInputText(initialText);
      setLastInitialText(initialText);
    }
  }, [initialText, lastInitialText]);

  // Constants for batch process
  const CHUNK_SIZE = 25000; // characters, vastly increased to reduce API calls and loading time

  const handleExportData = async () => {
    try {
      const data = await localforage.getItem('custom_topics');
      if (!data) {
        alert("No custom data found to export.");
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const fileName = `grammar_backup_${new Date().toISOString().split('T')[0]}.json`;

      // Mobile/WebView fallback: use native share sheet if available
      if (navigator.canShare && navigator.share) {
        const file = new File([blob], fileName, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName });
          return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export data.");
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!Array.isArray(data)) {
          throw new Error("Invalid format: Backup must be a list of topics.");
        }
        
        const confirmResult = window.confirm("This will REPLACE your current data. Are you sure?");
        if (confirmResult) {
          await localforage.setItem('custom_topics', data);
          alert("Import successful! Reloading...");
          window.location.reload();
        }
      } catch (err) {
        console.error("Import failed:", err);
        alert("Failed to import data. Please check the file format.");
      } finally {
        setIsImporting(false);
        if (importFileRef.current) importFileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };


  const extractSpecificPages = async (source: File | ArrayBuffer, pagesStr: string | number) => {
    if (!source) return;
    setIsExtractingPdf(true);
    setError(null);
    try {
      const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;
      if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
        throw new Error("Invalid source: Could not get a valid array buffer.");
      }
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      
      const pageNumbers = new Set<number>();
      const str = String(pagesStr).trim();
      if (!str) {
         setInputText('');
         setIsExtractingPdf(false);
         return;
      }

      for (const part of str.split(',')) {
        const range = part.split('-').map(s => parseInt(s.trim(), 10));
        if (range.length === 1 && !isNaN(range[0])) {
           pageNumbers.add(range[0]);
        } else if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
           const start = Math.min(range[0], range[1]);
           const end = Math.max(range[0], range[1]);
           for (let i = start; i <= end; i++) {
             pageNumbers.add(i);
           }
        }
      }

      const validPages = Array.from(pageNumbers).filter(p => !isNaN(p) && p >= 1 && p <= pdf.numPages).sort((a,b) => a-b);

      if (validPages.length === 0) {
        setError(`Invalid page selection. Please enter valid page numbers (e.g. 1, 2-5). The PDF has ${pdf.numPages} pages.`);
        setIsExtractingPdf(false);
        return;
      }
      if (validPages.length > 50) {
         setError(`Too many pages selected (${validPages.length}). Please select a maximum of 50 pages at once.`);
         setIsExtractingPdf(false);
         return;
      }
      
      let allText = '';
      let extractedCount = 0;
      for (const pageNum of validPages) {
         const page = await pdf.getPage(pageNum);
         const textContent = await page.getTextContent();
         const pageText = textContent.items
           .map((item: any) => item.str || '')
           .filter((s: string) => s.trim().length > 0)
           .join(' ');
           
         if (pageText.trim()) {
           allText += `[Page ${pageNum}]\n${pageText}\n\n`;
           extractedCount++;
         }
      }
      
      if (!allText.trim()) {
        setError(`Could not extract any text from the selected pages. They might be scanned or protected.`);
      } else {
        if (extractedCount < validPages.length) {
          console.warn(`Could not extract text from some pages.`);
        }
        setInputText(allText.trim());
      }
    } catch (err) {
      console.error("PDF extraction failed:", err);
      setError("Failed to extract text from the PDF file. Please try a different file.");
    } finally {
      setIsExtractingPdf(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    
    setIsExtractingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (!arrayBuffer) {
        throw new Error("Could not read file data.");
      }
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      setLoadedPdf({ source: file, numPages: pdf.numPages, name: file.name });
      setSelectedPage('1');
      
      // Also save this PDF to the permanent grammarbd_pdfs library so it's not lost
      const savedPdfs = await localforage.getItem<any[]>('grammarbd_pdfs') || [];
      let fullText = '';
      const pagesList = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .filter((str: string) => str.trim().length > 0)
          .join(' ');
        pagesList.push({ number: i, text: pageText });
        fullText += `[Page ${i}]\n${pageText}\n\n`;
      }
      
      const newPdf = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        url: URL.createObjectURL(file),
        text: fullText,
        pages: pagesList,
        numPages: pdf.numPages,
        buffer: arrayBuffer 
      };
      
      const updatedPdfs = [...savedPdfs, newPdf];
      await localforage.setItem('grammarbd_pdfs', updatedPdfs);
      setSavedPdfs(updatedPdfs);
      
      await extractSpecificPages(file, "1");
    } catch (err) {
      console.error(err);
      setError("Failed to open PDF file.");
    } finally {
      setIsExtractingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectLibraryPdf = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pdfId = e.target.value;
    if (!pdfId) {
      setLoadedPdf(null);
      return;
    }
    const pdf = savedPdfs.find(p => p.id === pdfId);
    if (pdf && pdf.buffer) {
      setLoadedPdf({ source: pdf.buffer, numPages: pdf.numPages, name: pdf.name });
      setSelectedPage('1');
      await extractSpecificPages(pdf.buffer, "1");
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const customKey = localStorage.getItem('GEMINI_API_KEY');
      const result = await generateGrammarLesson(inputText, customKey, customInstruction);
      if (result && result.subtopics && result.subtopics.length > 0) {
        // Merge all generated subtopics into one unified block for easier editing
        let allPractice: any[] = [];
        const mergedContent = result.subtopics.map((s: any, i: number) => {
          // Collect practice
          if (s.practice) allPractice = [...allPractice, ...s.practice];
          
          // Check if title already starts with a number to avoid double numbering like "1. 1. Title"
          const titleHasNumber = /^\d+\./.test(s.title);
          const displayTitle = titleHasNumber ? s.title : `${i + 1}. ${s.title}`;
          return `${displayTitle.toUpperCase()}\n\n${s.content}\n\n`;
        }).join('\n\n');
        
        result.subtopics = [{
          title: result.title || "Comprehensive Lesson",
          content: mergedContent,
          practice: allPractice
        }];
      }
      setPreview(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "AI generation failed. Please check your internet connection or API settings.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAutoExtract = async () => {
    if (!inputText.trim()) return;
    setIsBatchProcessing(true);
    setError(null);
    
    try {
      const chunks = [];
      for (let i = 0; i < inputText.length; i += CHUNK_SIZE) {
        chunks.push(inputText.substring(i, i + CHUNK_SIZE));
      }
      setTotalChunks(chunks.length);
      
      const newTopics = [];
      let savedTopics = (await localforage.getItem<any[]>('custom_topics')) || [];
      const baseTopicId = 1000 + savedTopics.length; 
      const customKey = localStorage.getItem('GEMINI_API_KEY');
      
      for (let idx = 0; idx < chunks.length; idx++) {
        setCurrentChunk(idx + 1);
        try {
          const result = await generateGrammarLesson(chunks[idx], customKey, customInstruction);
          
          if (appendToExisting && selectedTopicId) {
            const topicIndex = savedTopics.findIndex((t: any) => t.id === selectedTopicId);
            if (topicIndex >= 0) {
              const topic = { ...savedTopics[topicIndex] };
              
              // Hydrate default roadmap modules if they don't have custom grammarData yet
              if (!topic.grammarData) {
                topic.grammarData = {
                  title: topic.title,
                  subtitle: "",
                  content: topic.steps.map((s: any) => (GRAMMAR_DATA[s.topicId]?.content?.[s.pageIdx] || { title: s.title, text: "Lesson content coming soon.", keyPoints: [], examples: [] }))
                };
                // Normalize pageIdx to absolute array position in custom content
                topic.steps = topic.steps.map((s: any, idx: number) => ({ ...s, pageIdx: idx }));
              }

              let basePageIdx = topic.steps?.length || 0;
              const topicIdNum = topic.steps?.[0]?.topicId || baseTopicId;

              if (selectedSubTopicId) {
                // Find the specific step and add extra info as NEW pages after it
                const stepIndex = topic.steps.findIndex((s: any) => s.id === selectedSubTopicId);
                if (stepIndex >= 0) {
                  const targetStep = topic.steps[stepIndex];
                  const pageIdx = targetStep.pageIdx;

                  if (topic.grammarData?.content) {
                    const additionalContent = result.subtopics.map((sub: any, sIdx: number) => ({
                      title: sub.title || `${targetStep.title} - Extra ${sIdx + 1}`,
                      category: sub.category,
                      keyPoints: sub.keyPoints || [],
                      text: (sub.content || "").replace(/\*/g, ''),
                      examples: sub.examples || [],
                      practice: sub.practice || [],
                      sourcePage: sub.sourcePage || ""
                    }));

                    const insertionPageIdx = pageIdx + 1;
                    topic.grammarData.content.splice(insertionPageIdx, 0, ...additionalContent);

                    const newSteps = additionalContent.map((sub: any, sIdx: number) => ({
                      id: `custom-step-${Date.now()}-${idx}-${sIdx}`,
                      title: sub.title,
                      subtitle: "",
                      topicId: topicIdNum,
                      pageIdx: insertionPageIdx + sIdx,
                      status: 'completed'
                    }));

                    // Shift subsequent page indexes
                    topic.steps = topic.steps.map((s: any) =>
                      s.pageIdx >= insertionPageIdx ? { ...s, pageIdx: s.pageIdx + additionalContent.length } : s
                    );

                    topic.steps.splice(stepIndex + 1, 0, ...newSteps);
                  }
                }
              } else {
                // Append as new sub-topics
                const newSteps = result.subtopics.map((sub: any, sIdx: number) => ({
                  id: `custom-step-${Date.now()}-${idx}-${sIdx}`,
                  title: sub.title,
                  subtitle: "",
                  topicId: topicIdNum,
                  pageIdx: basePageIdx + sIdx,
                  status: 'completed'
                }));
                
                const newContent = result.subtopics.map((sub: any) => ({
                  title: sub.title,
                  category: sub.category,
                  keyPoints: sub.keyPoints || [],
                  text: sub.content.replace(/\*/g, ''),
                  examples: sub.examples || [],
                  practice: sub.practice || [],
                  sourcePage: sub.sourcePage || ""
                }));

                topic.steps = [...(topic.steps || []), ...newSteps];
                if (topic.grammarData) {
                  topic.grammarData.content = [...(topic.grammarData.content || []), ...newContent];
                } else {
                  topic.grammarData = {
                    title: topic.title,
                    subtitle: "",
                    content: newContent
                  };
                }
              }
              
              savedTopics[topicIndex] = topic;
              await localforage.setItem('custom_topics', savedTopics);
              setAvailableTopics([...savedTopics]);
              onLessonCreated(topic);
            }
          } else {
            // Transform the result into a Grammar Module format with clear syntactic categories
            const customModule = {
              id: `custom-${Date.now()}-${idx}`,
              title: result.title || "Untitled Topic",
              description: "",
              permanent: false, 
              steps: result.subtopics.map((sub: any, sIdx: number) => ({
                id: `custom-step-${Date.now()}-${sIdx}`,
                title: sub.title,
                subtitle: "",
                topicId: baseTopicId + idx,
                pageIdx: sIdx,
                status: 'completed'
              })),
              grammarData: {
                title: result.title || "Untitled Topic",
                subtitle: "",
                content: result.subtopics.map((sub: any) => ({
                  title: sub.title,
                  category: sub.category,
                  keyPoints: sub.keyPoints || [],
                  text: sub.content.replace(/\*/g, ''),
                  examples: sub.examples || [],
                  sourcePage: sub.sourcePage || ""
                }))
              }
            };
            
            newTopics.push(customModule);
            savedTopics.push(customModule);
            await localforage.setItem('custom_topics', savedTopics);
            // Clear draft after successful creation
            await localforage.removeItem('creator_draft_text');
            await localforage.removeItem('creator_draft_instruction');
            onLessonCreated(customModule); 
          }
        } catch (innerErr: any) {
          console.warn(`Chunk ${idx + 1} failed:`, innerErr);
          // Don't stop the whole process if one chunk fails, unless it's an API key error
          if (innerErr.message?.includes('API Key')) {
            throw innerErr;
          }
        }
      }
      
      alert("PDF information processing complete!");
      // Clear draft after successful creation
      await localforage.removeItem('creator_draft_text');
      await localforage.removeItem('creator_draft_instruction');
      onBack();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Auto-Extraction failed. Please check your data and try again.");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleSave = async () => {
    if (preview) {
      const savedTopics = (await localforage.getItem<any[]>('custom_topics')) || [];
      const baseTopicId = 1000 + savedTopics.length;
      
      const customModule = {
        id: `custom-${Date.now()}`,
        title: preview.title || "Untitled Topic",
        description: "",
        permanent: false,
        steps: preview.subtopics.map((sub: any, sIdx: number) => ({
          id: `custom-step-${Date.now()}-${sIdx}`,
          title: sub.title,
          subtitle: "",
          topicId: baseTopicId,
          pageIdx: sIdx,
          status: 'completed'
        })),
        grammarData: {
          title: preview.title || "Untitled Topic",
          subtitle: "",
          content: preview.subtopics.map((sub: any) => ({
            title: sub.title,
            category: sub.category,
            keyPoints: sub.keyPoints || [],
            text: sub.content.replace(/\*/g, ''),
            examples: sub.examples || [],
            practice: sub.practice || [],
            sourcePage: sub.sourcePage || ""
          }))
        }
      };

      await localforage.setItem('custom_topics', [...savedTopics, customModule]);
      // Clear draft after successful creation
      await localforage.removeItem('creator_draft_text');
      await localforage.removeItem('creator_draft_instruction');
      onLessonCreated(customModule);
      onBack();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto min-h-[60vh] bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[2rem] shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 md:p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-indigo-50/30 dark:bg-indigo-500/5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} disabled={isBatchProcessing} className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-slate-500 hover:text-indigo-500 disabled:opacity-50">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="text-indigo-500" size={20} />
              {showDataSettings ? "Data & Backups" : "AI Lesson Generator"}
            </h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {showDataSettings ? "Manage your custom content" : ""}
            </p>
          </div>
        </div>

        <button 
          onClick={() => setShowDataSettings(!showDataSettings)}
          className={classNames(
            "p-2.5 rounded-xl transition-all shadow-sm",
            showDataSettings 
              ? "bg-indigo-500 text-white" 
              : "bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-500"
          )}
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {showDataSettings ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="p-5 bg-indigo-50 dark:bg-indigo-500/5 border-2 border-indigo-100 dark:border-indigo-500/10 rounded-2xl">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
                <Download size={18} className="text-indigo-500" />
                Backup Data
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed font-bold">
                ডাউনলোড করে রাখা ডাটা আপনি পরবর্তীতে রিসেট হওয়া অ্যাপ অথবা অন্য ফোনের অ্যাপে ইমপোর্ট করতে পারবেন। 
              </p>
              <button 
                onClick={handleExportData}
                className="w-full py-4 bg-indigo-500 text-white font-black rounded-xl shadow-lg shadow-indigo-500/20 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Download size={16} /> Backup Now (.json)
              </button>
            </div>

            <div className="p-5 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
                <RefreshCw size={18} className="text-emerald-500" />
                Restore Data
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed font-bold">
                আপনার ব্যাকআপ ফাইলটি এখানে সিলেক্ট করুন। এটি আপনার বর্তমান ডাটা রিপ্লেস করবে।
              </p>
              <button 
                onClick={() => importFileRef.current?.click()}
                disabled={isImporting}
                className="w-full py-4 bg-emerald-500 text-white font-black rounded-xl shadow-lg shadow-emerald-500/20 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {isImporting ? 'Importing...' : 'Restore Backup'}
              </button>
              <input 
                type="file" 
                ref={importFileRef}
                className="hidden"
                accept=".json"
                onChange={handleImportData}
              />
            </div>
            <button 
              onClick={() => setShowDataSettings(false)}
              className="w-full py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-indigo-500"
            >
              Close Settings
            </button>
          </motion.div>
        ) : isBatchProcessing ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-20 text-center space-y-6">
             <div className="relative w-32 h-32 flex items-center justify-center">
               <div className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900 rounded-full" />
               <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                 <circle
                   cx="64"
                   cy="64"
                   r="60"
                   stroke="currentColor"
                   strokeWidth="8"
                   fill="transparent"
                   className="text-indigo-500 transition-all duration-500"
                   strokeDasharray={377}
                   strokeDashoffset={377 - (377 * currentChunk) / Math.max(1, totalChunks)}
                 />
               </svg>
               <BookOpen size={32} className="text-indigo-500 animate-pulse" />
             </div>
             
             <div>
               <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">Reading & Creating...</h3>
               <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                 Processing Chunk {currentChunk} of {totalChunks}
               </p>
               <p className="text-[10px] text-slate-400 mt-2 max-w-sm mx-auto">
                 AI is scanning your PDF block by block and permanently generating new grammar topics. Please don't close this window.
               </p>
             </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
             <div className="space-y-1">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between ml-1 mb-2 gap-2">
                 <div className="flex items-center gap-2">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Material</label>
                   {inputText.length > 0 && (
                     <button 
                       onClick={() => {
                         if (window.confirm("আপনি কি নিশ্চিত? সব টেক্সট মুছে যাবে।")) {
                           setInputText("");
                           setCustomInstruction("");
                           localforage.removeItem('creator_draft_text');
                           localforage.removeItem('creator_draft_instruction');
                           setPreview(null);
                         }
                       }}
                       className="text-[8px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded cursor-pointer"
                     >
                       Clear Draft
                     </button>
                   )}
                 </div>
                 
                 <div className="flex items-center gap-2">
                   {savedPdfs.length > 0 && (
                     <select 
                       className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 focus:outline-none focus:border-indigo-500 shadow-sm"
                       onChange={handleSelectLibraryPdf}
                       disabled={isExtractingPdf}
                     >
                       <option value="">Select from PDF Library...</option>
                       {savedPdfs.map(pdf => (
                         <option key={pdf.id} value={pdf.id}>{pdf.name}</option>
                       ))}
                     </select>
                   )}
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     disabled={isExtractingPdf}
                     className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 disabled:opacity-50"
                   >
                     {isExtractingPdf ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                     {isExtractingPdf ? 'Extracting...' : 'Upload PDF'}
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

               {loadedPdf && (
                 <div className="flex flex-wrap items-center gap-3 mb-2 bg-indigo-50/50 dark:bg-indigo-500/5 p-3 rounded-xl border border-indigo-100 dark:border-indigo-500/10">
                   <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                     <FileText size={16} className="text-indigo-500 shrink-0" />
                     <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 truncate" title={loadedPdf.name}>
                       {loadedPdf.name}
                     </span>
                   </div>
                   <div className="flex items-center gap-2 shrink-0">
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Page</span>
                     <input 
                       type="text"
                       value={selectedPage}
                       onChange={(e) => setSelectedPage(e.target.value)}
                       onBlur={(e) => {
                         const val = e.target.value;
                         if (val.trim()) {
                           extractSpecificPages(loadedPdf.source, val);
                         }
                       }}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') {
                           const val = (e.target as HTMLInputElement).value;
                           if (val.trim()) {
                             extractSpecificPages(loadedPdf.source, val);
                           }
                         }
                       }}
                       placeholder="e.g. 1,3-5"
                       disabled={isExtractingPdf}
                       className="w-24 h-8 px-2 text-xs font-black text-center bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-indigo-900/20 rounded-lg focus:outline-none focus:border-indigo-500 shadow-sm disabled:opacity-50"
                     />
                     <span className="text-[10px] font-bold text-slate-400">/ {loadedPdf.numPages}</span>
                   </div>
                 </div>
               )}

               <textarea 
                 value={inputText}
                 onChange={(e) => setInputText(e.target.value)}
                 className="w-full h-48 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-xs focus:outline-none focus:border-indigo-500 transition-all font-medium leading-relaxed mt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                 placeholder="Paste text from your PDF here..."
               />
               <p className="text-[10px] text-slate-400 text-right font-bold">{inputText.length} characters</p>
               
               <div className="space-y-1 mt-4">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Custom Instruction / Prompt (Optional)</label>
                 <textarea 
                   value={customInstruction}
                   onChange={(e) => setCustomInstruction(e.target.value)}
                   className="w-full h-20 p-3 bg-indigo-50/50 dark:bg-indigo-500/5 border-2 border-indigo-100 dark:border-indigo-500/10 rounded-xl text-xs focus:outline-none focus:border-indigo-500 transition-all font-medium leading-relaxed"
                   placeholder=""
                 />
 
               </div>

               <AnimatePresence>
                 {preview && (
                   <motion.div 
                     initial={{ opacity: 0, y: 10 }} 
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -10 }}
                     className="mt-6 p-4 md:p-6 bg-emerald-50/30 dark:bg-emerald-500/5 border-2 border-emerald-100 dark:border-emerald-500/20 rounded-3xl space-y-5"
                   >
                     <div className="flex items-center justify-between">
                       <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                         <CheckCircle2 size={18} />
                         {/* Heading removed */}
                       </h3>
                       <button 
                         onClick={() => setPreview(null)}
                         className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-full transition-all"
                          title="Close Preview"
                       >
                         <X size={18} />
                       </button>
                     </div>

                     <div className="space-y-3">
                       <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Topic Title</label>
                         <input 
                           value={preview.title}
                           onChange={(e) => setPreview({ ...preview, title: e.target.value })}
                           className="w-full p-3 bg-white dark:bg-slate-800 border-2 border-emerald-100 dark:border-emerald-500/10 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-all shadow-sm"
                         />
                       </div>

                       <div className="space-y-4 pt-2">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Unified Lesson Preview</label>
                         <div className="p-5 md:p-8 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500/20 group-hover:bg-emerald-500/40 transition-colors" />
                           
                           {preview.subtopics.map((sub: any, idx: number) => (
                             <textarea 
                               key={idx}
                               value={sub.content}
                               onChange={(e) => handleSubTopicEdit(idx, 'content', e.target.value)}
                               className="w-full min-h-[450px] text-[12px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50/10 dark:bg-slate-800/10 p-6 rounded-[2rem] focus:outline-none border-2 border-transparent focus:border-emerald-500 transition-all leading-loose shadow-inner [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                               placeholder="Combined Lesson Content..."
                             />
                           ))}
                           <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 py-2 px-4 rounded-full w-fit mx-auto mt-4">
                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />

                           </div>
                         </div>
                       </div>
                     </div>

                     <div className="pt-2">
                       <button 
                         onClick={handleSave}
                         className="py-3 px-8 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl shadow-lg shadow-emerald-500/20 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all transform active:scale-95 mx-auto"
                       >
                         <CheckCircle2 size={16} />
                         Add to Topic
                       </button>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
               
               <div className="flex flex-col gap-2 mt-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input 
                     type="checkbox" 
                     checked={appendToExisting}
                     onChange={e => setAppendToExisting(e.target.checked)}
                     className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-500 bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-600"
                   />
 
                 </label>
                 {appendToExisting && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Main Topic</label>
                        <select 
                          value={selectedTopicId}
                          onChange={e => setSelectedTopicId(e.target.value)}
                          className="mt-1 w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold focus:outline-none focus:border-indigo-500 shadow-sm transition-all"
                        >
                          <option value="">-- Choose a Module --</option>
                          {availableTopics.map(t => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                      </div>

                      {selectedTopicId && (
                        <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Target Sub-topic (Optional)</label>
                          <select 
                            value={selectedSubTopicId}
                            onChange={e => setSelectedSubTopicId(e.target.value)}
                            className="mt-1 w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold focus:outline-none focus:border-indigo-500 shadow-sm transition-all"
                          >
                            <option value="">-- Append as New Sub-topics --</option>
                            {availableTopics.find(t => t.id === selectedTopicId)?.steps?.map((step: any) => (
                              <option key={step.id} value={step.id}>{step.title}</option>
                            ))}
                          </select>
                          <p className="text-[9px] text-slate-400 italic ml-1 mt-1">If selected, data will be merged into this specific category.</p>
                        </div>
                      )}
                    </div>
                  )}
               </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-bold flex items-center gap-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button 
                onClick={handleGenerate}
                disabled={isGenerating || isBatchProcessing || !inputText.trim()}
                className="w-full py-4 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-black rounded-2xl flex items-center justify-center gap-2 transition-all transform active:scale-95 text-[10px] uppercase tracking-widest border-2 border-indigo-100 dark:border-indigo-500/20"
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {isGenerating ? "Generating..." : "AI Generate & Preview"}
              </button>
              <button 
                onClick={handleAutoExtract}
                disabled={isGenerating || !inputText.trim() || (appendToExisting && !selectedTopicId)}
                className="w-full py-4 bg-slate-900 dark:bg-slate-800 hover:bg-black dark:hover:bg-slate-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 text-[10px] uppercase tracking-widest"
              >
                <Upload size={18} />
                Quick Save
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
