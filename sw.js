// 달서아트센터 근무관리 - 알림용 서비스 워커
// 앱이 열려 있을 때 폰 알림창에 뜨도록 하는 용도예요. 캐시는 하지 않아요.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((cs) => {
      if (cs.length) return cs[0].focus();
      return self.clients.openWindow("/");
    })
  );
});
