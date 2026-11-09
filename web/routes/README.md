# 🗺️ 路線庫 (Curated Routes)

這個資料夾用來收納您收集的 `.gpx` 趣味軌跡（GPS Art / 造型跑步路線）。

## 如何新增路線？（極簡化，不用手動填寫參數）

只要把 `.gpx` 檔案放進來，並在 `routes/catalog.js` 加入一行即可，**長度、點數等全部由前端 JS 自動即時計算**！

### 步驟 1：把 `.gpx` 檔案放入此目錄
例如：`routes/cat.gpx`

### 步驟 2：在 `routes/catalog.js` 登記名稱與路徑
打開 `routes/catalog.js`，加入極簡物件：

```javascript
{
  id: "cat",
  name: "台北招財貓",
  file: "routes/cat.gpx"
}
```

> **完全不需要手寫長度、點數、城市或標籤！**
> 網頁開啟或點選時，前端程式會直接解析 GPX 並自動算出：
> * 精準總距離（Haversine 演算法）
> * 原始軌跡點數
> * 簡化後關鍵轉折點（100~130 點）
> * Google Polyline 壓縮碼
