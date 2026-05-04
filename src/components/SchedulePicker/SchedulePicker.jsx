import { useState, useEffect, useRef } from 'react';
import styles from './SchedulePicker.module.css';

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour   = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const period = hour < 12 ? 'AM' : 'PM';
  const h12    = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return { label: `${h12}:${minute.toString().padStart(2, '0')} ${period}`, hour, minute };
});

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth()    === b.getMonth()
    && a.getDate()     === b.getDate();
}

function startOfDay(d) {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c;
}

// Round a local Date up to the next :00 or :30 boundary
function roundUpToHalf(d) {
  const m = d.getMinutes();
  if (m === 0 || m === 30) return d;
  const copy = new Date(d);
  if (m < 30) { copy.setMinutes(30, 0, 0); }
  else        { copy.setHours(copy.getHours() + 1, 0, 0, 0); }
  return copy;
}

function formatTrigger(date) {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function SchedulePicker({ value, onChange }) {
  const [open,       setOpen]       = useState(false);
  const [viewYear,   setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth,  setViewMonth]  = useState(() => new Date().getMonth());
  const [pendingDay, setPendingDay] = useState(null); // midnight-local Date or null
  const containerRef = useRef(null);
  const timeListRef  = useRef(null);

  const now = new Date();
  // Minimum slot: 30 min from now, rounded up to :00 or :30
  const minDate = roundUpToHalf(new Date(now.getTime() + 30 * 60 * 1000));
  const maxDate = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  function openPicker() {
    const base = value ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setPendingDay(value ? startOfDay(value) : null);
    setOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Scroll selected (or first available) time into view when popup opens or day changes
  useEffect(() => {
    if (!open || !timeListRef.current) return;
    const sel   = timeListRef.current.querySelector('[data-selected="true"]');
    const first = timeListRef.current.querySelector('button:not(:disabled)');
    (sel ?? first)?.scrollIntoView({ block: 'center' });
  }, [open, pendingDay]);

  // Calendar grid
  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const calDays = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function handleDayClick(day) {
    setPendingDay(startOfDay(day));
  }

  function handleTimeClick(slot) {
    const base = pendingDay ?? startOfDay(new Date());
    const d = new Date(base);
    d.setHours(slot.hour, slot.minute, 0, 0);
    if (d < minDate || d > maxDate) return;
    onChange(d);
    setOpen(false);
  }

  function slotDisabled(slot) {
    const base = pendingDay ?? startOfDay(new Date());
    const d = new Date(base);
    d.setHours(slot.hour, slot.minute, 0, 0);
    return d < minDate || d > maxDate;
  }

  function slotSelected(slot) {
    if (!value || !pendingDay) return false;
    return isSameDay(value, pendingDay)
      && value.getHours()   === slot.hour
      && value.getMinutes() === slot.minute;
  }

  function dayDisabled(day) {
    // Day is disabled if its last slot (23:30) is before minDate, or it's past maxDate
    const lastSlot = new Date(day); lastSlot.setHours(23, 30, 0, 0);
    return lastSlot < minDate || startOfDay(day) > startOfDay(maxDate);
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={`${styles.trigger} ${value ? styles.triggerSet : ''}`}
        onClick={openPicker}
      >
        <span className={styles.calIcon}>🗓</span>
        <span>{value ? formatTrigger(value) : 'Schedule (optional)'}</span>
        {value && (
          <span
            role="button"
            className={styles.clearX}
            title="Clear schedule"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
          >✕</span>
        )}
      </button>

      {open && (
        <div className={styles.popup}>

          {/* ── Calendar ── */}
          <div className={styles.cal}>
            <div className={styles.calNav}>
              <button type="button" className={styles.navBtn} onClick={prevMonth}>‹</button>
              <span className={styles.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
              <button type="button" className={styles.navBtn} onClick={nextMonth}>›</button>
            </div>
            <div className={styles.calGrid}>
              {DAY_NAMES.map(d => <div key={d} className={styles.dayName}>{d}</div>)}
              {calDays.map((day, i) => {
                if (!day) return <div key={`e${i}`} />;
                const disabled = dayDisabled(day);
                const selected = pendingDay && isSameDay(day, pendingDay);
                const today    = isSameDay(day, now);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`${styles.day} ${selected ? styles.daySelected : ''} ${today && !selected ? styles.dayToday : ''}`}
                    disabled={disabled}
                    onClick={() => handleDayClick(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Time slots ── */}
          <div className={styles.timeSide}>
            <div className={styles.timeHeader}>Time</div>
            <div className={styles.timeList} ref={timeListRef}>
              {TIME_SLOTS.map(slot => {
                const disabled = slotDisabled(slot);
                const selected = slotSelected(slot);
                return (
                  <button
                    key={slot.label}
                    type="button"
                    data-selected={String(selected)}
                    className={`${styles.timeSlot} ${selected ? styles.timeSlotSelected : ''}`}
                    disabled={disabled}
                    onClick={() => handleTimeClick(slot)}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
