// 제목 속 http(s) 주소를 눌러서 열 수 있는 링크로 바꾼다 (새 탭).
// 보이는 글자는 'https://www.' 를 떼서 짧게 — 주소 전체는 title(마우스 올림)로 본다.
// 링크를 눌렀을 땐 제목 편집·항목 열기가 같이 일어나지 않게 클릭을 여기서 멈춘다.
const URL_RE = /(https?:\/\/[^\s]+)/g;
const HAS_URL = /https?:\/\//;

export function linkify(text) {
  if (!text || !HAS_URL.test(text)) return text;
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    const label = part.replace(/^https?:\/\/(www\.)?/, '');
    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="title-link"
        title={part}
        onClick={e => e.stopPropagation()}
      >
        {label}
      </a>
    );
  });
}
