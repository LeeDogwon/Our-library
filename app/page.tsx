'use client';
Import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query, setDoc, deleteDoc } from 'firebase/firestore';
import { Book, Plus, Save, ChevronLeft, Trash2, Heart, MessageCircle, User, Send, Hash, ArrowLeft, MessageSquarePlus, X, RotateCcw, Trash, Sparkles, CheckCircle, BookOpen } from 'lucide-react';

// --- Firebase Configuration ---
// Vercel 환경 변수에서 설정값을 가져옵니다. 
// 값이 없을 경우를 대비해 빈 객체({})를 기본값으로 둡니다.
const firebaseConfig = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG || '{}');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// appId는 프로젝트를 구분하는 고유 이름입니다.
const appId = 'our-library'; 

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home'); 
  const [books, setBooks] = useState([]);
  const [allProgress, setAllProgress] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [activeTopicPage, setActiveTopicPage] = useState(null); 
  const [loading, setLoading] = useState(true);

  const [swipedBookId, setSwipedBookId] = useState(null);
  const [formInput, setFormInput] = useState({ title: '', author: '', totalPages: '' });
  const [chatInput, setChatInput] = useState('');
  const [newPageTopic, setNewPageTopic] = useState('');

  // 1. Authentication
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Sync
  useEffect(() => {
    if (!user) return;

    const bQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'books'));
    const unsubBooks = onSnapshot(bQuery, (snap) => {
      setBooks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.createdAt - a.createdAt));
    }, (err) => console.error("Books Sync Error:", err));

    const pQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'progress'));
    const unsubProg = onSnapshot(pQuery, (snap) => {
      setAllProgress(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const mQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'messages'));
    const unsubMessages = onSnapshot(mQuery, (snap) => {
      setAllMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubBooks(); unsubProg(); unsubMessages(); };
  }, [user]);

  const currentTopics = useMemo(() => {
    if (!selectedBook) return [];
    const msgs = allMessages.filter(m => m.bookId === selectedBook.id);
    return [...new Set(msgs.map(m => m.page))].sort((a, b) => a - b);
  }, [allMessages, selectedBook]);

  const getMyProg = (bid) => allProgress.find(p => p.bookId === bid && p.userId === user?.uid) || { currentPage: 0 };
  const getPartnerProg = (bid) => allProgress.find(p => p.bookId === bid && p.userId !== user?.uid);

  // 3. Logic: Book Sorting (Both must finish for 'Completed')
  const filteredBooks = useMemo(() => {
    const active = books.filter(b => !b.isDeleted);
    const reading = [];
    const completed = [];
    
    active.forEach(b => {
      const my = getMyProg(b.id);
      const partner = getPartnerProg(b.id) || { currentPage: 0 };
      
      if (my.currentPage >= b.totalPages && partner.currentPage >= b.totalPages) {
        completed.push(b);
      } else {
        reading.push(b);
      }
    });

    return { reading, completed, trash: books.filter(b => b.isDeleted) };
  }, [books, allProgress, user]);

  // 4. Handlers
  const handleAddBook = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'books'), {
        ...formInput,
        totalPages: parseInt(formInput.totalPages) || 1,
        createdAt: Date.now(),
        createdBy: user.uid,
        isDeleted: false
      });
      setView('home');
      setFormInput({ title: '', author: '', totalPages: '' });
    } catch (err) { console.error(err); }
  };

  const handleUpdateProgress = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const updatedPage = parseInt(fd.get('currentPage'));
    if (updatedPage > selectedBook.totalPages) return;

    const progressId = `${selectedBook.id}_${user.uid}`;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'progress', progressId), {
        bookId: selectedBook.id,
        userId: user.uid,
        currentPage: updatedPage,
        updatedAt: Date.now()
      });
      setView('home');
      setSelectedBook(null);
    } catch (err) { console.error(err); }
  };

  const moveToTrash = async (id) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', id), {
        isDeleted: true,
        deletedAt: Date.now()
      });
      setSwipedBookId(null);
    } catch (err) { console.error(err); }
  };

  const restoreBook = async (id) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', id), {
        isDeleted: false,
        deletedAt: null
      });
    } catch (err) { console.error(err); }
  };

  const permanentDelete = async (id) => {
    if (!window.confirm("우리의 기록이 영구히 삭제됩니다. 정말 지울까요?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'books', id));
    } catch (err) { console.error(err); }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        bookId: selectedBook.id,
        userId: user.uid,
        page: activeTopicPage,
        message: chatInput,
        createdAt: Date.now()
      });
      setChatInput('');
    } catch (err) { console.error(err); }
  };

  const createTopic = async (e) => {
    e.preventDefault();
    if (!newPageTopic) return;
    const pageNum = parseInt(newPageTopic);
    if (pageNum > selectedBook.totalPages) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        bookId: selectedBook.id,
        userId: 'system',
        page: pageNum,
        message: `${pageNum}P 토론 방이 열렸어요!`,
        createdAt: Date.now()
      });
      setActiveTopicPage(pageNum);
      setNewPageTopic('');
    } catch (err) { console.error(err); }
  };

  const SwipeableCard = ({ book, children }) => {
    const [startX, setStartX] = useState(0);
    const [currentX, setCurrentX] = useState(0);
    const isSwiped = swipedBookId === book.id;

    const onTouchStart = (e) => {
      setStartX(e.touches[0].clientX);
      setSwipedBookId(null);
    };

    const onTouchMove = (e) => {
      const diff = e.touches[0].clientX - startX;
      if (diff < 0) setCurrentX(diff);
    };

    const onTouchEnd = () => {
      if (currentX < -80) setSwipedBookId(book.id);
      setCurrentX(0);
    };

    return (
      <div className="relative overflow-hidden rounded-[2.5rem]">
        <div 
          className="absolute right-0 top-0 bottom-0 w-20 bg-rose-500/90 flex items-center justify-center text-white cursor-pointer active:bg-rose-600 transition-colors"
          onClick={(e) => { e.stopPropagation(); moveToTrash(book.id); }}
        >
          <Trash2 size={20} />
        </div>
        <div 
          className="relative transition-transform duration-300 ease-out bg-slate-900 border border-slate-800 p-6 z-10"
          style={{ transform: `translateX(${isSwiped ? -80 : currentX}px)` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={() => {
            if (isSwiped) { setSwipedBookId(null); }
            else { setSelectedBook(book); setView('edit'); }
          }}
        >
          {children}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
      <div className="relative">
        <Heart size={48} className="text-rose-500 animate-pulse fill-rose-500/20" />
        <Sparkles size={16} className="absolute -top-1 -right-1 text-indigo-400 animate-bounce" />
      </div>
      <p className="mt-6 text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em]">Connecting to Our Hearts...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans p-6 md:p-10 selection:bg-rose-500/30">
      <div className="max-w-md mx-auto">
        
        {/* Header */}
        <header className="flex justify-between items-start mb-12">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.1)]">
              <Heart size={10} className="text-rose-400 fill-rose-400" />
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em]">Our Shared Sanctuary</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tighter leading-tight">
              우리의 서재
            </h1>
            <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
              두 사람이 함께 페이지를 덮을 때 완독이 기록됩니다 <Sparkles size={10} className="text-yellow-500/50" />
            </p>
          </div>
          <div className="flex gap-2.5 pt-1">
            <button 
              onClick={() => setView('trash')} 
              className={`p-3.5 rounded-2xl transition-all border ${view === 'trash' ? 'bg-rose-500 border-rose-400 text-white' : 'bg-slate-900 text-slate-500 border-slate-800'}`}
            >
              <Trash size={18} />
            </button>
            {view === 'home' && (
              <button onClick={() => setView('add')} className="p-4 bg-indigo-600 rounded-2xl shadow-[0_10px_20px_rgba(79,70,229,0.3)] text-white hover:bg-indigo-500 transition-all">
                <Plus size={22} strokeWidth={2.5} />
              </button>
            )}
            {view !== 'home' && (
               <button onClick={() => {setView('home'); setSelectedBook(null); setActiveTopicPage(null);}} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-300">
               <ChevronLeft size={22} strokeWidth={2.5} />
             </button>
            )}
          </div>
        </header>

        {/* Dashboard Count */}
        {view === 'home' && (
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-[2rem] shadow-xl relative overflow-hidden group">
              <div className="absolute -right-2 -top-2 opacity-5 group-hover:opacity-10 transition-opacity">
                <BookOpen size={60} className="text-indigo-400" />
              </div>
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div> Reading
              </p>
              <p className="text-2xl font-black text-white">{filteredBooks.reading.length} <span className="text-xs font-medium text-slate-600 ml-0.5 uppercase tracking-tighter">Books</span></p>
            </div>
            <button 
              onClick={() => setView('completed')}
              className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-[2rem] text-left hover:border-emerald-500/40 transition-all shadow-xl relative overflow-hidden group"
            >
              <div className="absolute -right-2 -top-2 opacity-5 group-hover:opacity-10 transition-opacity">
                <CheckCircle size={60} className="text-emerald-400" />
              </div>
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <CheckCircle size={10} /> Completed
              </p>
              <p className="text-2xl font-black text-white">{filteredBooks.completed.length} <span className="text-xs font-medium text-slate-600 ml-0.5 uppercase tracking-tighter">Books</span></p>
            </button>
          </div>
        )}

        {/* Home: Reading List */}
        {view === 'home' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 px-1">
               <div className="h-[1px] flex-1 bg-slate-800"></div>
               <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Active Journey</span>
               <div className="h-[1px] flex-1 bg-slate-800"></div>
            </div>
            
            {filteredBooks.reading.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/10 border border-slate-800 border-dashed rounded-[3rem] opacity-40">
                <Heart size={40} className="mx-auto mb-4 text-slate-800" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Our shelf is waiting for a new story</p>
              </div>
            ) : (
              filteredBooks.reading.map(book => {
                const my = getMyProg(book.id);
                const partner = getPartnerProg(book.id) || { currentPage: 0 };
                const myPct = Math.min(Math.round((my.currentPage / book.totalPages) * 100), 100) || 0;
                const ptPct = Math.min(Math.round((partner.currentPage / book.totalPages) * 100), 100) || 0;

                return (
                  <SwipeableCard key={book.id} book={book}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex-1 pr-4 min-w-0">
                        <h3 className="font-bold text-xl text-white truncate tracking-tight group-hover:text-indigo-400 transition-colors">{book.title}</h3>
                        <p className="text-slate-500 text-[10px] mt-1 font-bold uppercase tracking-[0.1em]">{book.author}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-white leading-none tracking-tighter">{myPct}%</span>
                      </div>
                    </div>

                    <div className="space-y-5">
                      {/* My Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                            <User size={10} /> Me
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{my.currentPage} <span className="opacity-30">/</span> {book.totalPages}</span>
                        </div>
                        <div className="w-full bg-slate-950/50 h-2 rounded-full overflow-hidden border border-slate-800/50">
                          <div className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(79,70,229,0.4)]" style={{ width: `${myPct}%` }} />
                        </div>
                      </div>
                      {/* Partner Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Heart size={10} className="fill-rose-400" /> Partner
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{partner.currentPage} <span className="opacity-30">/</span> {book.totalPages}</span>
                        </div>
                        <div className="w-full bg-slate-950/50 h-1.5 rounded-full overflow-hidden border border-slate-800/50">
                          <div className="bg-gradient-to-r from-rose-500 to-rose-400 h-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(244,63,94,0.3)]" style={{ width: `${ptPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </SwipeableCard>
                );
              })
            )}
          </div>
        )}

        {/* Completed View */}
        {view === 'completed' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 space-y-5">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                 <CheckCircle size={24} className="text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tighter">함께 마친 이야기들</h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Two Hearts, One Story</p>
              </div>
            </div>
            {filteredBooks.completed.length === 0 ? (
              <div className="text-center py-24 bg-slate-900/5 border border-slate-800 rounded-[3rem] opacity-30">
                <Sparkles size={32} className="mx-auto mb-4 text-slate-700" />
                <p className="text-[10px] font-bold uppercase tracking-widest">No shared completions yet</p>
              </div>
            ) : (
              filteredBooks.completed.map(book => (
                <div key={book.id} onClick={() => {setSelectedBook(book); setView('edit');}} className="group bg-slate-900/40 border border-emerald-500/20 p-6 rounded-[2.5rem] flex justify-between items-center cursor-pointer hover:border-emerald-500/40 transition-all shadow-xl">
                  <div className="min-w-0 pr-4">
                    <h3 className="font-bold text-slate-200 truncate group-hover:text-emerald-400 transition-colors">{book.title}</h3>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="text-[9px] bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full font-black uppercase">Success</span>
                       <span className="text-[10px] text-slate-600 font-mono tracking-tighter italic">우리만의 역사에 기록됨</span>
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-500 shadow-inner">
                    <CheckCircle size={20} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Trash View */}
        {view === 'trash' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
            <div className="flex items-center gap-3 mb-8">
               <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                 <Trash2 size={24} className="text-rose-500" />
               </div>
               <h2 className="text-xl font-bold text-white tracking-tighter uppercase">우리의 쓰레기통</h2>
            </div>
            {filteredBooks.trash.length === 0 ? (
              <p className="text-center py-20 text-slate-700 text-[10px] font-black uppercase tracking-widest">Trash is Empty</p>
            ) : (
              filteredBooks.trash.map(book => (
                <div key={book.id} className="bg-slate-900/50 border border-slate-800 p-5 rounded-[2rem] flex justify-between items-center shadow-lg">
                  <div className="min-w-0 pr-4">
                    <h3 className="font-bold text-slate-300 truncate">{book.title}</h3>
                    <p className="text-[9px] text-slate-600 mt-1 uppercase font-bold tracking-tighter">{new Date(book.deletedAt).toLocaleDateString()} 삭제됨</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => restoreBook(book.id)} className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all"><RotateCcw size={16} /></button>
                    <button onClick={() => permanentDelete(book.id)} className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Add View */}
        {view === 'add' && (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl animate-in fade-in slide-in-from-bottom-4 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 opacity-5">
               <Heart size={200} className="text-indigo-400 fill-indigo-400" />
            </div>
            <h2 className="text-2xl font-black mb-8 text-white tracking-tight relative z-10">우리의 책 추가</h2>
            <form onSubmit={handleAddBook} className="space-y-6 relative z-10">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-2 flex items-center gap-1.5">
                  <Book size={10} /> Book Title
                </label>
                <input required placeholder="책 제목을 적어주세요" value={formInput.title} onChange={e => setFormInput({...formInput, title: e.target.value})} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white placeholder-slate-700"/>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-2 flex items-center gap-1.5">
                   <User size={10} /> Author
                </label>
                <input required placeholder="저자 이름" value={formInput.author} onChange={e => setFormInput({...formInput, author: e.target.value})} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white placeholder-slate-700"/>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-2 flex items-center gap-1.5">
                   <BarChart2 size={10} className="text-indigo-400" /> Total Pages
                </label>
                <input required type="number" placeholder="마지막 페이지 번호" value={formInput.totalPages} onChange={e => setFormInput({...formInput, totalPages: e.target.value})} className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono transition-all text-white placeholder-slate-700"/>
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 py-5 rounded-3xl font-black text-xs text-white uppercase tracking-[0.3em] shadow-[0_15px_30px_rgba(79,70,229,0.3)] mt-6 hover:brightness-110 transition-all active:scale-95">Add to Shelf</button>
            </form>
          </div>
        )}

        {/* Edit & Threaded Discussion */}
        {view === 'edit' && selectedBook && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6 pb-20">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
              <div className="absolute -top-6 -right-6 opacity-5 rotate-12">
                 <CheckCircle size={150} className="text-emerald-500" />
              </div>
              <h2 className="text-2xl font-black mb-1 text-white leading-tight pr-10">{selectedBook.title}</h2>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-12">{selectedBook.author}</p>
              
              <form onSubmit={handleUpdateProgress} className="space-y-10 relative z-10">
                <div className="space-y-4">
                  <div className="flex justify-between items-end ml-1">
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Today's Progress</label>
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tighter">I'm on Page...</span>
                  </div>
                  <div className="relative">
                    <input 
                      name="currentPage" 
                      type="number" 
                      max={selectedBook.totalPages}
                      min="0"
                      defaultValue={getMyProg(selectedBook.id).currentPage} 
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-[2.5rem] px-10 py-8 text-6xl font-black outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-white shadow-inner" 
                    />
                    <span className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-700 font-black text-2xl">/ {selectedBook.totalPages}</span>
                  </div>
                </div>
                <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 py-5 rounded-3xl font-black text-xs text-white uppercase tracking-[0.3em] shadow-xl hover:brightness-110 active:scale-95 transition-all">Update My Journey</button>
              </form>
            </div>

            {/* Threaded Discussions: ENLARGED Page Placeholder and Box */}
            {!activeTopicPage ? (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-xl">
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-2.5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                    <MessageCircle size={20} className="text-indigo-400" />
                  </div>
                  <h3 className="font-black text-[11px] uppercase tracking-[0.3em] text-slate-400">Page Discussion</h3>
                </div>

                {/* Larger Topic Creation Input */}
                <form onSubmit={createTopic} className="flex gap-4 mb-12">
                  <div className="relative flex-1">
                    <Hash size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="number" 
                      placeholder="Page" 
                      max={selectedBook.totalPages}
                      value={newPageTopic} 
                      onChange={e => setNewPageTopic(e.target.value)} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-[2rem] pl-12 pr-6 py-6 text-lg outline-none focus:ring-2 focus:ring-indigo-500/30 text-white shadow-inner font-black font-mono" 
                    />
                  </div>
                  <button type="submit" className="bg-indigo-600 px-7 rounded-[2rem] text-white shadow-[0_8px_20px_rgba(79,70,229,0.3)] hover:bg-indigo-500 transition-all flex items-center justify-center">
                    <Plus size={28} strokeWidth={3} />
                  </button>
                </form>

                {/* Enlarged Topic Tabs */}
                <div className="space-y-5">
                  {currentTopics.map(p => (
                    <button key={p} onClick={() => setActiveTopicPage(p)} className="w-full flex items-center justify-between bg-slate-950 border border-slate-800/40 p-6 rounded-[2.5rem] hover:border-indigo-500/50 hover:bg-slate-800/20 transition-all group shadow-md active:scale-95">
                      <div className="flex items-center gap-6 min-w-0">
                        {/* Larger Page Box (w-16 h-16) */}
                        <div className="w-16 h-16 bg-indigo-500/10 rounded-[1.25rem] flex items-center justify-center text-indigo-400 font-black text-2xl border-2 border-indigo-500/20 flex-shrink-0 group-hover:scale-110 transition-transform shadow-inner font-mono">
                          {p}
                        </div>
                        <div className="text-left truncate">
                          <p className="text-base font-black text-slate-100 truncate tracking-tight">{p}P 토론 공간</p>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
                             <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div> Active Topic
                          </p>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-slate-700 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all">
                        <ChevronLeft size={24} className="rotate-180" />
                      </div>
                    </button>
                  ))}
                  {currentTopics.length === 0 && (
                    <div className="text-center py-12">
                       <MessageCircle size={36} className="mx-auto text-slate-800 mb-3 opacity-20" />
                       <p className="text-slate-700 text-[10px] font-black uppercase tracking-[0.4em]">No Topics yet</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl animate-in slide-in-from-right-4 duration-400">
                <div className="flex justify-between items-center mb-10">
                  <button onClick={() => setActiveTopicPage(null)} className="flex items-center gap-2 text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all bg-indigo-500/5 px-5 py-2.5 rounded-full border border-indigo-500/10"><ArrowLeft size={14}/> 목록</button>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Page</span>
                    {/* Enlarged Badge in Chat room */}
                    <span className="w-14 h-14 bg-indigo-600/10 border-2 border-indigo-500/30 rounded-2xl flex items-center justify-center text-indigo-400 font-black text-xl shadow-lg font-mono">{activeTopicPage}</span>
                  </div>
                </div>

                <div className="space-y-6 mb-10 h-[400px] overflow-y-auto pr-2 custom-scrollbar flex flex-col pt-2">
                  {allMessages
                    .filter(m => m.bookId === selectedBook.id && m.page === activeTopicPage)
                    .sort((a,b) => a.createdAt - b.createdAt)
                    .map((m, i) => (
                      <div key={i} className={`flex flex-col ${m.userId === 'system' ? 'items-center' : m.userId === user.uid ? 'items-end' : 'items-start'}`}>
                        {m.userId === 'system' ? (
                          <div className="bg-slate-800/30 text-[9px] font-bold text-slate-500 px-6 py-2 rounded-full my-6 uppercase border border-slate-800 tracking-tighter shadow-sm">{m.message}</div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mb-2 px-1">
                               <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${m.userId === user.uid ? 'text-indigo-500' : 'text-rose-500'}`}>
                                  {m.userId === user.uid ? 'Me' : 'Partner'}
                               </span>
                               <span className="text-[8px] text-slate-800 font-mono">• {new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className={`max-w-[85%] px-5 py-4 rounded-[1.5rem] text-[13px] leading-relaxed shadow-sm border ${m.userId === user.uid ? 'bg-indigo-600 border-indigo-500 text-white rounded-tr-none' : 'bg-slate-950 border-slate-800 text-slate-300 rounded-tl-none'}`}>
                              {m.message}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                </div>

                <form onSubmit={sendMessage} className="relative mt-4">
                  <input placeholder="함께 나눌 메시지..." value={chatInput} onChange={e => setChatInput(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-[1.5rem] px-7 py-5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/30 text-white pr-16 shadow-inner" />
                  <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white hover:bg-indigo-500 transition-all shadow-lg active:scale-90"><Send size={18} /></button>
                </form>
              </div>
            )}
          </div>
        )}

        <footer className="mt-24 text-center pb-20">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/40 border border-slate-800/60 rounded-full mb-6 shadow-xl">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
             <p className="text-[10px] font-black text-slate-500 tracking-[0.3em] uppercase">Two Hearts Syncing</p>
          </div>
          <p className="text-[10px] font-black text-slate-800 tracking-[0.6em] uppercase">Digital Sanctuary • Eternal Connection</p>
        </footer>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }

        .py-4.5 { padding-top: 1.125rem; padding-bottom: 1.125rem; }
        
        .shadow-inner {
          box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);
        }
      `}</style>
    </div>
  );
}

// Utility icon
function BarChart2(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
