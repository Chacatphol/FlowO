import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { format, isToday, isPast, addMinutes, addHours, addDays, differenceInMinutes, differenceInHours, differenceInDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, add, isSameMonth, isSameDay, subDays, eachDayOfInterval, set, setHours, setMinutes } from "date-fns";
import { createPortal } from "react-dom";
import { th } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { Plus, Calendar as CalendarIcon, Bell, Trash2, Pencil, Check, CheckCircle, TimerReset, Upload, Download, ChevronLeft, ChevronRight, Link as LinkIcon, ListTodo, Sparkles, Folder, LayoutGrid, Layers, RefreshCw, Sun, Moon, BarChart3, LogOut, User, Flame, TrendingUp, Search, Filter, Menu, Circle, Minus, Flag, Clock, Archive, X } from "lucide-react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { db, auth } from "./firebase"; // Import auth
import { Button, GhostButton, Input, Textarea, Select, Card, SectionTitle, Badge, Progress } from './components/ui.jsx';
import PublicScheduleView from './PublicScheduleView.jsx';
import { DayPicker } from "react-day-picker";
import 'react-day-picker/dist/style.css';
import './day-picker.css';

// --- Data layer ---
const initialState = {
  subjects: [], // {id, name, color}
  tasks: [], // {id, subjectId, title, detail, startAt|null, dueAt|null, taskType:'deadline'|'event', link, status:'todo'|'doing'|'done', category:'เรียน'|'งาน'|'ส่วนตัว', reminders:[{type:'minutes'|'hours'|'days', amount:number}], createdAt, updatedAt}
  courses: [], // {id, name, code, room, pRoom, teacher, dayOfWeek:1-5, startTime, endTime, scheduleType:'odd-onsite'|'even-onsite'|'online-always'|'onsite-always', color, createdAt, updatedAt}
  scheduleOverrides: {},
  lastLogin: null,
  loginStreak: 0,
}

function reducer(state, action){
  switch(action.type){
    case 'load': {
      const loaded = action.payload;
      // Ensure loaded is an object and not null, otherwise reset to initial state
      if (typeof loaded !== 'object' || loaded === null) {
        return initialState;
      }
      return {
        ...initialState,
        subjects: Array.isArray(loaded.subjects) ? loaded.subjects.filter(s => s && typeof s === 'object') : [],
        tasks: Array.isArray(loaded.tasks) ? loaded.tasks.filter(t => t && typeof t === 'object') : [],
        courses: Array.isArray(loaded.courses) ? loaded.courses.filter(c => c && typeof c === 'object') : [],
        scheduleOverrides: typeof loaded.scheduleOverrides === 'object' && loaded.scheduleOverrides !== null ? loaded.scheduleOverrides : {},
        lastLogin: loaded.lastLogin || null,
        loginStreak: loaded.loginStreak || 0,
      };
    }
    case 'addSubject': return { ...state, subjects:[...state.subjects, action.payload] }
    case 'updateSubject': return { ...state, subjects: state.subjects.map(s=>s.id===action.payload.id? {...s,...action.payload}:s) }
    case 'deleteSubject': return { ...state, subjects: state.subjects.filter(s=>s.id!==action.id), tasks: state.tasks.filter(t=>t.subjectId!==action.id) }
    case 'addTask': return { ...state, tasks:[...state.tasks, action.payload] }
    case 'updateTask': return { ...state, tasks: state.tasks.map(t=>t.id===action.payload.id? {...t,...action.payload, updatedAt:Date.now()}:t) }
    case 'deleteTask': return { ...state, tasks: state.tasks.filter(t=>t.id!==action.id) }
    case 'addCourse': return { ...state, courses:[...state.courses, action.payload] }
    case 'updateCourse': return { ...state, courses: state.courses.map(c=>c.id===action.payload.id? {...c,...action.payload, updatedAt:Date.now()}:c) }
    case 'deleteCourse': return { ...state, courses: state.courses.filter(c=>c.id!==action.id) }
    case 'setScheduleOverride': {
      const { key, status } = action.payload;
      return { ...state, scheduleOverrides: { ...state.scheduleOverrides, [key]: status } };
    }
    case 'removeScheduleOverride': {
      const { key } = action.payload;
      const newOverrides = { ...state.scheduleOverrides };
      delete newOverrides[key];
      return { ...state, scheduleOverrides: newOverrides };
    }
    case 'updateLoginStreak': return { ...state, lastLogin: action.payload.lastLogin, loginStreak: action.payload.loginStreak }
    case 'reset': return { ...initialState, scheduleOverrides: {} }
    default: return state
  }
}

