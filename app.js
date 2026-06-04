/* ==========================================================================
   🚗 CarCare TCO - Core JavaScript Application
   ========================================================================== */

// 1. 系統狀態模型 (State Management)
let state = {
  settings: {
    accessToken: "DavisCar",
    theme: "dark",
    sync: {
      provider: "jsonbin",
      apiKey: "",
      binId: "",
      githubToken: "",
      gistId: ""
    },
    intervals: {
      "機油": 10000,
      "機油芯": 10000,
      "變速箱油": 40000,
      "輪胎": 50000,
      "煞車片": 40000,
      "火星塞": 60000,
      "電瓶": 40000,
      "冷氣濾網": 15000,
      "空氣濾網": 20000,
      "雨刷": 20000
    }
  },
  vehicles: [],            // 車輛列表
  fuelRecords: [],         // 加油記錄
  maintenanceRecords: [],  // 保養記錄
  otherExpenses: [],       // 其他支出
  currentVehicleId: ""     // 當前選取車輛 ID
};

// 儲存同步狀態 (避免重複上傳)
let isSyncing = false;

// 2. 應用程式初始化 (App Lifecycle)
document.addEventListener("DOMContentLoaded", () => {
  initAuth(); // 安全驗證優先
});

// ==========================================================================
// 🔒 訪問安全認證 (Authentication Module)
// ==========================================================================
function initAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  
  // 先載入基本設定以取得當前設定的 Token（若 localStorage 為空，則先套用預設值）
  const savedState = localStorage.getItem("car_care_tco_state");
  let currentToken = state.settings.accessToken;
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      if (parsed.settings && parsed.settings.accessToken) {
        currentToken = parsed.settings.accessToken;
        state = parsed; // 預先賦值
      }
    } catch (e) {
      console.error("解析本機 state 失敗", e);
    }
  }

  // 1. 檢查 URL 是否帶有 Token
  if (urlToken) {
    if (urlToken === currentToken) {
      // 驗證成功，寫入 LocalStorage 與 Cookie (有效期 1 年)
      saveAuthToken(urlToken);
      // 清除網址上的敏感 token 參數，優化外觀
      window.history.replaceState({}, document.title, window.location.pathname);
      enterApp();
      return;
    }
  }

  // 2. 檢查 LocalStorage / Cookie 是否已有憑證
  if (checkStoredAuth(currentToken)) {
    enterApp();
  } else {
    // 3. 未授權，顯示鎖定畫面
    showLockScreen();
  }

  // 綁定驗證按鈕與 Enter 鍵
  document.getElementById("authSubmitBtn").addEventListener("click", handleAuthSubmit);
  document.getElementById("authTokenInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAuthSubmit();
  });
}

function checkStoredAuth(expectedToken) {
  const localAuth = localStorage.getItem("car_care_auth_token");
  if (localAuth === expectedToken) return true;

  // 嘗試讀取 Cookie
  const cookies = document.cookie.split(";");
  for (let c of cookies) {
    c = c.trim();
    if (c.startsWith("car_care_auth_token=")) {
      const cookieVal = c.substring("car_care_auth_token=".length);
      if (cookieVal === expectedToken) {
        // 如果 Cookie 有但 LocalStorage 沒有，補存入
        localStorage.setItem("car_care_auth_token", cookieVal);
        return true;
      }
    }
  }
  return false;
}

function saveAuthToken(token) {
  localStorage.setItem("car_care_auth_token", token);
  // 設定 Cookie (1 年到期)
  const d = new Date();
  d.setTime(d.getTime() + (365 * 24 * 60 * 60 * 1000));
  document.cookie = `car_care_auth_token=${token};expires=${d.toUTCString()};path=/;SameSite=Strict`;
}

function handleAuthSubmit() {
  const inputVal = document.getElementById("authTokenInput").value.trim();
  const currentToken = state.settings.accessToken;
  
  if (inputVal === currentToken) {
    saveAuthToken(inputVal);
    document.getElementById("authOverlay").classList.add("hide");
    enterApp();
  } else {
    const errorMsg = document.getElementById("authErrorMsg");
    errorMsg.classList.remove("hide");
    setTimeout(() => errorMsg.classList.add("hide"), 3000);
  }
}

function showLockScreen() {
  document.getElementById("authOverlay").classList.remove("hide");
  document.getElementById("appContainer").classList.add("hide");
}

function enterApp() {
  document.getElementById("authOverlay").classList.add("hide");
  document.getElementById("appContainer").classList.remove("hide");
  
  // 初始化應用程式
  loadData();
  setupEventListeners();
  switchPage("dashboard");
  fetchCPCPrice(); // 異步獲取最新公告油價
}

// 鎖定軟體 (登出)
document.getElementById("lockAppBtn").addEventListener("click", () => {
  if (confirm("確定要鎖定軟體並退出嗎？")) {
    localStorage.removeItem("car_care_auth_token");
    document.cookie = "car_care_auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    location.reload();
  }
});


// ==========================================================================
// ⚙️ 資料載入與儲存 (Data Storage Module)
// ==========================================================================
function loadData() {
  const savedState = localStorage.getItem("car_care_tco_state");
  if (savedState) {
    try {
      state = JSON.parse(savedState);
      // 確保提醒週期有預設值
      if (!state.settings.intervals) {
        state.settings.intervals = {
          "機油": 10000, "機油芯": 10000, "變速箱油": 40000, "輪胎": 50000,
          "煞車片": 40000, "火星塞": 60000, "電瓶": 40000, "冷氣濾網": 15000,
          "空氣濾網": 20000, "雨刷": 20000
        };
      }
    } catch (e) {
      console.error("載入 LocalStorage 失敗，套用預設值", e);
    }
  } else {
    // 首次登入，提供範例資料
    initSampleData();
  }

  // 更新 UI 車輛下拉選單
  updateVehicleDropdowns();
  
  // 觸發雲端背景同步 (從雲端拉取最新資料)
  if (state.settings.sync.apiKey && state.settings.sync.binId) {
    syncFromCloudBackground();
  } else {
    updateUI();
  }
}

function saveState(syncToCloud = true) {
  localStorage.setItem("car_care_tco_state", JSON.stringify(state));
  
  // 更新本機安全驗證 Token，維持一致
  localStorage.setItem("car_care_auth_token", state.settings.accessToken);
  
  updateUI();

  // 若設定了雲端同步，且啟用了自動同步，則在背景上傳
  if (syncToCloud && state.settings.sync.apiKey && state.settings.sync.binId) {
    syncToCloudBackground();
  }
}

function initSampleData() {
  state.vehicles = [
    {
      id: "v-" + Date.now(),
      name: "我的第一部愛車",
      make: "Toyota",
      model: "Altis",
      year: 2021,
      purchasePrice: 750000,
      initOdometer: 150,
      purchaseDate: "2021-08-15"
    }
  ];
  state.currentVehicleId = state.vehicles[0].id;
  
  // 寫入範例加油記錄
  const vId = state.currentVehicleId;
  const now = new Date();
  const dateStr1 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateStr2 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateStr3 = now.toISOString().split('T')[0];

  state.fuelRecords = [
    { id: "f-1", vehicleId: vId, date: dateStr1, odometer: 10250, pricePerLiter: 29.5, amount: 1180, fuelType: "95", isFull: true },
    { id: "f-2", vehicleId: vId, date: dateStr2, odometer: 10780, pricePerLiter: 30.1, amount: 1200, fuelType: "95", isFull: false },
    { id: "f-3", vehicleId: vId, date: dateStr3, odometer: 11250, pricePerLiter: 29.8, amount: 1192, fuelType: "95", isFull: true }
  ];

  state.maintenanceRecords = [
    { id: "m-1", vehicleId: vId, date: dateStr1, odometer: 10000, item: "機油,機油芯", partsCost: 1800, laborCost: 400, notes: "一萬公里保養" }
  ];

  state.otherExpenses = [
    { id: "e-1", vehicleId: vId, date: dateStr2, category: "洗車美容", amount: 350, notes: "自助洗車＋打蠟" }
  ];

  localStorage.setItem("car_care_tco_state", JSON.stringify(state));
}


