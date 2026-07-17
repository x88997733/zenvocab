# ZenVocab 5.0

手機優先的 AI 英文學習 PWA。

## 功能
- AI 查單字與片語
- 手機拍照掃描書頁
- 自動建立字卡
- 本機單字庫、收藏、搜尋
- Leitner Box 簡易間隔複習
- 語音播放與語音辨識匹配
- JSON 匯入與匯出
- PWA 加入手機主畫面

## 部署到 Vercel
1. 將整個專案上傳 GitHub。
2. 在 Vercel 匯入 Repository。
3. Environment Variables 新增：
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-2.5-flash`
4. Deploy。

## 本機執行
```bash
npm install
npm run dev
```

本機開發若要測試 `/api/gemini`，建議使用 `vercel dev`；單純 `npm run dev` 只會啟動前端。

## 手機安裝
- iPhone Safari：分享 → 加入主畫面
- Android Chrome：選單 → 安裝應用程式

## 注意
語音功能顯示的是瀏覽器「辨識文字與目標文字的匹配度」，不是專業音素或口音評分。
