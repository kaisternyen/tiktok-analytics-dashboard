import React, { useState, useEffect } from 'react';

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

export default function VideoFilterSortBar({ filters, sorts, onChange }: VideoFilterSortBarProps) {
  const [localOperator, setLocalOperator] = useState<FilterOperator>(filters.operator || 'AND');
  const [localFilters, setLocalFilters] = useState<FilterCondition[]>(filters.conditions || []);
  const [localSorts, setLocalSorts] = useState<SortCondition[]>(sorts);

  // Sync localSorts with parent prop
  useEffect(() => {
    setLocalSorts(sorts);
    console.log('[SortBar] useEffect sync localSorts with parent:', sorts);
  }, [sorts]);

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

  const handleSortChange = (idx: number, key: keyof SortCondition, value: 'asc' | 'desc' | string) => {
    const updated = [...localSorts];
    updated[idx] = { ...updated[idx], [key]: value };
    setLocalSorts(updated);
    console.log('[SortBar] handleSortChange:', { idx, key, value, updated });
    onChange({ operator: localOperator, conditions: localFilters }, updated);
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

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-col gap-4">
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
          const fieldDef = FIELD_DEFS.find(f => f.name === filter.field) || FIELD_DEFS[0];
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
          return (
            <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded px-2 py-1">
              <select
                className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                value={filter.field}
                onChange={e => handleFilterChange(idx, 'field', e.target.value)}
              >
                {FIELD_DEFS.map(f => (
                  <option key={f.name} value={f.name}>{f.label}</option>
                ))}
              </select>
              <select
                className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                value={filter.operator}
                onChange={e => handleFilterChange(idx, 'operator', e.target.value)}
              >
                {ops.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
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