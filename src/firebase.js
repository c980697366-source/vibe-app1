import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ✅ 填入你自己 Firebase 控制台的配置
const firebaseConfig = {
  apiKey: "AIzaSyAMNlM4GTDMc_Ui_KMspPJsTxbFz_8mR7Y",
  authDomain: "vibe-app-d3458.firebaseapp.com",
  projectId: "vibe-app-d3458",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);