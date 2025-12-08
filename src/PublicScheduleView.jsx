import React, { useState, useMemo } from 'react';
import { format, addDays, subDays, startOfWeek, eachDayOfInterval } from 'date-fns';
import { th } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';

// Helper functions (copied from App.jsx)
const hexToRgba = (hex, alpha = 1) => {
  if (!hex || !/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return '';
  let c = hex.substring(1).split('');
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  c = '0x' + c.join('');
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`;
};

const getWeekType = (date) => {
  const referenceDate = new Date('2025-12-02');
  const weekStartOfDate = startOfWeek(date, { weekStartsOn: 1 });
  const weekStartOfReference = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const weeksDiff = Math.floor((weekStartOfDate - weekStartOfReference) / (7 * 24 * 60 * 60 * 1000));
  return weeksDiff % 2 === 0 ? 'odd' : 'even';
};

const getCourseStatus = (course, date) => {
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

const getCoursesForDay = (courses, date) => {
  const dayOfWeek = date.getDay();
  return courses
    .filter(c => c.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
};

export default function PublicScheduleView({ data }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const courses = data?.courses || [];
  const weekType = getWeekType(selectedDate);
  const weekTypeLabel = weekType === 'odd' ? 'สัปดาห์คี่' : 'สัปดาห์คู่';
  const weekTypeColor = weekType === 'odd' 
    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/50' 
    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50';

  const todayCourses = useMemo(() => {
    return getCoursesForDay(courses, selectedDate);
  }, [courses, selectedDate]);

  const handlePrevDay = () => {
    let newDate = subDays(selectedDate, 1);
    if (newDate.getDay() === 0) newDate = subDays(newDate, 2);
    if (newDate.getDay() === 6) newDate = subDays(newDate, 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    let newDate = addDays(selectedDate, 1);
    if (newDate.getDay() === 6) newDate = addDays(newDate, 2);
    if (newDate.getDay() === 0) newDate = addDays(newDate, 1);
    setSelectedDate(newDate);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center gap-3 mb-4">
          <img src="/logo.svg" alt="FlowU Logo" className="h-10" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ตารางเรียน (แชร์)</h1>
            <p className="text-sm text-slate-500">ดูเฉพาะ - ไม่สามารถแก้ไขได้</p>
          </div>
        </div>
      </div>

      {/* Schedule Card */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-slate-200/50 dark:border-slate-700/50">
          {/* Date Navigator */}
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={handlePrevDay}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            
            <div className="text-center flex-1 px-4">
              <div className="font-semibold text-xl mb-2">
                {format(selectedDate, 'EEEE d MMMM yyyy', { locale: th })}
              </div>
              <div className={`inline-block px-6 py-2 rounded-full font-bold ${weekTypeColor}`}>
                ✨ {weekTypeLabel} ✨
              </div>
            </div>
            
            <button 
              onClick={handleNextDay}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Today's Schedule */}
          <div className="space-y-3">
            {todayCourses.length > 0 ? (
              todayCourses.map(course => {
                const { status } = getCourseStatus(course, selectedDate);
                const statusBgColor = status === 'online' 
                  ? 'bg-blue-500'
                  : status === 'onsite'
                  ? 'bg-green-500'
                  : 'bg-slate-500';
                const statusLabel = status === 'online' ? '🌐 ออนไลน์' : status === 'onsite' ? '🏫 ออนไซต์' : '❓ ไม่ทราบ';

                return (
                  <div 
                    key={course.id}
                    className="rounded-xl bg-white/60 dark:bg-slate-800/60 overflow-hidden border-l-4"
                    style={{ borderLeftColor: course.color }}
                  >
                    {/* Status Bar */}
                    <div className={`${statusBgColor} text-white px-4 py-2 font-bold text-sm flex items-center justify-between`}>
                      <span>{statusLabel}</span>
                      <span className="text-xs opacity-90">
                        <Clock className="h-3 w-3 inline mr-1"/>
                        {course.startTime} - {course.endTime}
                      </span>
                    </div>
                    
                    {/* Course Info */}
                    <div className="p-4">
                      <div className="font-semibold text-lg mb-2">{course.name}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                        <div>📚 รหัสวิชา: {course.code}</div>
                        {course.room && <div>🚪 ห้องเรียน: {course.room}</div>}
                        {course.pRoom && <div>📍 ห้อง P: {course.pRoom}</div>}
                        {course.teacher && <div>👨‍🏫 อาจารย์: {course.teacher}</div>}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-slate-500 py-10">
                <CalendarIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">ไม่มีวิชาเรียนในวันนี้ 🎉</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-500">
          <p>ตารางเรียนนี้ถูกแชร์จาก FlowU</p>
          <p className="mt-1">ต้องการจัดการตารางเรียนของคุณเอง? <a href="/" className="text-indigo-500 hover:underline">สมัครใช้งาน</a></p>
        </div>
      </div>
    </div>
  );
}