// --- Helpers ---
const uid = () => Math.random().toString(36).slice(2,9)
const hexToRgba = (hex, alpha = 1) => {
  if (!hex || !/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return '';
  let c = hex.substring(1).split('');
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  c = '0x' + c.join('');
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`;
};

// Calculate odd/even week (สัปดาห์คู่/คี่)
// Week starts on Monday and ends on Friday (5 days per week).
// Week of Dec 2, 2025 (Monday) is week 1 (odd).
const getWeekType = (date) => {
  const referenceDate = new Date('2025-12-02'); // Monday, Dec 2, 2025 - Week 1 (odd)
  
  // Get the start of the week (Monday) for both dates
  const weekStartOfDate = startOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
  const weekStartOfReference = startOfWeek(referenceDate, { weekStartsOn: 1 });
  
  // Calculate the number of weeks between the two Monday dates
  const weeksDiff = Math.floor(differenceInDays(weekStartOfDate, weekStartOfReference) / 7);
  
  // Week 0 (reference week) is odd, week 1 is even, week 2 is odd, etc.
  return weeksDiff % 2 === 0 ? 'odd' : 'even';
};

// Get course status (online/onsite) based on schedule type and current week, with overrides
const getCourseStatus = (course, date, scheduleOverrides = {}) => {
  const weekStartDate = startOfWeek(date, { weekStartsOn: 1 }); // เริ่มนับจากวันจันทร์
  const weekStartDateString = format(weekStartDate, 'yyyy-MM-dd');
  const overrideKey = `${course.id}_${weekStartDateString}`;

  if (scheduleOverrides[overrideKey]) {
    return { status: scheduleOverrides[overrideKey], isOverridden: true };
  }

  const weekType = getWeekType(date);
  let status = 'unknown';

  if (course.scheduleType === 'online-always') status = 'online';
  else if (course.scheduleType === 'onsite-always') status = 'onsite';
  else if (course.scheduleType === 'odd-onsite') {
    status = weekType === 'odd' ? 'onsite' : 'online';
  }
  else if (course.scheduleType === 'even-onsite') {
    status = weekType === 'even' ? 'onsite' : 'online';
  }

  return { status, isOverridden: false };
};

// Get courses for a specific day
const getCoursesForDay = (courses, date) => {
  const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  return courses
    .filter(c => c.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
};
// --- Data layer (Firebase) with Auth ---
function usePersistentState(userId){
  const [state, dispatch] = useReducer(reducer, initialState);
  const isInitialLoad = useRef(true);

  // Load data from Firestore when userId changes
  useEffect(() => {
    if (!userId) {
      dispatch({ type: 'reset' }); // Reset state if no user is logged in
      return;
    }
    isInitialLoad.current = true; // Set flag on user change
    const docRef = doc(db, "schedules", userId);

    // Use onSnapshot for real-time updates
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("📥 โหลดข้อมูลจาก Firestore:", data);
        dispatch({ type: 'load', payload: data });

        // Mark initial load as complete BEFORE any other dispatches
        isInitialLoad.current = false;

        // Check and update login streak
        const today = format(new Date(), 'yyyy-MM-dd');
        const lastLoginDate = data.lastLogin ? format(new Date(data.lastLogin), 'yyyy-MM-dd') : null;
        
        if (lastLoginDate !== today) {
            const yesterday = format(addDays(new Date(), -1), 'yyyy-MM-dd');
            const newStreak = lastLoginDate === yesterday ? (data.loginStreak || 0) + 1 : 1;
            console.log("🔥 อัปเดต login streak:", newStreak);
            dispatch({ type: 'updateLoginStreak', payload: { lastLogin: new Date().toISOString(), loginStreak: newStreak } });
        }

      } else {
        console.log("⚠️ ไม่พบข้อมูลผู้ใช้ จะสร้างใหม่เมื่อมีการบันทึกครั้งแรก");
        dispatch({ type: 'reset' }); // Start with a clean slate
        isInitialLoad.current = false; // Allow saving for new users
      }
    }, (error) => {
      console.error("❌ Error listening to document:", error);
      isInitialLoad.current = false; // Allow retry
    });

    // Cleanup function when component unmounts or userId changes
    return () => unsubscribe();
  }, [userId]);

  // Save data to Firestore whenever state changes
  useEffect(() => {
    // Prevent writing during initial load or if user is not logged in
    if (!userId || isInitialLoad.current) {
      console.log("⏸️ ข้ามการบันทึก (userId:", userId, "isInitialLoad:", isInitialLoad.current, ")");
      return;
    }
    
    // Remove undefined values from state (Firestore doesn't accept undefined)
    const cleanState = JSON.parse(JSON.stringify(state, (key, value) => {
      return value === undefined ? null : value;
    }));
    
    console.log("💾 กำลังบันทึกข้อมูลลง Firestore...", cleanState);
    const docRef = doc(db, "schedules", userId);
    setDoc(docRef, cleanState, { merge: true })
      .then(() => {
        console.log("✅ บันทึกข้อมูลสำเร็จ!");
      }).catch(error => {
        console.error("❌ Error writing document: ", error);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองอีกครั้ง");
      });
  }, [state, userId]);

  return [state, dispatch];
}

function scheduleReminder(task){
  if(!('Notification' in window)) return
  if(Notification.permission !== 'granted') return
  if(!task.dueAt || !task.reminders?.length) return
  const due = new Date(task.dueAt)
  task.reminders.forEach(r=>{
    let when = new Date(due)
    if(r.type==='minutes') when = addMinutes(due, -r.amount)
    if(r.type==='hours') when = addHours(due, -r.amount)
    if(r.type==='days') when = addDays(due, -r.amount)
    const delay = when.getTime() - Date.now()
    if(delay>0){
      setTimeout(()=>{
        new Notification(`ใกล้ถึงกำหนด: ${task.title}`, { body: task.subjectName?`วิชา: ${task.subjectName}`:undefined })
      }, Math.min(delay, 2147483647)) // clamp
    }
  })
}

function timeLeftLabel(dueAt){
  const due = new Date(dueAt)
  const mins = Math.max(0, differenceInMinutes(due, new Date()))
  if(mins>=1440){ const d = Math.floor(mins/1440); return `เหลือ ${d} วัน` }
  if(mins>=60){ const h = Math.floor(mins/60); return `เหลือ ${h} ชม.` }
  return `เหลือ ${mins} นาที`
}

function statusBadge(s){
  const map = { todo:'ยังไม่ทำ', doing:'กำลังทำ', done:'เสร็จแล้ว' }
  const cls = s==='done'? 'border-emerald-400 text-emerald-600 dark:text-emerald-300' : s==='doing'? 'border-amber-400 text-amber-600 dark:text-amber-300' : 'border-slate-300 text-slate-500 dark:text-slate-300'
  return <Badge className={cls}>{map[s]}</Badge>
}

function getUrgencyStyle(dueAt) {
  if (!dueAt) return { gradientClass: '', textColorClass: 'text-slate-500', showFire: false };

  const hoursLeft = differenceInHours(new Date(dueAt), new Date());

  if (hoursLeft <= 6) { // Very urgent, less than 6 hours or overdue
    return { gradientClass: 'bg-gradient-to-b from-red-500 to-orange-400', textColorClass: 'text-red-500 dark:text-red-400', showFire: true };
  }
  if (hoursLeft <= 24) { // Urgent, less than 24 hours
    return { gradientClass: 'bg-gradient-to-b from-orange-500 to-amber-400', textColorClass: 'text-orange-500 dark:text-orange-400', showFire: false };
  }
  if (hoursLeft <= 168) { // Upcoming, less than 7 days
    return { gradientClass: 'bg-gradient-to-b from-amber-400 to-yellow-300', textColorClass: 'text-amber-500 dark:text-amber-400', showFire: false };
  }
  // Not urgent
  return { gradientClass: '', textColorClass: 'text-slate-500', showFire: false };
}

// --- Main App ---
export default function App(){
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [state, dispatch] = usePersistentState(user?.uid);
  const [view, setView] = useState('dashboard') // dashboard | tasks | calendar | settings
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [query, setQuery] = useState('')
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedTasksForDeletion, setSelectedTasksForDeletion] = useState(new Set());
  const [nowTick, setNowTick] = useState(0)

  // ========== ตรวจสอบว่าเป็นหน้า Public Share หรือไม่ ==========
  const [isPublicView, setIsPublicView] = useState(false);
  const [sharedUserId, setSharedUserId] = useState(null);
  const [sharedUserData, setSharedUserData] = useState(null);

  useEffect(() => {
    // ตรวจสอบ URL parameter (เช่น ?share=USER_ID)
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get('share');
    
    if (shareParam) {
      setIsPublicView(true);
      setSharedUserId(shareParam);
      console.log('📤 โหมดแชร์ตารางเรียน - User ID:', shareParam);
      
      // โหลดข้อมูลจาก Firestore
      const docRef = doc(db, "schedules", shareParam);
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('📥 โหลดข้อมูลตารางเรียนที่แชร์:', data);
          setSharedUserData(data);
        } else {
          console.log('⚠️ ไม่พบข้อมูลตารางเรียน');
          setSharedUserData(null);
        }
      });
      
      return () => unsubscribe();
    }
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // tick every 30s for countdown labels
  useEffect(()=>{ const t = setInterval(()=> setNowTick(x=>x+1), 30000); return ()=>clearInterval(t) },[])

  // derived
  const subjectsMap = useMemo(()=> Object.fromEntries(state.subjects.map(s=>[s.id,s])),[state.subjects])
  const tasks = useMemo(()=> state.tasks.map(t=> ({...t, subjectName: subjectsMap[t.subjectId]?.name, subjectColor: subjectsMap[t.subjectId]?.color})), [state.tasks, subjectsMap])

  // stats
  const todayTasks = tasks.filter(t=> t.dueAt && isToday(new Date(t.dueAt)))
  const progressToday = todayTasks.length? Math.round(todayTasks.reduce((a,t)=>a+(t.progress||0),0)/todayTasks.length) : (tasks.length? Math.round(tasks.reduce((a,t)=>a+(t.progress||0),0)/tasks.length):0)
  const doneCount = tasks.filter(t=>t.status==='done').length
  const lazyScore = Math.max(0, 100 - progressToday) // playful metric

  // due soon list
  const dueSoon = tasks
    .filter(t=> t.dueAt && t.status!=='done')
    .sort((a,b)=> new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0,5)

  const filteredTasks = useMemo(()=>{
    let arr = tasks
    if(selectedSubject) arr = arr.filter(t=>t.subjectId===selectedSubject)
    if(query.trim()) arr = arr.filter(t=> (t.title+" "+(t.detail||'')).toLowerCase().includes(query.toLowerCase()))
    // sort: with due first ascending, then without due, then status
    arr = [...arr].sort((a, b) => {
      // Move done tasks to the bottom
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;

      if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
      if (a.dueAt) return -1; // a has due date, b doesn't, a comes first
      if (b.dueAt) return 1;  // b has due date, a doesn't, b comes first
      return new Date(b.createdAt) - new Date(a.createdAt); // both have no due date, sort by creation
    });
    // Filter out archived tasks
    return arr.filter(t => {
      if (t.status === 'done' && t.updatedAt) {
        return differenceInHours(new Date(), new Date(t.updatedAt)) < 1;
      }
      return true;
    });
  },[tasks, selectedSubject, query])

  // request notification permission once
  useEffect(()=>{
    if('Notification' in window && Notification.permission==='default'){
      // ask politely after short delay
      const h = setTimeout(()=> Notification.requestPermission(), 1000)
      return ()=>clearTimeout(h)
    }
  },[])

  const archivedTasks = useMemo(() => tasks.filter(t => 
    t.status === 'done' && t.updatedAt && differenceInHours(new Date(), new Date(t.updatedAt)) >= 1
  ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [tasks]);

  const navItems = [
    { key: 'dashboard', label: 'แดชบอร์ด', icon: LayoutGrid },
    { key: 'tasks', label: 'งานทั้งหมด', icon: ListTodo },
    { key: 'schedule', label: 'ตารางเรียน', icon: CalendarIcon },
    { key: 'settings', label: 'ตั้งค่า', icon: Layers }
  ];

  // schedule reminders for tasks when added/updated
  useEffect(()=>{ tasks.forEach(scheduleReminder) }, [tasks])

  if (loadingAuth) {
    return <div className="h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">รอสักครู่นะงับ...</div>;
  }

  if (!user) {
    return <LoginScreen />;
  }

  const handleLogout = () => {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) signOut(auth);
  }

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-950 font-sans">
      
  <div className="md:flex pb-16 md:pb-0">
        {/* Sidebar for Desktop - Brutalist Style */}
  <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-black border-r-4 border-black dark:border-white p-4">
          <div className="flex items-center gap-3 mb-8 px-2">
            <img src="/logo.svg" alt="FlowO Logo" className="h-9" />
          </div>
          <nav className="flex-1 space-y-2">
            {navItems.map(({ key, label, icon: Icon }) => (
              <a key={key} href="#" onClick={(e) => { e.preventDefault(); setView(key); }}
                 className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${view === key ? 'bg-white text-indigo-600 shadow-md' : 'hover:bg-slate-200/50 text-slate-600'}`}>
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </a>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="flex items-center gap-2 text-sm p-2 rounded-xl bg-slate-200/50 dark:bg-slate-800/50">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || user.email} className="h-8 w-8 rounded-full" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center">
                  <User className="h-4 w-4 text-slate-500" />
                </div>
              )}
              <span className="truncate flex-1 font-medium">{user.displayName || user.email}</span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
  <main className="flex-1 px-4 py-6 md:p-8">
          {/* Mobile Header */}
          <header className="md:hidden flex items-center justify-between mb-4">
            <img src="/logo.svg" alt="FlowO Logo" className="h-8" />
          </header>

          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.12 }}>
              {view === 'dashboard' && <Dashboard state={state} tasks={tasks} dueSoon={dueSoon} progressToday={progressToday} lazyScore={lazyScore} setView={setView} setSelectedSubject={setSelectedSubject} />}
              {view === 'tasks' && <TasksView state={state} dispatch={dispatch} tasks={tasks} filteredTasks={filteredTasks} setQuery={setQuery} query={query} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} deleteMode={deleteMode} selectedTasksForDeletion={selectedTasksForDeletion} setSelectedTasksForDeletion={setSelectedTasksForDeletion} />}
              {view === 'schedule' && <ScheduleView state={state} dispatch={dispatch} userId={user?.uid} />}
              {view === 'settings' && <Settings state={state} dispatch={dispatch} userId={user?.uid} onLogout={handleLogout} setView={setView} />}
              {view === 'history' && <HistoryView tasks={archivedTasks} dispatch={dispatch} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Floating Action Buttons for Tasks View */}
      {view === 'tasks' && (
        <div className="fixed left-4 right-4 bottom-20 md:bottom-6 flex items-center justify-between gap-3 z-40">
          {deleteMode ? (
            <Button onClick={() => { setDeleteMode(false); setSelectedTasksForDeletion(new Set()); }} className="bg-slate-500 hover:bg-slate-600">
              <X className="h-4 w-4"/> ยกเลิก
            </Button>
          ) : (
            <Button onClick={() => setDeleteMode(true)} className="bg-slate-600 hover:bg-slate-700">
              <Trash2 className="h-4 w-4"/>
            </Button>
          )}
          
          {deleteMode ? (
            <Button onClick={() => {
              if (confirm(`ต้องการลบจริงหรอ ${selectedTasksForDeletion.size} งานที่เลือก?`)) {
                selectedTasksForDeletion.forEach(id => dispatch({ type: 'deleteTask', id }));
                setSelectedTasksForDeletion(new Set());
                setDeleteMode(false);
              }
            }} className="bg-rose-600 hover:bg-rose-700" disabled={selectedTasksForDeletion.size === 0}>
              <Trash2 className="h-4 w-4"/> ลบ {selectedTasksForDeletion.size} รายการ
            </Button>
          ) : (
            <AddTaskButton subjects={state.subjects} onAdd={(payload) => dispatch({ type: 'addTask', payload })} />
          )}
        </div>
      )}

      {/* Mobile Bottom Navigation */}
  <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-950/90 border-t border-slate-200/50 dark:border-slate-800/50 p-1">
        <div className="flex items-center justify-around">
          {navItems.map(({ key, label, icon: Icon }) => (
            <a key={key} href="#" onClick={(e) => { e.preventDefault(); setView(key); }}
               className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all ${view === key ? 'text-indigo-600' : 'text-slate-500'}`}>
              <Icon className="h-6 w-6" />
              <span className="text-xs mt-1">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

function Dashboard({state, tasks, dueSoon, progressToday, lazyScore, setView, setSelectedSubject}){
  // start with no date selected to avoid opening the date modal on app load
  const [modalDate, setModalDate] = useState(null);
  const [scheduleDate, setScheduleDate] = useState(new Date());

  // Calendar setup
  const [calendarCursor, setCalendarCursor] = useState(new Date());

  const start = startOfMonth(calendarCursor);
  const end = endOfMonth(calendarCursor);
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(start, {weekStartsOn: 1}),
    end: endOfWeek(end, {weekStartsOn: 1})
  });

  // Group tasks by date for calendar
  const tasksByDate = tasks.reduce((acc, task) => {
    if (!task.dueAt) return acc;
    const dateKey = format(new Date(task.dueAt), 'yyyy-MM-dd');
    acc[dateKey] = acc[dateKey] || [];
    acc[dateKey].push(task);
    return acc;
  }, {});

  const handleDateSelect = (day) => {
    setModalDate(day);
    setScheduleDate(day);
  };

  const getIndicatorsForDay = useMemo(() => {
    const indicatorMap = new Map();
    for (const day of calendarDays) {
        const dayKey = format(day, 'yyyy-MM-dd');
        const indicators = new Set();
        
        for (const task of tasks) {
            const isEvent = task.taskType === 'event';
            const isDue = task.dueAt && isSameDay(new Date(task.dueAt), day);
            const isStart = task.startAt && isSameDay(new Date(task.startAt), day);
            const isOngoing = task.startAt && task.dueAt && !isStart && !isDue && day > new Date(task.startAt) && day < new Date(task.dueAt);

            if (isDue && (isEvent || task.taskType === 'deadline')) {
                indicators.add('red');
            } else if (isStart) {
                indicators.add('blue');
            } else if (isOngoing) {
                indicators.add('green');
            }
        }
        // Prioritize colors: Red > Blue > Green
        const sortedIndicators = Array.from(indicators).sort((a, b) => {
            const order = { red: 0, blue: 1, green: 2 };
            return order[a] - order[b];
        });
        indicatorMap.set(dayKey, sortedIndicators);
    }
    return indicatorMap;
  }, [calendarDays, tasks]);

  const scheduleItems = useMemo(() => {
    const items = [];
    const dayTasks = (tasksByDate[format(scheduleDate, 'yyyy-MM-dd')] || [])
      .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : -1) - (b.dueAt ? new Date(b.dueAt).getTime() : -1));

    const allDayTasks = dayTasks.filter(t => !t.dueAt);
    const workableTasks = tasks.filter(t => 
        t.taskType === 'deadline' && 
        t.startAt && t.dueAt && 
        isSameDay(scheduleDate, new Date(t.startAt)) === false &&
        isSameDay(scheduleDate, new Date(t.dueAt)) === false &&
        scheduleDate > new Date(t.startAt) && scheduleDate < new Date(t.dueAt)
    );

    if (allDayTasks.length > 0) {
      items.push({ type: 'all-day', tasks: allDayTasks });
    }

    const timedTasks = dayTasks.filter(t => t.dueAt);
    let lastEventEnd = new Date(scheduleDate).setHours(0, 0, 0, 0);

    timedTasks.forEach(task => {
      const taskStart = new Date(task.dueAt).getTime();
      if (taskStart > lastEventEnd) {
        const freeMinutes = differenceInMinutes(taskStart, lastEventEnd);
        if (freeMinutes > 15) { // Only show free time if it's significant
          items.push({ type: 'free', start: lastEventEnd, end: taskStart, duration: freeMinutes });
        }
      }
      const taskEnd = addMinutes(taskStart, task.duration || 60).getTime();
      items.push({ type: 'task', task });
      lastEventEnd = taskEnd;
    });

    const endOfDay = new Date(scheduleDate).setHours(23, 59, 59, 999);
    if (endOfDay > lastEventEnd) {
      const freeMinutes = differenceInMinutes(endOfDay, lastEventEnd);
      if (freeMinutes > 15) {
        items.push({ type: 'free', start: lastEventEnd, end: endOfDay, duration: freeMinutes });
      }
    }

    if (workableTasks.length > 0) {
        items.unshift({ type: 'workable', tasks: workableTasks });
    }

    return items;
  }, [scheduleDate, tasksByDate]);

  const formatFreeTime = (minutes) => {
    if (minutes < 60) return `${minutes} นาที`;
    return `${Math.floor(minutes / 60)} ชม. ${minutes % 60 > 0 ? minutes % 60 + ' นาที' : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Urgent / Due Soon (top column) */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><Flame className="h-4 w-4"/> งานที่ด่วนใกล้ถึง</SectionTitle>
          <div className="text-sm text-slate-500">จัดเรียงตามกำหนดส่ง</div>
        </div>

        <div className="space-y-3">
          {dueSoon.length > 0 ? dueSoon.map(task => (
            <div key={task.id} className="p-3 rounded-lg bg-white/60 flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{task.title}</div>
                <div className="text-xs text-slate-500">{task.subjectName || 'ไม่มีวิชา'} • {task.dueAt ? format(new Date(task.dueAt), "d MMM HH:mm", {locale: th}) : 'ไม่ระบุเวลา'}</div>
              </div>
              <div className="ml-3 flex flex-col items-end gap-2">
                {statusBadge(task.status)}
              </div>
            </div>
          )) : (
            <div className="text-slate-500 text-center py-6">ไม่มีงานด่วนใกล้ถึง</div>
          )}
        </div>
      </Card>

      {/* Calendar (middle column) */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><CalendarIcon className="h-4 w-4"/> ปฏิทิน</SectionTitle>
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => setCalendarCursor(add(calendarCursor, {months: -1}))}>
              <ChevronLeft className="h-4 w-4"/>
            </GhostButton>
            <div className="text-sm font-medium w-32 text-center">
              {format(calendarCursor, 'MMMM yyyy', {locale: th})}
            </div>
            <GhostButton onClick={() => setCalendarCursor(add(calendarCursor, {months: 1}))}>
              <ChevronRight className="h-4 w-4"/>
            </GhostButton>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-2">
          {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map(d => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDate[dateKey] || [];
            const indicators = getIndicatorsForDay.get(dateKey) || [];

            return (
              <div
                key={dateKey}
                onClick={() => handleDateSelect(day)}
                className={`
                  aspect-square p-1 rounded-lg cursor-pointer
                  transition-all duration-200
                  border border-slate-200/50 dark:border-slate-700/50
                  backdrop-blur-sm
                  ${indicators.length > 0 ? 'scale-100' : 'scale-90 opacity-60'}
                  ${isSameMonth(day, calendarCursor)
                    ? `bg-white/60 ${
                        !modalDate || !isSameDay(day, modalDate) ? 'hover:bg-white/80' : ''
                      }`
                    : 'opacity-40'}
                  ${isSameDay(day, new Date()) ? 'ring-2 ring-indigo-400' : ''}
                `}
              >
                <div className={`text-xs ${isSameDay(day, new Date()) ? 'font-semibold text-indigo-600' : ''}`}>
                  {format(day, 'd')}
                </div>
                <div className="absolute bottom-1 left-1 right-1 flex flex-col gap-0.5">
                  {indicators.slice(0, 8).map((color, i) => (
                    <div key={i} className={`h-0.5 w-full rounded-full ${color === 'red' ? 'bg-red-500' : color === 'blue' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Day Schedule (bottom column) */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><TimerReset className="h-4 w-4"/> งานวันนี้</SectionTitle>
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => setScheduleDate(subDays(scheduleDate, 1))}>
              <ChevronLeft className="h-4 w-4"/>
            </GhostButton>
            <div className="text-sm font-medium w-32 text-center">
              {format(scheduleDate, 'EEEE d MMM', {locale: th})}
            </div>
            <GhostButton onClick={() => setScheduleDate(addDays(scheduleDate, 1))}>
              <ChevronRight className="h-4 w-4"/>
            </GhostButton>
          </div>
        </div>

        <div className="space-y-1">
          {scheduleItems.length > 0 ? scheduleItems.map((item, index) => {
            if (item.type === 'task') {
              const { task } = item;
              const start = new Date(task.dueAt);
              const isEvent = task.taskType === 'event';
              return (
                <div key={task.id} className="flex gap-4">
                  <div className="text-xs text-slate-400 w-12 text-right pt-2">{format(start, 'HH:mm')}</div>
                  <div className={`flex-1 p-3 rounded-lg border ${isEvent ? 'border-green-500' : 'border-blue-500'}`} style={{ backgroundColor: hexToRgba(isEvent ? '#22c55e' : '#3b82f6', 0.1) }}>
                    <div className="font-medium text-sm">{task.title}</div>
                    <div className="text-xs text-slate-500">{task.subjectName}</div>
                  </div>
                </div>
              );
            }
            if (item.type === 'free') {
              return (
                <div key={`free-${index}`} className="relative flex items-center h-8">
                  {/* This div is now just a placeholder for height */}
                  {item.duration > 30 && (
                    <div className="absolute left-0 right-0 flex items-center justify-center">
                      <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700 absolute"></div>
                      <span className="bg-slate-100 dark:bg-slate-900 px-2 text-xs text-slate-400 relative z-10">ว่าง {formatFreeTime(item.duration)}</span>
                    </div>
                  )}
                </div>
              );
            }
            if (item.type === 'all-day') {
              return (
                <div key="all-day" className="mb-2">
                  <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">งานที่ต้องทำ (ทั้งวัน)</div>
                  {item.tasks.map(t => (
                    <div key={t.id} className="p-2 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 mb-1 text-sm">{t.title}</div>
                  ))}
                </div>
              );
            }
            if (item.type === 'workable') {
              return (
                <div key="workable-day" className="mb-2 p-3 rounded-lg bg-slate-100/80 dark:bg-slate-800/80">
                  <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">มีงานที่รอทำอยู่ ทำดีไหมน้าา 😉</div>
                  {item.tasks.map(t => (
                    <div key={t.id} className="text-sm text-slate-500 dark:text-slate-400">
                      - {t.title} <span className="text-xs">({t.subjectName})</span>
                    </div>
                  ))}
                </div>
              );
            }
            return null;
          }) : (
            <div className="text-slate-500 text-center py-8">บ่มีงานจ้า วันนี้นอนได้</div>
          )}
        </div>
      </Card>

      {/* Task List Modal for Selected Date */}
      <AnimatePresence>
        {modalDate && (
          <Modal onClose={() => setModalDate(null)}>
            <div className="text-lg font-semibold mb-4">
              งานวันที่ {format(modalDate, 'd MMMM yyyy', {locale: th})}
            </div>
            {(() => {
              const dayTasks = tasksByDate[format(modalDate, 'yyyy-MM-dd')] || [];
              const activeTasks = dayTasks.filter(t => t.status !== 'done');
              const completedTasks = dayTasks.filter(t => t.status === 'done');

              if (dayTasks.length === 0) {
                return <div className="text-slate-500 text-center py-8">บ่มีงานจ้า วันนี้นอนได้</div>;
              }

              return (
                <div className="space-y-4">
                  {activeTasks.length > 0 && (
                    <div className="space-y-2">
                      {activeTasks.map(task => (
                        <div key={task.id} onClick={() => { setView('tasks'); setSelectedSubject(null); }}
                             className="p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                          <div className="flex items-center justify-between">
                            <div><div className="font-medium">{task.title}</div><div className="text-xs text-slate-500">{task.subjectName}</div></div>
                            <div className="flex gap-2">{statusBadge(task.status)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {completedTasks.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-slate-500 mt-4 pt-4 border-t border-slate-200/80">งานที่เสร็จแล้ว</div>
                      <div className="space-y-2 mt-2">
                        {completedTasks.map(task => (<div key={task.id} className="p-3 rounded-lg bg-slate-50/50 opacity-70"><div className="font-medium line-through">{task.title}</div><div className="text-xs text-slate-500">{task.subjectName}</div></div>))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScheduleView({state, dispatch, userId}) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCourse, setSelectedCourse] = useState(null); // Will now be { course, date }

  const weekType = getWeekType(selectedDate);
  const weekTypeLabel = weekType === 'odd' ? 'สัปดาห์คี่' : 'สัปดาห์คู่';
  const weekTypeColor = weekType === 'odd' 
    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/50' 
    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50';

  const todayCourses = useMemo(() => {
    return getCoursesForDay(state.courses, selectedDate);
  }, [state.courses, selectedDate]);

  const weekDays = useMemo(() => {
    // Get the start of the week (Monday) for the selected date
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // 1 = Monday
    const weekEnd = addDays(weekStart, 4); // Friday (จันทร์ + 4 วัน = ศุกร์)
    
    // Get only 5 days from Monday to Friday
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [selectedDate]);

  const weekSchedule = useMemo(() => {
    const schedule = {};
    weekDays.forEach(day => {
      const dayKey = format(day, 'yyyy-MM-dd');
      schedule[dayKey] = getCoursesForDay(state.courses, day);
    });
    return schedule;
  }, [state.courses, weekDays]);

  // Helper to calculate rowspan for merged cells
  const getTimeSlotRowspan = (course) => {
    const [startHour, startMin] = course.startTime.split(':').map(Number);
    const [endHour, endMin] = course.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return Math.ceil((endMinutes - startMinutes) / 60);
  };

  const handleOverride = (course, date) => {
    const { status } = getCourseStatus(course, date, state.scheduleOverrides);
    const weekStartDate = startOfWeek(date, { weekStartsOn: 1 }); // เริ่มนับจากวันจันทร์
    const weekStartDateString = format(weekStartDate, 'yyyy-MM-dd');
    const overrideKey = `${course.id}_${weekStartDateString}`;
    
    const defaultStatusResult = getCourseStatus(course, date, {});
    const nextStatusToSet = status === 'online' ? 'onsite' : 'online';

    if (nextStatusToSet === defaultStatusResult.status) {
        dispatch({ type: 'removeScheduleOverride', payload: { key: overrideKey } });
    } else {
        dispatch({ type: 'setScheduleOverride', payload: { key: overrideKey, status: nextStatusToSet } });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><CalendarIcon className="h-5 w-5"/> ตารางเรียน</SectionTitle>
          <Button onClick={() => {
            if (!userId) {
              alert('ไม่สามารถแชร์ได้ กรุณาเข้าสู่ระบบก่อน');
              return;
            }
            const shareUrl = `${window.location.origin}/share/${userId}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
              alert(`คัดลอกลิงก์สำหรับแชร์แล้ว!\n${shareUrl}`);
            }).catch(() => {
              alert('ไม่สามารถคัดลอกลิงก์ได้');
            });
          }}>
            <LinkIcon className="h-4 w-4 mr-2" />
            แชร์ตารางเรียน
          </Button>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center justify-between">
          <GhostButton onClick={() => {
            let newDate = subDays(selectedDate, 1);
            // ถ้าเป็นวันอาทิตย์ (0) ให้ข้ามไปวันศุกร์
            if (newDate.getDay() === 0) newDate = subDays(newDate, 2);
            // ถ้าเป็นวันเสาร์ (6) ให้ข้ามไปวันศุกร์
            if (newDate.getDay() === 6) newDate = subDays(newDate, 1);
            setSelectedDate(newDate);
          }}>
            <ChevronLeft className="h-4 w-4 mr-1"/> วันก่อนหน้า
          </GhostButton>
          <div className="text-center flex-1 px-2">
            <div className="font-semibold text-lg mb-2">
              {format(selectedDate, 'EEEE d MMMM', { locale: th })}
            </div>
            <div className={`inline-block px-6 py-2 rounded-full font-bold text-lg ${weekTypeColor} animate-pulse`}>
              ✨ {weekTypeLabel} ✨
            </div>
          </div>
          <GhostButton onClick={() => {
            let newDate = addDays(selectedDate, 1);
            // ถ้าเป็นวันเสาร์ (6) ให้ข้ามไปวันจันทร์
            if (newDate.getDay() === 6) newDate = addDays(newDate, 2);
            // ถ้าเป็นวันอาทิตย์ (0) ให้ข้ามไปวันจันทร์
            if (newDate.getDay() === 0) newDate = addDays(newDate, 1);
            setSelectedDate(newDate);
          }}>
            วันถัดไป <ChevronRight className="h-4 w-4 ml-1"/>
          </GhostButton>
        </div>
      </Card>

      {/* Daily View */}
      <Card>
        <SectionTitle>ตารางเรียนวันนี้</SectionTitle>
        {todayCourses.length > 0 ? (
          <div className="space-y-3 mt-4">
            {todayCourses.map(course => {
              const { status, isOverridden } = getCourseStatus(course, selectedDate, state.scheduleOverrides);
              const statusBgColor = status === 'online' 
                ? 'bg-blue-500'
                : status === 'onsite'
                ? 'bg-green-500'
                : 'bg-slate-500';
              const statusLabel = status === 'online' ? '🌐 ออนไลน์' : status === 'onsite' ? '🏫 ออนไซต์' : '❓ ไม่ทราบ';

              return (
                <div 
                  key={course.id}
                  onClick={() => setSelectedCourse({ course, date: selectedDate })}
                  className="rounded-xl bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-all overflow-hidden border-l-4"
                  style={{ borderLeftColor: course.color }}
                >
                  {/* Status Bar */}
                  <div className={`${statusBgColor} text-white px-4 py-2 font-bold text-sm flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      {isOverridden && <RefreshCw className="h-4 w-4 animate-spin" />}
                      <span>{statusLabel}</span>
                    </div>
                    <span className="text-xs opacity-90">
                      <Clock className="h-3 w-3 inline mr-1"/>
                      {course.startTime} - {course.endTime}
                    </span>
                  </div>
                  
                  {/* Course Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-lg mb-2">{course.name}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                          <div>📚 รหัสวิชา: {course.code}</div>
                          {course.room && <div>🚪 ห้องเรียน: {course.room}</div>}
                          {course.pRoom && <div>📍 ห้อง P: {course.pRoom}</div>}
                          {course.teacher && <div>👨‍🏫 อาจารย์: {course.teacher}</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-500 py-10">
            ไม่มีวิชาเรียนในวันนี้ 🎉
          </div>
        )}
      </Card>

      {/* Weekly Overview */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>ตารางเรียนรายสัปดาห์ (ภาพรวม)</SectionTitle>
          <div className="text-xs text-slate-500">💡 คลิกที่วิชาเพื่อแก้ไข รูปแบบที่เรียนชั่วคราว</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-800 text-sm font-semibold sticky left-0 z-10">เวลา</th>
                {weekDays.map(day => (
                  <th key={format(day, 'yyyy-MM-dd')} className="border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-800 text-sm font-semibold min-w-[140px]">
                    {format(day, 'EEEE', {locale: th})}
                    <div className="text-xs font-normal text-slate-500">{format(day, 'd MMM', {locale: th})}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map((time, timeIndex) => {
                const renderedCells = new Set();
                
                return (
                  <tr key={time}>
                    <td className="border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-500 font-medium bg-slate-50 dark:bg-slate-800 sticky left-0 z-10">{time}</td>
                    {weekDays.map((day, dayIndex) => {
                      const dayKey = format(day, 'yyyy-MM-dd');
                      const cellKey = `${dayKey}-${timeIndex}`;
                      
                      if (renderedCells.has(cellKey)) {
                        return null;
                      }

                      const dayCourses = weekSchedule[dayKey] || [];
                      const courseAtTime = dayCourses.find(c => c.startTime <= time && c.endTime > time);

                      if (courseAtTime && courseAtTime.startTime === time) {
                        const rowspan = getTimeSlotRowspan(courseAtTime);
                        const { status, isOverridden } = getCourseStatus(courseAtTime, day, state.scheduleOverrides);
                        const statusBgColor = status === 'online' ? 'bg-blue-500' : status === 'onsite' ? 'bg-green-500' : 'bg-slate-500';
                        const statusIcon = status === 'online' ? '🌐' : status === 'onsite' ? '🏫' : '❓';
                        const statusText = status === 'online' ? 'ออนไลน์' : status === 'onsite' ? 'ออนไซต์' : 'ไม่ทราบ';
                        
                        for (let i = 0; i < rowspan; i++) {
                          renderedCells.add(`${dayKey}-${timeIndex + i}`);
                        }

                        return (
                          <td 
                            key={dayKey} 
                            rowSpan={rowspan}
                            onClick={() => setSelectedCourse({ course: courseAtTime, date: day })}
                            className="border border-slate-200 dark:border-slate-700 p-0 align-top cursor-pointer hover:shadow-lg hover:brightness-95 transition-all duration-200 group"
                            style={{ backgroundColor: hexToRgba(courseAtTime.color, 0.15) }}
                            title="คลิกเพื่อดูรายละเอียดและแก้ไขสถานะ"
                          >
                            <div className="h-full flex flex-col">
                              {/* Status Bar */}
                              <div 
                                className={`${statusBgColor} text-white px-2 py-1 text-[10px] font-bold flex items-center justify-center gap-1`}
                              >
                                {isOverridden && <RefreshCw className="h-3 w-3 animate-spin" />}
                                <span>{statusIcon}</span>
                                <span>{statusText}</span>
                              </div>
                              
                              {/* Course Info */}
                              <div className="p-2 flex-1">
                                <div className="font-medium text-xs">{courseAtTime.name}</div>
                                <div className="text-slate-600 dark:text-slate-300 text-[10px]">{courseAtTime.code}</div>
                                <div className="text-slate-500 text-[10px] mt-1">{courseAtTime.startTime}-{courseAtTime.endTime}</div>
                              </div>
                            </div>
                          </td>
                        );
                      } else if (!courseAtTime) {
                        return (
                          <td key={dayKey} className="border border-slate-200 dark:border-slate-700 p-1">
                          </td>
                        );
                      }
                      
                      return null;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Course Detail Modal */}
      <AnimatePresence>
        {selectedCourse && (() => {
          const { course, date } = selectedCourse;
          const { status, isOverridden } = getCourseStatus(course, date, state.scheduleOverrides);
          const nextStatus = status === 'online' ? 'onsite' : 'online';
          
          return (
            <Modal onClose={() => setSelectedCourse(null)}>
              <div className="text-lg font-semibold mb-4">{course.name}</div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500">รหัสวิชา</label>
                  <div className="font-medium">{course.code}</div>
                </div>
                {course.room && (
                  <div>
                    <label className="text-xs text-slate-500">ห้องเรียน</label>
                    <div className="font-medium">{course.room}</div>
                  </div>
                )}
                {course.pRoom && (
                  <div>
                    <label className="text-xs text-slate-500">ห้อง P</label>
                    <div className="font-medium">{course.pRoom}</div>
                  </div>
                )}
                {course.teacher && (
                  <div>
                    <label className="text-xs text-slate-500">อาจารย์</label>
                    <div className="font-medium">{course.teacher}</div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500">เวลาเรียน</label>
                  <div className="font-medium">{course.startTime} - {course.endTime}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">เงื่อนไขการเรียน</label>
                  <div className="font-medium">
                    {course.scheduleType === 'odd-onsite' && 'เข้าชั้นเรียนในสัปดาห์คี่ / ออนไลน์ในสัปดาห์คู่'}
                    {course.scheduleType === 'even-onsite' && 'เข้าชั้นเรียนในสัปดาห์คู่ / ออนไลน์ในสัปดาห์คี่'}
                    {course.scheduleType === 'online-always' && 'ออนไลน์ตลอด'}
                    {course.scheduleType === 'onsite-always' && 'เรียนที่มหาลัยตลอด'}
                  </div>
                </div>
              </div>

              {/* Weekly Override Section */}
              <div className="mt-6 pt-4 border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">⚡ เปลี่ยนแปลงชั่วคราวสำหรับสัปดาห์นี้</div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">สถานะปัจจุบัน</label>
                    <div className="font-bold text-xl flex items-center gap-2 mt-1">
                       {isOverridden && <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />}
                       {status === 'online' ? '🌐 ออนไลน์' : '🏫 ออนไซต์'}
                    </div>
                    {isOverridden && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
                        ✨ มีการเปลี่ยนแปลงพิเศษ
                      </p>
                    )}
                  </div>
                  <Button 
                    onClick={() => handleOverride(course, date)}
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold px-6 py-3 shadow-lg"
                  >
                    <RefreshCw className="h-5 w-5 mr-2" />
                    เปลี่ยนเป็น {nextStatus === 'online' ? '🌐 ออนไลน์' : '🏫 ออนไซต์'}
                  </Button>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={() => setSelectedCourse(null)}>ปิด</Button>
              </div>
            </Modal>
          )
        })()}
      </AnimatePresence>
    </div>
  );
}

function TasksView({state, dispatch, tasks, filteredTasks, setQuery, query, selectedSubject, setSelectedSubject, deleteMode, selectedTasksForDeletion, setSelectedTasksForDeletion}){
  const [editingTask, setEditingTask] = useState(null);

  const subjectTasksCount = useMemo(() => 
    Object.fromEntries(state.subjects.map(s => [s.id, tasks.filter(t => t.subjectId === s.id).length])), 
    [tasks, state.subjects]
  );;

  const handleEditSubject = () => {
    if (!selectedSubject) return;
    const subject = state.subjects.find(s => s.id === selectedSubject);
    if (subject) {
      const name = prompt('แก้ไขชื่อรายวิชา', subject.name);
      if (name && name.trim()) {
        dispatch({ type: 'updateSubject', payload: { ...subject, name: name.trim() } });
      }
    }
  };

  const handleDeleteSubject = () => {
    if (!selectedSubject) return;
    if (confirm('ลบรายวิชานี้และงานทั้งหมด?')) {
      dispatch({ type: 'deleteSubject', id: selectedSubject });
      setSelectedSubject(null);
    }
  };

  const toggleTaskSelection = (taskId) => {
    const newSelected = new Set(selectedTasksForDeletion);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasksForDeletion(newSelected);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header with Search */}
      <div className="sticky top-0 z-20 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-xl p-4 -mx-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400" />
          <Input 
            placeholder="ค้นหางาน..." 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
            className="pl-9 w-full shadow-lg"
          />
        </div>
      </div>

      {/* Subject Filters */}
      <div className="sticky top-[76px] z-10 -mx-4 px-4 py-2 bg-slate-100/60 dark:bg-slate-950/60 backdrop-blur-xl">
        <div className="flex flex-wrap gap-2">
          <GhostButton 
            onClick={() => setSelectedSubject(null)}
            className={`transition-all ${!selectedSubject ? 'bg-indigo-500 !text-white shadow-lg' : 'bg-white/40'}`}
          >
            ทั้งหมด
          </GhostButton>
          {state.subjects.map(s => (
            <GhostButton 
              key={s.id} 
              onClick={() => setSelectedSubject(s.id)} 
              className={`transition-all
                ${selectedSubject === s.id ? 'bg-indigo-500 !text-white shadow-lg' : 'bg-white/40'}
              `}
            >
              <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
              {s.name}
              <Badge className="ml-1 !px-1.5">{subjectTasksCount[s.id] || 0}</Badge>
            </GhostButton>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        <AnimatePresence>
          {filteredTasks.map(t=> (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <TaskItem 
                task={t}
                isInDeleteMode={deleteMode}
                isSelected={selectedTasksForDeletion.has(t.id)}
                onToggleSelect={() => setSelectedTasksForDeletion(prev => { const next = new Set(prev); if (next.has(t.id)) next.delete(t.id); else next.add(t.id); return next; })}
                onUpdate={(payload) => dispatch({ type: 'updateTask', payload })}
                onView={() => setEditingTask(t)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {filteredTasks.length === 0 && 
          <div className="text-center text-slate-500 py-10">ไม่พบงานตามที่ค้นหา</div>
        }
      </div>

      <AnimatePresence>
        {editingTask && (
          <Modal onClose={() => setEditingTask(null)}>
            <TaskDetailView task={editingTask} onUpdate={(payload) => dispatch({ type: 'updateTask', payload })} onClose={() => setEditingTask(null)} subjects={state.subjects} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

function AddTaskButton({subjects, onAdd}){
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    subjectId: subjects[0]?.id || '',
    title:'', detail: '', startAt: '', dueAt: '', link: '', status:'todo', category:'เรียน', reminders:[], taskType: 'deadline'
  })
  useEffect(()=>{ if(subjects.length && !form.subjectId) setForm(f=>({...f, subjectId: subjects[0].id})) },[subjects])

  const handleDayClick = (day) => {
    const { startAt, dueAt } = form;
    const newDate = set(day, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });

    if (!startAt && !dueAt) {
      // First click, set due date
      setForm(f => ({ ...f, dueAt: newDate.toISOString(), startAt: '' }));
    } else if (!startAt && dueAt) {
      // Second click, create a range
      const dueDate = new Date(dueAt);
      if (newDate < dueDate) {
        setForm(f => ({ ...f, startAt: newDate.toISOString() }));
      } else {
        setForm(f => ({ ...f, startAt: dueAt, dueAt: newDate.toISOString() }));
      }
    } else {
      // Third click or more, reset and set new due date
      setForm(f => ({ ...f, dueAt: newDate.toISOString(), startAt: '' }));
    }
  };

  const handleTimeChange = (field, timeValue) => {
    if (!timeValue) return;
    const [hours, minutes] = timeValue.split(':');
    const dateToUpdate = form[field] ? new Date(form[field]) : new Date();
    let finalDate = setHours(dateToUpdate, parseInt(hours, 10));
    finalDate = setMinutes(finalDate, parseInt(minutes, 10));
    setForm(f => ({ ...f, [field]: finalDate.toISOString() }));
  };

  const selectedRange = useMemo(() => {
    const from = form.startAt ? new Date(form.startAt) : undefined;
    const to = form.dueAt ? new Date(form.dueAt) : undefined;
    if (from && !to) return { from, to: from };
    if (!from && to) return { from: to, to: to };
    return { from, to };
  }, [form.startAt, form.dueAt]);

  const submit = ()=>{
    if(!form.title) return alert('ใส่ชื่องานก่อนนะ')
    const payload = { ...form, id:uid(), createdAt:Date.now(), updatedAt:Date.now(), detail: form.detail || '', link: form.link || '' }
    onAdd(payload)
    setOpen(false)
    setForm({ subjectId: subjects[0]?.id || '', title:'', detail: '', startAt: '', dueAt: '', link: '', status:'todo', category:'เรียน', reminders:[], taskType: 'deadline' })
  }

  return (
    <>
      <Button onClick={()=>setOpen(true)}><Plus className="h-4 w-4"/> เพิ่มงาน</Button>
      <AnimatePresence>
        {open && (
          <Modal onClose={()=>setOpen(false)}>
            <div className="text-lg font-semibold mb-4 px-2">เพิ่มงานใหม่</div>
            <div className="px-2 mb-4">
              <label className="text-xs text-slate-500 mb-1 block">ประเภท</label>
              <div className="flex gap-2">
                <GhostButton onClick={() => setForm({...form, taskType: 'deadline'})} className={`flex-1 ${form.taskType === 'deadline' ? 'bg-indigo-500 !text-white' : 'bg-white/40'}`}>📝 งาน</GhostButton>
                <GhostButton onClick={() => setForm({...form, taskType: 'event'})} className={`flex-1 ${form.taskType === 'event' ? 'bg-indigo-500 !text-white' : 'bg-white/40'}`}>🗓️ นัดหมาย</GhostButton>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(85vh-8rem)] px-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">รายวิชา</label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map(s => (
                      <GhostButton key={s.id} onClick={() => setForm({ ...form, subjectId: s.id })} className={`${form.subjectId === s.id ? 'bg-indigo-500 !text-white' : 'bg-white/40'}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.name}
                      </GhostButton>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs">ชื่องาน</label>
                  <Input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} placeholder="เช่น Assignment บทที่ 3" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs">รายละเอียด</label>
                  <Textarea value={form.detail} onChange={e=>setForm({...form, detail:e.target.value})} placeholder="โน้ตย่อย หรือ checklist คร่าวๆ" />
                </div>
                <div className="md:col-span-2 p-3 rounded-2xl bg-slate-100/50">
                  <div className="flex justify-center">
                    <DayPicker
                      mode="range"
                      selected={selectedRange}
                      onDayClick={handleDayClick}
                      locale={th}
                      showOutsideDays
                      weekStartsOn={1}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-2 pt-2 border-t border-slate-200/50">
                    {form.taskType === 'deadline' && (
                      <div>
                        <label className="text-xs">เวลาเริ่ม</label>
                        <Input type="time" value={form.startAt ? format(new Date(form.startAt), 'HH:mm') : ''} onChange={e => handleTimeChange('startAt', e.target.value)} />
                      </div>
                    )}
                    <div className={form.taskType !== 'deadline' ? 'col-span-2' : ''}>
                      <label className="text-xs">{form.taskType === 'deadline' ? 'เวลาสิ้นสุด' : 'เวลานัดหมาย'}</label>
                      <Input type="time" value={form.dueAt ? format(new Date(form.dueAt), 'HH:mm') : ''} onChange={e => handleTimeChange('dueAt', e.target.value)} />
                    </div>
                  </div>
                  <div className="text-xs text-center text-slate-500 mt-2">
                    {form.startAt && form.dueAt ? 'เลือกวันเริ่มต้นและสิ้นสุดแล้ว' : form.dueAt ? 'เลือกวันสิ้นสุดแล้ว คลิกอีกครั้งเพื่อเลือกวันเริ่มต้น' : 'คลิกเพื่อเลือกวัน'}
                  </div>
                </div>
                <div>
                  <label className="text-xs">ลิงก์ที่เกี่ยวข้อง</label>
                  <Input value={form.link} onChange={e=>setForm({...form, link:e.target.value})} placeholder="วางลิงก์เอกสาร" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs">หมวดหมู่</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'เรียน', label: 'เรียน' },
                      { value: 'งาน', label: 'งาน' },
                      { value: 'ส่วนตัว', label: 'ส่วนตัว' },
                    ].map(c => (
                      <GhostButton key={c.value} onClick={() => setForm({ ...form, category: c.value })} className={`${form.category === c.value ? 'bg-indigo-500 !text-white' : 'bg-white/40'}`}>
                        {c.label}
                      </GhostButton>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs">สถานะ</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {[
                      { value: 'todo', label: 'ยังไม่ทำ' },
                      { value: 'doing', label: 'กำลังทำ' },
                      { value: 'done', label: 'เสร็จแล้ว' },
                    ].map(s => (
                      <GhostButton key={s.value} onClick={() => setForm({ ...form, status: s.value })} className={form.status === s.value ? 'bg-indigo-500 !text-white' : 'bg-white/40'}>
                        {s.label}
                      </GhostButton>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs">เตือนก่อน (เลือกหลายอันได้)</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {label:'15 นาที', type:'minutes', amount:15},
                      {label:'1 ชม.', type:'hours', amount:1},
                      {label:'1 วัน', type:'days', amount:1},
                    ].map(r=> (
                      <GhostButton key={r.label} onClick={()=>{
                        setForm(f=> ({...f, reminders: f.reminders.some(x=>x.type===r.type && x.amount===r.amount) ? f.reminders.filter(x=>!(x.type===r.type && x.amount===r.amount)) : [...f.reminders, r]}))
                      }} className={form.reminders.some(x=>x.type===r.type && x.amount===r.amount)? 'bg-indigo-500 !text-white' : 'bg-white/40'}>
                        <Bell className="h-4 w-4"/> {r.label}
                      </GhostButton>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <GhostButton onClick={()=>setOpen(false)}>ยกเลิก</GhostButton>
                <Button onClick={submit}><Check className="h-4 w-4"/> บันทึก</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}

function HorizontalScroller({ children }) {
  const scrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (el) {
      setShowLeft(el.scrollLeft > 0);
      setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1); // -1 for precision
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    el?.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    return () => {
      el?.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [children]);

  const scroll = (amount) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="relative flex items-center">
      {showLeft && <button onClick={() => scroll(-150)} className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-slate-100 dark:from-slate-900 to-transparent"><ChevronLeft className="h-5 w-5 text-slate-500"/></button>}
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto scroll-smooth py-1" style={{ scrollbarWidth: 'none', '-ms-overflow-style': 'none', 'WebkitOverflowScrolling': 'touch' }}>{children}</div>
      {showRight && <button onClick={() => scroll(150)} className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-slate-100 dark:from-slate-900 to-transparent"><ChevronRight className="h-5 w-5 text-slate-500"/></button>}
    </div>
  );
}

function TaskItem({task, onUpdate, onView, isInDeleteMode, isSelected, onToggleSelect}){

  const handleStatusChange = (e) => {
    e.stopPropagation(); // หยุดไม่ให้ event ส่งผลกระทบกับส่วนอื่น
    const statuses = ['todo', 'doing', 'done'];
    const currentIndex = statuses.indexOf(task.status);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    // Allow un-doing 'done' status within 1 hour
    if (task.status === 'done' && task.updatedAt) {
      if (differenceInHours(new Date(), new Date(task.updatedAt)) >= 1) {
        alert("ไม่สามารถเปลี่ยนสถานะงานที่เสร็จสิ้นไปแล้วเกิน 1 ชั่วโมงได้");
        return;
      }
    }

    onUpdate({ ...task, status: nextStatus, updatedAt: new Date().toISOString() });
  };

  // สร้างคลาสสำหรับไล่เฉดสีตามสถานะของงาน
  const statusGradientClass =
    task.status === 'done'
      ? 'opacity-60 bg-gradient-to-l from-emerald-400/10' // สีเขียวสำหรับ "เสร็จแล้ว"
      : task.status === 'doing'
      ? 'bg-gradient-to-l from-amber-400/10' // สีส้มสำหรับ "กำลังทำ"
      : ''; // ไม่มีสีสำหรับ "ยังไม่ทำ"

  const isEvent = task.taskType === 'event';

  const handleClick = () => {
    if (isInDeleteMode) {
      onToggleSelect();
    } else {
      onView();
    }
  };

  return (
    <Card onClick={handleClick} className={`${statusGradientClass} cursor-pointer transition-all ${isSelected ? 'ring-2 ring-indigo-500' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Status Toggle Button */}
        <button onClick={handleStatusChange} className="flex-shrink-0 mt-1 transition-transform active:scale-90" title="คลิกเพื่อเปลี่ยนสถานะ">
          {task.status === 'done' && <CheckCircle className="h-6 w-6 text-emerald-500" />}
          {task.status === 'doing' && <div className="h-6 w-6 rounded-full border-2 border-amber-500 flex items-center justify-center"><Minus className="h-4 w-4 text-amber-500"/></div>}
          {task.status === 'todo' && <Circle className="h-6 w-6 text-slate-300 dark:text-slate-600" />}
        </button>

        {/* Task Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium truncate">{task.title}</div>
            {task.subjectName && <Badge className="border-slate-300 text-slate-500"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{background:task.subjectColor}}/> {task.subjectName}</Badge>}
          </div>
          {task.detail && (
            <div className={`text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap line-clamp-4`}>
              {task.detail}
            </div>
          )}
          <div className="mt-2">
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              {task.dueAt ? (
                isEvent ? (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3"/> นัดหมาย: {format(new Date(task.dueAt), "d MMM yy HH:mm", {locale: th})}</span>
                ) : (
                  <>
                    <span className="flex items-center gap-1"><Flag className="h-3 w-3"/> กำหนดส่ง: {format(new Date(task.dueAt), "d MMM yy HH:mm", {locale: th})}</span>
                    <span>• {isPast(new Date(task.dueAt))? 'เลยกำหนดแล้ว' : timeLeftLabel(task.dueAt)}</span>
                  </>
                )
              ) : <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3"/> ไม่มีวันส่ง</span>}
              {task.link && <a href={task.link} target="_blank" className="inline-flex items-center gap-1 underline"><LinkIcon className="h-3 w-3"/> ลิงก์งาน</a>}
            </div>
          </div>
        </div>
        {isInDeleteMode && (
          <div className="absolute top-2 right-2">
            <CheckCircle className={`h-6 w-6 transition-all ${isSelected ? 'text-indigo-500 scale-100' : 'text-slate-300 dark:text-slate-600 scale-0'}`} />
          </div>
        )}
      </div>
    </Card>
  )
}

function TaskDetailModal({ task, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="text-lg font-semibold mb-2">รายละเอียดงาน</div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500">ชื่องาน</label>
          <div className="font-medium">{task.title}</div>
        </div>
        {task.detail && (
          <div>
            <label className="text-xs text-slate-500">รายละเอียด</label>
            <div className="whitespace-pre-wrap">{task.detail}</div>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500">กำหนดส่ง</label>
          <div className="flex items-center gap-2">
            {task.dueAt ? (
              <>
                <CalendarIcon className="h-4 w-4 text-slate-500"/>
                <span>{format(new Date(task.dueAt), "d MMM yyyy HH:mm", {locale: th})}</span>
                <span className="text-sm text-slate-500">• {isPast(new Date(task.dueAt)) ? 'เลยกำหนดแล้ว' : timeLeftLabel(task.dueAt)}</span>
              </>
            ) : (
              <span className="text-slate-500">ไม่มีวันส่ง</span>
            )}
          </div>
        </div>
        {task.link && (
          <div>
            <label className="text-xs text-slate-500">ลิงก์ที่เกี่ยวข้อง</label>
            <a href={task.link} target="_blank" className="text-indigo-500 hover:underline flex items-center gap-1">
              <LinkIcon className="h-4 w-4"/> {task.link}
            </a>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>ปิด</Button>
      </div>
    </Modal>
  );
}

function ReminderPicker({value, onChange}){
  const items = [
    {label:'15 นาที', type:'minutes', amount:15},
    {label:'30 นาที', type:'minutes', amount:30},
    {label:'1 ชม.', type:'hours', amount:1},
    {label:'3 ชม.', type:'hours', amount:3},
    {label:'1 วัน', type:'days', amount:1},
  ]
  const toggle = (it)=>{
    const exists = value.some(x=>x.type===it.type && x.amount===it.amount)
    onChange(exists? value.filter(x=>!(x.type===it.type && x.amount===it.amount)) : [...value, it])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(it=> (
        <GhostButton key={it.label} onClick={()=>toggle(it)} className={value.some(x=>x.type===it.type && x.amount===it.amount)? 'bg-slate-50 dark:bg-slate-800' : ''}>
          <Bell className="h-4 w-4"/> {it.label}
        </GhostButton>
      ))}
    </div>
  );
}

function AddCourseModal({course, onClose, onSave}) {
  const [form, setForm] = useState(course || {
    name: '',
    code: '',
    room: '',
    pRoom: '',
    teacher: '',
    dayOfWeek: 1, // Monday
    startTime: '09:00',
    endTime: '12:00',
    scheduleType: 'odd-onsite',
    color: '#6366f1'
  });

  const handleSubmit = () => {
    if (!form.name || !form.code) {
      alert('กรุณากรอกชื่อวิชาและรหัสวิชา');
      return;
    }
    onSave(form);
  };

  return (
    <Modal onClose={onClose}>
      <div className="text-lg font-semibold mb-4">{course ? 'แก้ไขวิชาเรียน' : 'เพิ่มวิชาเรียนใหม่'}</div>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        <div>
          <label className="text-xs text-slate-500">ชื่อวิชา</label>
          <Input 
            value={form.name} 
            onChange={e => setForm({...form, name: e.target.value})} 
            placeholder="เช่น ศาสนานำชีวิต"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">รหัสวิชา</label>
          <Input 
            value={form.code} 
            onChange={e => setForm({...form, code: e.target.value})} 
            placeholder="เช่น 002125"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500">ห้องเรียน</label>
            <Input 
              value={form.room} 
              onChange={e => setForm({...form, room: e.target.value})} 
              placeholder="เช่น 9.06.06"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">ห้อง P</label>
            <Input 
              value={form.pRoom} 
              onChange={e => setForm({...form, pRoom: e.target.value})} 
              placeholder="เช่น P3"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">อาจารย์</label>
          <Input 
            value={form.teacher} 
            onChange={e => setForm({...form, teacher: e.target.value})} 
            placeholder="ชื่ออาจารย์ผู้สอน"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">วันเรียน</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {[
              {value: 1, label: 'จันทร์'},
              {value: 2, label: 'อังคาร'},
              {value: 3, label: 'พุธ'},
              {value: 4, label: 'พฤหัสบดี'},
              {value: 5, label: 'ศุกร์'},
            ].map(day => (
              <GhostButton 
                key={day.value}
                onClick={() => setForm({...form, dayOfWeek: day.value})}
                className={form.dayOfWeek === day.value ? 'bg-indigo-500 !text-white' : 'bg-white/40'}
              >
                {day.label}
              </GhostButton>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500">เวลาเริ่ม</label>
            <Input 
              type="time"
              value={form.startTime} 
              onChange={e => setForm({...form, startTime: e.target.value})} 
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">เวลาจบ</label>
            <Input 
              type="time"
              value={form.endTime} 
              onChange={e => setForm({...form, endTime: e.target.value})} 
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-2 block">เงื่อนไขการเรียน</label>
          <div className="space-y-2">
            {[
              {value: 'odd-onsite', label: 'เข้าชั้นเรียนในสัปดาห์คี่ / ออนไลน์ในสัปดาห์คู่'},
              {value: 'even-onsite', label: 'เข้าชั้นเรียนในสัปดาห์คู่ / ออนไลน์ในสัปดาห์คี่'},
              {value: 'online-always', label: 'ออนไลน์ตลอด'},
              {value: 'onsite-always', label: 'มหาลัยตลอด'},
            ].map(type => (
              <label key={type.value} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50 cursor-pointer">
                <input 
                  type="radio"
                  name="scheduleType"
                  value={type.value}
                  checked={form.scheduleType === type.value}
                  onChange={e => setForm({...form, scheduleType: e.target.value})}
                  className="w-4 h-4"
                />
                <span className="text-sm">{type.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">สีประจำวิชา</label>
          <Input 
            type="color"
            value={form.color} 
            onChange={e => setForm({...form, color: e.target.value})} 
            className="w-full h-12 p-1"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <Button onClick={handleSubmit}><Check className="h-4 w-4"/> บันทึก</Button>
      </div>
    </Modal>
  );
}


function Settings({state, dispatch, userId, onLogout, setView}){
  const fileRef = useRef(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null); // This will hold the subject object being edited
  const [addingCourse, setAddingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  const nameRef = useRef(null);
  const colorRef = useRef(null);
  const editNameRef = useRef(null);
  const editColorRef = useRef(null);

  const addSubject = ()=>{
    const name = nameRef.current.value.trim();
    if(!name) return;
    dispatch({type:'addSubject', payload:{id:uid(), name, color: colorRef.current.value || '#6366f1'}});
    nameRef.current.value = '';
    setAddingSubject(false);
  };

  const handleEditSubject = (subject) => {
    setEditingSubject(subject);
  };

  const saveEditSubject = () => {
    if (!editingSubject) return;
    const name = editNameRef.current.value.trim();
    if (name) {
      dispatch({ type: 'updateSubject', payload: { ...editingSubject, name, color: editColorRef.current.value || '#6366f1' } });
    }
    setEditingSubject(null);
  };

  const handleDeleteSubject = (subjectId) => {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายวิชานี้และงานทั้งหมดที่เกี่ยวข้อง?')) {
      dispatch({ type: 'deleteSubject', id: subjectId });
    }
  };

  const handleEditCourse = (course) => {
    setEditingCourse(course);
  };

  const handleDeleteCourse = (courseId) => {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบวิชาเรียนนี้?')) {
      dispatch({ type: 'deleteCourse', id: courseId });
    }
  };
  const exportData = ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'flowo-data.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importData = (e)=>{
    const file = e.target.files?.[0]
    if(!file) return
    const reader = new FileReader()
    reader.onload = (ev)=>{
      try{
        const data = JSON.parse(ev.target.result);
        dispatch({type: 'load', payload: data});
        alert('นำเข้าข้อมูลสำเร็จ!');
      }catch{
        alert('ไฟล์ไม่ถูกต้อง');
      }
    }
    reader.readAsText(file)
  }

  const handleClearData = () => {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      if (!userId) return;
      const docRef = doc(db, "schedules", userId);
      // เขียนทับข้อมูลบน Firebase ด้วย state เริ่มต้น (ว่างเปล่า)
      setDoc(docRef, initialState)
        .then(() => {
          alert('ล้างข้อมูลสำเร็จแล้ว!');
          // onSnapshot จะอัปเดตหน้าจอให้โดยอัตโนมัติ
        })
        .catch(error => {
          console.error("Error clearing document: ", error);
          alert("เกิดข้อผิดพลาดในการล้างข้อมูล");
        });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>จัดการรายวิชา</SectionTitle>
        <div className="space-y-2 mb-4">
          {state.subjects.map(s => (
            <div key={s.id} className="flex items-center p-2 rounded-lg bg-slate-100/50 dark:bg-slate-800/50 group">
              <span className="w-3 h-3 rounded-full mr-3" style={{backgroundColor: s.color}}></span>
              <span className="flex-1">{s.name}</span>
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <GhostButton onClick={() => handleEditSubject(s)} className="!p-2"><Pencil className="h-4 w-4"/></GhostButton>
                <GhostButton onClick={() => handleDeleteSubject(s.id)} className="!p-2 text-rose-500"><Trash2 className="h-4 w-4"/></GhostButton>
              </div>
            </div>
          ))}
        </div>
        <Button onClick={() => setAddingSubject(true)}><Plus className="h-4 w-4"/> เพิ่มรายวิชาใหม่</Button>
      </Card>

      <AnimatePresence>
        {addingSubject && (
          <Modal onClose={() => setAddingSubject(false)}>
            <div className="text-lg font-semibold mb-4">เพิ่มรายวิชาใหม่</div>
            <div className="space-y-4">
              <div>
                <label className="text-xs">ชื่อรายวิชา</label>
                <Input ref={nameRef} placeholder="เช่น GEN001" autoFocus />
              </div>
              <div>
                <label className="text-xs">เลือกสี</label>
                <Input ref={colorRef} type="color" defaultValue="#6366f1" className="w-full h-12 p-1" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <GhostButton onClick={() => setAddingSubject(false)}>ยกเลิก</GhostButton>
              <Button onClick={addSubject}><Check className="h-4 w-4"/> บันทึก</Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingSubject && (
          <Modal onClose={() => setEditingSubject(null)}>
            <div className="text-lg font-semibold mb-4">แก้ไขรายวิชา</div>
            <div className="space-y-4">
              <div>
                <label className="text-xs">ชื่อรายวิชา</label>
                <Input
                  ref={editNameRef}
                  defaultValue={editingSubject.name}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs">เลือกสี</label>
                <Input
                  ref={editColorRef}
                  type="color"
                  defaultValue={editingSubject.color}
                  className="w-full h-12 p-1"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <GhostButton onClick={() => setEditingSubject(null)}>ยกเลิก</GhostButton>
              <Button onClick={saveEditSubject}><Check className="h-4 w-4"/> บันทึก</Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <Card>
        <SectionTitle>จัดการตารางเรียน</SectionTitle>
        <div className="space-y-2 mb-4">
          {state.courses.map(c => (
            <div key={c.id} className="flex items-center p-2 rounded-lg bg-slate-100/50 dark:bg-slate-800/50 group">
              <span className="w-3 h-3 rounded-full mr-3" style={{backgroundColor: c.color}}></span>
              <div className="flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-slate-500">{c.code} • {['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'][c.dayOfWeek]} {c.startTime}-{c.endTime}</div>
              </div>
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <GhostButton onClick={() => handleEditCourse(c)} className="!p-2"><Pencil className="h-4 w-4"/></GhostButton>
                <GhostButton onClick={() => handleDeleteCourse(c.id)} className="!p-2 text-rose-500"><Trash2 className="h-4 w-4"/></GhostButton>
              </div>
            </div>
          ))}
        </div>
        <Button onClick={() => setAddingCourse(true)}><Plus className="h-4 w-4"/> เพิ่มวิชาเรียนใหม่</Button>
      </Card>

      <AnimatePresence>
        {addingCourse && (
          <AddCourseModal onClose={() => setAddingCourse(false)} onSave={(course) => {
            dispatch({type:'addCourse', payload:{...course, id:uid(), createdAt:Date.now(), updatedAt:Date.now()}});
            setAddingCourse(false);
          }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingCourse && (
          <AddCourseModal 
            course={editingCourse} 
            onClose={() => setEditingCourse(null)} 
            onSave={(course) => {
              dispatch({type:'updateCourse', payload:course});
              setEditingCourse(null);
            }} 
          />
        )}
      </AnimatePresence>

      <Card>
        <SectionTitle><Archive className="h-4 w-4"/> ประวัติงาน</SectionTitle>
        <p className="text-sm text-slate-500 mb-3">ดูงานที่เสร็จสิ้นไปแล้ว</p>
        <Button onClick={() => setView('history')}>ไปที่หน้าประวัติงาน</Button>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="sm:col-span-1">
          <SectionTitle>สำรอง/กู้คืน</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
            <Button onClick={exportData}><Download className="h-4 w-4"/> ส่งออก JSON</Button>
            <GhostButton onClick={()=>fileRef.current?.click()}><Upload className="h-4 w-4"/> นำเข้า JSON</GhostButton>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importData} />
          </div>
          <div className="mt-3 text-xs text-slate-500">ข้อมูลจะถูกบันทึกออนไลน์อัตโนมัติ</div>
        </Card>

        <Card className="sm:col-span-1">
          <SectionTitle>ล้างข้อมูลทั้งหมด</SectionTitle>
          <div className="flex flex-col items-start">
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={handleClearData}>ล้างข้อมูล</Button>
            <p className="text-xs text-slate-500 mt-2">การกระทำนี้จะลบข้อมูลทั้งหมดในบัญชีของคุณอย่างถาวร</p>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>บัญชี</SectionTitle>
        <p className="text-sm text-slate-500 mb-3">ออกจากระบบเพื่อสลับบัญชี</p>
        <Button onClick={onLogout} className="bg-slate-600 hover:bg-slate-700"><LogOut className="h-4 w-4"/> ออกจากระบบ</Button>
      </Card>
    </div>
  )
}

function TaskDetailView({ task, onUpdate, onClose, subjects }) {
  const [isEditing, setEditing] = useState(false);
  const [form, setForm] = useState({...task, taskType: task.taskType || 'deadline', startAt: task.startAt ? format(new Date(task.startAt), "yyyy-MM-dd'T'HH:mm") : '', dueAt: task.dueAt? format(new Date(task.dueAt), "yyyy-MM-dd'T'HH:mm") : ''})
  
  const handleDayClick = (day) => {
    const { startAt, dueAt } = form;
    const newDate = set(day, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });

    if (!startAt && !dueAt) {
      setForm(f => ({ ...f, dueAt: newDate.toISOString(), startAt: '' }));
    } else if (!startAt && dueAt) {
      const dueDate = new Date(dueAt);
      if (newDate < dueDate) {
        setForm(f => ({ ...f, startAt: newDate.toISOString() }));
      } else {
        setForm(f => ({ ...f, startAt: dueAt, dueAt: newDate.toISOString() }));
      }
    } else {
      setForm(f => ({ ...f, dueAt: newDate.toISOString(), startAt: '' }));
    }
  };

  const handleTimeChange = (field, timeValue) => {
    if (!timeValue) return;
    const [hours, minutes] = timeValue.split(':');
    const dateToUpdate = form[field] ? new Date(form[field]) : new Date();
    let finalDate = setHours(dateToUpdate, parseInt(hours, 10));
    finalDate = setMinutes(finalDate, parseInt(minutes, 10));
    setForm(f => ({ ...f, [field]: finalDate.toISOString() }));
  };

  const selectedRange = useMemo(() => {
    const from = form.startAt ? new Date(form.startAt) : undefined;
    const to = form.dueAt ? new Date(form.dueAt) : undefined;
    if (from && !to) return { from, to: from };
    if (!from && to) return { from: to, to: to };
    return { from, to };
  }, [form.startAt, form.dueAt]);

  const save = ()=>{
    const payload = {...form, detail: form.detail || '', link: form.link || ''}
    onUpdate(payload)
    setEditing(false)
  };

  if (isEditing) {
    return (
      <>
        <div className="flex justify-between items-center mb-4">
          <div className="text-lg font-semibold">อัปเดตงาน</div>
          <div className="flex gap-2">
            <GhostButton onClick={()=>setEditing(false)}>ยกเลิก</GhostButton>
            <Button onClick={save}><Check className="h-4 w-4"/> บันทึก</Button>
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-slate-500 mb-1 block">ประเภท</label>
          <div className="flex gap-2"><GhostButton onClick={() => setForm({...form, taskType: 'deadline'})} className={`flex-1 ${form.taskType === 'deadline' ? 'bg-indigo-500 !text-white' : 'bg-white/40'}`}>📝 งาน</GhostButton>
            <GhostButton onClick={() => setForm({...form, taskType: 'event'})} className={`flex-1 ${form.taskType === 'event' ? 'bg-indigo-500 !text-white' : 'bg-white/40'}`}>🗓️ นัดหมาย</GhostButton>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs">สถานะ</label>
            <div className="custom-select-wrapper">
              <Select value={form.status} onChange={e=>setForm({...form, status: e.target.value})}>
                <option value="todo">ยังไม่ทำ</option><option value="doing">กำลังทำ</option><option value="done">เสร็จแล้ว</option>
              </Select></div>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">ชื่องาน</label>
            <Input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} className="w-full" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">รายละเอียด</label>
            <Textarea value={form.detail||''} onChange={e=>setForm({...form, detail:e.target.value})} />
          </div>
          <div className="md:col-span-2 p-3 rounded-2xl bg-slate-100/50">
            <DayPicker
              mode="range"
              selected={selectedRange}
              onDayClick={handleDayClick}
              locale={th}
              showOutsideDays
              weekStartsOn={1}
            />
            <div className="grid grid-cols-2 gap-4 mt-2 pt-2 border-t border-slate-200/50">
              {form.taskType === 'deadline' && (
                <div>
                  <label className="text-xs">เวลาเริ่ม</label>
                  <Input type="time" value={form.startAt ? format(new Date(form.startAt), 'HH:mm') : ''} onChange={e => handleTimeChange('startAt', e.target.value)} />
                </div>
              )}
              <div className={form.taskType !== 'deadline' ? 'col-span-2' : ''}>
                <label className="text-xs">{form.taskType === 'deadline' ? 'เวลาสิ้นสุด' : 'เวลานัดหมาย'}</label>
                <Input type="time" value={form.dueAt ? format(new Date(form.dueAt), 'HH:mm') : ''} onChange={e => handleTimeChange('dueAt', e.target.value)} />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs">ลิงก์</label>
            <Input value={form.link||''} onChange={e=>setForm({...form, link:e.target.value})} className="w-full" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">เตือนก่อน</label>
            <ReminderPicker value={form.reminders||[]} onChange={(reminders)=> setForm({...form, reminders})} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="text-lg font-semibold mb-2">{task.title}</div>
      <div className="space-y-4">
        {task.detail && (
          <div>
            <label className="text-xs text-slate-500">รายละเอียด</label>
            <div className="whitespace-pre-wrap text-sm">{task.detail}</div>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500">{task.taskType === 'event' ? 'นัดหมาย' : 'กำหนดส่ง'}</label>
          <div className="flex items-center gap-2 text-sm">
            {task.dueAt ? (
              <>
                <CalendarIcon className="h-4 w-4 text-slate-500"/>
                <span>{format(new Date(task.dueAt), "d MMMM yyyy 'เวลา' HH:mm", {locale: th})}</span>
              </>
            ) : (
              <span className="text-slate-500">ไม่มี</span>
            )}
          </div>
        </div>
        {task.link && (
          <div>
            <label className="text-xs text-slate-500">ลิงก์</label>
            <a href={task.link} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline flex items-center gap-1 text-sm truncate">
              <LinkIcon className="h-4 w-4"/> {task.link}
            </a>
          </div>
        )}
        <div className="flex gap-4">
          <div>
            <label className="text-xs text-slate-500">สถานะ</label>
            <div>{statusBadge(task.status)}</div>
          </div>
          <div>
            <label className="text-xs text-slate-500">วิชา</label>
            <div>{task.subjectName ? <Badge className="border-slate-300 text-slate-500"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{background:task.subjectColor || '#94a3b8'}}/> {task.subjectName}</Badge> : 'ไม่มี'}</div>
          </div>
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
        <GhostButton onClick={onClose}>ปิด</GhostButton>
        <Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4"/> แก้ไข</Button>
      </div>
    </>
  );
}

function HistoryView({ tasks, dispatch }) {
  const [selectedTasks, setSelectedTasks] = useState(new Set());

  const handleDelete = () => {
    if (selectedTasks.size === 0) return;
    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ ${selectedTasks.size} งานออกจากประวัติอย่างถาวร?`)) {
      selectedTasks.forEach(id => dispatch({ type: 'deleteTask', id }));
      setSelectedTasks(new Set());
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle><Archive className="h-5 w-5"/> ประวัติงาน</SectionTitle>
      <p className="text-sm text-slate-500 -mt-4">รายการงานที่เสร็จสิ้นไปแล้วเกิน 1 ชั่วโมง</p>
      <div className="flex justify-end">
        <Button onClick={handleDelete} disabled={selectedTasks.size === 0} className="bg-rose-600 hover:bg-rose-700">
          <Trash2 className="h-4 w-4"/> ลบ {selectedTasks.size} รายการ
        </Button>
      </div>
      <div className="space-y-2">
        {tasks.map(task => (
          <Card key={task.id} onClick={() => {
            const newSelected = new Set(selectedTasks);
            if (newSelected.has(task.id)) newSelected.delete(task.id);
            else newSelected.add(task.id);
            setSelectedTasks(newSelected);
          }} className={`cursor-pointer transition-opacity opacity-70 hover:opacity-100 ${selectedTasks.has(task.id) ? 'ring-2 ring-rose-500' : ''}`}
          >
            <div className="flex justify-between">
              <div>
                <div className="font-medium">{task.title}</div>
                <div className="text-xs text-slate-500">เสร็จสิ้นเมื่อ: {format(new Date(task.updatedAt), "d MMM yy HH:mm", {locale: th})}</div>
              </div>
              {selectedTasks.has(task.id) && <CheckCircle className="h-5 w-5 text-rose-500" />}
            </div>
          </Card>
        ))}
        {tasks.length === 0 && <div className="text-center text-slate-500 py-10">ยังไม่มีงานในประวัติ</div>}
      </div>
    </div>
  );
}

function LoginScreen() {
  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      alert("เกิดข้อผิดพลาดในการล็อกอิน: " + error.message);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-8 bg-slate-100 dark:bg-slate-950 p-4">
      <div className="text-center">
        <motion.div initial={{rotate:-8, scale:0.9}} animate={{rotate:0, scale:1}} className="inline-block h-20 w-20 mb-4 rounded-3xl bg-indigo-600 text-white items-center justify-center shadow-lg shadow-indigo-500/30">
          <Sparkles className="h-12 w-12 m-4" />
        </motion.div>
        <h1 className="text-3xl font-bold font-display">ยินดีต้อนรับสู่ FlowO</h1>
        <p className="text-slate-500 mt-2">จัดการตารางงานและชีวิตให้ง่ายขึ้น</p>
      </div>
      <Button onClick={handleSignIn} className="!px-6 !py-3 !text-base"><User className="h-5 w-5" /> เข้าสู่ระบบด้วย Google</Button>
    </div>
  );
}

function Modal({children, onClose}){
  useEffect(()=>{
    const onKey = (e)=>{ if(e.key==='Escape') onClose() }

    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[onClose])
  return createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Centering container: ensures symmetric top/bottom spacing and centers content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{ duration: 0.18 }}
          className="w-[92%] sm:w-[80%] md:w-[720px] mx-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrollable area: max-height keeps equal margins and allows internal scrolling when content is tall */}
          <div className="max-h-[calc(100vh-4rem)] w-full overflow-y-auto rounded-2xl">
            <Card className="p-4 md:p-6 rounded-2xl">
              {children}
            </Card>
          </div>
        </motion.div>
      </div>
    </>,
    document.body
  )
}
