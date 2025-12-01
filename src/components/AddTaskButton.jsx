import React, { useState, useEffect } from 'react';
import { Plus, Check, Bell } from 'lucide-react';
import { Button, GhostButton, Input, Textarea, Select } from './ui';
import { Modal } from './Modal';
import { AnimatePresence } from 'framer-motion';

// Helper function
const uid = () => Math.random().toString(36).slice(2,9);

export function AddTaskButton({subjects, onAdd}){
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    subjectId: subjects[0]?.id || '',
    title:'', detail:'', dueAt:'', link:'', status:'todo', progress:0, priority:'med', category:'เรียน', reminders:[]
  })
  useEffect(()=>{ if(subjects.length && !form.subjectId) setForm(f=>({...f, subjectId: subjects[0].id})) },[subjects])

  const submit = ()=>{
    if(!form.title) return alert('ใส่ชื่องานก่อนนะ')
    const payload = { ...form, id:uid(), createdAt:Date.now(), updatedAt:Date.now(), dueAt: form.dueAt? new Date(form.dueAt).toISOString(): null }
    onAdd(payload)
    setOpen(false)
    setForm(f=>({...f, title:'', detail:'', dueAt:'', link:'', status:'todo', progress:0, reminders:[]}))
  }

  return (
    <>
      <Button onClick={()=>setOpen(true)}><Plus className="h-4 w-4"/> เพิ่มงาน</Button>
      <AnimatePresence>
        {open && (
          <Modal onClose={()=>setOpen(false)}>
            <div className="text-lg font-semibold mb-4">เพิ่มงานใหม่</div>
            <div className="overflow-y-auto max-h-[calc(85vh-8rem)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">รายวิชา</label>
                  <Select value={form.subjectId} onChange={e=>setForm({...form, subjectId:e.target.value})}>
                    {subjects.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">ความสำคัญ</label>
                  <Select value={form.priority} onChange={e=>setForm({...form, priority:e.target.value})}>
                    <option value="high">ด่วน</option>
                    <option value="med">สำคัญ</option>
                    <option value="low">ทั่วไป</option>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">ชื่องาน</label>
                  <Input 
                    value={form.title} 
                    onChange={e=>setForm({...form, title:e.target.value})} 
                    placeholder="เช่น Assignment บทที่ 3"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">รายละเอียด</label>
                  <Textarea 
                    value={form.detail} 
                    onChange={e=>setForm({...form, detail:e.target.value})} 
                    placeholder="โน้ตย่อย หรือ checklist คร่าวๆ"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">กำหนดส่ง (ว่างได้)</label>
                  <Input type="datetime-local" value={form.dueAt} onChange={e=>setForm({...form, dueAt:e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">ลิงก์ที่เกี่ยวข้อง</label>
                  <Input 
                    value={form.link} 
                    onChange={e=>setForm({...form, link:e.target.value})} 
                    placeholder="วางลิงก์เอกสาร"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">หมวดหมู่</label>
                  <Select value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
                    <option value="เรียน">เรียน</option>
                    <option value="งาน">งาน</option>
                    <option value="ส่วนตัว">ส่วนตัว</option>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">สถานะ</label>
                  <Select value={form.status} onChange={e=>setForm({...form, status:e.target.value})}>
                    <option value="todo">ยังไม่ทำ</option>
                    <option value="doing">กำลังทำ</option>
                    <option value="done">เสร็จแล้ว</option>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">เตือนก่อน (เลือกหลายอันได้)</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {label:'15 นาที', type:'minutes', amount:15},
                      {label:'30 นาที', type:'minutes', amount:30},
                      {label:'1 ชม.', type:'hours', amount:1},
                      {label:'3 ชม.', type:'hours', amount:3},
                      {label:'1 วัน', type:'days', amount:1},
                    ].map(r=> (
                      <GhostButton key={r.label} onClick={()=>{
                        setForm(f=> ({...f, reminders: f.reminders.some(x=>x.type===r.type && x.amount===r.amount) ? f.reminders.filter(x=>!(x.type===r.type && x.amount===r.amount)) : [...f.reminders, r]}))
                      }} className={form.reminders.some(x=>x.type===r.type && x.amount===r.amount)? 'bg-slate-50 dark:bg-slate-800' : ''}>
                        <Bell className="h-4 w-4"/> {r.label}
                      </GhostButton>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">ความคืบหน้า: {form.progress}%</label>
                  <input 
                    type="range" 
                    min={0} 
                    max={100} 
                    value={form.progress} 
                    onChange={e=>setForm({...form, progress: Number(e.target.value)})} 
                    className="w-full" 
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t pt-4 dark:border-slate-700">
              <GhostButton onClick={()=>setOpen(false)}>ยกเลิก</GhostButton>
              <Button onClick={submit}><Check className="h-4 w-4"/> บันทึก</Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}