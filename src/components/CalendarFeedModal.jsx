import { useState } from 'react';

// 외부 캘린더(구글/애플/노션 캘린더 등)에서 구독할 수 있는 ICS 피드 URL 관리 모달.

export default function CalendarFeedModal({ feedUrl, hasToken, loading, onRegenerate, onRevoke, onClose }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('아래 URL을 복사하세요', feedUrl);
    }
  };

  const handleRegenerate = async () => {
    if (hasToken && !window.confirm('URL을 재발급하면 기존 URL로는 더 이상 구독할 수 없습니다. 계속할까요?')) return;
    setBusy(true);
    const ok = await onRegenerate();
    setBusy(false);
    if (!ok) window.alert('URL 발급에 실패했습니다. 잠시 후 다시 시도해주세요.');
  };

  const handleRevoke = async () => {
    if (!window.confirm('구독 URL을 삭제하면 모든 외부 캘린더에서 이 일정을 볼 수 없게 됩니다. 계속할까요?')) return;
    setBusy(true);
    await onRevoke();
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-header">
          <h2>🔗 외부 캘린더 구독</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="modal-form">
          <p className="feed-desc">
            비공개 URL을 발급하면 구글 캘린더, 애플 캘린더, 노션 캘린더 등에서 플로우 일정을 구독할 수 있습니다.
            URL을 아는 사람만 볼 수 있으니 외부에 공유하지 마세요.
          </p>

          {loading ? (
            <p className="feed-desc">불러오는 중…</p>
          ) : hasToken ? (
            <>
              <div className="field-group">
                <label className="field-label">구독 URL</label>
                <div className="feed-url-box">{feedUrl}</div>
              </div>
              <div className="feed-actions">
                <button type="button" className="btn btn--primary" onClick={handleCopy}>
                  {copied ? '✓ 복사됨' : 'URL 복사'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={handleRegenerate} disabled={busy}>재발급</button>
                <button type="button" className="btn btn--danger" onClick={handleRevoke} disabled={busy}>삭제</button>
              </div>
              <div className="field-group">
                <label className="field-label">등록 방법</label>
                <ul className="feed-guide">
                  <li><b>구글 캘린더</b>: 설정 → 캘린더 추가 → URL로 추가에 붙여넣기 (다른 캘린더 앱이 구글 계정을 통해 함께 표시)</li>
                  <li><b>아이폰/맥</b>: 설정 → 캘린더 → 계정 추가 → 기타 → 구독 캘린더 추가</li>
                  <li><b>노션 캘린더</b>: 구글 캘린더에 등록해두면 자동으로 표시</li>
                </ul>
                <p className="feed-note">구글 캘린더는 갱신 주기가 길어(수 시간) 변경사항 반영이 느릴 수 있습니다.</p>
              </div>
            </>
          ) : (
            <div className="feed-actions">
              <button type="button" className="btn btn--primary" onClick={handleRegenerate} disabled={busy}>
                구독 URL 발급
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
