import { useState, useEffect } from 'react';
import { computeDayKeys } from '../utils/todoRows';

// 자정을 넘기거나, 탭을 다시 열었을 때 날짜 기준(오늘/어제/내일/이번 주 끝)을 갱신한다.
export function useDayKeys() {
  const [keys, setKeys] = useState(computeDayKeys);
  useEffect(() => {
    const check = () => setKeys(prev => {
      const next = computeDayKeys();
      return prev.today === next.today ? prev : next;
    });
    const id = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return keys;
}
