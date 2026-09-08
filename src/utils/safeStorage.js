// localStorage 는 사생활 보호 모드나 브라우저의 '사이트 데이터 차단' 설정에서
// 읽기/쓰기가 아니라 접근 자체가 예외를 던진다.
// 화면 설정값(사이드바 접힘, 패널 폭 등)을 읽다가 앱 전체가 흰 화면이 되는 걸 막는다.
export function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장하지 못해도 화면 동작은 그대로 이어간다 */
  }
}

export function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

// 접두어로 시작하는 키 전부 삭제 (공유 브라우저 정리용)
export function removeStoredByPrefix(...prefixes) {
  try {
    Object.keys(localStorage)
      .filter(k => prefixes.some(p => k.startsWith(p)))
      .forEach(k => localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}
