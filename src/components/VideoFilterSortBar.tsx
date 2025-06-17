import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

// Define field types for the videos table
const FIELD_DEFS = [
  { name: 'username', label: 'Username', type: 'text' },
  { name: 'description', label: 'Description', type: 'text' },
  { name: 'status', label: 'Status', type: 'text' },
  { name: 'platform', label: 'Platform', type: 'text' },
  { name: 'currentViews', label: 'Views', type: 'number' },
  { name: 'currentLikes', label: 'Likes', type: 'number' },
  { name: 'currentComments', label: 'Comments', type: 'number' },
  { name: 'currentShares', label: 'Shares', type: 'number' },
  { name: 'createdAt', label: 'Posted', type: 'date' },
  { name: 'lastUpdate', label: 'Last Updated', type: 'date' },
  { name: 'scrapingCadence', label: 'Cadence', type: 'text' },
  { name: 'timeframe', label: 'Timeframe', type: 'datetime' },
];

const OPERATORS = {
  text: [
    { value: 'contains', label: 'contains...' },
    { value: 'does not contain', label: 'does not contain...' },
    { value: 'is', label: 'is...' },
    { value: 'is not', label: 'is not...' },
    { value: 'is empty', label: 'is empty' },
    { value: 'is not empty', label: 'is not empty' },
  ],
  number: [
    { value: '=', label: '=' },
    { value: '≠', label: '≠' },
    { value: '<', label: '<' },
    { value: '≤', label: '≤' },
    { value: '>', label: '>' },
    { value: '≥', label: '≥' },
    { value: 'is empty', label: 'is empty' },
    { value: 'is not empty', label: 'is not empty' },
  ],
  date: [
    { value: 'is', label: 'is...' },
    { value: 'is within', label: 'is within...' },
    { value: 'is before', label: 'is before...' },
    { value: 'is after', label: 'is after...' },
    { value: 'is on or before', label: 'is on or before...' },
    { value: 'is on or after', label: 'is on or after...' },
    { value: 'is not', label: 'is not...' },
    { value: 'is empty', label: 'is empty' },
    { value: 'is not empty', label: 'is not empty' },
  ],
  datetime: [
    { value: 'is on or after', label: 'from...' },
  ],
};

export type FilterOperator = 'AND' | 'OR';
export type FilterCondition = {
  field: string;
  operator: string;
  value: string | number | null | [string, string] | [number, number];
};
export type FilterGroup = {
  operator: FilterOperator;
  conditions: FilterCondition[];
};

export type SortCondition = {
  field: string;
  order: 'asc' | 'desc';
};

interface VideoFilterSortBarProps {
  filters: FilterGroup;
  sorts: SortCondition[];
  onChange: (filters: FilterGroup, sorts: SortCondition[]) => void;
}

// Remove 'timeframe' from FIELD_DEFS for filters
const FILTER_FIELD_DEFS = FIELD_DEFS.filter(f => f.name !== 'timeframe');

// Add type guard for FilterGroup
function isFilterGroup(obj: unknown): obj is FilterGroup {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'operator' in obj &&
    'conditions' in obj &&
    Array.isArray((obj as FilterGroup).conditions)
  );
}

