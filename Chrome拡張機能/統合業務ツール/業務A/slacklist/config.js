const SLACK_CONFIG = {
    // Slack Bot/User Token
    API_TOKEN: 'xoxb-xxxx-xxxx-xxxx',
    
    // SlackリストのID
    LIST_ID: 'F0xxxxxxxxx',
    
    // リストのURL（通知メッセージに含めるリンク用）
    LIST_URL: 'https://app.slack.com/lists/Txxxxxx/Fxxxxxxxx',
    
    // リストの各カラムID
    COLUMN_IDS: {
        NOTES: 'field_xxxxx',      // 備考（rich_text型）
        LINK: 'field_xxxxx',       // リンク（link型）
        CATEGORY: 'field_xxxxx',   // カテゴリ（select型）
        REQUESTOR: 'field_xxxxx',  // 依頼者（user型）
    },
    
    // カテゴリ選択肢
    CATEGORIES: [
        { value: '', name: '-- 選択してください --' },
        { value: 'option_id_1', name: 'エスカレーション' },
        { value: 'option_id_2', name: '優先対応依頼' },
        { value: 'option_id_3', name: 'アカウント削除依頼' },
        // ...
    ],
    
    // 依頼者選択肢（SlackユーザーID）
    REQUESTOR_OPTIONS: [
        { value: '', name: '-- 選択してください --' },
        { value: 'U01XXXXXX', name: '田中太郎' },
        { value: 'U02XXXXXX', name: '鈴木花子' },
        // ...
    ],
    
    // チャンネル通知設定（オプション）
    NOTIFICATION: {
        CHANNEL_ID: 'C0xxxxxxxxx',           // 通知先チャンネル
        MENTION_USER_IDS: ['U01XXXXX'],      // メンションするユーザー
        USER_GROUP_ID: 'S0xxxxxxxxx',        // cc:するユーザーグループ
    }
};