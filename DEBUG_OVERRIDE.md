# 🔧 แก้ไขปัญหาสถานะชั่วคราวหาย - โค้ดที่ต้องแก้

## ⚠️ ปัญหา
scheduleOverrides ไม่ถูกบันทึกหรือโหลดกลับมาอย่างถูกต้อง

## ✅ วิธีแก้ไข

### ขั้นที่ 1: เพิ่ม Logging (Debug)

เปิดไฟล์ `src/App.jsx` แล้วหาบรรทัดที่มี:

```javascript
console.log("💾 กำลังบันทึกข้อมูลลง Firestore...", cleanState);
```

**แก้ไขเป็น:**

```javascript
console.log("💾 กำลังบันทึกข้อมูลลง Firestore...");
console.log("🔄 scheduleOverrides:", state.scheduleOverrides);
console.log("📦 จำนวน keys:", Object.keys(state.scheduleOverrides || {}).length);
```

---

### ขั้นที่ 2: เพิ่ม Logging ตอนโหลด

หาบรรทัดที่มี:

```javascript
console.log("📥 โหลดข้อมูลจาก Firestore:", data);
```

**เพิ่มบรรทัดนี้ด้านล่าง:**

```javascript
console.log("🔄 scheduleOverrides ที่โหลด:", data.scheduleOverrides);
```

---

### ขั้นที่ 3: ทดสอบ

1. **Save ไฟล์**
2. **รีเฟรชเว็บ (F5)**
3. **เปิด Console (F12)**
4. **กดเปลี่ยนสถานะชั่วคราว**
5. **ดู Console** - ควรเห็น:
   ```
   💾 กำลังบันทึกข้อมูลลง Firestore...
   🔄 scheduleOverrides: { "xxx_2025-12-02": "online" }
   📦 จำนวน keys: 1
   ✅ บันทึกข้อมูลสำเร็จ!
   ```
6. **รีเฟรช (F5)**
7. **ดู Console** - ควรเห็น:
   ```
   📥 โหลดข้อมูลจาก Firestore: {...}
   🔄 scheduleOverrides ที่โหลด: { "xxx_2025-12-02": "online" }
   ```

---

## 🎯 ถ้าเห็น scheduleOverrides เป็น {} (empty)

แปลว่า dispatch ไม่ทำงาน ให้ตรวจสอบ:

### ตรวจสอบ handleOverride function

หาฟังก์ชัน `handleOverride` ในไฟล์ `App.jsx` (ประมาณบรรทัด 850):

```javascript
const handleOverride = (course, date) => {
  const { status } = getCourseStatus(course, date, state.scheduleOverrides);
  const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
  const weekStartDateString = format(weekStartDate, 'yyyy-MM-dd');
  const overrideKey = `${course.id}_${weekStartDateString}`;
  
  const newStatus = status === 'online' ? 'onsite' : 'online';
  
  dispatch({ 
    type: 'setScheduleOverride', 
    payload: { key: overrideKey, status: newStatus } 
  });
};
```

**เพิ่ม console.log:**

```javascript
const handleOverride = (course, date) => {
  const { status } = getCourseStatus(course, date, state.scheduleOverrides);
  const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
  const weekStartDateString = format(weekStartDate, 'yyyy-MM-dd');
  const overrideKey = `${course.id}_${weekStartDateString}`;
  
  const newStatus = status === 'online' ? 'onsite' : 'online';
  
  console.log("🎯 กำลัง override:", {
    courseId: course.id,
    courseName: course.name,
    overrideKey: overrideKey,
    oldStatus: status,
    newStatus: newStatus
  });
  
  dispatch({ 
    type: 'setScheduleOverride', 
    payload: { key: overrideKey, status: newStatus } 
  });
  
  console.log("✅ Dispatch สำเร็จ");
};
```

---

## 🔍 ถ้ายังไม่ได้

### ตรวจสอบ reducer

หาส่วน `case 'setScheduleOverride':` ในไฟล์ `App.jsx`:

```javascript
case 'setScheduleOverride': {
  const { key, status } = action.payload;
  return { ...state, scheduleOverrides: { ...state.scheduleOverrides, [key]: status } };
}
```

**เพิ่ม console.log:**

```javascript
case 'setScheduleOverride': {
  const { key, status } = action.payload;
  console.log("📝 Reducer setScheduleOverride:", { key, status });
  const newOverrides = { ...state.scheduleOverrides, [key]: status };
  console.log("📝 New overrides:", newOverrides);
  return { ...state, scheduleOverrides: newOverrides };
}
```

---

## 📋 สรุปขั้นตอน

1. ✅ เพิ่ม logging ใน 3 จุด:
   - ตอนบันทึก (Save)
   - ตอนโหลด (Load)
   - ตอน dispatch (handleOverride)

2. ✅ ทดสอบ:
   - กดเปลี่ยนสถานะ
   - ดู Console
   - รีเฟรช
   - ดู Console อีกครั้ง

3. ✅ บอกฉันว่าเห็นอะไรใน Console

---

## 💡 ตัวอย่าง Console ที่ถูกต้อง

เมื่อกดเปลี่ยนสถานะ:
```
🎯 กำลัง override: {
  courseId: "abc123",
  courseName: "ศาสนานำชีวิต",
  overrideKey: "abc123_2025-12-02",
  oldStatus: "online",
  newStatus: "onsite"
}
✅ Dispatch สำเร็จ
📝 Reducer setScheduleOverride: { key: "abc123_2025-12-02", status: "onsite" }
📝 New overrides: { "abc123_2025-12-02": "onsite" }
💾 กำลังบันทึกข้อมูลลง Firestore...
🔄 scheduleOverrides: { "abc123_2025-12-02": "onsite" }
📦 จำนวน keys: 1
✅ บันทึกข้อมูลสำเร็จ!
```

หลังรีเฟรช:
```
📥 โหลดข้อมูลจาก Firestore: {...}
🔄 scheduleOverrides ที่โหลด: { "abc123_2025-12-02": "onsite" }
```

---

## 🆘 ถ้ายังไม่ได้

Copy Console log ทั้งหมดมาให้ฉันดู แล้วฉันจะช่วยแก้ไขให้!
