import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAccountAuth } from "./useAccountAuth";

const GEMINI_API_KEY = "替換成你的_GEMINI_API_KEY";

export default function App() {
  const { currentUser, loading, authError, loginWithEmail, logout, checkPermission, isAdmin } = useAccountAuth();
  
  const [emailInput, setEmailInput] = useState("");
  const [accountsList, setAccountsList] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [accountData, setAccountData] = useState(null);
  const [fetchingData, setFetchingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 名片辨識 State
  const [isScanningCard, setIsScanningCard] = useState(false);
  const [cardError, setCardError] = useState("");

  // Leader 管理後台 State
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newAmEmail, setNewAmEmail] = useState("");
  const [newAmName, setNewAmName] = useState("");
  const [newAmAccount, setNewAmAccount] = useState("");
  const [newAmPerm, setNewAmPerm] = useState("read_write");
  const [adminMsg, setAdminMsg] = useState("");

  // 新增/編輯客戶 State
  const [newAccId, setNewAccId] = useState("");
  const [newAccName, setNewAccName] = useState("");
  const [newAccIndustry, setNewAccIndustry] = useState("");
  const [newAccTarget, setNewAccTarget] = useState(10000000);
  const [editingAccId, setEditingAccId] = useState(null);
  const [accMsg, setAccMsg] = useState("");

  // 自訂欄位 State
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [fieldScope, setFieldScope] = useState("global");
  const [fieldMsg, setFieldMsg] = useState("");

  // 1. 動態抓取客戶清單
  const fetchAccountsList = async () => {
    try {
      const snap = await getDocs(collection(db, "accounts"));
      const list = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data(), name: docSnap.data().name || docSnap.id.toUpperCase() });
      });
      setAccountsList(list);
      if (list.length > 0 && !activeAccountId) {
        setActiveAccountId(list[0].id);
        setNewAmAccount(list[0].id);
      }
    } catch (err) {
      console.error("載入客戶清單失敗:", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchAccountsList();
    }
  }, [currentUser]);

  // 權限檢查
  const permission = checkPermission(activeAccountId);
  const canEdit = permission === "read_write";

  // 2. 載入客戶 Plan 資料
  useEffect(() => {
    if (!currentUser || !activeAccountId || (permission === "none" && !isAdmin)) {
      setAccountData(null);
      return;
    }

    const loadAccountData = async () => {
      setFetchingData(true);
      try {
        const ref = doc(db, "accounts", activeAccountId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const raw = snap.data();
          setAccountData({
            name: raw.name || "",
            tier: raw.tier || "Strategic",
            industry: raw.industry || "",
            revenueTarget: raw.revenueTarget || 0,
            currentRevenue: raw.currentRevenue || 0,
            strategy: raw.strategy || "",
            customFields: Array.isArray(raw.customFields) ? raw.customFields : [],
            stakeholders: Array.isArray(raw.stakeholders) ? raw.stakeholders : [],
            pipelines: Array.isArray(raw.pipelines) ? raw.pipelines : [],
            actions: Array.isArray(raw.actions) ? raw.actions : []
          });
        } else {
          setAccountData(null);
        }
      } catch (err) {
        console.error("載入失敗:", err);
      } finally {
        setFetchingData(false);
      }
    };

    loadAccountData();
  }, [currentUser, activeAccountId, permission, isAdmin]);

  // 3. 後台抓取成員授權
  const fetchAllUsers = async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const snap = await getDocs(collection(db, "permissions"));
      const usersList = [];
      snap.forEach((docSnap) => {
        usersList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAllUsers(usersList);
    } catch (err) {
      console.error("讀取權限清單失敗:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === "admin" && isAdmin) {
      fetchAllUsers();
      fetchAccountsList();
    }
  }, [activeTab, isAdmin]);

  // 4. 自訂欄位管理
  const handleAddCustomField = async (e) => {
    e.preventDefault();
    if (!isAdmin || !newFieldLabel.trim()) return;

    const labelClean = newFieldLabel.trim();
    const fieldId = "field_" + Date.now();
    const newFieldObj = {
      id: fieldId,
      label: labelClean,
      type: newFieldType,
      value: newFieldType === "number" ? 0 : ""
    };

    setFieldMsg("欄位套用中...");

    try {
      if (fieldScope === "global") {
        const snap = await getDocs(collection(db, "accounts"));
        const promises = [];
        snap.forEach((docSnap) => {
          const accData = docSnap.data();
          const existingFields = Array.isArray(accData.customFields) ? accData.customFields : [];
          if (!existingFields.some((f) => f.label === labelClean)) {
            const updated = [...existingFields, newFieldObj];
            promises.push(updateDoc(doc(db, "accounts", docSnap.id), { customFields: updated }));
          }
        });
        await Promise.all(promises);
        setFieldMsg(`✓ 已成功將「${labelClean}」推播至所有客戶！`);
      } else {
        const ref = doc(db, "accounts", activeAccountId);
        const currentCustomFields = accountData?.customFields || [];
        const updatedFields = [...currentCustomFields, newFieldObj];
        await updateDoc(ref, { customFields: updatedFields });
        setFieldMsg(`✓ 已為 ${activeAccountId.toUpperCase()} 新增欄位「${labelClean}」`);
      }

      setNewFieldLabel("");
      const updatedSnap = await getDoc(doc(db, "accounts", activeAccountId));
      if (updatedSnap.exists()) {
        setAccountData((prev) => ({ ...prev, customFields: updatedSnap.data().customFields || [] }));
      }
      setTimeout(() => setFieldMsg(""), 3500);
    } catch (err) {
      console.error("新增欄位失敗:", err);
      setFieldMsg("❌ 欄位新增失敗");
    }
  };

  const handleRemoveCustomField = async (fieldId, label) => {
    if (!isAdmin) return;
    const isGlobal = window.confirm(`是否要從「所有客戶」中同步刪除欄位「${label}」？\n按【確定】從所有客戶刪除\n按【取消】僅從當前客戶刪除`);

    try {
      if (isGlobal) {
        const snap = await getDocs(collection(db, "accounts"));
        const promises = [];
        snap.forEach((docSnap) => {
          const accData = docSnap.data();
          const existing = Array.isArray(accData.customFields) ? accData.customFields : [];
          const updated = existing.filter((f) => f.label !== label && f.id !== fieldId);
          promises.push(updateDoc(doc(db, "accounts", docSnap.id), { customFields: updated }));
        });
        await Promise.all(promises);
      } else {
        const ref = doc(db, "accounts", activeAccountId);
        const updated = (accountData?.customFields || []).filter((f) => f.id !== fieldId);
        await updateDoc(ref, { customFields: updated });
      }

      const updatedSnap = await getDoc(doc(db, "accounts", activeAccountId));
      if (updatedSnap.exists()) {
        setAccountData((prev) => ({ ...prev, customFields: updatedSnap.data().customFields || [] }));
      }
    } catch (err) {
      console.error("刪除欄位失敗:", err);
      alert("刪除欄位失敗");
    }
  };

  const handleCustomFieldValueChange = (fieldId, val) => {
    const updated = (accountData?.customFields || []).map((f) => {
      if (f.id === fieldId) {
        return { ...f, value: f.type === "number" ? Number(val) : val };
      }
      return f;
    });
    setAccountData({ ...accountData, customFields: updated });
  };

  // 5. Key Account 客戶：建立與編輯
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    const accIdClean = newAccId.trim().toLowerCase().replace(/\s+/g, "-");
    if (!accIdClean) return;

    setAccMsg("處理中...");
    try {
      const accRef = doc(db, "accounts", accIdClean);

      if (editingAccId) {
        await updateDoc(accRef, {
          name: newAccName.trim() || accIdClean.toUpperCase(),
          industry: newAccIndustry.trim() || "Technology",
          revenueTarget: Number(newAccTarget) || 0,
          updatedAt: new Date().toISOString()
        });
        setAccMsg(`✓ 已成功更新客戶 "${newAccName || accIdClean}"！`);
        setEditingAccId(null);
      } else {
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          setAccMsg(`⚠️ 客戶代碼 "${accIdClean}" 已存在。`);
          return;
        }

        const globalFields = accountData?.customFields || [];

        await setDoc(accRef, {
          name: newAccName.trim() || accIdClean.toUpperCase(),
          industry: newAccIndustry.trim() || "Technology",
          tier: "Strategic",
          revenueTarget: Number(newAccTarget) || 0,
          currentRevenue: 0,
          strategy: "請在此設定核心策略方針...",
          customFields: globalFields.map(f => ({ ...f, value: f.type === "number" ? 0 : "" })),
          stakeholders: [],
          pipelines: [],
          actions: [],
          createdAt: new Date().toISOString(),
          createdBy: currentUser.email
        });

        setAccMsg(`✓ 成功建立客戶 "${newAccName || accIdClean}"！`);
      }

      setNewAccId("");
      setNewAccName("");
      setNewAccIndustry("");
      fetchAccountsList();
      setTimeout(() => setAccMsg(""), 3500);
    } catch (err) {
      console.error("儲存客戶失敗:", err);
      setAccMsg("❌ 儲存失敗");
    }
  };

  const handleStartEditAccount = (acc) => {
    setEditingAccId(acc.id);
    setNewAccId(acc.id);
    setNewAccName(acc.name || "");
    setNewAccIndustry(acc.industry || "");
    setNewAccTarget(acc.revenueTarget || 0);
  };

  const handleDeleteAccount = async (accId, accName) => {
    if (!isAdmin) return;
    const confirmDel = window.confirm(`⚠️ 確定要徹底刪除客戶「${accName} (${accId.toUpperCase()})」嗎？`);
    if (!confirmDel) return;

    try {
      await deleteDoc(doc(db, "accounts", accId));
      alert(`已成功刪除客戶 ${accName}`);
      fetchAccountsList();
      if (activeAccountId === accId) {
        setActiveAccountId(accountsList.find(a => a.id !== accId)?.id || "");
      }
    } catch (err) {
      console.error("刪除客戶失敗:", err);
      alert("刪除失敗，請檢查權限");
    }
  };

  // 6. AM 團隊成員授權
  const handleAssignPermission = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    const targetEmail = newAmEmail.trim().toLowerCase();
    if (!targetEmail || !newAmAccount) return;

    setAdminMsg("更新中...");
    try {
      const userRef = doc(db, "permissions", targetEmail);
      const userSnap = await getDoc(userRef);

      let currentMappings = {};
      let currentRole = "user";
      let nameToSave = newAmName.trim() || targetEmail.split("@")[0];

      if (userSnap.exists()) {
        const data = userSnap.data();
        currentMappings = data.mappings || {};
        currentRole = data.role || "user";
        if (data.name && !newAmName.trim()) nameToSave = data.name;
      }

      currentMappings[newAmAccount.toLowerCase()] = newAmPerm;

      await setDoc(userRef, {
        name: nameToSave,
        role: currentRole,
        mappings: currentMappings,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setAdminMsg(`✓ 已成功為 ${targetEmail} 指派 ${newAmAccount.toUpperCase()} 權限！`);
      setNewAmEmail("");
      setNewAmName("");
      fetchAllUsers();
      setTimeout(() => setAdminMsg(""), 3500);
    } catch (err) {
      console.error("指派失敗:", err);
      setAdminMsg("❌ 授權更新失敗");
    }
  };

  const handleRemoveUserMapping = async (email, accId) => {
    if (!isAdmin) return;
    try {
      const userRef = doc(db, "permissions", email);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return;

      const data = snap.data();
      const mappings = { ...(data.mappings || {}) };
      delete mappings[accId.toLowerCase()];

      await updateDoc(userRef, { mappings });
      fetchAllUsers();
    } catch (err) {
      console.error("移除客戶授權失敗:", err);
    }
  };

  const handleDeleteUser = async (email) => {
    if (!isAdmin) return;
    if (email === currentUser.email) {
      alert("不能刪除您自己的管理員帳號！");
      return;
    }
    const confirmDel = window.confirm(`確定要完全移除使用者「${email}」的所有登入權限嗎？`);
    if (!confirmDel) return;

    try {
      await deleteDoc(doc(db, "permissions", email));
      fetchAllUsers();
    } catch (err) {
      console.error("刪除使用者失敗:", err);
    }
  };

  // 7. 儲存 Plan
  const handleSave = async () => {
    if (!canEdit || !accountData) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const ref = doc(db, "accounts", activeAccountId);
      await updateDoc(ref, {
        strategy: accountData.strategy || "",
        revenueTarget: Number(accountData.revenueTarget) || 0,
        currentRevenue: Number(accountData.currentRevenue) || 0,
        customFields: accountData.customFields || [],
        stakeholders: accountData.stakeholders,
        pipelines: accountData.pipelines,
        actions: accountData.actions,
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: currentUser.email
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("更新失敗:", err);
      alert("儲存失敗，請檢查連線或權限");
    } finally {
      setIsSaving(false);
    }
  };

  // 8. 名片辨識
  const handleCardUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("替換")) {
      alert("請先填入有效的 GEMINI_API_KEY！");
      return;
    }

    setIsScanningCard(true);
    setCardError("");

    const compressImageInline = (imageFile) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const maxWidth = 1024;
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
            resolve(dataUrl.split(",")[1]);
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });
    };

    try {
      const base64Image = await compressImageInline(file);
      const promptText = '這是一張商務名片。請仔細辨識圖片文字，擷取出：姓名 (name)、職稱 (title)、部門 (department)。以繁體中文或名片原有文字呈現，未提及部門請回傳空字串。只回傳純 JSON 格式：{"name": "...", "title": "...", "department": "..."}';

      const generateRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  { inlineData: { mimeType: "image/jpeg", data: base64Image } }
                ]
              }
            ],
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );

      const generateData = await generateRes.json();
      if (generateData.error) throw new Error(generateData.error.message || "辨識請求失敗");

      const rawText = generateData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const cleanJsonStr = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsedData = JSON.parse(cleanJsonStr);

      const newSh = {
        name: parsedData.name || "未識別姓名",
        title: parsedData.title || "未識別職稱",
        department: parsedData.department || "",
        role: "Neutral"
      };

      setAccountData((prev) => ({
        ...prev,
        stakeholders: [...prev.stakeholders, newSh]
      }));
    } catch (err) {
      console.error("名片辨識詳細錯誤:", err);
      setCardError(`辨識失敗: ${err.message}`);
    } finally {
      setIsScanningCard(false);
      e.target.value = "";
    }
  };

  // 9. 一鍵匯出 PPT 風格 PDF
  const handleExportPdf = () => {
    window.print();
  };

  // 動態表格函式
  const addStakeholder = () => {
    if (!canEdit) return;
    setAccountData({ ...accountData, stakeholders: [...accountData.stakeholders, { name: "新聯絡人", title: "職稱", role: "Neutral", department: "Procurement" }] });
  };
  const updateStakeholder = (idx, field, value) => {
    const updated = [...accountData.stakeholders];
    updated[idx][field] = value;
    setAccountData({ ...accountData, stakeholders: updated });
  };
  const removeStakeholder = (idx) => {
    if (!canEdit) return;
    setAccountData({ ...accountData, stakeholders: accountData.stakeholders.filter((_, i) => i !== idx) });
  };

  const addPipeline = () => {
    if (!canEdit) return;
    setAccountData({ ...accountData, pipelines: [...accountData.pipelines, { projectName: "新專案名稱", stage: "RFQ", value: 1000000, winRate: 50 }] });
  };
  const updatePipeline = (idx, field, value) => {
    const updated = [...accountData.pipelines];
    updated[idx][field] = field === "value" || field === "winRate" ? Number(value) : value;
    setAccountData({ ...accountData, pipelines: updated });
  };
  const removePipeline = (idx) => {
    if (!canEdit) return;
    setAccountData({ ...accountData, pipelines: accountData.pipelines.filter((_, i) => i !== idx) });
  };

  const addAction = () => {
    if (!canEdit) return;
    setAccountData({ ...accountData, actions: [...accountData.actions, { task: "新行動項目說明", owner: currentUser.email, status: "Not Started", dueDate: "2026-12-31" }] });
  };
  const updateAction = (idx, field, value) => {
    const updated = [...accountData.actions];
    updated[idx][field] = value;
    setAccountData({ ...accountData, actions: updated });
  };
  const removeAction = (idx) => {
    if (!canEdit) return;
    setAccountData({ ...accountData, actions: accountData.actions.filter((_, i) => i !== idx) });
  };

  if (!currentUser) {
    return (
      <div style={{ maxWidth: 400, margin: "100px auto", padding: 28, border: "1px solid #cbd5e1", borderRadius: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", background: "#ffffff", color: "#0f172a", fontFamily: "sans-serif" }}>
        <h2 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>Qisda KAM Hub</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 0 }}>請以公司 Email 登入以檢視客戶計畫</p>
        <form onSubmit={(e) => { e.preventDefault(); loginWithEmail(emailInput); }}>
          <input
            type="email"
            placeholder="請輸入公司 Email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            style={{ width: "100%", padding: 12, boxSizing: "border-box", marginBottom: 16, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, color: "#0f172a", background: "#ffffff" }}
            required
          />
          {authError && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{authError}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: 12, backgroundColor: "#0284c7", color: "#ffffff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 }}
          >
            {loading ? "登入中..." : "進入系統"}
          </button>
        </form>
      </div>
    );
  }

  const totalPipelineValue = accountData?.pipelines?.reduce((sum, p) => sum + (Number(p.value) || 0), 0) || 0;
  const achievementRate = accountData?.revenueTarget > 0 ? ((accountData.currentRevenue / accountData.revenueTarget) * 100).toFixed(1) : 0;

  return (
    <>
      {/* 專用列印與分頁樣式注入 */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .ppt-slide {
            page-break-after: always;
            break-after: page;
            height: 180mm;
            max-height: 180mm;
            box-sizing: border-box;
            padding: 16px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            position: relative;
            background: #ffffff !important;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            margin-bottom: 20mm;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* 螢幕主畫面 (日常操作區) */}
      <div className="no-print" style={{ maxWidth: 1100, margin: "30px auto", padding: "0 24px", fontFamily: "sans-serif", color: "#0f172a" }}>
        {/* 頂部導航列 */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: "700", color: "#0f172a" }}>佳世達 Global Key Account Hub</h1>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
              登入者: <strong>{currentUser.name || currentUser.email}</strong> {isAdmin && <span style={{ color: "#0284c7", fontWeight: "bold" }}>(Leader/Admin)</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {accountData && (
              <button
                onClick={handleExportPdf}
                style={{ padding: "8px 16px", backgroundColor: "#475569", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 6 }}
                title="匯出橫向 16:9 自動分頁的簡報檔"
              >
                📄 匯出 PPT 風格 PDF
              </button>
            )}
            {canEdit && activeTab !== "admin" && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{ padding: "8px 18px", backgroundColor: "#059669", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
              >
                {isSaving ? "存檔中..." : "💾 儲存所有變更"}
              </button>
            )}
            <button onClick={logout} style={{ padding: "8px 16px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", color: "#475569" }}>
              登出
            </button>
          </div>
        </header>

        {saveSuccess && (
          <div style={{ marginTop: 12, padding: "10px 16px", backgroundColor: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", borderRadius: 6, fontSize: 14 }}>
            ✓ 資料已成功更新至 Firestore 雲端資料庫！
          </div>
        )}

        {/* 客戶切換列 */}
        {activeTab !== "admin" && (
          <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "12px 18px", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: "bold", fontSize: 14, color: "#0f172a" }}>切換客戶帳號:</span>
              <select
                value={activeAccountId}
                onChange={(e) => setActiveAccountId(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 14, color: "#0f172a", background: "#fff" }}
              >
                {accountsList.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.id.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              {permission === "read_write" && (
                <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>
                  ✏️ 可編輯 (Read/Write)
                </span>
              )}
              {permission === "read_only" && (
                <span style={{ background: "#e2e8f0", color: "#475569", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>
                  👁️ 唯讀模式 (Read-Only)
                </span>
              )}
              {permission === "none" && (
                <span style={{ background: "#fee2e2", color: "#991b1b", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>
                  🚫 無此客戶權限
                </span>
              )}
            </div>
          </div>
        )}

        {/* 頁籤導覽列 */}
        <div style={{ display: "flex", gap: 8, borderBottom: "2px solid #e2e8f0", marginTop: 20 }}>
          {[
            { id: "overview", label: "📊 客戶全貌與戰略" },
            { id: "stakeholders", label: `👥 組織圖譜 (${accountData?.stakeholders?.length || 0})` },
            { id: "pipeline", label: `🚀 商機管道 (${accountData?.pipelines?.length || 0})` },
            { id: "actions", label: `✅ 行動清單 (${accountData?.actions?.length || 0})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 18px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontWeight: activeTab === tab.id ? "bold" : "normal",
                color: activeTab === tab.id ? "#0284c7" : "#64748b",
                borderBottom: activeTab === tab.id ? "3px solid #0284c7" : "3px solid transparent",
                marginBottom: -2,
                fontSize: 14
              }}
            >
              {tab.label}
            </button>
          ))}

          {isAdmin && (
            <button
              onClick={() => setActiveTab("admin")}
              style={{
                padding: "10px 18px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontWeight: activeTab === "admin" ? "bold" : "normal",
                color: activeTab === "admin" ? "#d97706" : "#64748b",
                borderBottom: activeTab === "admin" ? "3px solid #d97706" : "3px solid transparent",
                marginBottom: -2,
                fontSize: 14,
                marginLeft: "auto"
              }}
            >
              ⚙️ 團隊與客戶管理後台
            </button>
          )}
        </div>

        {/* TAB 5: Leader 管理後台 */}
        {activeTab === "admin" && isAdmin && (
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 28 }}>
            {/* 模組 1：自訂欄位 */}
            <div style={{ padding: 20, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
              <h3 style={{ margin: "0 0 12px 0", color: "#0369a1", fontSize: 16 }}>
                📋 客戶全貌自訂欄位維護 (支援全域推播與個別設定)
              </h3>
              <form onSubmit={handleAddCustomField} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#075985" }}>欄位名稱</label>
                  <input
                    type="text"
                    placeholder="如: 目標毛利率 (%)、TAM 市佔率..."
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#075985" }}>資料型態</label>
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                  >
                    <option value="text">文字 (Text)</option>
                    <option value="number">數字 / 百分比 (Number)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#075985" }}>套用目標客戶範圍</label>
                  <select
                    value={fieldScope}
                    onChange={(e) => setFieldScope(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                  >
                    <option value="global">🌐 全域套用 (所有客戶同步建立)</option>
                    <option value="single">🎯 僅套用當前客戶 ({activeAccountId.toUpperCase()})</option>
                  </select>
                </div>
                <button
                  type="submit"
                  style={{ padding: "8px 16px", background: "#0284c7", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold", height: 36 }}
                >
                  + 新增欄位
                </button>
              </form>
              {fieldMsg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: "bold", color: "#0369a1" }}>{fieldMsg}</div>}

              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 13, fontWeight: "bold", color: "#475569" }}>當前客戶現存自訂欄位:</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {(accountData?.customFields || []).length === 0 ? (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>尚無自訂欄位</span>
                  ) : (
                    accountData.customFields.map((f) => (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", padding: "4px 10px", borderRadius: 4, border: "1px solid #cbd5e1", fontSize: 13 }}>
                        <span><strong>{f.label}</strong> ({f.type === "number" ? "數字" : "文字"})</span>
                        <button
                          onClick={() => handleRemoveCustomField(f.id, f.label)}
                          style={{ border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontWeight: "bold" }}
                          title="刪除欄位"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 模組 2：客戶管理 */}
            <div style={{ padding: 20, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
              <h3 style={{ margin: "0 0 12px 0", color: "#166534", fontSize: 16 }}>
                🏢 Key Account 客戶管理 ({editingAccId ? `✏️ 編輯客戶: ${editingAccId.toUpperCase()}` : "➕ 建立新客戶"})
              </h3>
              <form onSubmit={handleSaveAccount} style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#14532d" }}>客戶代碼 (ID)</label>
                  <input
                    type="text"
                    placeholder="如: cisco"
                    disabled={!!editingAccId}
                    value={newAccId}
                    onChange={(e) => setNewAccId(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: editingAccId ? "#e2e8f0" : "#fff" }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#14532d" }}>客戶完整名稱</label>
                  <input
                    type="text"
                    placeholder="如: Cisco Systems Inc."
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#14532d" }}>產業別</label>
                  <input
                    type="text"
                    placeholder="如: Networking"
                    value={newAccIndustry}
                    onChange={(e) => setNewAccIndustry(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#14532d" }}>年度目標 (USD)</label>
                  <input
                    type="number"
                    value={newAccTarget}
                    onChange={(e) => setNewAccTarget(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="submit"
                    style={{ padding: "8px 16px", background: editingAccId ? "#2563eb" : "#16a34a", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold", height: 36 }}
                  >
                    {editingAccId ? "儲存更新" : "建立客戶"}
                  </button>
                  {editingAccId && (
                    <button
                      type="button"
                      onClick={() => { setEditingAccId(null); setNewAccId(""); setNewAccName(""); setNewAccIndustry(""); }}
                      style={{ padding: "8px 12px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer", height: 36 }}
                    >
                      取消
                    </button>
                  )}
                </div>
              </form>
              {accMsg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: "bold", color: "#166534" }}>{accMsg}</div>}

              <div style={{ marginTop: 20 }}>
                <span style={{ fontSize: 13, fontWeight: "bold", color: "#14532d" }}>現有 Key Account 客戶列表:</span>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8, background: "#fff", borderRadius: 6, overflow: "hidden", border: "1px solid #cbd5e1" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                      <th style={{ padding: 8 }}>客戶代碼</th>
                      <th style={{ padding: 8 }}>客戶全名</th>
                      <th style={{ padding: 8 }}>產業別</th>
                      <th style={{ padding: 8 }}>年度營收目標</th>
                      <th style={{ padding: 8, textAlign: "center" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountsList.map((acc) => (
                      <tr key={acc.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 8, fontWeight: "bold" }}>{acc.id.toUpperCase()}</td>
                        <td style={{ padding: 8 }}>{acc.name}</td>
                        <td style={{ padding: 8 }}>{acc.industry || "-"}</td>
                        <td style={{ padding: 8 }}>${(acc.revenueTarget || 0).toLocaleString()} USD</td>
                        <td style={{ padding: 8, textAlign: "center" }}>
                          <button
                            onClick={() => handleStartEditAccount(acc)}
                            style={{ background: "transparent", border: "none", color: "#2563eb", cursor: "pointer", marginRight: 10, fontWeight: "bold" }}
                          >
                            ✏️ 編輯
                          </button>
                          <button
                            onClick={() => handleDeleteAccount(acc.id, acc.name)}
                            style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: "bold" }}
                          >
                            🗑️ 刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 模組 3：AM 授權管理 */}
            <div style={{ padding: 20, background: "#fefce8", border: "1px solid #fef08a", borderRadius: 8 }}>
              <h3 style={{ margin: "0 0 12px 0", color: "#854d0e", fontSize: 16 }}>➕ 指派或更新 AM 客戶授權</h3>
              <form onSubmit={handleAssignPermission} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#713f12" }}>AM 公司 Email</label>
                  <input
                    type="email"
                    placeholder="am_name@qisda.com"
                    value={newAmEmail}
                    onChange={(e) => setNewAmEmail(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#713f12" }}>姓名 (稱謂)</label>
                  <input
                    type="text"
                    placeholder="如: Ken Chen"
                    value={newAmName}
                    onChange={(e) => setNewAmName(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#713f12" }}>指定客戶</label>
                  <select
                    value={newAmAccount}
                    onChange={(e) => setNewAmAccount(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                  >
                    {accountsList.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.id.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#713f12" }}>權限級別</label>
                  <select
                    value={newAmPerm}
                    onChange={(e) => setNewAmPerm(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #cbd5e1", boxSizing: "border-box", color: "#0f172a", background: "#fff" }}
                  >
                    <option value="read_write">✏️ 可編輯 (Read/Write)</option>
                    <option value="read_only">👁️ 唯讀 (Read-Only)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  style={{ padding: "8px 16px", background: "#d97706", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold", height: 36 }}
                >
                  儲存授權
                </button>
              </form>
              {adminMsg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: "bold", color: "#854d0e" }}>{adminMsg}</div>}
            </div>

            {/* 模組 4：AM 權限矩陣 */}
            <div style={{ background: "#ffffff", padding: 20, borderRadius: 8, border: "1px solid #cbd5e1" }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 16, color: "#0f172a" }}>
                📋 當前團隊成員權限清單 (Permissions Matrix)
              </h3>
              {loadingUsers ? (
                <div style={{ color: "#64748b" }}>讀取成員中...</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, background: "#ffffff", color: "#0f172a" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#334155" }}>
                      <th style={{ padding: "12px 10px", textAlign: "left" }}>Email / 帳號</th>
                      <th style={{ padding: "12px 10px", textAlign: "left" }}>姓名</th>
                      <th style={{ padding: "12px 10px", textAlign: "left" }}>系統角色</th>
                      <th style={{ padding: "12px 10px", textAlign: "left" }}>客戶授權細項</th>
                      <th style={{ padding: "12px 10px", textAlign: "left" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                        <td style={{ padding: "12px 10px", fontWeight: "600", color: "#0f172a", textAlign: "left" }}>
                          {u.id}
                        </td>
                        <td style={{ padding: "12px 10px", color: "#1e293b", textAlign: "left" }}>
                          {u.name || "-"}
                        </td>
                        <td style={{ padding: "12px 10px", textAlign: "left" }}>
                          {u.role === "admin" ? (
                            <span style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: "bold" }}>
                              Leader/Admin
                            </span>
                          ) : (
                            <span style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", padding: "3px 8px", borderRadius: 4, fontSize: 12 }}>
                              AM User
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 10px", textAlign: "left" }}>
                          {u.role === "admin" ? (
                            <span style={{ color: "#059669", fontWeight: "bold", fontSize: 13 }}>★ 全部客戶最高讀寫權限</span>
                          ) : u.mappings && Object.keys(u.mappings).length > 0 ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-start" }}>
                              {Object.entries(u.mappings).map(([acc, p]) => (
                                <span
                                  key={acc}
                                  style={{
                                    background: p === "read_write" ? "#dcfce7" : "#f1f5f9",
                                    color: p === "read_write" ? "#15803d" : "#334155",
                                    border: p === "read_write" ? "1px solid #bbf7d0" : "1px solid #cbd5e1",
                                    padding: "3px 8px",
                                    borderRadius: 4,
                                    fontSize: 12,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6
                                  }}
                                >
                                  <strong>{acc.toUpperCase()}</strong>: {p === "read_write" ? "可編輯" : "唯讀"}
                                  <button
                                    onClick={() => handleRemoveUserMapping(u.id, acc)}
                                    style={{ border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontWeight: "bold", padding: 0, fontSize: 14, lineHeight: 1 }}
                                    title="移除授權"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 13 }}>尚未指派任何客戶</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 10px", textAlign: "left" }}>
                          {u.role !== "admin" && (
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
                            >
                              🗑️ 刪除成員
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 業務內容 TABs */}
        {activeTab !== "admin" && (
          permission === "none" && !isAdmin ? (
            <div style={{ marginTop: 40, padding: 40, background: "#f8fafc", textAlign: "center", color: "#64748b", borderRadius: 8 }}>
              您目前未獲授權存取 <strong>{activeAccountId.toUpperCase()}</strong>。請向 Team Leader 申請權限開通。
            </div>
          ) : fetchingData ? (
            <div style={{ marginTop: 40, textAlign: "center", color: "#64748b" }}>連線載入客戶 Plan 中...</div>
          ) : accountData ? (
            <main style={{ marginTop: 24 }}>
              {/* TAB 1: 客戶全貌 */}
              {activeTab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 13, color: "#64748b" }}>年度營收目標 (USD)</div>
                      <input
                        type="number"
                        disabled={!canEdit}
                        value={accountData.revenueTarget}
                        onChange={(e) => setAccountData({ ...accountData, revenueTarget: e.target.value })}
                        style={{ fontSize: 20, fontWeight: "bold", width: "100%", border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", marginTop: 4, color: "#0f172a", padding: "4px 8px", borderRadius: 4 }}
                      />
                    </div>
                    <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 13, color: "#64748b" }}>目前達成營收 (USD)</div>
                      <input
                        type="number"
                        disabled={!canEdit}
                        value={accountData.currentRevenue}
                        onChange={(e) => setAccountData({ ...accountData, currentRevenue: e.target.value })}
                        style={{ fontSize: 20, fontWeight: "bold", color: "#0284c7", width: "100%", border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", marginTop: 4, padding: "4px 8px", borderRadius: 4 }}
                      />
                    </div>
                    <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 13, color: "#64748b" }}>目標達成率</div>
                      <div style={{ fontSize: 20, fontWeight: "bold", color: achievementRate >= 70 ? "#059669" : "#d97706", marginTop: 8 }}>
                        {achievementRate}%
                      </div>
                    </div>
                  </div>

                  {(accountData.customFields || []).length > 0 && (
                    <div>
                      <h4 style={{ margin: "0 0 10px 0", fontSize: 14, color: "#475569" }}>📌 客戶自訂關鍵指標 / 業務維度</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        {accountData.customFields.map((field) => (
                          <div key={field.id} style={{ padding: 14, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            <label style={{ display: "block", fontSize: 13, fontWeight: "bold", color: "#334155", marginBottom: 6 }}>
                              {field.label}
                            </label>
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              disabled={!canEdit}
                              value={field.value ?? ""}
                              onChange={(e) => handleCustomFieldValueChange(field.id, e.target.value)}
                              style={{ width: "100%", padding: "8px 10px", border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4, fontSize: 15 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{ display: "block", marginBottom: 8, fontWeight: "bold", color: "#0f172a" }}>客戶戰略核心與合作目標 (1~3 年)</label>
                    <textarea
                      rows={6}
                      disabled={!canEdit}
                      value={accountData.strategy}
                      onChange={(e) => setAccountData({ ...accountData, strategy: e.target.value })}
                      placeholder="請填入客戶戰略重心、供應鏈佈局、跨 BU 潛在機會..."
                      style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", background: !canEdit ? "#f8fafc" : "#fff", boxSizing: "border-box", fontSize: 14, lineHeight: 1.6, color: "#0f172a" }}
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: 組織圖譜 */}
              {activeTab === "stakeholders" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>記錄決策鏈關鍵聯絡人、職能與立場態度。</p>
                      {cardError && <span style={{ color: "#ef4444", fontSize: 13 }}>{cardError}</span>}
                    </div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <label style={{ padding: "6px 14px", background: isScanningCard ? "#94a3b8" : "#4f46e5", color: "#fff", borderRadius: 6, cursor: isScanningCard ? "not-allowed" : "pointer", fontSize: 13, fontWeight: "bold", display: "flex", alignItems: "center", gap: 6 }}>
                          {isScanningCard ? "⏳ AI 名片辨識中..." : "📷 上傳名片自動識別"}
                          <input type="file" accept="image/*" onChange={handleCardUpload} disabled={isScanningCard} style={{ display: "none" }} />
                        </label>
                        <button onClick={addStakeholder} style={{ padding: "6px 14px", background: "#0284c7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>
                          + 手動新增
                        </button>
                      </div>
                    )}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#0f172a" }}>
                        <th style={{ padding: 10 }}>姓名</th>
                        <th style={{ padding: 10 }}>職稱</th>
                        <th style={{ padding: 10 }}>部門</th>
                        <th style={{ padding: 10 }}>立場角色</th>
                        {canEdit && <th style={{ padding: 10, textAlign: "center" }}>操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {accountData.stakeholders.map((sh, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>
                            <input type="text" disabled={!canEdit} value={sh.name} onChange={(e) => updateStakeholder(idx, "name", e.target.value)} style={{ width: "90%", padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <input type="text" disabled={!canEdit} value={sh.title} onChange={(e) => updateStakeholder(idx, "title", e.target.value)} style={{ width: "90%", padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <input type="text" disabled={!canEdit} value={sh.department || ""} onChange={(e) => updateStakeholder(idx, "department", e.target.value)} style={{ width: "90%", padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <select disabled={!canEdit} value={sh.role} onChange={(e) => updateStakeholder(idx, "role", e.target.value)} style={{ padding: 6, borderRadius: 4, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" }}>
                              <option value="Champion">🌟 Champion (支持者)</option>
                              <option value="Neutral">⚖️ Neutral (中立)</option>
                              <option value="Blocker">⚠️ Blocker (阻礙者)</option>
                            </select>
                          </td>
                          {canEdit && (
                            <td style={{ padding: 8, textAlign: "center" }}>
                              <button onClick={() => removeStakeholder(idx)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>🗑️</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 3: 商機管道 */}
              {activeTab === "pipeline" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <span style={{ fontSize: 14, color: "#64748b" }}>目前專案商機總額估算: </span>
                      <strong style={{ fontSize: 16, color: "#0284c7" }}>${totalPipelineValue.toLocaleString()} USD</strong>
                    </div>
                    {canEdit && (
                      <button onClick={addPipeline} style={{ padding: "6px 14px", background: "#0284c7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>
                        + 新增專案商機
                      </button>
                    )}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#0f172a" }}>
                        <th style={{ padding: 10 }}>專案名稱</th>
                        <th style={{ padding: 10 }}>目前階段</th>
                        <th style={{ padding: 10 }}>預估合約金額 (USD)</th>
                        <th style={{ padding: 10 }}>得標機率 (%)</th>
                        {canEdit && <th style={{ padding: 10, textAlign: "center" }}>操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {accountData.pipelines.map((pipe, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>
                            <input type="text" disabled={!canEdit} value={pipe.projectName} onChange={(e) => updatePipeline(idx, "projectName", e.target.value)} style={{ width: "90%", padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <select disabled={!canEdit} value={pipe.stage} onChange={(e) => updatePipeline(idx, "stage", e.target.value)} style={{ padding: 6, borderRadius: 4, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" }}>
                              <option value="RFQ">RFQ (詢價規格對焦)</option>
                              <option value="EVT">EVT (工程驗證)</option>
                              <option value="DVT">DVT (設計驗證)</option>
                              <option value="PVT">PVT (生產驗證)</option>
                              <option value="MP">MP (量產中)</option>
                            </select>
                          </td>
                          <td style={{ padding: 8 }}>
                            <input type="number" disabled={!canEdit} value={pipe.value} onChange={(e) => updatePipeline(idx, "value", e.target.value)} style={{ width: "90%", padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                            <input type="number" disabled={!canEdit} value={pipe.winRate || 50} onChange={(e) => updatePipeline(idx, "winRate", e.target.value)} style={{ width: 50, padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                            <span style={{ color: "#0f172a" }}>%</span>
                          </td>
                          {canEdit && (
                            <td style={{ padding: 8, textAlign: "center" }}>
                              <button onClick={() => removePipeline(idx)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>🗑️</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 4: 行動清單 */}
              {activeTab === "actions" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>追蹤當前季度的具體落地任務與交付期程。</p>
                    {canEdit && (
                      <button onClick={addAction} style={{ padding: "6px 14px", background: "#0284c7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>
                        + 新增行動任務
                      </button>
                    )}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#0f172a" }}>
                        <th style={{ padding: 10 }}>任務項目說明</th>
                        <th style={{ padding: 10 }}>負責人 (Owner)</th>
                        <th style={{ padding: 10 }}>到期日 (Due Date)</th>
                        <th style={{ padding: 10 }}>執行狀態</th>
                        {canEdit && <th style={{ padding: 10, textAlign: "center" }}>操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {accountData.actions.map((act, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>
                            <input type="text" disabled={!canEdit} value={act.task} onChange={(e) => updateAction(idx, "task", e.target.value)} style={{ width: "95%", padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <input type="text" disabled={!canEdit} value={act.owner} onChange={(e) => updateAction(idx, "owner", e.target.value)} style={{ width: "90%", padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <input type="date" disabled={!canEdit} value={act.dueDate} onChange={(e) => updateAction(idx, "dueDate", e.target.value)} style={{ padding: 6, border: canEdit ? "1px solid #cbd5e1" : "none", background: canEdit ? "#fff" : "transparent", color: "#0f172a", borderRadius: 4 }} />
                          </td>
                          <td style={{ padding: 8 }}>
                            <select disabled={!canEdit} value={act.status} onChange={(e) => updateAction(idx, "status", e.target.value)} style={{ padding: 6, borderRadius: 4, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" }}>
                              <option value="Not Started">⚪ 尚未開始</option>
                              <option value="In Progress">🟡 進行中</option>
                              <option value="Completed">🟢 已完成</option>
                            </select>
                          </td>
                          {canEdit && (
                            <td style={{ padding: 8, textAlign: "center" }}>
                              <button onClick={() => removeAction(idx)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>🗑️</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </main>
          ) : (
            <div style={{ marginTop: 40, padding: 32, background: "#f8fafc", textAlign: "center", color: "#64748b" }}>
              此客戶尚未在 Firestore 建立資料，請至管理後台初始化。
            </div>
          )
        )}
      </div>

      {/* =========================================================================
          專屬 PPT 列印畫布 (Print Only Canvas)
          按下列印或匯出 PDF 時，自動按頁分割成 4~5 頁橫向 16:9 幻燈片
          ========================================================================= */}
      {accountData && (
        <div className="print-only" style={{ width: "100%", background: "#ffffff", color: "#0f172a", fontFamily: "sans-serif" }}>
          
          {/* SLIDE 1: 封面投影片 */}
          <section className="ppt-slide" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff", border: "none" }}>
            <div style={{ fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#38bdf8", marginBottom: 12 }}>
              Qisda Global Key Account Management
            </div>
            <h1 style={{ fontSize: 44, margin: "0 0 16px 0", fontWeight: "800" }}>
              {accountData.name} ({activeAccountId.toUpperCase()})
            </h1>
            <div style={{ fontSize: 22, color: "#94a3b8", marginBottom: 32 }}>
              Annual Key Account Strategy & Execution Plan
            </div>
            <div style={{ borderTop: "1px solid #334155", paddingTop: 16, width: "60%", display: "flex", justifyContent: "space-between", fontSize: 13, color: "#cbd5e1" }}>
              <span>產業領域: <strong>{accountData.industry || "Technology"}</strong></span>
              <span>報告建立者: <strong>{currentUser.email}</strong></span>
              <span>報告日期: <strong>{new Date().toLocaleDateString()}</strong></span>
            </div>
          </section>

          {/* SLIDE 2: 客戶全貌與戰略 */}
          <section className="ppt-slide">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0284c7", paddingBottom: 8, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>01. 客戶全貌與戰略方針 (Overview & Strategy)</h2>
              <span style={{ fontSize: 12, color: "#64748b" }}>{accountData.name}</span>
            </div>

            {/* 指標卡區 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>年度目標 (Target)</div>
                <div style={{ fontSize: 18, fontWeight: "bold", marginTop: 4 }}>${Number(accountData.revenueTarget).toLocaleString()} USD</div>
              </div>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>達成營收 (Revenue)</div>
                <div style={{ fontSize: 18, fontWeight: "bold", color: "#0284c7", marginTop: 4 }}>${Number(accountData.currentRevenue).toLocaleString()} USD</div>
              </div>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>達成率 (Attainment)</div>
                <div style={{ fontSize: 18, fontWeight: "bold", color: achievementRate >= 70 ? "#16a34a" : "#d97706", marginTop: 4 }}>{achievementRate}%</div>
              </div>
            </div>

            {/* 自訂欄位 */}
            {(accountData.customFields || []).length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {accountData.customFields.map((f) => (
                  <div key={f.id} style={{ padding: 10, background: "#f1f5f9", borderRadius: 6, fontSize: 12 }}>
                    <span style={{ color: "#475569", fontWeight: "bold" }}>{f.label}: </span>
                    <span style={{ color: "#0f172a" }}>{f.value || "-"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 核心策略文字 */}
            <div style={{ flex: 1, padding: 14, background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, fontWeight: "bold", color: "#334155", marginBottom: 6 }}>戰略方針與跨 BU 綜效重點 (Strategic Focus):</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#1e293b" }}>
                {accountData.strategy || "尚未設定戰略文字"}
              </div>
            </div>
          </section>

          {/* SLIDE 3: 組織圖譜 */}
          <section className="ppt-slide">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0284c7", paddingBottom: 8, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>02. 組織決策關係人圖譜 (Key Stakeholders)</h2>
              <span style={{ fontSize: 12, color: "#64748b" }}>共計 {accountData.stakeholders?.length || 0} 位決策鏈關鍵人</span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>姓名</th>
                  <th style={{ padding: 8 }}>職稱 (Title)</th>
                  <th style={{ padding: 8 }}>部門 (Department)</th>
                  <th style={{ padding: 8 }}>立場角色 (Role)</th>
                </tr>
              </thead>
              <tbody>
                {(accountData.stakeholders || []).map((sh, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8, fontWeight: "bold" }}>{sh.name}</td>
                    <td style={{ padding: 8 }}>{sh.title}</td>
                    <td style={{ padding: 8 }}>{sh.department || "-"}</td>
                    <td style={{ padding: 8 }}>
                      {sh.role === "Champion" && "🌟 Champion (支持者)"}
                      {sh.role === "Neutral" && "⚖️ Neutral (中立)"}
                      {sh.role === "Blocker" && "⚠️ Blocker (阻礙者)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* SLIDE 4: 商機管線 */}
          <section className="ppt-slide">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0284c7", paddingBottom: 8, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>03. 新專案商機管道 (Project Pipeline)</h2>
              <span style={{ fontSize: 12, color: "#0284c7", fontWeight: "bold" }}>商機總值: ${totalPipelineValue.toLocaleString()} USD</span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>專案名稱</th>
                  <th style={{ padding: 8 }}>研發階段 (Stage)</th>
                  <th style={{ padding: 8 }}>預估合約金額 (USD)</th>
                  <th style={{ padding: 8 }}>得標機率 (%)</th>
                </tr>
              </thead>
              <tbody>
                {(accountData.pipelines || []).map((pipe, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8, fontWeight: "bold" }}>{pipe.projectName}</td>
                    <td style={{ padding: 8 }}>{pipe.stage}</td>
                    <td style={{ padding: 8 }}>${Number(pipe.value).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{pipe.winRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* SLIDE 5: 落地行動清單 */}
          <section className="ppt-slide">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0284c7", paddingBottom: 8, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>04. 季度落地行動清單 (Action Items)</h2>
              <span style={{ fontSize: 12, color: "#64748b" }}>交付期程與負責人</span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>任務項目說明</th>
                  <th style={{ padding: 8 }}>負責人 (Owner)</th>
                  <th style={{ padding: 8 }}>到期日 (Due Date)</th>
                  <th style={{ padding: 8 }}>執行狀態</th>
                </tr>
              </thead>
              <tbody>
                {(accountData.actions || []).map((act, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}>{act.task}</td>
                    <td style={{ padding: 8 }}>{act.owner}</td>
                    <td style={{ padding: 8 }}>{act.dueDate}</td>
                    <td style={{ padding: 8 }}>
                      {act.status === "Completed" && "🟢 已完成"}
                      {act.status === "In Progress" && "🟡 進行中"}
                      {act.status === "Not Started" && "⚪ 尚未開始"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

        </div>
      )}
    </>
  );
}