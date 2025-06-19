"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { cn } from "../lib/utils";

type TimelinePreset = 'D' | 'W' | 'M' | '3M' | '1Y' | 'ALL' | 'CUSTOM' | '1H';

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

  // Helper function to get most recent complete hour
  const getMostRecentCompleteHour = () => {
    const now = getCurrentESTTime();
    const currentHour = now.getHours();
    const mostRecentHour = toZonedTime(now, 'America/New_York');
    mostRecentHour.setHours(currentHour, 0, 0, 0);
    return fromZonedTime(mostRecentHour, 'America/New_York');
  };

  // Calculate preset timeframes
  const getPresetTimeframe = (preset: TimelinePreset): [string, string] | null => {
    if (preset === 'ALL') return null;
    if (preset === 'CUSTOM') return null; // Custom will use the customRange
    
    const now = getCurrentESTTime();
    
    let startTime: Date;
    let endTime: Date;
    
    switch (preset) {
      case '1H':
        // Most recent complete hour (if it's 7:30, show 6:00-7:00)
        const currentHour = now.getHours();
        const previousHour = currentHour === 0 ? 23 : currentHour - 1;
        
        // Start of previous hour
        startTime = toZonedTime(now, 'America/New_York');
        startTime.setHours(previousHour, 0, 0, 0);
        startTime = fromZonedTime(startTime, 'America/New_York');
        
        // End of previous hour (start of current hour)
        endTime = toZonedTime(now, 'America/New_York');
        endTime.setHours(currentHour, 0, 0, 0);
        endTime = fromZonedTime(endTime, 'America/New_York');
        
        // If we're in the same day, use the times as calculated
        // If it's midnight (currentHour = 0), we need to go back to previous day
        if (currentHour === 0) {
          startTime = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);
        }
        
        return [startTime.toISOString(), endTime.toISOString()];
        
      case 'D':
        // Current day's midnight EST to most recent complete hour
        startTime = getESTMidnight(now);
        endTime = getMostRecentCompleteHour();
        break;
      case 'W':
        // Current time back to midnight EST 7 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        endTime = now;
        break;
      case 'M':
        // Current time back to midnight EST 30 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        endTime = now;
        break;
      case '3M':
        // Current time back to midnight EST 90 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
        endTime = now;
        break;
      case '1Y':
        // Current time back to midnight EST 365 days ago
        startTime = getESTMidnight(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
        endTime = now;
        break;
      default:
        return null;
    }
    
    return [startTime.toISOString(), endTime.toISOString()];
  };

  // Handle preset button clicks
  const handlePresetClick = (preset: TimelinePreset) => {
    setSelectedPreset(preset);
    
    if (preset === 'CUSTOM') {
      // Use the stored custom range if available, or don't change timeframe if none set
      if (customRange[0] && customRange[1]) {
        const startEST = fromZonedTime(customRange[0], 'America/New_York');
        const endEST = fromZonedTime(customRange[1], 'America/New_York');
        
        onChange([startEST.toISOString(), endEST.toISOString()]);
      }
      // Don't call onChange(null) here - let the user set their custom range
      return;
    }
    
    const newTimeframe = getPresetTimeframe(preset);
    onChange(newTimeframe);
  };

  // Handle advanced/custom range changes
  const handleAdvancedStartChange = (date: Date | null) => {
    if (selectedPreset === 'CUSTOM') {
      const newRange: [Date | null, Date | null] = [date, customRange[1]];
      setCustomRange(newRange);
      
      if (date && newRange[1]) {
        // Convert to EST and create timeframe with full time precision
        const startEST = fromZonedTime(date, 'America/New_York');
        const endEST = fromZonedTime(newRange[1], 'America/New_York');
        
        onChange([startEST.toISOString(), endEST.toISOString()]);
      }
    }
  };

  const handleAdvancedEndChange = (date: Date | null) => {
    if (selectedPreset === 'CUSTOM') {
      const newRange: [Date | null, Date | null] = [customRange[0], date];
      setCustomRange(newRange);
      
      if (newRange[0] && date) {
        // Convert to EST and create timeframe with full time precision
        const startEST = fromZonedTime(newRange[0], 'America/New_York');
        const endEST = fromZonedTime(date, 'America/New_York');
        
        onChange([startEST.toISOString(), endEST.toISOString()]);
      }
    }
  };

  // Detect if current timeframe matches a preset
  useEffect(() => {
    if (!timeframe) {
      setSelectedPreset('ALL');
      return;
    }

    // Calculate preset timeframes within useEffect to avoid dependency issues
    const getPresetTimeframeLocal = (preset: TimelinePreset): [string, string] | null => {
      if (preset === 'ALL') return null;
      if (preset === 'CUSTOM') return null; // Custom will use the customRange
      
      const now = getCurrentESTTime();
      
      let startTime: Date;
      let endTime: Date;
      
      switch (preset) {
        case '1H':
          // Most recent complete hour (if it's 7:30, show 6:00-7:00)
          const currentHour = now.getHours();
          const previousHour = currentHour === 0 ? 23 : currentHour - 1;
          
          // Start of previous hour
          startTime = toZonedTime(now, 'America/New_York');
          startTime.setHours(previousHour, 0, 0, 0);
          startTime = fromZonedTime(startTime, 'America/New_York');
          
          // End of previous hour (start of current hour)
          endTime = toZonedTime(now, 'America/New_York');
          endTime.setHours(currentHour, 0, 0, 0);
          endTime = fromZonedTime(endTime, 'America/New_York');
          
          // If we're in the same day, use the times as calculated
          // If it's midnight (currentHour = 0), we need to go back to previous day
          if (currentHour === 0) {
            startTime = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);
          }
          
          return [startTime.toISOString(), endTime.toISOString()];
          
        case 'D':
          // Current day's midnight EST to most recent complete hour
          startTime = getESTMidnight(now);
          endTime = getMostRecentCompleteHour();
          break;
        case 'W':
          // Current time back to midnight EST 7 days ago
          startTime = getESTMidnight(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
          endTime = now;
          break;
        case 'M':
          // Current time back to midnight EST 30 days ago
          startTime = getESTMidnight(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
          endTime = now;
          break;
        case '3M':
          // Current time back to midnight EST 90 days ago
          startTime = getESTMidnight(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
          endTime = now;
          break;
        case '1Y':
          // Current time back to midnight EST 365 days ago
          startTime = getESTMidnight(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
          endTime = now;
          break;
        default:
          return null;
      }
      
      return [startTime.toISOString(), endTime.toISOString()];
    };

    // Check if current timeframe matches any preset
    const presets: TimelinePreset[] = ['1H', 'D', 'W', 'M', '3M', '1Y'];
    
    for (const preset of presets) {
      const presetTimeframe = getPresetTimeframeLocal(preset);
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
    { key: '1H', label: '1H' },
    { key: 'D', label: 'D' },
    { key: 'W', label: 'W' },
    { key: 'M', label: 'M' },
    { key: '3M', label: '3M' },
    { key: '1Y', label: '1Y' },
    { key: 'ALL', label: 'ALL' },
    { key: 'CUSTOM', label: 'CUSTOM' },
  ];

  // Get display values for the advanced section
  const getAdvancedDisplayValues = (): [Date | null, Date | null] => {
    if (selectedPreset === 'CUSTOM') {
      return customRange;
    } else if (timeframe) {
      return [
        toZonedTime(new Date(timeframe[0]), 'America/New_York'),
        toZonedTime(new Date(timeframe[1]), 'America/New_York')
      ];
    }
    return [null, null];
  };

  const [advancedStart, advancedEnd] = getAdvancedDisplayValues();
  const isCustomMode = selectedPreset === 'CUSTOM';

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

      {/* Advanced Section - always visible, but readonly when not in custom mode */}
      <div className="h-10 flex items-center">
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
          {!isCustomMode && (
            <span className="text-sm text-muted-foreground font-medium">
              {selectedPreset === 'ALL' ? 'All time:' : `${selectedPreset}:`}
            </span>
          )}
          <span className="text-sm text-muted-foreground">From:</span>
          <DatePicker
            selected={advancedStart || undefined}
            onChange={handleAdvancedStartChange}
            showTimeSelect
            timeIntervals={60}
            timeCaption="Hour"
            dateFormat="MMM d, yyyy h aa"
            placeholderText="Start date/time"
            className={cn(
              "text-sm px-2 py-1 rounded border border-input bg-background w-40",
              !isCustomMode && "cursor-default bg-muted"
            )}
            popperPlacement="bottom-start"
            disabled={!isCustomMode}
            readOnly={!isCustomMode}
          />
          <span className="text-sm text-muted-foreground">To:</span>
          <DatePicker
            selected={advancedEnd || undefined}
            onChange={handleAdvancedEndChange}
            minDate={advancedStart || undefined}
            showTimeSelect
            timeIntervals={60}
            timeCaption="Hour"
            dateFormat="MMM d, yyyy h aa"
            placeholderText="End date/time"
            className={cn(
              "text-sm px-2 py-1 rounded border border-input bg-background w-40",
              !isCustomMode && "cursor-default bg-muted"
            )}
            popperPlacement="bottom-start"
            disabled={!isCustomMode}
            readOnly={!isCustomMode}
          />
          {isCustomMode && (advancedStart || advancedEnd) && (
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
      </div>
    </div>
  );
} 