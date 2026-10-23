import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 請把底下的引號內容替換成你在 Firebase 專案設定看到的真實資訊
const firebaseConfig = {
  apiKey: "AIzaSyABwDsyYNTuy3lD301kszk-OQ9Ra-eW_VU",
  authDomain: "qisda-kam-hub.firebaseapp.com",
  projectId: "qisda-kam-hub",
  storageBucket: "qisda-kam-hub.firebasestorage.app",
  messagingSenderId: "273450631165",
  appId: "1:273450631165:web:528c180803c83acf99e394"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);