// ==========================================================================
// ☁️ 雲端同步模組 (Cloud Synchronization - jsonbin.io)
// ==========================================================================
async function syncToCloudBackground() {
  if (isSyncing) return;
  const syncConf = state.settings.sync;
  if (!syncConf.provider) syncConf.provider = "jsonbin";

  // 檢查是否填寫了必要欄位，否則不上傳
  if (syncConf.provider === "jsonbin") {
    if (!syncConf.apiKey || !syncConf.binId) return;
  } else {
    if (!syncConf.githubToken || !syncConf.gistId) return;
  }

  isSyncing = true;
  updateSyncIndicator("yellow", "同步上傳中...");
  
  try {
    // 深度複製一份 state，並清空敏感金鑰欄位，以防上傳到雲端被 GitHub 掃描器自動廢除 Token
    const uploadState = JSON.parse(JSON.stringify(state));
    if (uploadState.settings && uploadState.settings.sync) {
      uploadState.settings.sync.githubToken = "";
      uploadState.settings.sync.apiKey = "";
    }

    let response;
    if (syncConf.provider === "jsonbin") {
      response = await fetch(`https://api.jsonbin.io/v3/b/${syncConf.binId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": syncConf.apiKey
        },
        body: JSON.stringify(uploadState)
      });
    } else {
      // GitHub Gist 同步 (PATCH)
      response = await fetch(`https://api.github.com/gists/${syncConf.gistId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `token ${syncConf.githubToken}`
        },
        body: JSON.stringify({
          files: {
            "carcare_data.json": {
              content: JSON.stringify(uploadState, null, 2)
            }
          }
        })
      });
    }

    if (response.ok) {
      updateSyncIndicator("green", "資料已同步雲端");
    } else {
      throw new Error(`HTTP 錯誤: ${response.status}`);
    }
  } catch (err) {
    console.error("雲端同步失敗", err);
    updateSyncIndicator("red", "同步失敗（待連網）");
  } finally {
    isSyncing = false;
  }
}

async function syncFromCloudBackground() {
  const syncConf = state.settings.sync;
  if (!syncConf.provider) syncConf.provider = "jsonbin";

  if (syncConf.provider === "jsonbin") {
    if (!syncConf.apiKey || !syncConf.binId) return;
  } else {
    if (!syncConf.githubToken || !syncConf.gistId) return;
  }

  updateSyncIndicator("yellow", "正在同步雲端資料...");
  
  try {
    let response;
    let cloudState = null;

    if (syncConf.provider === "jsonbin") {
      response = await fetch(`https://api.jsonbin.io/v3/b/${syncConf.binId}/latest`, {
        method: "GET",
        headers: {
          "X-Master-Key": syncConf.apiKey
        }
      });
      if (response.ok) {
        const resData = await response.json();
        cloudState = resData.record;
      }
    } else {
      // GitHub Gist 讀取 (GET)
      response = await fetch(`https://api.github.com/gists/${syncConf.gistId}`, {
        method: "GET",
        headers: {
          "Authorization": `token ${syncConf.githubToken}`
        }
      });
      if (response.ok) {
        const resData = await response.json();
        const fileObj = resData.files["carcare_data.json"];
        if (fileObj && fileObj.content) {
          cloudState = JSON.parse(fileObj.content);
        }
      }
    }

    if (response.ok && cloudState && cloudState.settings) {
      // ⚠️ 下載後必須保留本地現有的 Token 設定，避免被雲端的空字串覆蓋
      const localSyncConf = { ...state.settings.sync };
      
      state = cloudState;
      
      if (state.settings && state.settings.sync) {
        state.settings.sync.githubToken = localSyncConf.githubToken;
        state.settings.sync.apiKey = localSyncConf.apiKey;
      }

      localStorage.setItem("car_care_tco_state", JSON.stringify(state));
      updateVehicleDropdowns();
      updateUI();
      updateSyncIndicator("green", "雲端資料下載成功");
    } else {
      throw new Error(`HTTP 錯誤: ${response.status}`);
    }
  } catch (err) {
    console.error("從雲端讀取資料失敗", err);
    updateSyncIndicator("red", "雲端讀取失敗");
    updateUI(); // 降級渲染本地資料
  }
}

function updateSyncIndicator(status, text) {
  const dot = document.getElementById("syncStatusDot");
  const txt = document.getElementById("syncStatusText");
  const mobileDot = document.getElementById("mobileSyncStatus");

  // 重設 class
  dot.className = "status-dot " + status;
  txt.innerText = text;
  
  if (mobileDot) {
    mobileDot.className = "sync-dot-indicator tooltip " + status;
    mobileDot.setAttribute("data-tooltip", text);
  }
}


// ==========================================================================
// ⛽ 中油公告油價抓取模組 (CPC Fuel Prices)
// ==========================================================================
async function fetchCPCPrice() {
  const dateEl = document.getElementById("cpcPriceDate");
  dateEl.innerText = "讀取中...";

  const targetUrl = "https://vipmbr.cpc.com.tw/opendata/mainprodlistprice";
  
  // 多重代理與直連策略鏈 (Fallback Chain)
  const strategies = [
    // 策略 1: 直接連線 (適合瀏覽器無 CORS 限制、或中油允許的來源)
    async () => {
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`直連失敗，狀態碼: ${res.status}`);
      return await res.json();
    },
    // 策略 2: 透過 corsproxy.io 代理 (對瀏覽器端 client-side Origin 標頭友善)
    async () => {
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error(`corsproxy.io 失敗，狀態碼: ${res.status}`);
      return await res.json();
    },
    // 策略 3: 透過 allorigins.win (get 封裝 JSON 方式)
    async () => {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error(`allorigins (get) 失敗，狀態碼: ${res.status}`);
      const resJson = await res.json();
      if (!resJson.contents) throw new Error("allorigins 回傳內容為空");
      return JSON.parse(resJson.contents);
    },
    // 策略 4: 透過 allorigins.win (raw 直接轉發方式)
    async () => {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error(`allorigins (raw) 失敗，狀態碼: ${res.status}`);
      return await res.json();
    }
  ];

  let data = null;
  let success = false;

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`正在嘗試中油油價獲取策略 ${i + 1}...`);
      data = await strategies[i]();
      if (data && Array.isArray(data) && data.length > 0) {
        success = true;
        console.log(`策略 ${i + 1} 成功獲取中油油價資料！`);
        break;
      }
    } catch (err) {
      console.warn(`中油油價獲取策略 ${i + 1} 失敗:`, err.message || err);
    }
  }

  // 3. 解析獲取到的 JSON 牌價陣列
  if (success && Array.isArray(data) && data.length > 0) {
    try {
      const prices = { "92": 0, "95": 0, "98": 0, "diesel": 0, "date": "" };

      data.forEach(item => {
        const name = item["產品名稱"] || "";
        const priceVal = parseFloat(item["參考牌價_金額"] || "0");
        const rocDate = item["牌價生效日期"] || "";

        // 轉換民國年生效日期 "1150601" -> "2026/06/01"
        if (rocDate && rocDate.length >= 7 && !prices.date) {
          const yy = parseInt(rocDate.substring(0, rocDate.length - 4));
          const mm = rocDate.substring(rocDate.length - 4, rocDate.length - 2);
          const dd = rocDate.substring(rocDate.length - 2);
          prices.date = `${yy + 1911}/${mm}/${dd}`;
        }

        if (name.includes("92無鉛")) prices["92"] = priceVal;
        else if (name.includes("95無鉛")) prices["95"] = priceVal;
        else if (name.includes("98無鉛")) prices["98"] = priceVal;
        else if (name.includes("超級柴油")) prices["diesel"] = priceVal;
      });

      if (prices["95"] > 0) {
        document.getElementById("cpc-92").innerText = "NT$ " + prices["92"];
        document.getElementById("cpc-95").innerText = "NT$ " + prices["95"];
        document.getElementById("cpc-98").innerText = "NT$ " + prices["98"];
        document.getElementById("cpc-diesel").innerText = "NT$ " + prices["diesel"];
        dateEl.innerText = (prices.date || "本週") + " 公告";

        window.cpcPrices = prices;
        state.settings.cpcPrices = prices; // 存入本地 state 快取
        saveState(false); // 儲存至 LocalStorage 但在背景不重複上傳雲端
        return;
      }
    } catch (parseErr) {
      console.error("解析中油 JSON 結構失敗", parseErr);
    }
  }

  // 4. 降級處理：讀取本地快取
  if (state.settings.cpcPrices && state.settings.cpcPrices["95"] > 0) {
    const cache = state.settings.cpcPrices;
    document.getElementById("cpc-92").innerText = "NT$ " + cache["92"];
    document.getElementById("cpc-95").innerText = "NT$ " + cache["95"];
    document.getElementById("cpc-98").innerText = "NT$ " + cache["98"];
    document.getElementById("cpc-diesel").innerText = "NT$ " + cache["diesel"];
    dateEl.innerText = cache.date + " (本機快取)";
    window.cpcPrices = cache;
  } else {
    // 5. 完全沒有快取時，套用預設值
    const fallbackPrices = { "92": 29.5, "95": 31.0, "98": 33.0, "diesel": 27.1, "date": "本週參考油價 (手動)" };
    document.getElementById("cpc-92").innerText = "NT$ " + fallbackPrices["92"];
    document.getElementById("cpc-95").innerText = "NT$ " + fallbackPrices["95"];
    document.getElementById("cpc-98").innerText = "NT$ " + fallbackPrices["98"];
    document.getElementById("cpc-diesel").innerText = "NT$ " + fallbackPrices["diesel"];
    dateEl.innerText = fallbackPrices["date"];
    window.cpcPrices = fallbackPrices;
  }
}

