import React, { useState } from 'react';
import { Settings, Shield, Bell, Moon, Sun, Globe, HelpCircle, ChevronRight, User, Palette, Zap, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { PdfManager } from './PdfManager';
import { callGemini } from '../services/geminiService';

interface SettingsViewProps {
  onNavigateToAI: (text: string) => void;
}

export function SettingsView({ onNavigateToAI }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'resources'>('general');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('GEMINI_API_KEY') || '');
  const [saveStatus, setSaveStatus] = useState<null | 'saved'>(null);
  const [testStatus, setTestStatus] = useState<null | 'testing' | 'success' | 'error'>(null);
  const [testErrorMessage, setTestErrorMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        return saved === 'true';
      }
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('notificationsEnabled') === 'true');

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationsEnabled(true);
          localStorage.setItem('notificationsEnabled', 'true');
        } else {
          alert('Notification permission denied.');
        }
      } else {
        alert('This browser does not support notifications.');
      }
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem('notificationsEnabled', 'false');
    }
  };

  React.useEffect(() => {
    // Note: True daily background notifications require a Service Worker,
    // which is not supported in this runtime environment.
    // For now, this just demonstrates the notification browser capability when authorized.
  }, [notificationsEnabled]);

  const handleSaveKey = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleTestKey = async () => {
    if (!apiKey) {
      setTestStatus('error');
      setTestErrorMessage('Please enter an API key first');
      setTimeout(() => setTestStatus(null), 3000);
      return;
    }

    setTestStatus('testing');
    try {
      await callGemini({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: "ping" }] }]
      }, 0, 1000, apiKey); // 0 retries for testing
      setTestStatus('success');
      setTimeout(() => setTestStatus(null), 3000);
    } catch (err: any) {
      console.error(err);
      setTestStatus('error');
      setTestErrorMessage(err.message || 'Verification failed');
      setTimeout(() => setTestStatus(null), 5000);
    }
  };


  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  const toggleDarkMode = (dark: boolean) => {
    setIsDarkMode(dark);
  };

  return (
    <div className="w-full max-w-6xl mx-auto min-h-[85vh] flex flex-col bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[2.5rem] shadow-xl overflow-hidden">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 dark:bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg">
             <Settings size={24} />
          </div>
          <div>
             <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Settings & Resources</h2>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Manage your experience</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <input 
                type="password" 
                placeholder="Gemini API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="px-3 py-1.5 text-[10px] font-medium bg-slate-50 dark:bg-slate-900 border-none rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none w-32 md:w-48 text-slate-800 dark:text-white"
              />
              <div className="flex gap-1">
                <button 
                  onClick={handleTestKey}
                  disabled={testStatus === 'testing'}
                  className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${
                    testStatus === 'success' ? 'bg-emerald-500 text-white' : 
                    testStatus === 'error' ? 'bg-rose-500 text-white' :
                    'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {testStatus === 'testing' ? '...' : testStatus === 'success' ? '✓' : testStatus === 'error' ? '!' : 'Test'}
                </button>
                <button 
                  onClick={handleSaveKey}
                  className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${
                    saveStatus === 'saved' ? 'bg-emerald-500 text-white' : 'bg-indigo-500 text-white hover:bg-indigo-600'
                  }`}
                >
                  {saveStatus === 'saved' ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
            {testStatus === 'error' && (
              <p className="text-[8px] text-rose-500 font-bold ml-2 truncate max-w-[200px]">{testErrorMessage}</p>
            )}
            {testStatus === 'success' && (
              <p className="text-[8px] text-emerald-500 font-bold ml-2">API key is valid!</p>
            )}
          </div>
          
          <button className="px-5 py-2.5 border-2 border-rose-100 text-rose-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 transition-all">
            Log Out
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Sidebar Nav */}
        <div className="w-full md:w-56 border-r border-slate-100 dark:border-slate-800 p-4 bg-slate-50/30 dark:bg-slate-800/20">
          <div className="space-y-1">
            <button 
              onClick={() => setActiveTab('general')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'general' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <User size={16} /> General
            </button>
            <button 
              onClick={() => setActiveTab('resources')}
              className={`w-full p-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'resources' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Zap size={16} /> Resources
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'general' ? (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6 max-w-xl">
               <section className="space-y-3">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <Palette size={12} /> Appearance
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => toggleDarkMode(false)}
                      className={`p-4 bg-white dark:bg-slate-800 border-2 ${!isDarkMode ? 'border-indigo-500' : 'border-slate-100 dark:border-transparent'} rounded-2xl text-left`}
                    >
                       <Sun className={!isDarkMode ? "text-indigo-500 mb-1" : "text-slate-400 mb-1"} size={20} />
                       <p className="font-black text-sm text-slate-800 dark:text-white">Light</p>
                    </button>
                    <button 
                      onClick={() => toggleDarkMode(true)}
                      className={`p-4 bg-slate-50 dark:bg-slate-800/50 border-2 ${isDarkMode ? 'border-indigo-500' : 'border-transparent'} rounded-2xl text-left`}
                    >
                       <Moon className={isDarkMode ? "text-indigo-500 mb-1" : "text-slate-400 mb-1"} size={20} />
                       <p className="font-black text-sm text-slate-400 dark:text-white">Dark</p>
                    </button>
                  </div>
               </section>

               <section className="space-y-3">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <Bell size={12} /> Notifications
                  </h4>
                  <button 
                      onClick={toggleNotifications}
                      className={`w-full p-4 bg-white dark:bg-slate-800 border-2 ${notificationsEnabled ? 'border-emerald-500' : 'border-slate-50 dark:border-slate-800'} rounded-2xl flex items-center justify-between group hover:border-indigo-500 transition-all`}
                    >
                       <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 ${notificationsEnabled ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 dark:bg-slate-700 text-slate-400'} rounded-lg flex items-center justify-center`}>
                             <Bell size={20} />
                          </div>
                          <div className="text-left">
                             <p className="font-black text-sm text-slate-800 dark:text-white">Daily Practice Reminder</p>
                             <p className="text-[10px] text-slate-400 font-medium">{notificationsEnabled ? "Notifications enabled" : "Receive a daily reminder"}</p>
                             <span
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
                                    new Notification("GrammarBD Test", { body: "This is a test notification!" });
                                 } else {
                                    alert('Please enable notifications first.');
                                 }
                               }}
                               className="text-[9px] mt-1 text-indigo-500 font-black uppercase tracking-widest hover:underline cursor-pointer"
                             >
                               Test Notification
                             </span>
                          </div>
                       </div>
                       <div className={`w-8 h-4 rounded-full ${notificationsEnabled ? 'bg-emerald-500' : 'bg-slate-200'} transition-colors flex items-center ${notificationsEnabled ? 'justify-end' : 'justify-start'} px-0.5`}>
                         <div className="w-3 h-3 rounded-full bg-white"></div>
                       </div>
                    </button>
               </section>

               <section className="space-y-3">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <Globe size={12} /> App Preferences
                  </h4>
                  <div className="space-y-2">
                     {[
                       { icon: Bell, title: "Notifications", desc: "Keep up with your goals" },
                       { icon: Shield, title: "Privacy", desc: "Manage your data usage" },
                       { icon: HelpCircle, title: "Support", desc: "Get help from our team" }
                     ].map((item, idx) => (
                       <button key={idx} className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-800 rounded-2xl flex items-center justify-between group hover:border-indigo-500 transition-all">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-slate-50 dark:bg-slate-700 text-slate-400 rounded-lg flex items-center justify-center">
                                <item.icon size={20} />
                             </div>
                             <div className="text-left">
                                <p className="font-black text-sm text-slate-800 dark:text-white">{item.title}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{item.desc}</p>
                             </div>
                          </div>
                          <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500 transition-all" />
                       </button>
                     ))}
                  </div>
               </section>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
               <PdfManager 
                 onExtractText={(text) => {
                   onNavigateToAI(text);
                 }} 
               />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
