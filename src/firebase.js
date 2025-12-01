// c:/dev/me-u-schedule-app/src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// นำข้อมูลที่ได้จาก Firebase console มาใส่ตรงนี้
const firebaseConfig = {
  // แนะนำให้คัดลอกข้อมูลทั้งหมดจาก Firebase Console มาวางใหม่อีกครั้งเพื่อให้แน่ใจว่าถูกต้อง 100%
  apiKey: "AIzaSyC0wgzVQ1XVJkQlLisLTGeyLHP_RV3ectk", // ควรตรวจสอบค่านี้อีกครั้ง
  authDomain: "me-u-5ab65.firebaseapp.com",
  projectId: "me-u-5ab65",
  storageBucket: "me-u-5ab65.appspot.com", // แก้ไขรูปแบบให้ถูกต้อง
  messagingSenderId: "359943167809",
  appId: "1:359943167809:web:95c5ce6d43740448524bc0",
  // databaseURL และ measurementId ไม่จำเป็นสำหรับการใช้งาน Firestore และ Auth
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export service ที่ต้องการใช้งาน
export const db = getFirestore(app);
export const auth = getAuth(app);
