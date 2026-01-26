/**
 * WebアプリとしてHTMLを配信
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('シフト表')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * メンバーリストを取得(キャッシュ使用)
 */
function getMemberList() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('memberList');
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  // キャッシュがなければスプレッドシートから取得
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName('メンバー');
  const memberData = memberSheet.getRange('A2:B').getValues().filter(row => row[0] && row[1]);
  
  // 30分キャッシュ
  cache.put('memberList', JSON.stringify(memberData), 1800);
  
  return memberData;
}

/**
 * メンバーリストのキャッシュをクリア
 */
function clearMemberCache() {
  CacheService.getScriptCache().remove('memberList');
}

/**
 * キャッシュからシフトデータを取得(高速)
 * @param {string} startDateStr - 開始日 (YYYY-MM-DD形式)
 * @return {Object|null} キャッシュされたシフトデータ、なければnull
 */
function getShiftDataFromCache(startDateStr) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'shiftData_' + startDateStr;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  return null;
}

/**
 * APIからシフトデータを取得してキャッシュに保存
 * @param {string} startDateStr - 開始日 (YYYY-MM-DD形式)
 * @return {Object} シフトデータ
 */
function getShiftDataFresh(startDateStr) {
  const data = fetchShiftData(startDateStr);
  
  // キャッシュに保存(30分)
  // サイズが大きい場合はキャッシュしない
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'shiftData_' + startDateStr;
    const dataStr = JSON.stringify(data);
    
    // 90KB以下ならキャッシュ(100KB制限に余裕を持たせる)
    if (dataStr.length < 90000) {
      cache.put(cacheKey, dataStr, 1800);
    } else {
      console.log('データが大きすぎるためキャッシュしません: ' + dataStr.length + ' bytes');
    }
  } catch (e) {
    console.error('キャッシュ保存エラー:', e);
  }
  
  return data;
}

/**
 * シフトデータを取得(内部用)
 * @param {string} startDateStr - 開始日 (YYYY-MM-DD形式)
 * @return {Object} シフトデータ
 */
function fetchShiftData(startDateStr) {
  const startDate = startDateStr ? new Date(startDateStr) : new Date();
  startDate.setHours(0, 0, 0, 0);
  
  // メンバーリスト取得(キャッシュ使用)
  const memberData = getMemberList();
  
  // 5営業日分の日付を取得(土日スキップ、祝日は含む)
  const businessDays = getBusinessDays(startDate, 5);
  
  // 祝日情報を取得
  const holidays = getHolidays(businessDays);
  
  // 各メンバーの予定を取得
  const members = memberData.map(([name, email]) => {
    const events = getMemberEvents(email, businessDays);
    return {
      name: name,
      email: email,
      events: events
    };
  });
  
  return {
    dates: businessDays.map(d => formatDate(d)),
    holidays: holidays,
    members: members
  };
}

/**
 * 開始日から指定した営業日数分の日付を取得(土日スキップ)
 * @param {Date} startDate - 開始日
 * @param {number} count - 営業日数
 * @return {Date[]} 営業日の配列
 */
