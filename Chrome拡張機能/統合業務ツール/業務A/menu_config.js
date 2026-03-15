export const menuConfig = {
  businessName: "業務A",
  items: [
    {
      type: "menu",
      id: "knowledge",
      name: "knowledge",
      path: "業務A/knowledge/knowledge.html"
    },
    {
      type: "menu",
      id: "knowledge-editor",
      name: "ナレッジエディター",
      path: "業務A/ナレッジエディター/knowledge-editor.html"
    },
    {
      type: "menu",
      id: "slacklist",
      name: "Slackリスト連携",
      path: "業務A/slacklist/slacklist.html"
    },
    {
      type: "menu",
      id: "menu1",
      name: "ひな型単独メニュー1",
      path: "業務A/menu1/menu1.html"
    },
    {
      type: "accordion",
      name: "ひな型アコーディオン1",
      menus: [
        { id: "menu2", name: "ひな型アコーディオン内単独メニュー2", path: "業務A/アコーディオン1/menu2/menu2.html" },
        { id: "menu3", name: "ひな型アコーディオン内単独メニュー3", path: "業務A/アコーディオン1/menu3/menu3.html" }
      ]
    }
  ]
};