export default function VideoFilterSortBar({ filters, sorts, onChange }: VideoFilterSortBarProps) {
  const [localOperator, setLocalOperator] = useState<FilterOperator>(filters.operator || 'AND');
  const [localFilters, setLocalFilters] = useState<FilterCondition[]>(filters.conditions.filter(f => f.field !== 'timeframe') || []);
  const [localSorts, setLocalSorts] = useState<SortCondition[]>(sorts);
  const [showSnapModal, setShowSnapModal] = useState(false);
  const [pendingSnapIdx, setPendingSnapIdx] = useState<number | null>(null);
  const [pendingSnapValue, setPendingSnapValue] = useState<[string, string] | null>(null);
  const [prevValue, setPrevValue] = useState<[string, string] | null>(null);
  // Extract timeframe filter from filters
  const initialTimeframe = filters.conditions.find(f => f.field === 'timeframe' && Array.isArray(f.value))?.value as [string, string] | undefined;
  const [timeframe, setTimeframe] = useState<[string, string] | undefined>(initialTimeframe);

  // Sync localSorts with parent prop
  useEffect(() => {
    setLocalSorts(sorts);
    console.log('[SortBar] useEffect sync localSorts with parent:', sorts);
  }, [sorts]);

  // Update parent on any change
  useEffect(() => {
    let combinedFilters: FilterGroup;
    const hasTimeframe = timeframe && timeframe[0] && timeframe[1];
    const hasFilters = localFilters.length > 0;
    if (hasTimeframe && hasFilters) {
      combinedFilters = {
        operator: 'AND',
        conditions: [
          { field: 'timeframe', operator: 'is on or after', value: timeframe },
          {
            operator: localOperator,
            conditions: localFilters
          } as unknown as FilterCondition // type cast for backend compatibility
        ]
      };
    } else if (hasTimeframe) {
      combinedFilters = {
        operator: 'AND',
        conditions: [
          { field: 'timeframe', operator: 'is on or after', value: timeframe }
        ]
      };
    } else if (hasFilters) {
      combinedFilters = {
        operator: localOperator,
        conditions: localFilters
      };
    } else {
      combinedFilters = { operator: 'AND', conditions: [] };
    }
    // Remove empty nested group if present
    if (combinedFilters.conditions && combinedFilters.conditions.length === 2) {
      const [first, second] = combinedFilters.conditions;
      if (isFilterGroup(second) && second.conditions.length === 0) {
        combinedFilters.conditions = [first];
      }
    }
    onChange(combinedFilters, localSorts);
    // eslint-disable-next-line
  }, [localFilters, localSorts, localOperator, timeframe]);

  const handleOperatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalOperator(e.target.value as FilterOperator);
    onChange({ operator: e.target.value as FilterOperator, conditions: localFilters }, localSorts);
  };

  const handleFilterChange = (idx: number, key: keyof FilterCondition, value: string | number | null | [string, string] | [number, number]) => {
    const updated = [...localFilters];
    updated[idx] = { ...updated[idx], [key]: value };
    setLocalFilters(updated);
    onChange({ operator: localOperator, conditions: updated }, localSorts);
  };

  const handleAddFilter = () => {
    const updated = [...localFilters, { field: 'username', operator: 'contains', value: '' }];
    setLocalFilters(updated);
    onChange({ operator: localOperator, conditions: updated }, localSorts);
  };

  const handleRemoveFilter = (idx: number) => {
    const updated = localFilters.filter((_, i) => i !== idx);
    setLocalFilters(updated);
    onChange({ operator: localOperator, conditions: updated }, localSorts);
  };

  const handleAddSort = () => {
    const updated = [...localSorts, { field: 'createdAt', order: 'desc' as 'asc' | 'desc' }];
    setLocalSorts(updated);
    console.log('[SortBar] handleAddSort:', updated);
    onChange({ operator: localOperator, conditions: localFilters }, updated);
  };

  const handleRemoveSort = (idx: number) => {
    const updated = localSorts.filter((_, i) => i !== idx) as SortCondition[];
    setLocalSorts(updated);
    console.log('[SortBar] handleRemoveSort:', { idx, updated });
    onChange({ operator: localOperator, conditions: localFilters }, updated);
  };

  const platformOptions = [
    { value: 'tiktok', label: 'TikTok' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'youtube', label: 'YouTube' },
  ];

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-col gap-4">
      {/* Timeframe Bar */}
      <div className="flex flex-col gap-2">
        <span className="font-medium text-gray-700">Timeframe:</span>
        <div className="flex items-center gap-2 mb-2">
          <DatePicker
            selected={timeframe && timeframe[0] ? toZonedTime(new Date(timeframe[0]), 'America/New_York') : null}
            onChange={date => {
              if (!date) return;
              const d = new Date(date);
              d.setMinutes(0, 0, 0);
              const estIso = fromZonedTime(d, 'America/New_York').toISOString();
              setTimeframe([estIso, timeframe && timeframe[1] ? timeframe[1] : '']);
            }}
            showTimeSelect
            showTimeSelectOnly={false}
            timeIntervals={60}
            dateFormat="MMMM d, yyyy h aa"
            timeCaption="Hour"
            placeholderText="Start date/time (EST)"
            className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
            popperPlacement="bottom"
          />
          <span className="mx-1 text-xs">to</span>
          <DatePicker
            selected={timeframe && timeframe[1] ? toZonedTime(new Date(timeframe[1]), 'America/New_York') : null}
            onChange={date => {
              if (!date) return;
              const d = new Date(date);
              d.setMinutes(0, 0, 0);
              const estIso = fromZonedTime(d, 'America/New_York').toISOString();
              setTimeframe([timeframe && timeframe[0] ? timeframe[0] : '', estIso]);
            }}
            showTimeSelect
            showTimeSelectOnly={false}
            timeIntervals={60}
            dateFormat="MMMM d, yyyy h aa"
            timeCaption="Hour"
            placeholderText="End date/time (EST)"
            className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
            popperPlacement="bottom"
          />
          {timeframe && (timeframe[0] || timeframe[1]) && (
            <button
              className="ml-2 text-xs text-gray-400 hover:text-red-500"
              onClick={() => setTimeframe(['', ''])}
              title="Clear timeframe"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {/* Filter Bar */}
      <div className="flex flex-col gap-2">
        <span className="font-medium text-gray-700">Filter:</span>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500">Where</span>
          <select
            className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
            value={localOperator}
            onChange={handleOperatorChange}
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
          <span className="text-xs text-gray-500">of the following conditions:</span>
        </div>
        {localFilters.map((filter, idx) => {
          const fieldDef = FILTER_FIELD_DEFS.find(f => f.name === filter.field) || FILTER_FIELD_DEFS[0];
          const ops = OPERATORS[fieldDef.type as keyof typeof OPERATORS];
          // Single-choice value options
          const isStatus = filter.field === 'status';
          const isCadence = filter.field === 'scrapingCadence';
          const statusOptions = [
            { value: 'Active', label: 'Active' },
            { value: 'Paused', label: 'Paused' },
          ];
          const cadenceOptions = [
            { value: 'hourly', label: 'Hourly' },
            { value: 'daily', label: 'Daily' },
            { value: 'testing', label: 'Testing' },
          ];
          const isPlatform = filter.field === 'platform';
          const isTimeframe = filter.field === 'timeframe';

          // DEBUG: Log filter field definitions
          console.log('FIELD_DEFS at runtime:', FIELD_DEFS);

          return (
            <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded px-2 py-1">
              <select
                className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                value={filter.field}
                onChange={e => handleFilterChange(idx, 'field', e.target.value)}
              >
                {FILTER_FIELD_DEFS.map(f => (
                  <option key={f.name} value={f.name}>{f.label}</option>
                ))}
              </select>
              {/* For timeframe, show static text instead of operator dropdown */}
              {isTimeframe ? (
                <span className="text-xs text-gray-700">from</span>
              ) : (
                <select
                  className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                  value={filter.operator}
                  onChange={e => handleFilterChange(idx, 'operator', e.target.value)}
                >
                  {ops.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              )}
              {/* Value input, varies by type and operator */}
              {filter.operator !== 'is empty' && filter.operator !== 'is not empty' && (
                isStatus ? (
                  <select
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'string' ? filter.value : ''}
                    onChange={e => handleFilterChange(idx, 'value', e.target.value)}
                  >
                    <option value="">Select status</option>
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : isCadence ? (
                  <select
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'string' ? filter.value : ''}
                    onChange={e => handleFilterChange(idx, 'value', e.target.value)}
                  >
                    <option value="">Select cadence</option>
                    {cadenceOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : isPlatform ? (
                  <select
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'string' ? filter.value : ''}
                    onChange={e => handleFilterChange(idx, 'value', e.target.value)}
                  >
                    <option value="">Select platform</option>
                    {platformOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : fieldDef.type === 'date' && filter.operator === 'is within' ? (
                  <>
                    <input
                      type="date"
                      className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                      value={Array.isArray(filter.value) ? (typeof filter.value[0] === 'string' ? filter.value[0].split('T')[0] : '') : ''}
                      onChange={e => {
                        // Start of first day
                        const iso = e.target.value ? new Date(e.target.value + 'T00:00:00.000Z').toISOString() : '';
                        handleFilterChange(idx, 'value', [iso, Array.isArray(filter.value) && typeof filter.value[1] === 'string' ? filter.value[1] : '']);
                      }}
                    />
                    <span className="mx-1 text-xs">to</span>
                    <input
                      type="date"
                      className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                      value={Array.isArray(filter.value) ? (typeof filter.value[1] === 'string' ? filter.value[1].split('T')[0] : '') : ''}
                      onChange={e => {
                        // End of second day (set to next day at midnight minus 1ms)
                        const end = e.target.value ? new Date(new Date(e.target.value + 'T00:00:00.000Z').getTime() + 24*60*60*1000 - 1).toISOString() : '';
                        handleFilterChange(idx, 'value', [Array.isArray(filter.value) && typeof filter.value[0] === 'string' ? filter.value[0] : '', end]);
                      }}
                    />
                  </>
                ) : fieldDef.type === 'date' ? (
                  <input
                    type="date"
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'string' ? filter.value.split('T')[0] : ''}
                    onChange={e => {
                      let iso = '';
                      if (e.target.value) {
                        const date = new Date(e.target.value + 'T00:00:00.000Z');
                        switch (filter.operator) {
                          case 'is after':
                            // Next day at midnight
                            iso = new Date(date.getTime() + 24*60*60*1000).toISOString();
                            break;
                          case 'is before':
                            // This day at midnight
                            iso = date.toISOString();
                            break;
                          case 'is on or after':
                          case 'is on or before':
                          case 'is':
                          default:
                            iso = date.toISOString();
                            break;
                        }
                      }
                      handleFilterChange(idx, 'value', iso);
                    }}
                  />
                ) : fieldDef.type === 'number' ? (
                  <input
                    type="number"
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'number' || typeof filter.value === 'string' ? filter.value : ''}
                    onInput={e => {
                      const value = (e.target as HTMLInputElement).value === '' ? null : Number((e.target as HTMLInputElement).value);
                      console.log('Filter input changed:', { idx, value });
                      handleFilterChange(idx, 'value', value);
                    }}
                  />
                ) : isTimeframe ? (
                  <>
                    <DatePicker
                      selected={Array.isArray(filter.value) && filter.value[0] ? toZonedTime(new Date(filter.value[0]), 'America/New_York') : null}
                      onChange={date => {
                        if (!date) return;
                        // Always round to the nearest hour
                        const d = new Date(date);
                        d.setMinutes(0, 0, 0);
                        // Convert to EST ISO string
                        const estIso = fromZonedTime(d, 'America/New_York').toISOString();
                        const end = Array.isArray(filter.value) && typeof filter.value[1] === 'string' ? filter.value[1] : '';
                        const newValue: [string, string] = [estIso, end];
                        // Check if range > 24h and at least one is not 12:00 AM EST
                        if (end) {
                          const startDate = toZonedTime(new Date(estIso), 'America/New_York');
                          const endDate = toZonedTime(new Date(end), 'America/New_York');
                          const isStartMidnight = startDate.getHours() === 0 && startDate.getMinutes() === 0;
                          const isEndMidnight = endDate.getHours() === 0 && endDate.getMinutes() === 0;
                          const rangeMs = Math.abs(new Date(end).getTime() - new Date(estIso).getTime());
                          if (rangeMs > 24*60*60*1000 && (!isStartMidnight || !isEndMidnight)) {
                            setShowSnapModal(true);
                            setPendingSnapIdx(idx);
                            setPendingSnapValue(newValue);
                            setPrevValue([Array.isArray(filter.value) && typeof filter.value[0] === 'string' ? filter.value[0] : '', end]);
                            return;
                          }
                        }
                        handleFilterChange(idx, 'value', newValue);
                      }}
                      showTimeSelect
                      showTimeSelectOnly={false}
                      timeIntervals={60}
                      dateFormat="MMMM d, yyyy h aa"
                      timeCaption="Hour"
                      placeholderText="Start date/time (EST)"
                      className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                      popperPlacement="bottom"
                    />
                    <span className="mx-1 text-xs">to</span>
                    <DatePicker
                      selected={Array.isArray(filter.value) && filter.value[1] ? toZonedTime(new Date(filter.value[1]), 'America/New_York') : null}
                      onChange={date => {
                        if (!date) return;
                        // Always round to the nearest hour
                        const d = new Date(date);
                        d.setMinutes(0, 0, 0);
                        // Convert to EST ISO string
                        const estIso = fromZonedTime(d, 'America/New_York').toISOString();
                        const start = Array.isArray(filter.value) && typeof filter.value[0] === 'string' ? filter.value[0] : '';
                        const newValue: [string, string] = [start, estIso];
                        // Check if range > 24h and at least one is not 12:00 AM EST
                        if (start) {
                          const startDate = toZonedTime(new Date(start), 'America/New_York');
                          const endDate = toZonedTime(new Date(estIso), 'America/New_York');
                          const isStartMidnight = startDate.getHours() === 0 && startDate.getMinutes() === 0;
                          const isEndMidnight = endDate.getHours() === 0 && endDate.getMinutes() === 0;
                          const rangeMs = Math.abs(new Date(estIso).getTime() - new Date(start).getTime());
                          if (rangeMs > 24*60*60*1000 && (!isStartMidnight || !isEndMidnight)) {
                            setShowSnapModal(true);
                            setPendingSnapIdx(idx);
                            setPendingSnapValue(newValue);
                            setPrevValue([start, Array.isArray(filter.value) && typeof filter.value[1] === 'string' ? filter.value[1] : '']);
                            return;
                          }
                        }
                        handleFilterChange(idx, 'value', newValue);
                      }}
                      showTimeSelect
                      showTimeSelectOnly={false}
                      timeIntervals={60}
                      dateFormat="MMMM d, yyyy h aa"
                      timeCaption="Hour"
                      placeholderText="End date/time (EST)"
                      className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                      popperPlacement="bottom"
                    />
                    {/* Snap Modal */}
                    {showSnapModal && pendingSnapIdx === idx && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-10">
                        <div className="bg-white rounded-lg shadow-lg p-6 w-80 flex flex-col items-center">
                          <div className="mb-4 text-center">
                            <div className="font-semibold mb-2">Range exceeds 24 hours</div>
                            <div className="text-sm text-gray-600">Convert to daily? This will snap both dates to 12:00 AM EST.</div>
                          </div>
                          <div className="flex gap-4">
                            <button
                              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                              onClick={() => {
                                // Snap both to 12:00 AM EST (America/New_York)
                                if (pendingSnapValue) {
                                  const toESTMidnight = (dateStr: string) => {
                                    const d = toZonedTime(new Date(dateStr), 'America/New_York');
                                    d.setHours(0, 0, 0, 0);
                                    return fromZonedTime(d, 'America/New_York').toISOString();
                                  };
                                  const start = toESTMidnight(pendingSnapValue[0]);
                                  const end = toESTMidnight(pendingSnapValue[1]);
                                  handleFilterChange(idx, 'value', [start, end]);
                                }
                                setShowSnapModal(false);
                                setPendingSnapIdx(null);
                                setPendingSnapValue(null);
                                setPrevValue(null);
                              }}
                            >
                              Convert to daily
                            </button>
                            <button
                              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                              onClick={() => {
                                // Revert to previous value
                                if (prevValue) {
                                  handleFilterChange(idx, 'value', prevValue);
                                }
                                setShowSnapModal(false);
                                setPendingSnapIdx(null);
                                setPendingSnapValue(null);
                                setPrevValue(null);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'string' ? filter.value : ''}
                    onInput={e => {
                      const value = (e.target as HTMLInputElement).value;
                      console.log('Filter input changed:', { idx, value });
                      handleFilterChange(idx, 'value', value);
                    }}
                  />
                )
              )}
              <button
                className="ml-1 text-xs text-gray-400 hover:text-red-500"
                onClick={() => handleRemoveFilter(idx)}
                title="Remove filter"
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 self-start"
          onClick={handleAddFilter}
        >
          + Add condition
        </button>
      </div>
      {/* Sort Bar */}
      <div className="flex flex-col gap-2">
        <span className="font-medium text-gray-700">Sort:</span>
        {localSorts.map((sort, idx) => {
          const fieldDef = FIELD_DEFS.find(f => f.name === sort.field) || FIELD_DEFS[0];
          let orderOptions = [
            { value: 'asc', label: 'A → Z' },
            { value: 'desc', label: 'Z → A' },
          ];
          if (fieldDef.type === 'number') {
            orderOptions = [
              { value: 'asc', label: 'Lowest to Highest' },
              { value: 'desc', label: 'Highest to Lowest' },
            ];
          } else if (fieldDef.type === 'date') {
            orderOptions = [
              { value: 'asc', label: 'First to Last' },
              { value: 'desc', label: 'Last to First' },
            ];
          }
          return (
            <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded px-2 py-1">
              <select
                className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                value={sort.field}
                onChange={e => {
                  const updated = [...localSorts];
                  updated[idx] = { ...updated[idx], field: e.target.value };
                  setLocalSorts(updated);
                  console.log('[SortBar] Dropdown field changed:', e.target.value, updated);
                  onChange({ operator: localOperator, conditions: localFilters }, updated);
                }}
              >
                {FIELD_DEFS.map(f => (
                  <option key={f.name} value={f.name}>{f.label}</option>
                ))}
              </select>
              <select
                className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                value={sort.order}
                onChange={e => {
                  const updated = [...localSorts];
                  updated[idx] = { ...updated[idx], order: e.target.value as 'asc' | 'desc' };
                  setLocalSorts(updated);
                  console.log('[SortBar] Dropdown order changed:', e.target.value, updated);
                  onChange({ operator: localOperator, conditions: localFilters }, updated);
                }}
              >
                {orderOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                className="ml-1 text-xs text-gray-400 hover:text-red-500"
                onClick={() => handleRemoveSort(idx)}
                title="Remove sort"
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 self-start"
          onClick={handleAddSort}
        >
          + Add sort
        </button>
      </div>
    </div>
  );
} 