"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { cn } from "../lib/utils";

type TimelinePreset = 'D' | 'W' | 'M' | '3M' | '1Y' | 'ALL' | 'CUSTOM';

interface TimelineFilterProps {
  timeframe: [string, string] | null;
  onChange: (timeframe: [string, string] | null) => void;
  className?: string;
}

export function TimelineFilter({ timeframe, onChange, className }: TimelineFilterProps) {
  const [selectedPreset, setSelectedPreset] = useState<TimelinePreset>('ALL');
  const [customRange, setCustomRange] = useState<[Date | null, Date | null]>([null, null]);

  // Helper function to get EST midnight
  const getESTMidnight = (date: Date) => {
    const estDate = toZonedTime(date, 'America/New_York');
    estDate.setHours(0, 0, 0, 0);
    return fromZonedTime(estDate, 'America/New_York');
  };

  // Helper function to get current time in EST
  const getCurrentESTTime = () => {
    return toZonedTime(new Date(), 'America/New_York');
  };

  // Calculate preset timeframes
  const getPresetTimeframe = (preset: TimelinePreset): [string, string] | null => {
    if (preset === 'ALL') return null;
    
    const now = getCurrentESTTime();
    const endTime = now.toISOString();
    
    let startTime: Date;
    
    switch (preset) {
      case 'D':
        // Current time back to midnight EST today
        startTime = getESTMidnight(now);
        break;
      case 'W':
        // Current time back to midnight EST 7 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        break;
      case 'M':
        // Current time back to midnight EST 30 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        break;
      case '3M':
        // Current time back to midnight EST 90 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
        break;
      case '1Y':
        // Current time back to midnight EST 365 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
        break;
      default:
        return null;
    }
    
    return [startTime.toISOString(), endTime];
  };

  // Handle preset button clicks
  const handlePresetClick = (preset: TimelinePreset) => {
    setSelectedPreset(preset);
    
    if (preset === 'CUSTOM') {
      // Don't change the timeframe, just show the custom range picker
      return;
    }
    
    const newTimeframe = getPresetTimeframe(preset);
    onChange(newTimeframe);
  };

  // Handle custom range changes
  const handleCustomStartChange = (date: Date | null) => {
    const newRange: [Date | null, Date | null] = [date, customRange[1]];
    setCustomRange(newRange);
    
    if (date && newRange[1]) {
      // Convert to EST and create timeframe
      const startEST = getESTMidnight(date);
      const endEST = toZonedTime(newRange[1], 'America/New_York');
      endEST.setHours(23, 59, 59, 999); // End of day
      const endESTIso = fromZonedTime(endEST, 'America/New_York');
      
      onChange([startEST.toISOString(), endESTIso.toISOString()]);
    }
  };

  const handleCustomEndChange = (date: Date | null) => {
    const newRange: [Date | null, Date | null] = [customRange[0], date];
    setCustomRange(newRange);
    
    if (newRange[0] && date) {
      // Convert to EST and create timeframe
      const startEST = getESTMidnight(newRange[0]);
      const endEST = toZonedTime(date, 'America/New_York');
      endEST.setHours(23, 59, 59, 999); // End of day
      const endESTIso = fromZonedTime(endEST, 'America/New_York');
      
      onChange([startEST.toISOString(), endESTIso.toISOString()]);
    }
  };

  // Detect if current timeframe matches a preset
  useEffect(() => {
    if (!timeframe) {
      setSelectedPreset('ALL');
      return;
    }

    // Check if current timeframe matches any preset
    const presets: TimelinePreset[] = ['D', 'W', 'M', '3M', '1Y'];
    
    for (const preset of presets) {
      const presetTimeframe = getPresetTimeframe(preset);
      if (presetTimeframe) {
        // Allow some tolerance (1 minute) for matching
        const startDiff = Math.abs(new Date(timeframe[0]).getTime() - new Date(presetTimeframe[0]).getTime());
        const endDiff = Math.abs(new Date(timeframe[1]).getTime() - new Date(presetTimeframe[1]).getTime());
        
        if (startDiff < 60000 && endDiff < 60000) {
          setSelectedPreset(preset);
          return;
        }
      }
    }
    
    // If no preset matches, it's a custom range
    setSelectedPreset('CUSTOM');
    if (timeframe) {
      setCustomRange([
        toZonedTime(new Date(timeframe[0]), 'America/New_York'),
        toZonedTime(new Date(timeframe[1]), 'America/New_York')
      ]);
    }
  }, [timeframe]);

  const presets: { key: TimelinePreset; label: string }[] = [
    { key: 'D', label: 'D' },
    { key: 'W', label: 'W' },
    { key: 'M', label: 'M' },
    { key: '3M', label: '3M' },
    { key: '1Y', label: '1Y' },
    { key: 'ALL', label: 'ALL' },
    { key: 'CUSTOM', label: 'CUSTOM' },
  ];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Preset Buttons - styled like the header navigation */}
      <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
        {presets.map((preset) => (
          <button
            key={preset.key}
            onClick={() => handlePresetClick(preset.key)}
            className={cn(
              "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50",
              selectedPreset === preset.key
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground hover:bg-background/50"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom Date Range Picker Container - fixed height to prevent layout shift */}
      <div className="h-10 flex items-center">
        {selectedPreset === 'CUSTOM' ? (
          <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
            <span className="text-sm text-muted-foreground">From:</span>
            <DatePicker
              selected={customRange[0] || undefined}
              onChange={handleCustomStartChange}
              selectsStart
              startDate={customRange[0] || undefined}
              endDate={customRange[1] || undefined}
              dateFormat="MMM d, yyyy"
              placeholderText="Start date"
              className="text-sm px-2 py-1 rounded border border-input bg-background w-32"
              popperPlacement="bottom-start"
            />
            <span className="text-sm text-muted-foreground">To:</span>
            <DatePicker
              selected={customRange[1] || undefined}
              onChange={handleCustomEndChange}
              selectsEnd
              startDate={customRange[0] || undefined}
              endDate={customRange[1] || undefined}
              minDate={customRange[0] || undefined}
              dateFormat="MMM d, yyyy"
              placeholderText="End date"
              className="text-sm px-2 py-1 rounded border border-input bg-background w-32"
              popperPlacement="bottom-start"
            />
            {(customRange[0] || customRange[1]) && (
              <button
                onClick={() => {
                  setCustomRange([null, null]);
                  onChange(null);
                  setSelectedPreset('ALL');
                }}
                className="text-sm text-muted-foreground hover:text-destructive"
                title="Clear custom range"
              >
                ×
              </button>
            )}
          </div>
        ) : (
          // Empty div to maintain space when not in custom mode
          <div></div>
        )}
      </div>
    </div>
  );
} 