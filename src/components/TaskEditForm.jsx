import React, { useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Button, GhostButton, Progress, Badge, Input, Textarea, Select } from './ui.jsx';
import { Check } from 'lucide-react';

export function TaskEditForm({ task, subjects, onSave, onClose }) {
  const [form, setForm] = useState({...task});

  const submit = () => {
    if(!form.title) return alert('ใส่ชื่องานก่อนนะ');
    onSave({
      ...form,
      updatedAt: Date.now(),
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      duration: Math.max(15, parseInt(form.duration) || 60)
    });
  };

  return (
    <>
      <div className="text-lg font-semibold mb-4">แก้ไขงาน</div>
      <div className="overflow-y-auto max-h-[calc(85vh-8rem)] space-y-4">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">รายวิชา</label>
          <Select 
            value={form.subjectId} 
            onChange={e => setForm({...form, subjectId: e.target.value})}
          >
            {subjects.map(s => 
              <option key={s.id} value={s.id}>{s.name}</option>
            )}
          </Select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">ชื่องาน</label>
          <Input 
            value={form.title} 
            onChange={e => setForm({...form, title: e.target.value})}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">รายละเอียด</label>
          <Textarea 
            value={form.detail || ''} 
            onChange={e => setForm({...form, detail: e.target.value})}
            rows={4}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">กำหนดส่ง</label>
            <Input 
              type="datetime-local" 
              value={form.dueAt || ''} 
              onChange={e => setForm({...form, dueAt: e.target.value})}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">ระยะเวลา (นาที)</label>
            <Input 
              type="number" 
              min="15" 
              step="15"
              value={form.duration || 60}
              onChange={e => setForm({...form, duration: Math.max(15, parseInt(e.target.value) || 60)})}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">สถานะ</label>
          <Select 
            value={form.status} 
            onChange={e => setForm({...form, status: e.target.value})}
          >
            <option value="todo">ยังไม่ทำ</option>
            <option value="doing">กำลังทำ</option>
            <option value="done">เสร็จแล้ว</option>
          </Select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">
            ความคืบหน้า: {form.progress}%
          </label>
          <input 
            type="range" 
            min={0} 
            max={100} 
            value={form.progress || 0}
            onChange={e => setForm({...form, progress: Number(e.target.value)})}
            className="w-full"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t pt-4 dark:border-slate-700">
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <Button onClick={submit}><Check className="h-4 w-4"/> บันทึก</Button>
      </div>
    </>
  );
}