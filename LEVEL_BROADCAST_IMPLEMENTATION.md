# 等級系統播報功能實現

## 概述
已成功實現等級系統的播報功能，支持等級提升、勳章解鎖等事件的群組播報。

## 實現內容

### 1. 播報服務 (broadcastService.js)
創建了專門的播報服務，負責：
- 等級提升播報
- 勳章解鎖播報
- 里程碑播報（預留）
- 完美評價播報（預留）

#### 主要功能：
- `broadcastLevelUp()` - 播報用戶等級提升
- `broadcastBadgeUnlock()` - 播報勳章解鎖
- `testBroadcast()` - 測試播報功能
- 支持自定義模板
- 支持消息置頂（5秒後自動取消）

### 2. 播報模板
默認模板示例：
```
🎉 恭喜升級！🎉

🧑‍🚀 {{user_name}}
⭐ Lv.{{old_level}} → Lv.{{new_level}} {{level_name}}
💎 升級獎勵：{{level_up_points}}積分

繼續努力，成為傳說勇士！💪
```

支持的變量：
- `{{user_name}}` - 用戶名稱
- `{{old_level}}` - 舊等級
- `{{new_level}}` - 新等級
- `{{level_name}}` - 等級名稱
- `{{level_up_points}}` - 升級獎勵積分

### 3. 管理面板集成
- 播報配置管理
- 播報開關控制
- 測試播報功能（已實現）
- 自定義播報模板（預留）

### 4. API端點
- `POST /api/level/broadcast` - 保存播報配置
- `GET /api/level/broadcast` - 獲取播報配置
- `POST /api/level/broadcast/test` - 測試播報

### 5. 數據庫支持
在 `group_configs` 表中：
- `broadcast_config` - 播報配置JSON
- `broadcast_enabled` - 是否啟用播報

## 使用方式

### 1. 啟用播報
在管理面板創建群組配置時，默認啟用播報功能。

### 2. 測試播報
點擊管理面板的"測試播報"按鈕，或運行測試腳本：
```bash
LEVEL_SYSTEM_ENABLED=true node level/scripts/test-broadcast-system.js
```

### 3. 實際使用
當用戶完成評價並升級時，系統會自動觸發播報。

## 配置說明

### 環境變量
- `LEVEL_SYSTEM_ENABLED=true` - 啟用等級系統
- `GROUP_CHAT_ID` - 默認播報群組ID

### 播報目標群組
優先級順序：
1. 數據庫中 `broadcast_enabled=1` 的群組
2. 環境變量 `GROUP_CHAT_ID` 指定的群組
3. 無配置時不播報

## 測試結果
- ✅ 播報服務正常創建
- ✅ 模板渲染正常
- ✅ 群組發送功能正常
- ✅ 消息置頂功能正常
- ✅ API接口正常

## 後續優化
1. 支持自定義播報模板編輯
2. 添加更多播報事件類型
3. 支持播報歷史記錄
4. 添加播報統計功能
5. 支持多語言播報 