// 重新整理中油油價
document.getElementById("refreshCpcBtn").addEventListener("click", () => {
  fetchCPCPrice();
});


// ==========================================================================
// 📐 核心算法引擎：油耗、TCO 與保養到期提醒 (Calculations)
// ==========================================================================

// 1. 單次與累計油耗計演算法
function calculateFuelEfficiency(carRecords) {
  // 將該車的加油記錄依里程從小到大排序
  const records = [...carRecords].sort((a, b) => a.odometer - b.odometer);
  const results = {}; // 用來存 id -> km/L

  if (records.length < 2) return results;

  // 精準的「加滿-加滿」區間計算
  for (let i = 0; i < records.length; i++) {
    const cur = records[i];
    if (!cur.isFull) {
      results[cur.id] = null; // 本次沒加滿，無法單獨計算油耗
      continue;
    }

    // 本次加滿，往回找上一次「加滿」的記錄
    let prevFullIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (records[j].isFull) {
        prevFullIdx = j;
        break;
      }
    }

    if (prevFullIdx === -1) {
      // 找不到上一次加滿，這代表是該車歷史上的「第一筆加滿」，作為基準點，無法計算本次油耗
      results[cur.id] = null;
      continue;
    }

    // 計算里程差
    const distance = cur.odometer - records[prevFullIdx].odometer;
    
    // 計算期間總加油量：包含上一次加滿後、到本次加滿間的所有加油公升數
    let totalLiters = 0;
    for (let k = prevFullIdx + 1; k <= i; k++) {
      const rec = records[k];
      const liters = rec.amount / rec.pricePerLiter;
      totalLiters += liters;
    }

    if (totalLiters > 0 && distance > 0) {
      results[cur.id] = (distance / totalLiters).toFixed(2);
    } else {
      results[cur.id] = null;
    }
  }

  return results;
}

// 計算總平均油耗
function calculateAverageFuelEfficiency(carRecords) {
  const records = [...carRecords].sort((a, b) => a.odometer - b.odometer);
  
  // 尋找第一筆和最後一筆「加滿」的記錄
  let firstFullIdx = -1;
  let lastFullIdx = -1;

  for (let i = 0; i < records.length; i++) {
    if (records[i].isFull) {
      if (firstFullIdx === -1) {
        firstFullIdx = i;
      }
      lastFullIdx = i;
    }
  }

  // 必須至少有兩次加滿記錄才能計算總平均
  if (firstFullIdx === -1 || lastFullIdx === -1 || firstFullIdx === lastFullIdx) {
    return 0;
  }

  const totalDistance = records[lastFullIdx].odometer - records[firstFullIdx].odometer;
  
  let totalLiters = 0;
  for (let k = firstFullIdx + 1; k <= lastFullIdx; k++) {
    const rec = records[k];
    totalLiters += (rec.amount / rec.pricePerLiter);
  }

  if (totalLiters > 0 && totalDistance > 0) {
    return (totalDistance / totalLiters);
  }
  return 0;
}

// 2. 總持有成本 (TCO) & 每公里成本 (CPK) 計算
function getTCODetails(vehicleId) {
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return { tco: 0, runningCost: 0, fuelCost: 0, maintCost: 0, expCost: 0, cpk: 0, currentOdo: 0 };

  const initOdo = vehicle.initOdometer || 0;
  const purchasePrice = Number(vehicle.purchasePrice) || 0;

  // 過濾當前車輛記錄
  const vFuel = state.fuelRecords.filter(r => r.vehicleId === vehicleId);
  const vMaint = state.maintenanceRecords.filter(r => r.vehicleId === vehicleId);
  const vExp = state.otherExpenses.filter(r => r.vehicleId === vehicleId);

  // 累加各項費用
  const fuelCost = vFuel.reduce((sum, r) => sum + Number(r.amount), 0);
  const maintCost = vMaint.reduce((sum, r) => sum + Number(r.partsCost) + Number(r.laborCost), 0);
  const expCost = vExp.reduce((sum, r) => sum + Number(r.amount), 0);

  const runningCost = fuelCost + maintCost + expCost;
  const tco = purchasePrice + runningCost;

  // 取得最新里程數
  let currentOdo = initOdo;
  if (vFuel.length > 0) {
    currentOdo = Math.max(currentOdo, ...vFuel.map(r => r.odometer));
  }
  if (vMaint.length > 0) {
    currentOdo = Math.max(currentOdo, ...vMaint.map(r => r.odometer));
  }

  const travelDistance = currentOdo - initOdo;
  let cpk = 0;
  if (travelDistance > 0) {
    cpk = runningCost / travelDistance; // CPK 以營運成本計算最實用
  }

  return {
    tco,
    runningCost,
    fuelCost,
    maintCost,
    expCost,
    cpk,
    currentOdo
  };
}

// 3. 保養提醒分析引擎
function checkMaintenanceAlerts(vehicleId, currentOdo) {
  const alerts = [];
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return alerts;

  const initOdo = vehicle.initOdometer || 0;
  const baseMileage = currentOdo - initOdo; // 從購入至今行駛里程
  
  // 該車所有的保養記錄
  const vMaint = state.maintenanceRecords.filter(r => r.vehicleId === vehicleId);

  // 尋找各個耗材間隔設定
  const intervals = state.settings.intervals;

  for (let item in intervals) {
    const intervalKm = intervals[item];
    if (intervalKm <= 0) continue; // 設為 0 代表不提醒

    // 找出最新一筆包含該耗材字眼的保養記錄 (不分大小寫、模糊匹配)
    // 例如使用者輸入的項目為 "更換機油、機油芯"，而我們要匹配 "機油"
    const relevantRecords = vMaint.filter(r => {
      return r.item.includes(item);
    }).sort((a, b) => b.odometer - a.odometer); // 里程大到小

    let lastMaintOdo = initOdo;
    let hasRecord = false;

    if (relevantRecords.length > 0) {
      lastMaintOdo = relevantRecords[0].odometer;
      hasRecord = true;
    }

    const elapsedKm = currentOdo - lastMaintOdo;
    const remainingKm = intervalKm - elapsedKm;

    if (remainingKm <= 1000) {
      // 距離保養剩餘 1000 公里內或已過期，發出提醒
      alerts.push({
        item: item,
        interval: intervalKm,
        elapsed: elapsedKm,
        remaining: remainingKm,
        hasRecord: hasRecord,
        status: remainingKm <= 0 ? "danger" : "warning"
      });
    }
  }

  return alerts;
}


