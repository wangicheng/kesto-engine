# Kesto Engine

Kesto Engine 是一個專為 Kesto 謎題（Kesto Puzzles）設計的靜態網頁端求解引擎與關卡工具。本專案完全以純前端架構運作，使用者可在瀏覽器中輸入、編輯及匯入謎題關卡，並透過本地演算法搜尋最佳解答。

- **線上直接使用**：[GitHub Pages 網頁版](https://wangicheng.github.io/kesto-engine/)

## 主要特色

- **本地端搜尋運算**：所有狀態探索與解題計算均在用戶端瀏覽器執行，無須傳送資料至後端伺服器。
- **高效搜尋演算法**：基於 A* 搜尋演算法，結合 64 位元 Bitboard 碰撞檢測與匈牙利演算法（Hungarian Algorithm）啟發式估計，可快速收斂搜尋空間。
- **非阻塞 UI 計算**：採用分批非同步計算機制（Async Batching），搜尋期間能維持網頁介面的流暢回應。
- **互動式關卡編輯器**：提供網頁畫布編輯介面，支援繪製牆壁、箱子與目標點，並內建範例關卡供快速測試。
- **解題過程視覺化**：支援搜尋結果的路徑展示、分步動畫推演與搜尋效能指標統計（擴展節點數、造訪狀態數、執行時間等）。

## 技術架構與模組

- **前端與建置工具**：TypeScript, Vite
- **核心搜尋引擎 (`src/engine/`)**：
  - `solver.ts`：A* 搜尋求解器主邏輯，負責狀態擴展與非同步任務調度。
  - `heuristic.ts`：啟發式估計函數，支援二分圖最佳匹配（Hungarian Algorithm）與全排列曼哈頓距離計算。
  - `bitboard.ts`：64 位元 Bitboard 靜態障礙物碰撞判斷。
  - `transition.ts`：滑動物理與動態狀態轉移模擬。
  - `priorityQueue.ts` / `flatVisitedMap.ts`：自訂 Bucket Priority Queue 與平鋪式狀態紀錄表，優化記憶體配置與存取效率。

## 快速開始

### 環境需求

- Node.js 18.0 或以上版本
- npm 9.0 或以上版本

### 安裝與運行

1. 複製專案庫：
   ```bash
   git clone https://github.com/wangicheng/kesto-engine.git
   cd kesto-engine
   ```

2. 安裝依賴套件：
   ```bash
   npm install
   ```

3. 啟動開發伺服器：
   ```bash
   npm run dev
   ```

4. 開啟瀏覽器訪問 `http://localhost:5173`。

## 可用指令 (Scripts)

- `npm run dev`：啟動 Vite 本地開發伺服器。
- `npm run build`：執行 TypeScript 型別檢查並編譯產出靜態網站至 `dist` 目錄。
- `npm run preview`：預覽編譯後的靜態網頁網站。
- `npm run benchmark`：執行搜尋引擎效能基準測試。

## 專案結構

```
kesto-engine/
├── index.html            # 網頁應用程式入口頁面
├── src/
│   ├── engine/           # 核心求解器與演算法邏輯
│   │   ├── bitboard.ts         # 位圖運算
│   │   ├── flatVisitedMap.ts   # 狀態造訪表
│   │   ├── heuristic.ts        # 啟發式估計函數
│   │   ├── priorityQueue.ts    # 優先佇列
│   │   ├── solver.ts           # A* 搜尋核心
│   │   ├── transition.ts       # 狀態轉移與碰撞模擬
│   │   └── types.ts            # 型別定義
│   ├── ui/               # 畫布與介面控制邏輯
│   │   ├── boardView.ts        # 棋盤渲染與編輯互動
│   │   └── controls.ts         # 操作面板與事件處理
│   ├── benchmark.ts      # 效能測試腳本
│   ├── main.ts           # 應用程式初始化入口
│   └── presets.ts        # 預設關卡資料
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 授權條款

本專案採用 [MIT License](LICENSE) 授權。
