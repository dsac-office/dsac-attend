// 달서아트센터 근무관리 - 알림용 서비스 워커
// 앱이 닫혀 있어도 폰·PC 알림창에 뜨도록 Firebase 메시징을 연결해요. 캐시는 하지 않아요.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyB67jU12eWT9hYaJKT1Trz1y9_8hu2paRs",
  authDomain: "dsac-attend.firebaseapp.com",
  projectId: "dsac-attend",
  storageBucket: "dsac-attend.firebasestorage.app",
  messagingSenderId: "200542275760",
  appId: "1:200542275760:web:8cccf2620525148c15d375"
});
firebase.messaging();
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
