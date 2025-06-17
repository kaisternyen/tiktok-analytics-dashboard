import React from 'react';

const PRESETS = [
  { label: 'D', value: 'D' },
  { label: 'W', value: 'W' },
  { label: 'M', value: 'M' },
  { label: '3M', value: '3M' },
  { label: '1Y', value: '1Y' },
  { label: 'ALL', value: 'ALL' },
];

export type TimelinePreset = 'D' | 'W' | 'M' | '3M' | '1Y' | 'ALL' | 'CUSTOM';

interface TimelineSelectorProps {
  value: TimelinePreset;
  customRange?: [Date | null, Date | null];
  onChange: (preset: TimelinePreset, customRange?: [Date | null, Date | null]) => void;
}

export default function TimelineSelector({ value, customRange, onChange }: TimelineSelectorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {PRESETS.map(preset => (
        <button
          key={preset.value}
          style={{
            padding: '4px 12px',
            borderRadius: 16,
            border: 'none',
            background: value === preset.value ? '#2563eb' : '#f3f4f6',
            color: value === preset.value ? '#fff' : '#111',
            fontWeight: 500,
            cursor: 'pointer',
            marginRight: 4,
            transition: 'background 0.2s',
          }}
          onClick={() => onChange(preset.value as TimelinePreset)}
        >
          {preset.label}
        </button>
      ))}
      <button
        style={{
          padding: '4px 12px',
          borderRadius: 16,
          border: 'none',
          background: value === 'CUSTOM' ? '#2563eb' : '#f3f4f6',
          color: value === 'CUSTOM' ? '#fff' : '#111',
          fontWeight: 500,
          cursor: 'pointer',
          marginRight: 4,
          transition: 'background 0.2s',
        }}
        onClick={() => onChange('CUSTOM')}
      >
        Custom
      </button>
      {value === 'CUSTOM' && (
        <span style={{ marginLeft: 8 }}>
          {/* Placeholder for custom range picker, to be replaced with actual picker */}
          <input
            type="datetime-local"
            value={customRange && customRange[0] ? customRange[0].toISOString().slice(0, 16) : ''}
            onChange={e => {
              const start = e.target.value ? new Date(e.target.value) : null;
              onChange('CUSTOM', [start, customRange ? customRange[1] : null]);
            }}
            style={{ marginRight: 4 }}
          />
          to
          <input
            type="datetime-local"
            value={customRange && customRange[1] ? customRange[1].toISOString().slice(0, 16) : ''}
            onChange={e => {
              const end = e.target.value ? new Date(e.target.value) : null;
              onChange('CUSTOM', [customRange ? customRange[0] : null, end]);
            }}
            style={{ marginLeft: 4 }}
          />
        </span>
      )}
    </div>
  );
} 