export const PROJECT_TYPES = [
  { key: 'education',   label: '교육',    emoji: '🎓', bg: '#DDEEFF', color: '#185FA5', border: '#7DB5E0' },
  { key: 'sponsorship', label: '프로젝트', emoji: '📁', bg: '#E2F0CC', color: '#3B6D11', border: '#8ABF55' },
  { key: 'health',      label: '건강',    emoji: '💪', bg: '#FEF3C7', color: '#92400E', border: '#F59E0B' },
  { key: 'hobby',       label: '취미',    emoji: '🎨', bg: '#F3E8FF', color: '#6B21A8', border: '#C084FC' },
];

export function getProjectType(key) {
  return PROJECT_TYPES.find(t => t.key === key) ?? PROJECT_TYPES[1];
}
