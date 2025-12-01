import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Badge, Progress } from './ui';

const statusColors = {
  todo: 'bg-slate-200 text-slate-500',
  doing: 'bg-blue-200 text-blue-500',
  done: 'bg-green-200 text-green-500'
};

const statusLabels = {
  todo: 'ยังไม่ทำ',
  doing: 'กำลังทำ',
  done: 'เสร็จแล้ว'
};

export function TaskItem({ task, selected, onClick }) {
  const subject = task.subject;
  const color = subject?.color || 'slate';

  return (
    <div 
      onClick={onClick}
      className={`
        p-4 rounded-2xl bg-white dark:bg-slate-800 relative transition-all
        ${selected ? 'ring-2 ring-offset-2 dark:ring-offset-slate-900' : ''}
      `}
    >
      <div className="flex justify-between items-start">
        <h3 className={`font-semibold text-lg text-${color}-500`}>{task.title}</h3>
        <Badge className={statusColors[task.status]}>
          {statusLabels[task.status]}
        </Badge>
      </div>
      {task.detail && <p className="text-sm text-slate-500 mt-1">{task.detail}</p>}
      <div className="mt-4">
        <Progress 
          value={task.progress} 
          color={color}
          className="h-1.5"
        />
      </div>
      <div className="flex gap-4 mt-4 text-xs">
        {task.dueAt && (
          <div>
            <div className="text-slate-500 dark:text-slate-400">กำหนดส่ง</div>
            <div>{format(new Date(task.dueAt), 'PPP', { locale: th })}</div>
          </div>
        )}
        {task.duration && (
          <div>
            <div className="text-slate-500 dark:text-slate-400">ระยะเวลา</div>
            <div>{task.duration} นาที</div>
          </div>
        )}
      </div>
    </div>
  );
}