import React, { useState } from 'react';

// Define field types for the videos table
const FIELD_DEFS = [
  { name: 'username', label: 'Username', type: 'text' },
  { name: 'description', label: 'Description', type: 'text' },
  { name: 'status', label: 'Status', type: 'text' },
  { name: 'platform', label: 'Platform', type: 'text' },
  { name: 'views', label: 'Views', type: 'number' },
  { name: 'likes', label: 'Likes', type: 'number' },
  { name: 'comments', label: 'Comments', type: 'number' },
  { name: 'shares', label: 'Shares', type: 'number' },
  { name: 'posted', label: 'Posted', type: 'date' },
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

export type FilterCondition = {
  field: string;
  operator: string;
  value: string | number | null | [string, string] | [number, number];
};

export type SortCondition = {
  field: string;
  order: 'asc' | 'desc';
};

interface VideoFilterSortBarProps {
  filters: FilterCondition[];
  sorts: SortCondition[];
  onChange: (filters: FilterCondition[], sorts: SortCondition[]) => void;
}

export default function VideoFilterSortBar({ filters, sorts, onChange }: VideoFilterSortBarProps) {
  const [localFilters, setLocalFilters] = useState<FilterCondition[]>(filters);
  const [localSorts, setLocalSorts] = useState<SortCondition[]>(sorts);

  const handleFilterChange = (idx: number, key: keyof FilterCondition, value: string | number | null | [string, string] | [number, number]) => {
    const updated = [...localFilters];
    updated[idx] = { ...updated[idx], [key]: value };
    setLocalFilters(updated);
    onChange(updated, localSorts);
  };

  const handleAddFilter = () => {
    setLocalFilters([...localFilters, { field: 'username', operator: 'contains', value: '' }]);
  };

  const handleRemoveFilter = (idx: number) => {
    const updated = localFilters.filter((_, i) => i !== idx);
    setLocalFilters(updated);
    onChange(updated, localSorts);
  };

  const handleSortChange = (idx: number, key: keyof SortCondition, value: 'asc' | 'desc' | string) => {
    const updated = [...localSorts];
    updated[idx] = { ...updated[idx], [key]: value };
    setLocalSorts(updated);
    onChange(localFilters, updated);
  };

  const handleAddSort = () => {
    setLocalSorts([...localSorts, { field: 'createdAt', order: 'desc' }]);
  };

  const handleRemoveSort = (idx: number) => {
    const updated = localSorts.filter((_, i) => i !== idx);
    setLocalSorts(updated);
    onChange(localFilters, updated);
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-col gap-4">
      {/* Filter Bar */}
      <div className="flex flex-col gap-2">
        <span className="font-medium text-gray-700">Filter:</span>
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
                      value={Array.isArray(filter.value) ? String(filter.value[0] ?? '') : ''}
                      onChange={e => handleFilterChange(idx, 'value', [e.target.value, Array.isArray(filter.value) ? String(filter.value[1] ?? '') : ''])}
                    />
                    <span className="mx-1 text-xs">to</span>
                    <input
                      type="date"
                      className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                      value={Array.isArray(filter.value) ? String(filter.value[1] ?? '') : ''}
                      onChange={e => handleFilterChange(idx, 'value', [Array.isArray(filter.value) ? String(filter.value[0] ?? '') : '', e.target.value])}
                    />
                  </>
                ) : fieldDef.type === 'date' ? (
                  <input
                    type="date"
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'string' ? filter.value : ''}
                    onChange={e => handleFilterChange(idx, 'value', e.target.value)}
                  />
                ) : fieldDef.type === 'number' ? (
                  <input
                    type="number"
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'number' || typeof filter.value === 'string' ? filter.value : ''}
                    onChange={e => handleFilterChange(idx, 'value', e.target.value === '' ? null : Number(e.target.value))}
                  />
                ) : (
                  <input
                    type="text"
                    className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
                    value={typeof filter.value === 'string' ? filter.value : ''}
                    onChange={e => handleFilterChange(idx, 'value', e.target.value)}
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
        {localSorts.map((sort, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded px-2 py-1">
            <select
              className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
              value={sort.field}
              onChange={e => handleSortChange(idx, 'field', e.target.value)}
            >
              {FIELD_DEFS.map(f => (
                <option key={f.name} value={f.name}>{f.label}</option>
              ))}
            </select>
            <select
              className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white"
              value={sort.order}
              onChange={e => handleSortChange(idx, 'order', e.target.value as 'asc' | 'desc')}
            >
              <option value="asc">A → Z / 0 → 9</option>
              <option value="desc">Z → A / 9 → 0</option>
            </select>
            <button
              className="ml-1 text-xs text-gray-400 hover:text-red-500"
              onClick={() => handleRemoveSort(idx)}
              title="Remove sort"
            >
              ×
            </button>
          </div>
        ))}
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