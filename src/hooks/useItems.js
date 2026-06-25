import { useState, useCallback } from 'react';
import { getTimeSlotFromTime } from '../utils/dateUtils';

const INITIAL_ITEMS = [
  { id: 1, type: 'todo', title: 'Corning 서류 정리', date: '2026-06-25', completed: false, priority: 'high', description: '' },
  { id: 2, type: 'education', title: 'DTU 마이크로팹 세미나', date: '2026-06-27', time: '14:00', timeSlot: 'lunch', completed: false, priority: 'medium', description: '나노팹 관련 강연' },
  { id: 3, type: 'schedule', title: '면접 준비', date: '2026-06-26', time: '10:00', timeSlot: 'morning', completed: false, priority: 'high', description: '자기소개 연습' },
  { id: 4, type: 'todo', title: '이력서 업데이트', date: '2026-06-28', completed: true, priority: 'medium', description: '' },
  { id: 5, type: 'education', title: 'React 심화 강의', date: '2026-06-30', time: '20:00', timeSlot: 'evening', completed: false, priority: 'low', description: 'Udemy 강좌' },
  { id: 6, type: 'schedule', title: '팀 회의', date: '2026-07-01', time: '13:00', timeSlot: 'lunch', completed: false, priority: 'medium', description: '주간 싱크' },
  { id: 7, type: 'todo', title: '독서 — 딥워크', date: '2026-06-29', completed: false, priority: 'low', description: '3장까지' },
];

let nextId = INITIAL_ITEMS.length + 1;

export function useItems() {
  const [items, setItems] = useState(INITIAL_ITEMS);

  const addItem = useCallback((data) => {
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : 'morning');
    setItems(prev => [...prev, { ...data, id: nextId++, timeSlot: slot, completed: data.completed ?? false }]);
  }, []);

  const updateItem = useCallback((id, data) => {
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : undefined);
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...data, ...(slot ? { timeSlot: slot } : {}) } : item
    ));
  }, []);

  const deleteItem = useCallback((id) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const toggleComplete = useCallback((id) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  }, []);

  const moveItem = useCallback((id, newDate, newTimeSlot) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, date: newDate, timeSlot: newTimeSlot } : item
    ));
  }, []);

  const getItemsForDate = useCallback((dateStr) =>
    items.filter(item => item.date === dateStr), [items]);

  const getItemsForCell = useCallback((dateStr, slot) =>
    items.filter(item => item.date === dateStr && item.timeSlot === slot), [items]);

  return { items, addItem, updateItem, deleteItem, toggleComplete, moveItem, getItemsForDate, getItemsForCell };
}
