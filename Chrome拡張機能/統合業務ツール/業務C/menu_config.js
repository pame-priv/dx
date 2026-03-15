export const menuConfig = {
    businessName: "業務C",
    items: [
      {
            type: "menu",
            id: "knowledge",
            name: "knowledge",
            path: "業務C/knowledge/knowledge.html"
      },
      {
        type: "menu",
        id: "knowledge-editor",
        name: "ナレッジエディター",
        path: "業務C/ナレッジエディター/knowledge-editor.html"
      },
      {
        type: "menu",
        id: "menu1",
        name: "単独メニュー1",
        path: "業務C/menu1/menu1.html"
      },
      {
        type: "accordion",
        name: "アコーディオン1",
        menus: [
          { id: "menu2", name: "メニュー2", path: "業務C/アコーディオン1/menu2/menu2.html" },
          { id: "menu3", name: "メニュー3", path: "業務C/アコーディオン1/menu3/menu3.html" }
        ]
      }
    ]
  };