function getBusinessDays(startDate, count) {
  const days = [];
  const current = new Date(startDate);
  
  while (days.length < count) {
    const dayOfWeek = current.getDay();
    // 土日以外を追加
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

/**
 * 祝日情報を取得
 * @param {Date[]} dates - 日付の配列
 * @return {Object} 日付文字列をキー、祝日名を値とするオブジェクト
 */
function getHolidays(dates) {
  const holidays = {};
  
  try {
    const calendar = CalendarApp.getCalendarById('ja.japanese#holiday@group.v.calendar.google.com');
    if (!calendar) return holidays;
    
    const keywords = ['休日', '祝日', '銀行休業日', '元日'];
    
    const checkText = (text) => {
      if (!text) return false;
      if (text.includes('祭日')) return false;  // 祭日が入っていたら除外
      return keywords.some(keyword => text.includes(keyword));
    };
    
    dates.forEach(date => {
      const events = calendar.getEventsForDay(date);
      
      const holidayEvent = events.find(event => {
        const title = event.getTitle();
        const description = event.getDescription();
        
        // 銀行休業日は無条件で通す
        if (title === '銀行休業日') return true;
        
        return checkText(title) || checkText(description);
      });
      
      if (holidayEvent) {
        holidays[formatDate(date)] = holidayEvent.getTitle();
      }
    });
  } catch (e) {
    console.error('祝日カレンダーの取得に失敗:', e);
  }
  
  return holidays;
}

/**
 * メンバーの予定を取得
 * @param {string} email - メールアドレス
 * @param {Date[]} dates - 日付の配列
 * @return {Object} 日付ごとの予定
 */
function getMemberEvents(email, dates) {
  const events = {};
  
  try {
    // 期間の最初と最後を取得
    const startDate = new Date(dates[0]);
    const endDate = new Date(dates[dates.length - 1]);
    endDate.setDate(endDate.getDate() + 1);
    
    // 1回のAPI呼び出しで全期間の予定を取得
    const response = Calendar.Events.list(email, {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    });
    
    const calendarEvents = response.items || [];
    
    // 各日付ごとに予定を振り分け
    dates.forEach(date => {
      const dateStr = formatDate(date);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // この日の予定をフィルタ
      const dayEvents = calendarEvents.filter(e => {
        if (e.start.date) {
          // 終日予定
          return e.start.date === dateStr;
        } else if (e.start.dateTime) {
          // 時間指定予定
          const eventStart = new Date(e.start.dateTime);
          return eventStart >= date && eventStart < nextDate;
        }
        return false;
      });
      
      // 終日の有給チェック
      const allDayYukyu = dayEvents.find(e => 
        e.start.date && e.summary && e.summary.includes('有給')
      );
      
      if (allDayYukyu) {
        // 有給の場合は専用イベントとして扱う
        events[dateStr] = {
          isOff: false,
          isYukyu: true,
          events: [{
            id: allDayYukyu.id,
            title: '有給',
            start: '09:00',
            end: '18:00',
            htmlLink: allDayYukyu.htmlLink || '',
            myResponseStatus: null
          }]
        };
        return;
      }
      
      // 時間指定の予定を取得(終日予定は有給以外無視)
      const timeEvents = dayEvents
        .filter(e => e.start.dateTime)
        .map(e => {
          const startTime = new Date(e.start.dateTime);
          const endTime = new Date(e.end.dateTime);
          
          // このメンバーの回答ステータスを取得
          let myResponseStatus = null;
          if (e.attendees && e.attendees.length > 0) {
            const myAttendee = e.attendees.find(a => a.email === email);
            if (myAttendee) {
              myResponseStatus = myAttendee.responseStatus;
            }
          }
          
          return {
            id: e.id,
            title: e.summary || '予定あり',
            start: formatTime(startTime),
            end: formatTime(endTime),
            htmlLink: e.htmlLink || '',
            myResponseStatus: myResponseStatus
          };
        });
      
      events[dateStr] = {
        isOff: false,
        isYukyu: false,
        events: timeEvents
      };
    });
  } catch (e) {
    console.error('カレンダー取得エラー (' + email + '):', e);
  }
  
  return events;
}

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 * @param {Date} date
 * @return {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 時刻をHH:MM形式にフォーマット
 * @param {Date} date
 * @return {string}
 */
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * 掲示板の投稿を取得(日付が変わったらリセット)
 * @return {Array} 投稿の配列
 */
function getPosts() {
  const props = PropertiesService.getScriptProperties();
  const data = JSON.parse(props.getProperty('postsData') || '{}');
  
  const today = new Date().toISOString().split('T')[0];
  
  // 日付が違ったらリセット
  if (data.date !== today) {
    props.setProperty('postsData', JSON.stringify({
      date: today,
      posts: []
    }));
    return [];
  }
  
  return data.posts || [];
}

/**
 * 掲示板に投稿を追加
 * @param {string} text - 投稿内容
 * @return {Array} 更新後の投稿配列
 */
function addPost(text) {
  const props = PropertiesService.getScriptProperties();
  const data = JSON.parse(props.getProperty('postsData') || '{}');
  
  const today = new Date().toISOString().split('T')[0];
  
  // 日付が違ったらリセット
  let posts = [];
  if (data.date === today) {
    posts = data.posts || [];
  }
  
  posts.push({
    id: Date.now().toString(),
    text: text,
    timestamp: new Date().toISOString()
  });
  
  props.setProperty('postsData', JSON.stringify({
    date: today,
    posts: posts
  }));
  
  return posts;
}

/**
 * 掲示板の投稿を編集
 * @param {string} id - 投稿ID
 * @param {string} text - 新しい内容
 * @return {Array} 更新後の投稿配列
 */
function editPost(id, text) {
  const props = PropertiesService.getScriptProperties();
  const data = JSON.parse(props.getProperty('postsData') || '{}');
  
  const today = new Date().toISOString().split('T')[0];
  
  // 日付が違ったらリセット
  if (data.date !== today) {
    props.setProperty('postsData', JSON.stringify({
      date: today,
      posts: []
    }));
    return [];
  }
  
  const posts = data.posts || [];
  const index = posts.findIndex(p => p.id === id);
  if (index !== -1) {
    posts[index].text = text;
    posts[index].editedAt = new Date().toISOString();
  }
  
  props.setProperty('postsData', JSON.stringify({
    date: today,
    posts: posts
  }));
  
  return posts;
}

/**
 * 掲示板の投稿を削除
 * @param {string} id - 投稿ID
 * @return {Array} 更新後の投稿配列
 */
function deletePost(id) {
  const props = PropertiesService.getScriptProperties();
  const data = JSON.parse(props.getProperty('postsData') || '{}');
  
  const today = new Date().toISOString().split('T')[0];
  
  // 日付が違ったらリセット
  if (data.date !== today) {
    props.setProperty('postsData', JSON.stringify({
      date: today,
      posts: []
    }));
    return [];
  }
  
  const posts = data.posts || [];
  const filtered = posts.filter(p => p.id !== id);
  
  props.setProperty('postsData', JSON.stringify({
    date: today,
    posts: filtered
  }));
  
  return filtered;
}

/**
 * 掲示板の投稿のピン留めをトグル
 * @param {string} id - 投稿ID
 * @return {Array} 更新後の投稿配列
 */
function togglePinPost(id) {
  const props = PropertiesService.getScriptProperties();
  const data = JSON.parse(props.getProperty('postsData') || '{}');
  
  const today = new Date().toISOString().split('T')[0];
  
  // 日付が違ったらリセット
  if (data.date !== today) {
    props.setProperty('postsData', JSON.stringify({
      date: today,
      posts: []
    }));
    return [];
  }
  
  const posts = data.posts || [];
  const index = posts.findIndex(p => p.id === id);
  if (index !== -1) {
    posts[index].pinned = !posts[index].pinned;
  }
  
  props.setProperty('postsData', JSON.stringify({
    date: today,
    posts: posts
  }));
  
  return posts;
}

function debugEventData() {
  const email = 'あなたのメールアドレス@example.com'; // メンバーシートの1人
  const today = new Date();
  
  const response = Calendar.Events.list(email, {
    timeMin: today.toISOString(),
    timeMax: new Date(today.getTime() + 86400000).toISOString(),
    singleEvents: true,
    maxResults: 10
  });
  
  response.items.forEach(e => {
    Logger.log('予定: ' + e.summary);
    Logger.log('参加者: ' + JSON.stringify(e.attendees));
  });
}


function clearAllCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('memberList');
  
  // 直近の日付のキャッシュもクリア
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = formatDate(d);
    cache.remove('shiftData_' + dateStr);
  }
  
  Logger.log('キャッシュをクリアしました');
}