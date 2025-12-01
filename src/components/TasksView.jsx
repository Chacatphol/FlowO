import { useState } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { TaskItem } from './TaskItem';
import { TaskEditForm } from './TaskEditForm';
import { Modal } from './Modal';
import { Button, Input, Select } from './ui';
import { useAuth } from '../firebase';

export function TasksView({ data }) {
  const { user } = useAuth();
  const [editTask, setEditTask] = useState(null);
  const [filter, setFilter] = useState({
    subject: 'all',
    status: 'all',
  });
  const [selected, setSelected] = useState([]);
  
  const subjects = data.subjects || [];
  const tasks = data.tasks || [];

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (filter.subject !== 'all' && task.subjectId !== filter.subject) return false;
    if (filter.status !== 'all' && task.status !== filter.status) return false;
    return true;
  });

  // Handle single click - toggle selection
  const toggleSelect = (task) => {
    if (selected.includes(task.id)) {
      setSelected(selected.filter(id => id !== task.id));
    } else {
      setSelected([...selected, task.id]);
    }
  };

  // Handle edit task
  const handleSave = async (updatedTask) => {
    const taskRef = doc(db, 'users', user.uid, 'tasks', updatedTask.id);
    await setDoc(taskRef, updatedTask);
    setEditTask(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select
          value={filter.subject}
          onChange={e => setFilter({...filter, subject: e.target.value})}
          className="flex-1"
        >
          <option value="all">ทุกรายวิชา</option>
          {subjects.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        <Select 
          value={filter.status}
          onChange={e => setFilter({...filter, status: e.target.value})}
          className="w-32"
        >
          <option value="all">ทุกสถานะ</option>
          <option value="todo">ยังไม่ทำ</option>
          <option value="doing">กำลังทำ</option>
          <option value="done">เสร็จแล้ว</option>
        </Select>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map(task => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <TaskItem
                task={task}
                selected={selected.includes(task.id)}
                onClick={() => toggleSelect(task)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editTask && (
        <Modal onClose={() => setEditTask(null)}>
          <TaskEditForm 
            task={editTask}
            subjects={subjects}
            onSave={handleSave}
            onClose={() => setEditTask(null)}
          />
        </Modal>
      )}

      {/* Floating action button */}
      <Button
        onClick={() => setEditTask({ id: Date.now().toString() })}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 p-0"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}