# Kesto Engine

Kesto Engine 是一個專為 Kesto 謎題（Kesto Puzzles）設計的靜態網頁端求解引擎與關卡工具。本專案完全以純前端架構運作，使用者可在瀏覽器中輸入、編輯及匯入謎題關卡，並透過本地演算法搜尋最佳解答。

- **線上直接使用**：[GitHub Pages 網頁版](https://wangicheng.github.io/kesto-engine/)

## 主要特色

- **本地端搜尋運算**：所有狀態探索與解題計算均在用戶端瀏覽器執行，無須傳送資料至後端伺服器。
- **高效雙向搜尋演算法**：採用 **Dual 32-bit SMI Parallel Bitboard** 並行滑行與**雙向廣度優先搜尋 (Bidirectional BFS)**，結合一維展平預查表 (`reverseLineTable`) 與連續 TypedArray 節點歷程管理 (`StateHistory`)，具備高達 700+ 萬 transitions/sec 吞吐量與零 GC 記憶體配置。
- **流暢非阻塞 UI**：採用 200ms (5 FPS) 非同步時間切片機制 (Async Time-slicing)，搜尋期間能維持網頁介面即時數據（搜尋時間、擴展節點數）的流暢更新。
- **互動式關卡編輯器**：提供網頁畫布編輯介面，支援繪製牆壁、箱子與目標點，並內建範例關卡供快速測試。
- **解題過程視覺化**：支援搜尋結果的路徑展示、分步動畫推演與搜尋效能指標統計（擴展節點數、造訪狀態數、執行時間等）。

## 技術架構與模組

- **前端與建置工具**：TypeScript, Vite
- **核心搜尋引擎 (`src/engine/`)**：
  - `solver.ts`：雙向 BFS 搜尋求解器主邏輯，負責正反向雙向狀態擴展、無物件累積的路徑重建與非同步 UI 時間切片調度。
  - `transition.ts`：內聯 (Inline) 32 位元 SMI 位元運算滑行與零配置 `moveStepBitboardFast` 狀態轉移引擎。
  - `reverseLineTable.ts`：8-Line 反向狀態擴展預查表與一維展平 Uint32Array Lookup Table。
  - `flatVisitedMap.ts`：開放定址法 TypedArray Visited Hash Map，將狀態位圖直接對映至 `StateHistory` 的整數節點 ID。
  - `bitboard.ts`：64 位元 Bitboard 靜態障礙物碰撞與座標轉換。
  - `heuristic.ts` / `priorityQueue.ts`：啟發式估計與優先佇列工具。
- **獨立測試套件 (`src/tests/`)**：
  - `testLevels.ts`：集中管理所有測試關卡（與網頁版 `presets.ts` 隔離）。
  - `benchmark.ts`：搜尋吞吐量與效能基準測試。
  - `test_k16.ts`：16 箱高難度記憶體與 GC 壓力測試。
  - `test_mismatched_counts.ts`：箱子與目標數不一致之邊界條件測試。

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
- `npm run test`：執行完整邊界條件測試與 1,240 萬節點 (k=16) 高難度記憶體壓測。
- `npm run benchmark`：執行 9 大基準關卡之搜尋引擎吞吐量與效能測試（> 700 萬 transitions/sec）。

## 專案結構

```
kesto-engine/
├── index.html            # 網頁應用程式入口頁面
├── src/
│   ├── engine/           # 核心求解器與演算法邏輯
│   │   ├── bitboard.ts         # 位圖轉換與運算
│   │   ├── flatVisitedMap.ts   # TypedArray 狀態造訪表
│   │   ├── heuristic.ts        # 啟發式估計函數
│   │   ├── priorityQueue.ts    # 優先佇列
│   │   ├── reverseLineTable.ts # 反向狀態預查表與線路 bitboard 展平
│   │   ├── solver.ts           # 雙向 BFS 搜尋核心與時間切片調度
│   │   ├── transition.ts       # 內聯 32 位元 SMI 位元運算滑行引擎
│   │   └── types.ts            # 型別定義
│   ├── tests/            # 獨立測試與效能基準測試套件
│   │   ├── benchmark.ts        # 效能與吞吐量基準測試
│   │   ├── test_k16.ts         # 16 箱高難度記憶體壓測
│   │   ├── test_mismatched_counts.ts # 邊界測試
│   │   └── testLevels.ts       # 集中化測試關卡庫
│   ├── ui/               # 畫布與介面控制邏輯
│   │   ├── boardView.ts        # 棋盤渲染與編輯互動
│   │   └── controls.ts         # 操作面板與事件處理
│   ├── main.ts           # 應用程式初始化入口
│   └── presets.ts        # 預設網頁展示關卡資料 (SAMPLE_LEVELS)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 授權條款

本專案採用 [MIT License](LICENSE) 授權。