// ==========================================================================
// 🖥️ UI 渲染與視窗控制 (UI Rendering Module)
// ==========================================================================
function updateUI() {
  const vId = state.currentVehicleId;
  const vehicle = state.vehicles.find(v => v.id === vId);

  if (!vehicle) {
    // 若沒有任何車輛，引導新增
    showEmptyVehicleState();
    return;
  }

  // 取得該車之計算結果
  const stats = getTCODetails(vId);
  const vFuel = state.fuelRecords.filter(r => r.vehicleId === vId);
  const vMaint = state.maintenanceRecords.filter(r => r.vehicleId === vId);
  const vExp = state.otherExpenses.filter(r => r.vehicleId === vId);

  // 1. 儀表板 KPI 渲染
  const avgFuel = calculateAverageFuelEfficiency(vFuel);
  document.getElementById("kpi-tco").innerText = "NT$ " + stats.tco.toLocaleString();
  document.getElementById("kpi-tco-sub").innerText = `車價: NT$ ${(vehicle.purchasePrice || 0).toLocaleString()} | 支出: NT$ ${stats.runningCost.toLocaleString()}`;
  document.getElementById("kpi-fuel").innerHTML = avgFuel > 0 ? `${avgFuel.toFixed(2)} <span class="unit">km/L</span>` : `0.0 <span class="unit">km/L</span>`;
  document.getElementById("kpi-cpk").innerHTML = `NT$ ${stats.cpk.toFixed(1)} <span class="unit">/ km</span>`;
  document.getElementById("kpi-odometer").innerHTML = `${stats.currentOdo.toLocaleString()} <span class="unit">km</span>`;
  document.getElementById("kpi-odometer-sub").innerText = `初始里程: ${(vehicle.initOdometer || 0).toLocaleString()} km`;

  // 2. 保養警告列表渲染
  const alertsList = document.getElementById("maintenanceAlertsList");
  const alerts = checkMaintenanceAlerts(vId, stats.currentOdo);
  
  if (alerts.length > 0) {
    let alertsHtml = '<div class="alerts-list">';
    alerts.forEach(a => {
      const statusIcon = a.status === "danger" ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-circle-exclamation"></i>';
      const statusText = a.remaining <= 0 
        ? `<span class="text-neon-red">已逾期 ${Math.abs(a.remaining).toLocaleString()} km</span>` 
        : `剩餘 ${a.remaining.toLocaleString()} km 更換`;
      const prevInfo = a.hasRecord 
        ? `上次更換里程：${(stats.currentOdo - a.elapsed).toLocaleString()} km` 
        : `購入至今尚未記錄更換過此項目`;

      alertsHtml += `
        <div class="alert-item">
          <div class="alert-item-left">
            <div class="alert-badge ${a.status}">${statusIcon}</div>
            <div>
              <div class="alert-title">${a.item} (${a.interval.toLocaleString()} km 週期)</div>
              <div class="alert-info">${prevInfo}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="alert-title">${statusText}</div>
            <div class="alert-info">已行駛 ${a.elapsed.toLocaleString()} km</div>
          </div>
        </div>
      `;
    });
    alertsHtml += '</div>';
    alertsList.innerHTML = alertsHtml;
  } else {
    alertsList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-check text-neon-green"></i>
        <p>目前所有耗材狀態良好，無須更換！</p>
      </div>
    `;
  }

  // 3. 加油歷史表格渲染
  renderFuelTable(vFuel);

  // 4. 保養歷史表格渲染
  renderMaintTable(vMaint);

  // 5. 其他支出表格渲染
  renderExpenseTable(vExp);

  // 6. 圖表分析渲染
  renderAnalyticsCharts(stats, vFuel, vMaint, vExp);

  // 7. 渲染系統設定頁面數值
  document.getElementById("settingsTokenInput").value = state.settings.accessToken;
  const syncConf = state.settings.sync;
  const provider = syncConf.provider || "jsonbin";
  document.getElementById("syncProvider").value = provider;
  document.getElementById("syncApiKey").value = syncConf.apiKey || "";
  document.getElementById("syncBinId").value = syncConf.binId || "";
  document.getElementById("syncGithubToken").value = syncConf.githubToken || "";
  document.getElementById("syncGistId").value = syncConf.gistId || "";
  
  // 根據選擇切換輸入欄位隱顯
  if (provider === "jsonbin") {
    document.getElementById("sync-jsonbin-fields").classList.remove("hide");
    document.getElementById("sync-github-fields").classList.add("hide");
  } else {
    document.getElementById("sync-jsonbin-fields").classList.add("hide");
    document.getElementById("sync-github-fields").classList.remove("hide");
  }

  // 8. 渲染保養週期提醒表單
  renderIntervalsForm();
}

function showEmptyVehicleState() {
  // 渲染無車輛狀態，儀表板全部歸零並引導新增
  document.getElementById("kpi-tco").innerText = "NT$ 0";
  document.getElementById("kpi-fuel").innerHTML = `0.0 <span class="unit">km/L</span>`;
  document.getElementById("kpi-cpk").innerHTML = `NT$ 0.0 <span class="unit">/ km</span>`;
  document.getElementById("kpi-odometer").innerHTML = `0 <span class="unit">km</span>`;
  
  document.getElementById("maintenanceAlertsList").innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-car-tunnel text-neon-blue"></i>
      <p>請先新增並設定一部車輛，以開始進行記錄！</p>
      <button class="btn btn-primary margin-top" onclick="openAddVehicleModal()">立即新增車輛</button>
    </div>
  `;

  document.getElementById("fuelTableBody").innerHTML = `<tr><td colspan="9" class="text-center text-muted">無車輛資料</td></tr>`;
  document.getElementById("maintenanceTableBody").innerHTML = `<tr><td colspan="8" class="text-center text-muted">無車輛資料</td></tr>`;
  document.getElementById("expenseTableBody").innerHTML = `<tr><td colspan="5" class="text-center text-muted">無車輛資料</td></tr>`;
  
  // 毀掉圖表
  destroyCharts();
}

// 渲染加油表格
function renderFuelTable(vFuel) {
  const tbody = document.getElementById("fuelTableBody");
  if (vFuel.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">目前尚無加油記錄</td></tr>`;
    return;
  }

  // 排序：日期從新到舊
  const sorted = [...vFuel].sort((a, b) => new Date(b.date) - new Date(a.date));
  const efficiencies = calculateFuelEfficiency(vFuel);

  let html = "";
  sorted.forEach(r => {
    const liters = (r.amount / r.pricePerLiter).toFixed(2);
    const eff = efficiencies[r.id];
    const effDisplay = eff ? `<span class="text-neon-teal font-weight-bold">${eff} km/L</span>` : `<span class="text-muted">--</span>`;
    const fullBadge = r.isFull ? `<span class="v-badge primary">加滿</span>` : `<span class="v-badge secondary">未滿</span>`;
    
    html += `
      <tr>
        <td>${r.date}</td>
        <td>${r.odometer.toLocaleString()}</td>
        <td>$ ${Number(r.pricePerLiter).toFixed(2)}</td>
        <td class="font-weight-bold">$ ${r.amount.toLocaleString()}</td>
        <td>${liters} L</td>
        <td>${r.fuelType}無鉛</td>
        <td>${fullBadge}</td>
        <td>${effDisplay}</td>
        <td class="text-right">
          <div class="table-actions">
            <button class="btn btn-icon-only btn-outline text-neon-blue" onclick="openEditRecordModal('fuel', '${r.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-icon-only btn-outline text-neon-red" onclick="deleteRecord('fuel', '${r.id}')"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// 渲染保養表格
function renderMaintTable(vMaint) {
  const tbody = document.getElementById("maintenanceTableBody");
  if (vMaint.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">目前尚無保養記錄</td></tr>`;
    return;
  }

  const sorted = [...vMaint].sort((a, b) => new Date(b.date) - new Date(a.date));
  let html = "";
  sorted.forEach(r => {
    const total = Number(r.partsCost) + Number(r.laborCost);
    html += `
      <tr>
        <td>${r.date}</td>
        <td>${r.odometer.toLocaleString()}</td>
        <td class="font-weight-bold">${r.item}</td>
        <td>$ ${Number(r.partsCost).toLocaleString()}</td>
        <td>$ ${Number(r.laborCost).toLocaleString()}</td>
        <td class="text-neon-blue font-weight-bold">$ ${total.toLocaleString()}</td>
        <td><span class="text-muted" title="${r.notes || ''}">${r.notes ? (r.notes.substring(0, 20) + (r.notes.length > 20 ? '...' : '')) : ''}</span></td>
        <td class="text-right">
          <div class="table-actions">
            <button class="btn btn-icon-only btn-outline text-neon-blue" onclick="openEditRecordModal('maintenance', '${r.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-icon-only btn-outline text-neon-red" onclick="deleteRecord('maintenance', '${r.id}')"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// 渲染其他支出表格
function renderExpenseTable(vExp) {
  const tbody = document.getElementById("expenseTableBody");
  if (vExp.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">目前尚無其他支出記錄</td></tr>`;
    return;
  }

  const sorted = [...vExp].sort((a, b) => new Date(b.date) - new Date(a.date));
  let html = "";
  sorted.forEach(r => {
    html += `
      <tr>
        <td>${r.date}</td>
        <td><span class="v-badge secondary">${r.category}</span></td>
        <td class="text-neon-purple font-weight-bold">$ ${Number(r.amount).toLocaleString()}</td>
        <td><span class="text-muted">${r.notes || ''}</span></td>
        <td class="text-right">
          <div class="table-actions">
            <button class="btn btn-icon-only btn-outline text-neon-blue" onclick="openEditRecordModal('expense', '${r.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-icon-only btn-outline text-neon-red" onclick="deleteRecord('expense', '${r.id}')"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// 渲染車輛管理分頁的列表
function renderVehiclesList() {
  const grid = document.getElementById("vehiclesGrid");
  if (state.vehicles.length === 0) {
    grid.innerHTML = `
      <div class="empty-state colspan-2">
        <i class="fa-solid fa-car-rear text-muted"></i>
        <p>目前沒有任何受管車輛</p>
      </div>
    `;
    return;
  }

  let html = "";
  state.vehicles.forEach(v => {
    const isCurrent = v.id === state.currentVehicleId;
    const badge = isCurrent ? `<span class="v-badge primary">當前作用中</span>` : `<span class="v-badge secondary">閒置</span>`;
    const details = getTCODetails(v.id);
    
    html += `
      <div class="vehicle-card glass-panel ${isCurrent ? 'active' : 'inactive'}">
        <div class="v-card-header">
          <div class="v-card-title">
            <h2>${v.name}</h2>
            <p>${v.make || ''} ${v.model || ''} (${v.year || '--'} 年)</p>
          </div>
          <div>${badge}</div>
        </div>
        <div class="v-stats-list">
          <div class="v-stat-row">
            <span class="v-stat-label">車輛購入車價</span>
            <span class="v-stat-val">NT$ ${(v.purchasePrice || 0).toLocaleString()}</span>
          </div>
          <div class="v-stat-row">
            <span class="v-stat-label">當前累計里程</span>
            <span class="v-stat-val">${details.currentOdo.toLocaleString()} km</span>
          </div>
          <div class="v-stat-row">
            <span class="v-stat-label">營運總支出 (TCO)</span>
            <span class="v-stat-val text-neon-green">NT$ ${details.runningCost.toLocaleString()}</span>
          </div>
        </div>
        <div class="v-actions">
          ${!isCurrent ? `<button class="btn btn-xs btn-primary" onclick="switchActiveVehicle('${v.id}')">切換此車</button>` : ''}
          <button class="btn btn-xs btn-outline text-neon-blue" onclick="openEditVehicleModal('${v.id}')">編輯</button>
          <button class="btn btn-xs btn-outline text-neon-red" onclick="deleteVehicle('${v.id}')">刪除車輛</button>
        </div>
      </div>
    `;
  });
  grid.innerHTML = html;
}

// 渲染保養週期設定表單
function renderIntervalsForm() {
  const container = document.getElementById("intervalFormGrid");
  const intervals = state.settings.intervals;
  
  let html = "";
  for (let item in intervals) {
    html += `
      <div class="form-group">
        <label for="interval-${item}">${item} 更換週期 (km)</label>
        <input type="number" id="interval-${item}" value="${intervals[item]}" min="0">
      </div>
    `;
  }
  container.innerHTML = html;
}

// 儲存保養週期提醒設定
document.getElementById("saveIntervalsBtn").addEventListener("click", () => {
  const intervals = state.settings.intervals;
  for (let item in intervals) {
    const input = document.getElementById(`interval-${item}`);
    if (input) {
      intervals[item] = Number(input.value) || 0;
    }
  }
  saveState();
  alert("耗材保養警示週期已成功更新！");
});

// 切換啟用車輛
function switchActiveVehicle(vehicleId) {
  state.currentVehicleId = vehicleId;
  saveState(false); // 本地切換即可，免自動雲端同步，只在資料庫變更時同步
  updateVehicleDropdowns();
  updateUI();
}

function updateVehicleDropdowns() {
  const select = document.getElementById("globalVehicleSelect");
  select.innerHTML = "";
  
  if (state.vehicles.length === 0) {
    select.innerHTML = `<option value="">請先新增車輛</option>`;
    return;
  }

  state.vehicles.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.text = v.name;
    if (v.id === state.currentVehicleId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

// 監聽車輛下拉切換
document.getElementById("globalVehicleSelect").addEventListener("change", (e) => {
  switchActiveVehicle(e.target.value);
});


// ==========================================================================
// 📊 Chart.js 數據可視化渲染 (Charts Module)
// ==========================================================================
let miniCostChartObj = null;
let costStructureChartObj = null;
let fuelEfficiencyChartObj = null;
let monthlyCostChartObj = null;

function destroyCharts() {
  if (miniCostChartObj) miniCostChartObj.destroy();
  if (costStructureChartObj) costStructureChartObj.destroy();
  if (fuelEfficiencyChartObj) fuelEfficiencyChartObj.destroy();
  if (monthlyCostChartObj) monthlyCostChartObj.destroy();
}

function renderAnalyticsCharts(stats, vFuel, vMaint, vExp) {
  destroyCharts();

  // 1. 費用支出結構 (Donut Chart) - 僅包含營運支出
  const fuelSum = stats.fuelCost;
  const maintSum = stats.maintCost;
  const expSum = stats.expCost;
  const totalRunning = stats.runningCost;

  const donutLabels = ["加油油資", "保養更換", "其他支出"];
  const donutData = [fuelSum, maintSum, expSum];

  // 避免完全沒有資料時圖表報錯，如果沒資料，則預設畫灰色圓環
  const hasData = totalRunning > 0;
  const chartDatasets = hasData ? [{
    data: donutData,
    backgroundColor: ["#10b981", "#3b82f6", "#8b5cf6"],
    borderWidth: 0,
    hoverOffset: 4
  }] : [{
    data: [1],
    backgroundColor: ["rgba(255, 255, 255, 0.05)"],
    borderWidth: 0
  }];

  // 渲染儀表板小圓餅圖
  const miniCtx = document.getElementById("miniCostChart").getContext("2d");
  miniCostChartObj = new Chart(miniCtx, {
    type: "doughnut",
    data: {
      labels: hasData ? donutLabels : ["尚無花費"],
      datasets: chartDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10 } } },
        tooltip: { enabled: hasData }
      },
      cutout: "70%"
    }
  });

  // 渲染數據分析分頁的大圓餅圖
  const fullDonutCtx = document.getElementById("costStructureChart").getContext("2d");
  costStructureChartObj = new Chart(fullDonutCtx, {
    type: "doughnut",
    data: {
      labels: hasData ? donutLabels : ["尚無花費"],
      datasets: chartDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: "#f8fafc", font: { size: 13 } } }
      },
      cutout: "60%"
    }
  });

  // 2. 歷史油耗趨勢 (Line Chart)
  // 將加油記錄排序（從小到大）
  const fuelSorted = [...vFuel].sort((a, b) => new Date(a.date) - new Date(b.date));
  const efficiencies = calculateFuelEfficiency(vFuel);
  
  // 篩選出有成功計算出油耗的點
  const lineLabels = [];
  const lineData = [];

  fuelSorted.forEach(r => {
    const eff = efficiencies[r.id];
    if (eff) {
      lineLabels.push(r.date.substring(5)); // 只拿 MM-DD 方便在手機上閱讀
      lineData.push(Number(eff));
    }
  });

  const lineCtx = document.getElementById("fuelEfficiencyChart").getContext("2d");
  fuelEfficiencyChartObj = new Chart(lineCtx, {
    type: "line",
    data: {
      labels: lineLabels.length > 0 ? lineLabels : ["無資料"],
      datasets: [{
        label: "油耗 (km/L)",
        data: lineData.length > 0 ? lineData : [0],
        borderColor: "#06b6d4",
        backgroundColor: "rgba(6, 182, 212, 0.05)",
        borderWidth: 3,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: "#06b6d4",
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.03)" }, ticks: { color: "#94a3b8" } },
        y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" }, suggestMin: 8, suggestMax: 20 }
      }
    }
  });

  // 3. 月度花費疊加圖 (Bar Chart) - 統計過去一年內每個月的花費
  const monthlyData = getMonthlyCostStatistics(vFuel, vMaint, vExp);
  const monthlyCtx = document.getElementById("monthlyCostChart").getContext("2d");
  
  monthlyCostChartObj = new Chart(monthlyCtx, {
    type: "bar",
    data: {
      labels: monthlyData.labels,
      datasets: [
        {
          label: "油資",
          data: monthlyData.fuel,
          backgroundColor: "#10b981",
          borderRadius: 4
        },
        {
          label: "保養與耗材",
          data: monthlyData.maint,
          backgroundColor: "#3b82f6",
          borderRadius: 4
        },
        {
          label: "其他支出",
          data: monthlyData.exp,
          backgroundColor: "#8b5cf6",
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#f8fafc" } }
      },
      scales: {
        x: { stacked: true, grid: { color: "rgba(255,255,255,0.03)" }, ticks: { color: "#94a3b8" } },
        y: { stacked: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } }
      }
    }
  });
}

function getMonthlyCostStatistics(vFuel, vMaint, vExp) {
  const months = [];
  const now = new Date();
  
  // 建立最近 6 個月的標籤列表（例如 2026-01 到 2026-06）
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(label);
  }

  const fuelObj = {};
  const maintObj = {};
  const expObj = {};
  
  months.forEach(m => {
    fuelObj[m] = 0;
    maintObj[m] = 0;
    expObj[m] = 0;
  });

  // 加油花費統計
  vFuel.forEach(r => {
    const m = r.date.substring(0, 7);
    if (fuelObj[m] !== undefined) fuelObj[m] += Number(r.amount);
  });

  // 保養花費統計
  vMaint.forEach(r => {
    const m = r.date.substring(0, 7);
    if (maintObj[m] !== undefined) maintObj[m] += (Number(r.partsCost) + Number(r.laborCost));
  });

  // 其他支出統計
  vExp.forEach(r => {
    const m = r.date.substring(0, 7);
    if (expObj[m] !== undefined) expObj[m] += Number(r.amount);
  });

  return {
    labels: months,
    fuel: months.map(m => fuelObj[m]),
    maint: months.map(m => maintObj[m]),
    exp: months.map(m => expObj[m])
  };
}


// ==========================================================================
// 🛠️ 表單新增/修改/刪除處理 (CRUD Logic)
// ==========================================================================

// --- A. 記錄 (加油、保養、支出) ---
function openAddRecordModal(type) {
  const form = document.getElementById("recordForm");
  form.reset();
  
  // 設定預設日期為今天
  const today = new Date().toISOString().split("T")[0];
  
  document.getElementById("formActionType").value = "add";
  document.getElementById("formDataType").value = type;
  document.getElementById("formRecordId").value = "";

  // 顯隱欄位分群
  document.getElementById("form-fuel-fields").classList.add("hide");
  document.getElementById("form-maintenance-fields").classList.add("hide");
  document.getElementById("form-expense-fields").classList.add("hide");

  if (type === "fuel") {
    document.getElementById("modalTitle").innerText = "新增加油記錄";
    document.getElementById("form-fuel-fields").classList.remove("hide");
    document.getElementById("fuelDate").value = today;
    
    // 自動預設帶入中油公告油價
    if (window.cpcPrices) {
      document.getElementById("fuelPrice").value = window.cpcPrices["95"] || "";
    }
  } else if (type === "maintenance") {
    document.getElementById("modalTitle").innerText = "新增保養耗材記錄";
    document.getElementById("form-maintenance-fields").classList.remove("hide");
    document.getElementById("maintDate").value = today;
    document.getElementById("maintPartsCost").value = "0";
    document.getElementById("maintLaborCost").value = "0";
  } else if (type === "expense") {
    document.getElementById("modalTitle").innerText = "新增其他費用支出";
    document.getElementById("form-expense-fields").classList.remove("hide");
    document.getElementById("expDate").value = today;
  }

  document.getElementById("recordModal").classList.remove("hide");
}

function openEditRecordModal(type, id) {
  const form = document.getElementById("recordForm");
  form.reset();

  document.getElementById("formActionType").value = "edit";
  document.getElementById("formDataType").value = type;
  document.getElementById("formRecordId").value = id;

  document.getElementById("form-fuel-fields").classList.add("hide");
  document.getElementById("form-maintenance-fields").classList.add("hide");
  document.getElementById("form-expense-fields").classList.add("hide");

  if (type === "fuel") {
    const record = state.fuelRecords.find(r => r.id === id);
    if (!record) return;
    
    document.getElementById("modalTitle").innerText = "編輯加油記錄";
    document.getElementById("form-fuel-fields").classList.remove("hide");
    document.getElementById("fuelDate").value = record.date;
    document.getElementById("fuelOdometer").value = record.odometer;
    document.getElementById("fuelPrice").value = record.pricePerLiter;
    document.getElementById("fuelAmount").value = record.amount;
    document.getElementById("fuelType").value = record.fuelType;
    document.getElementById("fuelIsFull").checked = record.isFull;
  } else if (type === "maintenance") {
    const record = state.maintenanceRecords.find(r => r.id === id);
    if (!record) return;

    document.getElementById("modalTitle").innerText = "編輯保養記錄";
    document.getElementById("form-maintenance-fields").classList.remove("hide");
    document.getElementById("maintDate").value = record.date;
    document.getElementById("maintOdometer").value = record.odometer;
    document.getElementById("maintItem").value = record.item;
    document.getElementById("maintPartsCost").value = record.partsCost;
    document.getElementById("maintLaborCost").value = record.laborCost;
    document.getElementById("maintNotes").value = record.notes || "";
  } else if (type === "expense") {
    const record = state.otherExpenses.find(r => r.id === id);
    if (!record) return;

    document.getElementById("modalTitle").innerText = "編輯支出記錄";
    document.getElementById("form-expense-fields").classList.remove("hide");
    document.getElementById("expDate").value = record.date;
    document.getElementById("expCategory").value = record.category;
    document.getElementById("expAmount").value = record.amount;
    document.getElementById("expNotes").value = record.notes || "";
  }

  document.getElementById("recordModal").classList.remove("hide");
}

function closeRecordModal() {
  document.getElementById("recordModal").classList.add("hide");
}

// 監聽記錄表單提交
document.getElementById("recordForm").addEventListener("submit", (e) => {
  e.preventDefault();
  
  const action = document.getElementById("formActionType").value;
  const type = document.getElementById("formDataType").value;
  const recordId = document.getElementById("formRecordId").value;
  const vId = state.currentVehicleId;

  if (action === "add") {
    // 新增邏輯
    if (type === "fuel") {
      const newRecord = {
        id: "f-" + Date.now(),
        vehicleId: vId,
        date: document.getElementById("fuelDate").value,
        odometer: Number(document.getElementById("fuelOdometer").value),
        pricePerLiter: Number(document.getElementById("fuelPrice").value),
        amount: Number(document.getElementById("fuelAmount").value),
        fuelType: document.getElementById("fuelType").value,
        isFull: document.getElementById("fuelIsFull").checked
      };
      state.fuelRecords.push(newRecord);
    } else if (type === "maintenance") {
      const newRecord = {
        id: "m-" + Date.now(),
        vehicleId: vId,
        date: document.getElementById("maintDate").value,
        odometer: Number(document.getElementById("maintOdometer").value),
        item: document.getElementById("maintItem").value.trim(),
        partsCost: Number(document.getElementById("maintPartsCost").value) || 0,
        laborCost: Number(document.getElementById("maintLaborCost").value) || 0,
        notes: document.getElementById("maintNotes").value.trim()
      };
      state.maintenanceRecords.push(newRecord);
    } else if (type === "expense") {
      const newRecord = {
        id: "e-" + Date.now(),
        vehicleId: vId,
        date: document.getElementById("expDate").value,
        category: document.getElementById("expCategory").value,
        amount: Number(document.getElementById("expAmount").value),
        notes: document.getElementById("expNotes").value.trim()
      };
      state.otherExpenses.push(newRecord);
    }
  } else {
    // 編輯邏輯
    if (type === "fuel") {
      const idx = state.fuelRecords.findIndex(r => r.id === recordId);
      if (idx !== -1) {
        state.fuelRecords[idx] = {
          ...state.fuelRecords[idx],
          date: document.getElementById("fuelDate").value,
          odometer: Number(document.getElementById("fuelOdometer").value),
          pricePerLiter: Number(document.getElementById("fuelPrice").value),
          amount: Number(document.getElementById("fuelAmount").value),
          fuelType: document.getElementById("fuelType").value,
          isFull: document.getElementById("fuelIsFull").checked
        };
      }
    } else if (type === "maintenance") {
      const idx = state.maintenanceRecords.findIndex(r => r.id === recordId);
      if (idx !== -1) {
        state.maintenanceRecords[idx] = {
          ...state.maintenanceRecords[idx],
          date: document.getElementById("maintDate").value,
          odometer: Number(document.getElementById("maintOdometer").value),
          item: document.getElementById("maintItem").value.trim(),
          partsCost: Number(document.getElementById("maintPartsCost").value) || 0,
          laborCost: Number(document.getElementById("maintLaborCost").value) || 0,
          notes: document.getElementById("maintNotes").value.trim()
        };
      }
    } else if (type === "expense") {
      const idx = state.otherExpenses.findIndex(r => r.id === recordId);
      if (idx !== -1) {
        state.otherExpenses[idx] = {
          ...state.otherExpenses[idx],
          date: document.getElementById("expDate").value,
          category: document.getElementById("expCategory").value,
          amount: Number(document.getElementById("expAmount").value),
          notes: document.getElementById("expNotes").value.trim()
        };
      }
    }
  }

  saveState();
  closeRecordModal();
});

// 刪除記錄
function deleteRecord(type, id) {
  if (!confirm("確定要刪除此筆記錄嗎？")) return;

  if (type === "fuel") {
    state.fuelRecords = state.fuelRecords.filter(r => r.id !== id);
  } else if (type === "maintenance") {
    state.maintenanceRecords = state.maintenanceRecords.filter(r => r.id !== id);
  } else if (type === "expense") {
    state.otherExpenses = state.otherExpenses.filter(r => r.id !== id);
  }

  saveState();
}


// --- B. 車輛管理 (Vehicles) ---
function openAddVehicleModal() {
  const form = document.getElementById("vehicleForm");
  form.reset();
  
  document.getElementById("vehicleFormAction").value = "add";
  document.getElementById("vehicleFormId").value = "";
  document.getElementById("vehicleModalTitle").innerText = "新增管理車輛";
  
  document.getElementById("vInitOdo").value = "0";
  document.getElementById("vPurchaseDate").value = new Date().toISOString().split("T")[0];

  document.getElementById("vehicleModal").classList.remove("hide");
}

function openEditVehicleModal(id) {
  const form = document.getElementById("vehicleForm");
  form.reset();

  const v = state.vehicles.find(item => item.id === id);
  if (!v) return;

  document.getElementById("vehicleFormAction").value = "edit";
  document.getElementById("vehicleFormId").value = id;
  document.getElementById("vehicleModalTitle").innerText = "編輯車輛資訊";

  document.getElementById("vName").value = v.name;
  document.getElementById("vMake").value = v.make || "";
  document.getElementById("vModel").value = v.model || "";
  document.getElementById("vYear").value = v.year || "";
  document.getElementById("vPurchasePrice").value = v.purchasePrice || "";
  document.getElementById("vInitOdo").value = v.initOdometer || 0;
  document.getElementById("vPurchaseDate").value = v.purchaseDate || "";

  document.getElementById("vehicleModal").classList.remove("hide");
}

function closeVehicleModal() {
  document.getElementById("vehicleModal").classList.add("hide");
}

document.getElementById("vehicleForm").addEventListener("submit", (e) => {
  e.preventDefault();
  
  const action = document.getElementById("vehicleFormAction").value;
  const vId = document.getElementById("vehicleFormId").value;

  const vehicleData = {
    name: document.getElementById("vName").value.trim(),
    make: document.getElementById("vMake").value.trim(),
    model: document.getElementById("vModel").value.trim(),
    year: Number(document.getElementById("vYear").value) || null,
    purchasePrice: Number(document.getElementById("vPurchasePrice").value) || 0,
    initOdometer: Number(document.getElementById("vInitOdo").value) || 0,
    purchaseDate: document.getElementById("vPurchaseDate").value
  };

  if (action === "add") {
    const newId = "v-" + Date.now();
    const newVehicle = { id: newId, ...vehicleData };
    state.vehicles.push(newVehicle);
    
    // 如果是第一台車，自動將其設為作用中
    if (state.vehicles.length === 1) {
      state.currentVehicleId = newId;
    }
  } else {
    const idx = state.vehicles.findIndex(v => v.id === vId);
    if (idx !== -1) {
      state.vehicles[idx] = { ...state.vehicles[idx], ...vehicleData };
    }
  }

  saveState();
  updateVehicleDropdowns();
  renderVehiclesList();
  closeVehicleModal();
});

function deleteVehicle(id) {
  if (!confirm("警告！刪除車輛將會一併刪除該車的所有加油、保養與支出記錄。此動作不可逆，確定要刪除嗎？")) return;

  // 1. 刪除該車基本資料
  state.vehicles = state.vehicles.filter(v => v.id !== id);
  // 2. 刪除關聯資料
  state.fuelRecords = state.fuelRecords.filter(r => r.vehicleId !== id);
  state.maintenanceRecords = state.maintenanceRecords.filter(r => r.vehicleId !== id);
  state.otherExpenses = state.otherExpenses.filter(r => r.vehicleId !== id);

  // 3. 若被刪除的車輛是當前作用車，則切換到其餘車輛
  if (state.currentVehicleId === id) {
    if (state.vehicles.length > 0) {
      state.currentVehicleId = state.vehicles[0].id;
    } else {
      state.currentVehicleId = "";
    }
  }

  saveState();
  updateVehicleDropdowns();
  renderVehiclesList();
}


// ==========================================================================
// ⚙️ 系統設定頁面事件 (Settings Actions)
// ==========================================================================

// 儲存 Token
document.getElementById("saveTokenBtn").addEventListener("click", () => {
  const token = document.getElementById("settingsTokenInput").value.trim();
  if (!token) {
    alert("Token 不能為空！");
    return;
  }
  state.settings.accessToken = token;
  saveState(true); // 自動同步到雲端
  saveAuthToken(token); // 更新當前憑證，維持免登入
  alert("訪問 Token 設定已更新！");
});

// 監聽同步商切換
document.getElementById("syncProvider").addEventListener("change", (e) => {
  const provider = e.target.value;
  if (provider === "jsonbin") {
    document.getElementById("sync-jsonbin-fields").classList.remove("hide");
    document.getElementById("sync-github-fields").classList.add("hide");
  } else {
    document.getElementById("sync-jsonbin-fields").classList.add("hide");
    document.getElementById("sync-github-fields").classList.remove("hide");
  }
});

// 儲存雲端同步
document.getElementById("saveSyncBtn").addEventListener("click", () => {
  const provider = document.getElementById("syncProvider").value;
  
  state.settings.sync.provider = provider;
  state.settings.sync.apiKey = document.getElementById("syncApiKey").value.trim();
  state.settings.sync.binId = document.getElementById("syncBinId").value.trim();
  state.settings.sync.githubToken = document.getElementById("syncGithubToken").value.trim();
  state.settings.sync.gistId = document.getElementById("syncGistId").value.trim();
  
  saveState(false); // 不觸發自動同步
  alert("同步金鑰配置已儲存！");
});

// 手動強制上傳雲端
document.getElementById("cloudUploadBtn").addEventListener("click", async () => {
  const syncConf = state.settings.sync;
  const provider = syncConf.provider || "jsonbin";
  
  if (provider === "jsonbin") {
    if (!syncConf.apiKey || !syncConf.binId) {
      alert("請先填寫 API Key 與 Bin ID！");
      return;
    }
  } else {
    if (!syncConf.githubToken || !syncConf.gistId) {
      alert("請先填寫 GitHub Token 與 Gist ID！");
      return;
    }
  }
  
  if (confirm("這將會用本機當前資料，覆蓋雲端的備份檔案。確定要同步上傳嗎？")) {
    updateSyncIndicator("yellow", "強制同步上傳中...");
    try {
      let response;
      if (provider === "jsonbin") {
        response = await fetch(`https://api.jsonbin.io/v3/b/${syncConf.binId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Master-Key": syncConf.apiKey
          },
          body: JSON.stringify(state)
        });
      } else {
        response = await fetch(`https://api.github.com/gists/${syncConf.gistId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `token ${syncConf.githubToken}`
          },
          body: JSON.stringify({
            files: {
              "carcare_data.json": {
                content: JSON.stringify(state, null, 2)
              }
            }
          })
        });
      }

      if (response.ok) {
        updateSyncIndicator("green", "手動雲端備份成功！");
        alert("資料已成功上傳覆蓋雲端！");
      } else {
        throw new Error(`代碼: ${response.status}`);
      }
    } catch (err) {
      alert("同步失敗，請檢查網路連線或金鑰配置。");
      updateSyncIndicator("red", "手動同步失敗");
    }
  }
});

// 手動強制下載雲端
document.getElementById("cloudDownloadBtn").addEventListener("click", async () => {
  const syncConf = state.settings.sync;
  const provider = syncConf.provider || "jsonbin";

  if (provider === "jsonbin") {
    if (!syncConf.apiKey || !syncConf.binId) {
      alert("請先填寫 API Key 與 Bin ID！");
      return;
    }
  } else {
    if (!syncConf.githubToken || !syncConf.gistId) {
      alert("請先填寫 GitHub Token 與 Gist ID！");
      return;
    }
  }

  if (confirm("注意！這將會下載雲端檔案，覆蓋目前本機瀏覽器的所有資料。確定要執行嗎？")) {
    updateSyncIndicator("yellow", "強制下載覆蓋中...");
    try {
      let response;
      let cloudState = null;

      if (provider === "jsonbin") {
        response = await fetch(`https://api.jsonbin.io/v3/b/${syncConf.binId}/latest`, {
          method: "GET",
          headers: {
            "X-Master-Key": syncConf.apiKey
          }
        });
        if (response.ok) {
          const resData = await response.json();
          cloudState = resData.record;
        }
      } else {
        response = await fetch(`https://api.github.com/gists/${syncConf.gistId}`, {
          method: "GET",
          headers: {
            "Authorization": `token ${syncConf.githubToken}`
          }
        });
        if (response.ok) {
          const resData = await response.json();
          const fileObj = resData.files["carcare_data.json"];
          if (fileObj && fileObj.content) {
            cloudState = JSON.parse(fileObj.content);
          }
        }
      }

      if (response.ok && cloudState && cloudState.settings) {
        state = cloudState;
        localStorage.setItem("car_care_tco_state", JSON.stringify(state));
        updateVehicleDropdowns();
        updateUI();
        updateSyncIndicator("green", "手動下載成功");
        alert("雲端資料已完美下載並復原！");
      } else {
        throw new Error(`代碼: ${response.status}`);
      }
    } catch (err) {
      alert("下載失敗，請檢查網路連線或金鑰配置。");
      updateSyncIndicator("red", "下載失敗");
    }
  }
});

