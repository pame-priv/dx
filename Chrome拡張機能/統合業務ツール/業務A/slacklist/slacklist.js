// slacklist.js - initial_fields対応版

(function() {

    if (typeof SLACK_CONFIG === 'undefined') {
        console.error('config.js が読み込まれていません。');
        const statusEl = document.getElementById('sl-status-message');
        if (statusEl) {
            statusEl.textContent = 'エラー: config.js が見つかりません。';
        }
        return;
    }

    const fetchUrlBtn = document.getElementById('sl-fetch-url-btn');
    const urlDisplay = document.getElementById('sl-url-display');
    const titleInput = document.getElementById('sl-title-input');
    const categorySelect = document.getElementById('sl-category-select'); 
    const requestorSelect = document.getElementById('sl-requestor-select');
    const addToSlackBtn = document.getElementById('sl-add-to-slack-btn');
    const statusMessage = document.getElementById('sl-status-message');

    function initializeSlackAdder() {
        if (!SLACK_CONFIG || !SLACK_CONFIG.COLUMN_IDS) {
            console.error('config.js の SLACK_CONFIG 構造が正しくありません。');
            if (statusMessage) {
                statusMessage.textContent = 'エラー: config.js の設定が不完全です。';
            }
            return;
        }

        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('modal') === 'true') {
                const headerElement = document.querySelector('.header');
                if (headerElement) {
                    headerElement.style.display = 'none';
                }
            }
        } catch (e) {
            console.error('モーダルヘッダー非表示処理でエラー:', e);
        }

        // カテゴリと依頼者の初期化（存在する場合のみ）
        if (SLACK_CONFIG.CATEGORIES && categorySelect) {
            try {
                SLACK_CONFIG.CATEGORIES.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.value;
                    option.textContent = category.name;
                    categorySelect.appendChild(option);
                });
            } catch (e) {
                console.error("カテゴリの初期化に失敗:", e);
            }
        }

        if (SLACK_CONFIG.REQUESTOR_OPTIONS && requestorSelect) {
            try {
                SLACK_CONFIG.REQUESTOR_OPTIONS.forEach(requestor => {
                    const option = document.createElement('option');
                    option.value = requestor.value;
                    option.textContent = requestor.name;
                    requestorSelect.appendChild(option);
                });
            } catch (e) {
                console.error("依頼者プルダウンの初期化に失敗:", e);
            }
        }

        if (fetchUrlBtn) {
            fetchUrlBtn.addEventListener('click', handleFetchUrl);
        }
        if (addToSlackBtn) {
            addToSlackBtn.addEventListener('click', handleAddToSlack);
        }
        
        // 前回選択した依頼者をストレージから読み込み
        if (requestorSelect && typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['lastRequestor'], function(result) {
                if (result.lastRequestor) {
                    requestorSelect.value = result.lastRequestor;
                }
            });
        }
    }

    async function handleFetchUrl() {
        if (!urlDisplay) return;

        if (typeof chrome !== 'undefined' && chrome.tabs) {
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const currentTab = tabs[0];
                
                if (currentTab) {
                    urlDisplay.value = currentTab.url;
                } else {
                    urlDisplay.value = 'エラー: アクティブなタブが見つかりません。';
                }
            } catch (error) {
                console.error('タブ情報の取得エラー:', error);
                urlDisplay.value = `エラー: ${error.message}`;
            }
        } else {
            console.warn('chrome.tabs API が利用できません。テストモードで実行します。');
            urlDisplay.value = 'https://test.example.com/page/123';
        }
    }
    
    async function handleAddToSlack() {
        if (!validateInputs()) {
            return;
        }

        const notesValue = titleInput ? titleInput.value : '';
        const linkUrl = urlDisplay ? urlDisplay.value : '';
        const categoryId = categorySelect ? categorySelect.value : '';
        const requestorId = requestorSelect ? requestorSelect.value : '';

        const { API_TOKEN, LIST_ID, COLUMN_IDS } = SLACK_CONFIG;

        // initial_fields配列を構築
        const initialFields = [];

        // 1. 備考 (NOTES) - rich_text形式
        if (COLUMN_IDS.NOTES) {
            // 備考が空の場合は「備考なし」
            const textValue = notesValue || '備考なし';
            
            initialFields.push({
                column_id: COLUMN_IDS.NOTES,
                rich_text: [
                    {
                        type: "rich_text",
                        elements: [
                            {
                                type: "rich_text_section",
                                elements: [
                                    {
                                        type: "text",
                                        text: textValue
                                    }
                                ]
                            }
                        ]
                    }
                ]
            });
        }

        // 2. リンク (Link型) - 存在する場合
        if (COLUMN_IDS.LINK && linkUrl) {
            initialFields.push({
                column_id: COLUMN_IDS.LINK,
                link: [
                    {
                        original_url: linkUrl
                    }
                ]
            });
        }

        // 3. カテゴリ (Select型) - 存在する場合
        if (COLUMN_IDS.CATEGORY && categoryId) {
            initialFields.push({
                column_id: COLUMN_IDS.CATEGORY,
                select: [categoryId]
            });
        }

        // 4. 依頼者 (User型) - 存在する場合
        if (COLUMN_IDS.REQUESTOR && requestorId) {
            initialFields.push({
                column_id: COLUMN_IDS.REQUESTOR,
                user: [requestorId]
            });
        }

        const payload = {
            list_id: LIST_ID,
            initial_fields: initialFields
        };

        // UIをローディング状態に
        if (addToSlackBtn) {
            addToSlackBtn.disabled = true;
            addToSlackBtn.textContent = '追加中...';
        }
        if (statusMessage) {
            statusMessage.textContent = ''; 
            statusMessage.style.color = '#333'; 
        }

        try {
            const response = await fetch('https://slack.com/api/slackLists.items.create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Authorization': `Bearer ${API_TOKEN}`
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.ok) {
                // Slackチャンネルに通知を送信
                await sendNotificationToChannel(notesValue, linkUrl, categoryId, requestorId);
                
                if (statusMessage) {
                    statusMessage.style.color = '#007a5a';
                    statusMessage.textContent = '✅ 正常にリストへ追加しました！';
                }
                
                // 依頼者をストレージに保存
                if (requestorId && typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.set({ lastRequestor: requestorId });
                }
                
                // フォームをリセット
                if (titleInput) titleInput.value = '';
                if (urlDisplay) urlDisplay.value = '';
                if (categorySelect) categorySelect.selectedIndex = 0;
                // 依頼者は保存するのでリセットしない
                
            } else {
                if (statusMessage) {
                    statusMessage.style.color = '#d32f2f';
                    let errorMessage = `❌ APIエラー: ${result.error}`;
                    
                    if (result.errors) {
                        const errorDetails = JSON.stringify(result.errors, null, 2);
                        errorMessage += `\n\n詳細: ${errorDetails}`;
                    }
                    
                    statusMessage.textContent = errorMessage;
                }
            }

        } catch (error) {
            if (statusMessage) {
                statusMessage.style.color = '#d32f2f';
                statusMessage.textContent = `❌ 通信エラー: ${error.message}`;
            }
        } finally {
            if (addToSlackBtn) {
                addToSlackBtn.disabled = false;
                addToSlackBtn.textContent = 'Slackリストに追加';
            }
        }
    }

    async function sendNotificationToChannel(notesValue, linkUrl, categoryId, requestorId) {
        // 通知設定が存在しない場合はスキップ
        if (!SLACK_CONFIG.NOTIFICATION || !SLACK_CONFIG.NOTIFICATION.CHANNEL_ID) {
            console.log('通知設定がないため、通知をスキップします');
            return;
        }

        const { API_TOKEN } = SLACK_CONFIG;
        const { CHANNEL_ID, MENTION_USER_IDS, USER_GROUP_ID } = SLACK_CONFIG.NOTIFICATION;

        // メンション文字列を構築
        let mentions = '';
        if (MENTION_USER_IDS && MENTION_USER_IDS.length > 0) {
            mentions = MENTION_USER_IDS.map(userId => `<@${userId}>`).join(' ');
        }

        // cc: でユーザーグループをメンション
        let ccMention = '';
        if (USER_GROUP_ID) {
            ccMention = `\ncc: <!subteam^${USER_GROUP_ID}>`;
        }

        // カテゴリ名を取得
        const categoryName = SLACK_CONFIG.CATEGORIES.find(cat => cat.value === categoryId)?.name || 'カテゴリ不明';
        
        // 依頼者名を取得
        const requestorName = SLACK_CONFIG.REQUESTOR_OPTIONS.find(req => req.value === requestorId)?.name || '依頼者不明';

        // SlackリストへのリンクURL (configから取得)
        const listUrl = SLACK_CONFIG.LIST_URL || '';

        // メッセージを構築
        let messageText = `${mentions}${ccMention}
新しいアイテムがSlackリストに追加されました！

*備考:* ${notesValue || '備考なし'}
*リンク:* ${linkUrl}
*カテゴリ:* ${categoryName}
*依頼者:* ${requestorName}`;

        // リストURLが設定されている場合のみリンクを追加
        if (listUrl) {
            messageText += `\n\n📋 <${listUrl}|Slackリストを開く>`;
        }

        const payload = {
            channel: CHANNEL_ID,
            text: messageText,
            unfurl_links: false,
            unfurl_media: false
        };

        try {
            const response = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Authorization': `Bearer ${API_TOKEN}`
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!result.ok) {
                console.error('通知送信エラー:', result.error);
            }
        } catch (error) {
            console.error('通知送信時の通信エラー:', error);
        }
    }

    function validateInputs() {
        const linkUrl = urlDisplay ? urlDisplay.value : '';
        const categoryId = categorySelect ? categorySelect.value : '';
        const requestorId = requestorSelect ? requestorSelect.value : '';

        if (statusMessage) {
            statusMessage.style.color = '#d32f2f';
        }

        if (!linkUrl) {
            if (statusMessage) {
                statusMessage.textContent = '「現在のURLを読み込む」ボタンを押してください。';
            }
            return false;
        }
        
        // カテゴリと依頼者は存在する場合のみチェック
        if (categorySelect && !categoryId) {
            if (statusMessage) {
                statusMessage.textContent = '「カテゴリ」を選んでください。';
            }
            return false;
        }
        if (requestorSelect && !requestorId) {
            if (statusMessage) {
                statusMessage.textContent = '「依頼者」を選んでください。';
            }
            return false;
        }

        if (statusMessage) {
            statusMessage.textContent = '';
        }
        return true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSlackAdder);
    } else {
        initializeSlackAdder();
    }

})();