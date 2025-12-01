import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Card } from './ui.jsx';

export function Modal({children, onClose}){
  useEffect(()=>{
    const onKey = (e)=>{ if(e.key==='Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[onClose])

  return createPortal(
    <>
      <motion.div
        initial={{opacity:0}}
        animate={{opacity:1}}
        exit={{opacity:0}}
        className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      <motion.div
        initial={{opacity:0, scale:0.98, y: 6}}
        animate={{opacity:1, scale:1, y:0}}
        exit={{opacity:0, scale:0.98, y:6}}
        transition={{ duration: 0.18 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] sm:w-[80%] md:w-[720px] z-50 max-h-[92vh] overflow-y-auto"
      >
        <div onClick={(e)=>e.stopPropagation()}>
          <Card className="p-4 md:p-6 rounded-2xl">
            {children}
          </Card>
        </div>
      </motion.div>
    </>,
    document.body
  )
}