// 匯出 JSON 備份檔
document.getElementById("exportBackupBtn").addEventListener("click", () => {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `carcare_tco_backup_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// 匯入 JSON 備份檔
document.getElementById("importBackupFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const imported = JSON.parse(evt.target.result);
      if (imported.settings && imported.vehicles) {
        state = imported;
        saveState(true); // 保存並同步至雲端
        updateVehicleDropdowns();
        updateUI();
        alert("JSON 備份資料已順利匯入並生效！");
      } else {
        alert("匯入失敗：此 JSON 檔案結構不正確！");
      }
    } catch (err) {
      alert("解析 JSON 檔案失敗！");
    }
  };
  reader.readAsText(file);
});

// 清空本機所有資料
document.getElementById("clearAllDataBtn").addEventListener("click", () => {
  if (confirm("⚠️ 警告！這會清空本機瀏覽器的所有資料，且無法還原。確定要執行嗎？")) {
    localStorage.removeItem("car_care_tco_state");
    localStorage.removeItem("car_care_auth_token");
    document.cookie = "car_care_auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    alert("本機資料已全部清除，頁面即將重整！");
    location.reload();
  }
});


// ==========================================================================
// 📱 導覽與事件綁定 (Routing & DOM Events Module)
// ==========================================================================
function switchPage(pageId) {
  // 1. 隱藏所有分頁區塊
  document.querySelectorAll(".page-section").forEach(sec => sec.classList.add("hide"));
  // 2. 顯示指定分頁
  document.getElementById(`page-${pageId}`).classList.remove("hide");

  // 3. 更新側邊欄 active 狀態
  document.querySelectorAll(".sidebar-nav li").forEach(li => {
    if (li.getAttribute("data-page") === pageId) {
      li.classList.add("active");
    } else {
      li.classList.remove("active");
    }
  });

  // 4. 手機端切換分頁後，自動收合側邊欄
  closeMobileSidebar();

  // 5. 若是切換至車輛管理，觸發渲染車輛列表
  if (pageId === "vehicles") {
    renderVehiclesList();
  }
}

function setupEventListeners() {
  // 側邊欄分頁點擊事件
  document.querySelectorAll(".sidebar-nav li").forEach(li => {
    li.addEventListener("click", (e) => {
      e.preventDefault();
      const page = li.getAttribute("data-page");
      if (page) switchPage(page);
    });
  });

  // 手機漢堡選單控制
  const burger = document.getElementById("mobileMenuToggle");
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const closeBtn = document.getElementById("sidebarCloseBtn");

  if (burger) {
    burger.addEventListener("click", () => {
      sidebar.classList.add("show");
      overlay.classList.add("show");
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeMobileSidebar);
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeMobileSidebar);
  }

  // 手動編輯公告油價事件
  const editCpcBtn = document.getElementById("editCpcBtn");
  if (editCpcBtn) {
    editCpcBtn.addEventListener("click", () => {
      const p92 = prompt("請輸入本週 92 無鉛汽油公告價：", window.cpcPrices?.["92"] || "29.5");
      if (p92 === null) return;
      const p95 = prompt("請輸入本週 95 無鉛汽油公告價：", window.cpcPrices?.["95"] || "31.0");
      if (p95 === null) return;
      const p98 = prompt("請輸入本週 98 無鉛汽油公告價：", window.cpcPrices?.["98"] || "33.0");
      if (p98 === null) return;
      const pdiesel = prompt("請輸入本週超級柴油公告價：", window.cpcPrices?.["diesel"] || "27.1");
      if (pdiesel === null) return;

      const manualPrices = {
        "92": parseFloat(p92) || 0,
        "95": parseFloat(p95) || 0,
        "98": parseFloat(p98) || 0,
        "diesel": parseFloat(pdiesel) || 0,
        "date": "手動設定"
      };

      document.getElementById("cpc-92").innerText = "NT$ " + manualPrices["92"];
      document.getElementById("cpc-95").innerText = "NT$ " + manualPrices["95"];
      document.getElementById("cpc-98").innerText = "NT$ " + manualPrices["98"];
      document.getElementById("cpc-diesel").innerText = "NT$ " + manualPrices["diesel"];
      document.getElementById("cpcPriceDate").innerText = "手動設定";

      window.cpcPrices = manualPrices;
      state.settings.cpcPrices = manualPrices;
      saveState(false); // 儲存快取但不重複上傳雲端
      alert("公告參考油價已成功手動更新！");
    });
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("show");
  if (overlay) overlay.classList.remove("show");
}

// 展開/收合元素用 (保養週期設定面板)
function toggleElement(id) {
  const el = document.getElementById(id);
  const header = el.previousElementSibling;
  const arrow = header.querySelector(".arrow-icon");

  if (el.classList.contains("hide")) {
    el.classList.remove("hide");
    if (arrow) arrow.classList.add("rotate-180");
  } else {
    el.classList.add("hide");
    if (arrow) arrow.classList.remove("rotate-180");
  }
}
