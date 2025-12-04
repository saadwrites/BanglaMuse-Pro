import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  PenTool,
  BookOpen,
  Feather,
  History,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Play,
  Square,
  Download,
  Trash2,
  Maximize2,
  Minimize2,
  Wand2,
  Settings,
  X,
  FileText
} from "lucide-react";

// --- Configuration ---
const API_KEY = process.env.API_KEY;

// Initialize GenAI
let ai: GoogleGenAI | null = null;
if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

// --- Audio Utilities ---
const decodeAudioData = async (
  base64String: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await audioContext.decodeAudioData(bytes.buffer);
};

// --- Types ---
type CategoryId = 'article' | 'fiction' | 'poetry' | 'memoir';
type LengthOption = 'short' | 'medium' | 'long';

interface Category {
  id: CategoryId;
  label: string;
  bnLabel: string;
  icon: React.ElementType;
  description: string;
}

interface HistoryItem {
  id: string;
  category: CategoryId;
  idea: string;
  content: string;
  timestamp: number;
}

const CATEGORIES: Category[] = [
  { id: 'article', label: 'Article', bnLabel: 'প্রবন্ধ', icon: PenTool, description: 'তথ্যবহুল ও বিশ্লেষণধর্মী লেখা' },
  { id: 'fiction', label: 'Fiction', bnLabel: 'গল্প', icon: BookOpen, description: 'কাল্পনিক ও সৃজনশীল গল্প' },
  { id: 'poetry', label: 'Poetry', bnLabel: 'কবিতা', icon: Feather, description: 'ছন্দ ও আবেগের বহিঃপ্রকাশ' },
  { id: 'memoir', label: 'Memoir', bnLabel: 'স্মৃতিচারণ', icon: History, description: 'অতীতের স্মৃতি ও অভিজ্ঞতা' },
];

const LENGTH_OPTIONS: { id: LengthOption; label: string }[] = [
  { id: 'short', label: 'ছোট (Short)' },
  { id: 'medium', label: 'মাঝারি (Medium)' },
  { id: 'long', label: 'বড় (Long)' },
];

// --- Mock Fallback Logic ---
const getMockResponse = (category: CategoryId, idea: string, hasStyle: boolean): string => {
  const baseIntro = hasStyle
    ? "(কাস্টম স্টাইল অনুকরণ করা হয়েছে) "
    : "";

  switch (category) {
    case 'memoir':
      return `${baseIntro}মনে পড়ে সেই পুরনো দিনের কথা... ${idea} নিয়ে ভাবলে আজও মনটা কেমন যেন করে ওঠে। জানলার ধারে বসে বৃষ্টির শব্দ শুনতে শুনতে পুরনো স্মৃতির পাতায় ডুব দিলাম। সময় যেন থমকে গেছে সেই ধুলোমাখা বিকেলে।`;
    case 'poetry':
      return `${baseIntro}আকাশের নীল সীমানায়,\nখুঁজে ফিরি তোমার ছায়া।\n${idea} যেন এক অলীক স্বপ্ন,\nবুনছে মনে নতুন মায়া।\nবাতাসের কানে কানে,\nবলে যাই রূপকথা,\nহৃদয়ের গহীনে,\nজমে থাকা ব্যথা।`;
    case 'fiction':
      return `${baseIntro}গ্রামের শেষ প্রান্তে যে পুরনো বটগাছটি ছিল, তাকে ঘিরে অনেক গল্প প্রচলিত। একদিন বিকেলে, ${idea} নিয়ে ভাবতে ভাবতে রফিক সেখানে গিয়ে বসলো। হঠাৎ দেখল এক অদ্ভুত ছায়া দীর্ঘ হয়ে তার দিকে এগিয়ে আসছে। বাতাসের শোঁ শোঁ শব্দে মনে হলো কেউ যেন ফিসফিস করে কিছু বলছে।`;
    default:
      return `${baseIntro}বর্তমান সময়ে ${idea} একটি অত্যন্ত গুরুত্বপূর্ণ বিষয়। এর প্রভাব আমাদের দৈনন্দিন জীবনে গভীরভাবে পরিলক্ষিত হয়। এ নিয়ে বিস্তারিত আলোচনা করা প্রয়োজন। সমাজ ও সংস্কৃতির বিবর্তনের সাথে সাথে এই বিষয়টি নতুন মাত্রা যোগ করেছে। আমাদের উচিত এ সম্পর্কে সচেতন হওয়া।`;
  }
};

