import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { DayPicker } from 'react-day-picker';
import { Popover, Transition } from '@headlessui/react';
import { format, setHours, setMinutes } from 'date-fns';
import { th } from 'date-fns/locale';

// Modern Smartify-like UI primitives (mobile-first, glass accents, indigo accent)
export const Button = ({ as: Comp = 'button', className = '', children, ...props }) => (
  <Comp
    className={`inline-flex items-center justify-center gap-2 select-none
      px-4 py-3 text-sm md:text-base font-semibold rounded-2xl
      bg-gradient-to-br from-indigo-600 to-indigo-500 text-white
      shadow-lg shadow-indigo-500/25 hover:shadow-xl active:scale-95 
      focus:outline-none
      transition-all disabled:opacity-60 ${className}`}
    {...props}
  >
    {children}
  </Comp>
);

export const GhostButton = ({ as: Comp = 'button', className = '', children, ...props }) => (
  <Comp
    className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg
      backdrop-blur-sm border border-white/10 text-slate-700
      hover:bg-white/60 active:scale-95 focus:outline-none
      transition ${className}`}
    {...props}
  >
    {children}
  </Comp>
);

export const Input = React.forwardRef((props, ref) => (
  <input
    ref={ref}
    {...props}
    className={`w-full px-3 py-2 text-sm md:text-base rounded-xl bg-white/60 backdrop-blur-sm
      border border-slate-200/30 outline-none focus:border-indigo-400
      placeholder:text-slate-400 transition ${props.className || ''}`}
  />
));

export const Textarea = (props) => {
  const textareaRef = useRef(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [props.value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      {...props}
      className={`w-full px-3 py-2 text-sm md:text-base rounded-xl bg-white/60 backdrop-blur-sm
        border border-white/10 outline-none focus:ring-2 focus:ring-indigo-400 transition resize-none overflow-y-hidden
        ${props.className || ''}`}
    />
  );
};

export const Select = (props) => (
  <select
    {...props}
    className={`w-full px-3 py-2 text-sm md:text-base rounded-xl bg-white/60 backdrop-blur-sm
      border border-slate-200/30 outline-none focus:border-indigo-400 transition ${props.className || ''}`}
  />
);

export const DateTimePicker = ({ value, onChange, ...props }) => {
  const selectedDate = value ? new Date(value) : null;

  const handleDaySelect = (date) => {
    if (!date) {
      onChange(null);
      return;
    }
    const newDate = new Date(date);
    const currentHours = selectedDate ? selectedDate.getHours() : new Date().getHours();
    const currentMinutes = selectedDate ? selectedDate.getMinutes() : 0;
    let finalDate = setHours(newDate, currentHours);
    finalDate = setMinutes(finalDate, currentMinutes);
    onChange(finalDate.toISOString());
  };

  const handleTimeChange = (e) => {
    const [hours, minutes] = e.target.value.split(':');
    const dateToUpdate = selectedDate || new Date();
    let finalDate = setHours(dateToUpdate, parseInt(hours, 10));
    finalDate = setMinutes(finalDate, parseInt(minutes, 10));
    onChange(finalDate.toISOString());
  };

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <Popover.Button as={Input} {...props} readOnly value={selectedDate ? format(selectedDate, 'd MMM yyyy, HH:mm', { locale: th }) : ''} placeholder="เลือกวันและเวลา" />
          <Transition
            as={React.Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <Popover.Panel className="absolute z-10 mt-2 w-screen max-w-sm">
              <div className="overflow-hidden rounded-2xl shadow-2xl border-2 border-black dark:border-white">
                <div className="relative bg-white/90 backdrop-blur-xl p-2">
                  <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDaySelect}
                    locale={th}
                    weekStartsOn={1} // Start week on Monday, consistent with Dashboard
                    showOutsideDays
                    classNames={{
                      caption: 'flex justify-between items-center mb-3 px-1 gap-2',
                      caption_label: 'text-sm font-semibold',
                      nav_button: 'h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-200/60 border-2 border-transparent hover:border-black',
                      head_row: 'grid grid-cols-7 gap-1 text-xs text-slate-500 mb-1', // Use grid for alignment and gap
                      head_cell: 'text-center font-medium text-slate-700', // Make day names more prominent and centered
                      row: 'flex w-full mt-2',
                      cell: 'w-10 h-10 flex items-center justify-center text-sm p-0',
                      day: 'w-full h-full flex items-center justify-center rounded-lg hover:bg-slate-200/60',
                      day_today: 'border-2 border-indigo-500',
                      day_selected: 'bg-black text-white hover:bg-black',
                      day_outside: 'text-slate-400 dark:text-slate-500',
                    }}
                    components={{
                      Caption: (props) => {
                        const { ...rest } = props;
                        return (
                          <div className="flex justify-between items-center mb-3 px-1">
                            <DayPicker.Caption {...rest} />
                            <Input type="time" className="w-28 py-1" value={selectedDate ? format(selectedDate, 'HH:mm') : ''} onChange={handleTimeChange} />
                          </div>
                        );
                      }
                    }}
                  />
                </div>
              </div>
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
};

export const Card = ({ className = '', children, ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.995 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.18 }}
    className={`bg-white/70 backdrop-blur-sm border border-white/10
      p-4 md:p-6 mb-3 rounded-2xl shadow-lg shadow-slate-300/20 ${className}`}
    {...props}
  >
    {children}
  </motion.div>
);

export const SectionTitle = ({children}) => (
  <motion.div
    initial={{ opacity: 0, x: -8 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.18 }}
    className="text-lg md:text-2xl font-semibold mb-4 flex items-center gap-2 text-slate-800"
  >
    {children}
  </motion.div>
);

export const Badge = ({children, className=''}) => (
  <span className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs font-semibold rounded-full bg-white/20 border border-white/5 ${className}`}>
    {children}
  </span>
);

export const Progress = ({value=0}) => (
  <div className="w-full h-3 bg-slate-200/60 rounded-full overflow-hidden">
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(100,Math.max(0,value))}%` }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 relative"
    >
      <span className="absolute right-1 top-1/2 -translate-y-1/2 px-1 text-[10px] font-mono text-white">
        {value}%
      </span>
    </motion.div>
  </div>
);
  
