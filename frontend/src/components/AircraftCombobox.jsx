import React, { useState, useRef, useEffect } from 'react';

const AIRCRAFT_GROUPS = [
  {
    group: 'Commercial — Airbus',
    items: [
      'A220-100', 'A220-300',
      'A319', 'A319neo',
      'A320', 'A320neo',
      'A321', 'A321neo', 'A321XLR',
      'A300-600', 'A310',
      'A330-200', 'A330-300', 'A330-800neo', 'A330-900neo',
      'A340-200', 'A340-300', 'A340-500', 'A340-600',
      'A350-900', 'A350-1000',
    ],
  },
  {
    group: 'Commercial — Boeing',
    items: [
      '717-200',
      '737-300', '737-400', '737-500',
      '737-700', '737-800', '737-900ER',
      '737 MAX 7', '737 MAX 8', '737 MAX 9', '737 MAX 10',
      '747-400', '747-8',
      '757-200', '757-300',
      '767-200', '767-300', '767-300ER', '767-400ER',
      '777-200', '777-200ER', '777-300ER', '777F', '777X',
      '787-8', '787-9', '787-10',
    ],
  },
  {
    group: 'Commercial — Other',
    items: ['Fokker 70', 'Fokker 100', 'MD-83', 'MD-88', 'MD-90'],
  },
  {
    group: 'Regional Jet',
    items: [
      'CRJ-200', 'CRJ-700', 'CRJ-900', 'CRJ-1000',
      'ERJ-145', 'ERJ-170', 'ERJ-175', 'ERJ-190', 'ERJ-195',
      'E175-E2', 'E190-E2', 'E195-E2',
    ],
  },
  {
    group: 'Regional Turboprop',
    items: [
      'ATR 42-500', 'ATR 42-600',
      'ATR 72-500', 'ATR 72-600',
      'Dash 8 Q200', 'Dash 8 Q300', 'Dash 8 Q400',
      'DHC-6 Twin Otter',
      'EMB 120',
      'L-410',
      'Saab 340', 'Saab 2000',
    ],
  },
  {
    group: 'Business Jet',
    items: [
      'Global 5500', 'Global 6500', 'Global 7500',
      'Learjet 45', 'Learjet 60', 'Learjet 75',
      'Citation Mustang', 'Citation M2',
      'Citation CJ1+', 'Citation CJ2+', 'Citation CJ3+', 'Citation CJ4',
      'Citation Bravo', 'Citation Ultra', 'Citation Encore', 'Citation Excel',
      'Citation XLS+', 'Citation Sovereign+', 'Citation Latitude',
      'Citation Longitude', 'Citation X+',
      'Falcon 2000LX', 'Falcon 50EX', 'Falcon 6X', 'Falcon 7X', 'Falcon 8X', 'Falcon 900LX',
      'G280', 'G450', 'G550', 'G600', 'G650ER', 'G700', 'G800',
      'Hawker 400XP', 'Hawker 800XP', 'Hawker 900XP', 'Hawker 4000',
      'Phenom 100', 'Phenom 300',
      'Legacy 450', 'Legacy 500', 'Legacy 600', 'Legacy 650',
      'HondaJet Elite',
      'PC-24',
      'King Air C90', 'King Air 200', 'King Air 350',
    ],
  },
  {
    group: 'Turboprop / Utility',
    items: [
      'Caravan 208B',
      'TBM 700', 'TBM 850', 'TBM 910', 'TBM 930', 'TBM 940', 'TBM 960',
      'PC-12', 'PC-12/47E', 'PC-12 NGX',
      'M600', 'M600/SLS',
    ],
  },
  {
    group: 'General Aviation',
    items: [
      'Bonanza G36', 'Baron 58',
      '172 Skyhawk', '182 Skylane', '210 Centurion',
      'SR20', 'SR22',
      'DA40', 'DA42', 'DA62',
      'Mooney M20',
      'PA-28 Warrior', 'PA-28 Arrow',
      'PA-34 Seneca', 'PA-44 Seminole',
    ],
  },
  {
    group: 'Helicopter',
    items: [
      'H125', 'H130', 'H135', 'H145', 'H160', 'H175',
      'AS332', 'AS365',
      'Bell 206', 'Bell 407', 'Bell 412', 'Bell 429',
      'AW109', 'AW139', 'AW169', 'AW189',
      'R22', 'R44', 'R66',
      'S-76', 'S-92',
    ],
  },
];

function getVisible(query) {
  const q = query.trim().toLowerCase();
  if (!q) return AIRCRAFT_GROUPS;
  return AIRCRAFT_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((item) => item.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);
}

export default function AircraftCombobox({ value, onChange, inputStyle }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const visible = getVisible(value || '');
  const flatItems = visible.flatMap((g) => g.items);
  const totalOptions = flatItems.length + 1; // +1 for "Other (specify)"

  const select = (item) => {
    onChange(item);
    setOpen(false);
    setHighlighted(-1);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); setHighlighted(0); }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); setHighlighted(-1); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, totalOptions - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < flatItems.length) {
        select(flatItems[highlighted]);
      } else if (highlighted === flatItems.length) {
        // "Other (specify)" — close, keep typed text
        setOpen(false);
        setHighlighted(-1);
      } else {
        setOpen(false);
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) { setOpen(false); setHighlighted(-1); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const baseInput = {
    width: '100%', background: '#1B2B4B', border: '1px solid #243050',
    borderRadius: 8, padding: '11px 12px', color: '#fff', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlighted(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="e.g. B737, A320, C172"
        autoComplete="off"
        style={{ ...baseInput, ...inputStyle }}
      />
      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', zIndex: 1000, top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#0D1E35', border: '1px solid #243050', borderRadius: 8,
            maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {visible.length === 0 && (
            <div style={{ padding: '10px 14px', color: '#4A6080', fontSize: 13, fontStyle: 'italic' }}>
              No match — type to use custom value
            </div>
          )}
          {visible.map((group) =>
            group.items.map((item) => {
              const idx = flatItems.indexOf(item);
              const isHl = highlighted === idx;
              return (
                <React.Fragment key={item}>
                  {group.items[0] === item && (
                    <div style={{
                      padding: '6px 14px 2px',
                      fontSize: 10, fontWeight: 700, color: '#00B4D8',
                      textTransform: 'uppercase', letterSpacing: 0.8,
                      borderTop: flatItems.indexOf(group.items[0]) > 0 ? '1px solid #1E3050' : 'none',
                    }}>
                      {group.group}
                    </div>
                  )}
                  <div
                    data-idx={idx}
                    onMouseDown={() => select(item)}
                    onMouseEnter={() => setHighlighted(idx)}
                    style={{
                      padding: '8px 14px', fontSize: 14, cursor: 'pointer',
                      color: isHl ? '#fff' : '#C8D8E8',
                      background: isHl ? '#1B3560' : 'transparent',
                    }}
                  >
                    {item}
                  </div>
                </React.Fragment>
              );
            })
          )}
          {/* "Other (specify)" always at bottom */}
          <div
            data-idx={flatItems.length}
            onMouseDown={() => { setOpen(false); setHighlighted(-1); }}
            onMouseEnter={() => setHighlighted(flatItems.length)}
            style={{
              padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontStyle: 'italic',
              color: highlighted === flatItems.length ? '#fff' : '#7A8CA0',
              background: highlighted === flatItems.length ? '#1B3560' : 'transparent',
              borderTop: '1px solid #1E3050',
            }}
          >
            Other (specify)
          </div>
        </div>
      )}
    </div>
  );
}