// --- Components ---

function App() {
  // --- State ---
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('article');
  const [idea, setIdea] = useState("");
  const [styleRef, setStyleRef] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  
  // Settings
  const [lengthOpt, setLengthOpt] = useState<LengthOption>('medium');
  const [creativity, setCreativity] = useState(0.8); // 0.0 to 1.0

  // UI State
  const [isStyleOpen, setIsStyleOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStyleBadge, setShowStyleBadge] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Audio State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // --- Effects ---
  useEffect(() => {
    const saved = localStorage.getItem('banglamuse_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('banglamuse_history', JSON.stringify(history));
  }, [history]);

  // --- Helpers ---
  const addToHistory = (text: string, cat: CategoryId, promptIdea: string) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      category: cat,
      idea: promptIdea,
      content: text,
      timestamp: Date.now()
    };
    setHistory(prev => [newItem, ...prev]);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setSelectedCategory(item.category);
    setIdea(item.idea);
    setGeneratedContent(item.content);
    setShowHistory(false);
    setShowStyleBadge(false); // Can't track style ref from simple history yet
  };

  const getWordCount = (text: string) => {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  };

  const handleDownload = () => {
    if (!generatedContent) return;
    const element = document.createElement("a");
    const file = new Blob([generatedContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `BanglaMuse-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // --- Core Functions ---

  const handleGenerate = async () => {
    if (!idea.trim()) {
      setError("অনুগ্রহ করে আপনার আইডিয়া বা বিষয় লিখুন।");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedContent("");
    setShowStyleBadge(!!styleRef.trim());
    stopAudio(); // Stop any playing audio

    try {
      if (!ai) throw new Error("API Key missing");

      // Construct Prompt
      let systemInstruction = `You are an expert Bengali creative writer known for your eloquent and engaging prose. Your task is to write a piece of content in Bengali based on the user's specific requirements. Language: STRICTLY BENGALI.`;
      
      let userPrompt = `Task: Write a ${CATEGORIES.find(c => c.id === selectedCategory)?.label} (${CATEGORIES.find(c => c.id === selectedCategory)?.bnLabel}) about: "${idea}".\n`;
      userPrompt += `Length: ${lengthOpt} (approx ${lengthOpt === 'short' ? '150' : lengthOpt === 'medium' ? '300' : '600'} words).\n`;

      if (selectedCategory === 'memoir') {
        userPrompt += `Tone: Write in a nostalgic, first-person perspective with emotional depth. Use sensory details to evoke memory.\n`;
      }

      if (styleRef.trim()) {
        userPrompt += `\nCRITICAL STYLE INSTRUCTION: Analyze the following sample text carefully. Mimic its vocabulary, sentence structure, tone, flow, and emotion. Adapt this EXACT style to write the new content.\n\nSample Text (Training Data):\n"${styleRef}"\n`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: creativity,
        }
      });

      const text = response.text;
      if (text) {
        setGeneratedContent(text);
        addToHistory(text, selectedCategory, idea);
      } else {
        throw new Error("No content generated");
      }

    } catch (err) {
      console.warn("API Error or Fallback triggered:", err);
      // Mock Fallback
      const mockText = getMockResponse(selectedCategory, idea, !!styleRef.trim());
      await new Promise(resolve => setTimeout(resolve, 1500));
      setGeneratedContent(mockText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefine = async (action: 'shorten' | 'expand' | 'polish') => {
    if (!generatedContent || !ai) return;
    setIsRefining(true);
    
    try {
      let prompt = `Original Text:\n"${generatedContent}"\n\n`;
      
      switch(action) {
        case 'shorten':
          prompt += `Task: Rewrite the above Bengali text to be shorter and more concise while keeping the main message.`;
          break;
        case 'expand':
          prompt += `Task: Expand the above Bengali text with more details, descriptions, and emotional depth.`;
          break;
        case 'polish':
          prompt += `Task: Polish the above Bengali text to make it more grammatically elegant, professional, and flow better.`;
          break;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text;
      if (text) {
        setGeneratedContent(text);
        addToHistory(text, selectedCategory, `${idea} (${action})`);
      }
    } catch (err) {
      console.error(err);
      setError("পরিবর্তন করা সম্ভব হয়নি। আবার চেষ্টা করুন।");
    } finally {
      setIsRefining(false);
    }
  };

  const handleTTS = async () => {
    if (!generatedContent) return;
    if (isPlayingAudio) {
      stopAudio();
      return;
    }

    setIsGeneratingAudio(true);
    try {
      if (!ai) throw new Error("API Key missing");

      // Truncate for TTS if too long to prevent timeouts (optional safety)
      const ttsContent = generatedContent.length > 2000 ? generatedContent.substring(0, 2000) : generatedContent;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: ttsContent }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio data received");

      // Init Audio Context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      }

      const audioBuffer = await decodeAudioData(base64Audio, audioContextRef.current);
      
      // Play
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPlayingAudio(false);
      
      audioSourceRef.current = source;
      source.start();
      setIsPlayingAudio(true);

    } catch (err) {
      console.error("TTS Error:", err);
      setError("অডিও জেনারেট করা সম্ভব হয়নি।");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // ignore
      }
      audioSourceRef.current = null;
    }
    setIsPlayingAudio(false);
  };

  const handleCopy = () => {
    if (!generatedContent) return;
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-800 bg-slate-50 relative overflow-hidden">
      
      {/* History Sidebar / Overlay */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <div className="relative w-80 bg-white shadow-2xl h-full flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <History size={18} /> পূর্বের লেখা (History)
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {history.length === 0 ? (
                <div className="text-center p-8 text-slate-400 text-sm">কোনো ইতিহাস পাওয়া যায়নি।</div>
              ) : (
                history.map((item) => (
                  <div key={item.id} onClick={() => loadHistoryItem(item)} className="p-3 rounded-lg border border-slate-100 hover:border-amber-300 hover:bg-amber-50 cursor-pointer group transition-all">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-amber-600 uppercase">{CATEGORIES.find(c => c.id === item.category)?.bnLabel}</span>
                      <button 
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-slate-800 line-clamp-2 font-medium mb-1">{item.idea}</p>
                    <p className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleDateString()} • {getWordCount(item.content)} words</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-2.5 rounded-xl text-white shadow-lg shadow-amber-500/30">
              <Sparkles size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">BanglaMuse <span className="text-amber-600">Pro</span></h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-0.5">আপনার স্টাইলে, আপনার ভাষায়</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-white hover:text-amber-600 transition-all"
            >
              <History size={18} />
              <span className="hidden sm:inline">ইতিহাস</span>
            </button>
            <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 flex items-center gap-1.5">
               <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
               Gemini 2.5
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* LEFT COLUMN: INPUTS (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            
            {/* Category Selection */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Square size={12} className="fill-slate-400" />
                ক্যাটাগরি (Category)
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`relative flex flex-col items-start p-3 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-md active:scale-[0.98] ${
                        isSelected 
                          ? 'border-amber-500 bg-amber-50/50 shadow-sm' 
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`p-2 rounded-lg mb-2 ${isSelected ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={20} />
                      </div>
                      <span className={`font-bold text-sm block ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                        {cat.bnLabel}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wide">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Idea Input */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <PenTool size={12} className="fill-slate-400" />
                আইডিয়া (Topic)
              </h2>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="উদাহরণ: বর্ষার বিকেলে একাকী বসে থাকার অনুভূতি..."
                className="w-full h-28 p-4 rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none resize-none bg-white text-slate-800 placeholder:text-slate-400 text-base transition-all shadow-sm"
              />
            </section>

            {/* Advanced Settings (Accordion) */}
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
               <button 
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-slate-700">
                  <Settings size={16} />
                  <span className="text-sm font-semibold">উন্নত সেটিংস (Advanced)</span>
                </div>
                {isAdvancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {isAdvancedOpen && (
                <div className="p-4 border-t border-slate-200 space-y-4 bg-white">
                  {/* Length Selector */}
                  <div>
                     <label className="text-xs font-semibold text-slate-500 mb-2 block uppercase">লেখার দৈর্ঘ্য (Length)</label>
                     <div className="flex bg-slate-100 p-1 rounded-lg">
                       {LENGTH_OPTIONS.map((opt) => (
                         <button
                           key={opt.id}
                           onClick={() => setLengthOpt(opt.id)}
                           className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                             lengthOpt === opt.id 
                               ? 'bg-white text-slate-900 shadow-sm border border-slate-200' 
                               : 'text-slate-500 hover:text-slate-700'
                           }`}
                         >
                           {opt.label}
                         </button>
                       ))}
                     </div>
                  </div>

                  {/* Creativity Slider */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase">সৃজনশীলতা (Creativity)</label>
                      <span className="text-xs text-amber-600 font-bold">{Math.round(creativity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.1"
                      value={creativity}
                      onChange={(e) => setCreativity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>যৌক্তিক (Logical)</span>
                      <span>কল্পনাপ্রবণ (Creative)</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Style Reference (Accordion) */}
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <button 
                onClick={() => setIsStyleOpen(!isStyleOpen)}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-slate-700" />
                  <span className="text-sm font-semibold text-slate-700">স্টাইল মিমিক্রি (Style AI)</span>
                </div>
                 {styleRef.trim() ? (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">ACTIVE</span>
                 ) : (
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold">OPTIONAL</span>
                 )}
              </button>
              
              {isStyleOpen && (
                <div className="p-4 border-t border-slate-200">
                   <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                     পছন্দের লেখকের লেখার অংশ এখানে পেস্ট করুন। AI সেই লেখার ভঙ্গি অনুকরণ করবে।
                   </p>
                  <textarea
                    value={styleRef}
                    onChange={(e) => setStyleRef(e.target.value)}
                    placeholder="নমুনা টেক্সট এখানে দিন..."
                    className="w-full h-32 p-3 rounded-lg border border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none text-sm leading-relaxed"
                  />
                </div>
              )}
            </section>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-sm animate-pulse">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg hover:shadow-slate-900/20 transition-all flex items-center justify-center gap-2 text-lg active:scale-[0.99] group mt-auto"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  লেখা তৈরি হচ্ছে...
                </>
              ) : (
                <>
                  <Sparkles size={20} className="group-hover:text-amber-400 transition-colors" />
                  লেখা তৈরি করুন
                </>
              )}
            </button>

          </div>

          {/* RIGHT COLUMN: OUTPUT (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col h-full min-h-[600px] lg:min-h-0">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 lg:hidden">ফলাফল (Output)</h2>
            <div className="relative flex-grow bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              
              {/* Output Header Toolbar */}
              <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-md">
                     <FileText size={14} className="text-slate-400"/>
                     <span className="text-xs font-semibold text-slate-600">
                       {getWordCount(generatedContent)} শব্দ
                     </span>
                  </div>
                  
                  {showStyleBadge && generatedContent && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full font-bold flex items-center gap-1 animate-in fade-in zoom-in">
                      <Sparkles size={10} />
                      Custom Style
                    </span>
                  )}
                </div>

                {generatedContent && (
                  <div className="flex items-center gap-2">
                     {/* TTS Button */}
                     <button
                      onClick={handleTTS}
                      disabled={isGeneratingAudio}
                      className={`p-2 rounded-md transition-all ${
                        isPlayingAudio 
                          ? 'bg-red-100 text-red-600 animate-pulse' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-blue-600'
                      }`}
                      title="Read Aloud"
                    >
                      {isGeneratingAudio ? (
                         <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                      ) : isPlayingAudio ? (
                         <Square size={16} fill="currentColor" />
                      ) : (
                         <Play size={16} />
                      )}
                    </button>

                    <button
                      onClick={handleDownload}
                      className="p-2 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      title="Download Text"
                    >
                      <Download size={16} />
                    </button>

                    <button
                      onClick={handleCopy}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        copied 
                          ? "bg-green-500 text-white border-green-500 shadow-md" 
                          : "bg-slate-800 text-white border border-slate-800 hover:bg-slate-700 shadow-md hover:shadow-lg"
                      }`}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>

              {/* Output Content Area */}
              <div className="flex-grow relative bg-slate-50/30">
                <div className="absolute inset-0 p-6 lg:p-10 overflow-y-auto custom-scrollbar">
                  {generatedContent ? (
                    <div className="max-w-none">
                      <p className="whitespace-pre-wrap text-lg md:text-xl leading-loose text-slate-800 font-medium font-bengali">
                        {generatedContent}
                      </p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                       <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                          {isLoading ? (
                            <Sparkles size={40} className="text-amber-400 animate-spin-slow" />
                          ) : (
                            <Feather size={40} className="text-slate-300" />
                          )}
                       </div>
                       {isLoading ? (
                         <div className="text-center space-y-2">
                           <p className="text-lg font-medium text-slate-600">AI ইজ থিংকিং...</p>
                           <p className="text-sm text-slate-400">দয়া করে অপেক্ষা করুন</p>
                         </div>
                       ) : (
                         <div className="text-center">
                           <h3 className="text-lg font-semibold text-slate-600 mb-2">প্রস্তুত বাংলা মিউজ প্রো</h3>
                           <p className="text-sm text-slate-400 max-w-xs mx-auto">বাম পাশের প্যানেল থেকে আপনার বিষয় লিখুন এবং জেনারেট বাটনে ক্লিক করুন</p>
                         </div>
                       )}
                    </div>
                  )}
                </div>
              </div>

              {/* Smart Tools Footer */}
              {generatedContent && !isLoading && (
                 <div className="border-t border-slate-200 p-3 bg-white">
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                       <span className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap mr-1">স্মার্ট এডিট:</span>
                       <button 
                         onClick={() => handleRefine('shorten')}
                         disabled={isRefining}
                         className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 text-xs font-medium transition-colors border border-slate-200 disabled:opacity-50 whitespace-nowrap"
                       >
                         {isRefining ? <span className="animate-spin">⏳</span> : <Minimize2 size={12} />}
                         ছোট করুন
                       </button>
                       <button 
                         onClick={() => handleRefine('expand')}
                         disabled={isRefining}
                         className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 text-xs font-medium transition-colors border border-slate-200 disabled:opacity-50 whitespace-nowrap"
                       >
                         {isRefining ? <span className="animate-spin">⏳</span> : <Maximize2 size={12} />}
                         বিস্তারিত করুন
                       </button>
                       <button 
                         onClick={() => handleRefine('polish')}
                         disabled={isRefining}
                         className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 text-xs font-medium transition-colors border border-slate-200 disabled:opacity-50 whitespace-nowrap"
                       >
                         {isRefining ? <span className="animate-spin">⏳</span> : <Sparkles size={12} />}
                         মার্জিত করুন
                       </button>
                    </div>
                 </div>
              )}

            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
