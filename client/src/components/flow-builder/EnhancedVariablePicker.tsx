import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Variable,
  User,
  MessageSquare,
  Settings,
  Workflow,
  Database,
  Loader2,
  RefreshCw,
  History,
  Wrench
} from 'lucide-react';
import { useFlowVariables, getCategoryLabel, getCategoryIcon, type FlowVariable } from '@/hooks/useFlowVariables';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';

interface EnhancedVariablePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  flowId?: number;
  customVariables?: FlowCustomVariable[];
  disabled?: boolean;
  /** When false, inserts the variable path only (e.g. contact.name). Default true inserts {{contact.name}} for templates. */
  wrapInBraces?: boolean;
  /** Optional className for the insert-variable trigger button (e.g. h-6 for compact rows). */
  pickerButtonClassName?: string;
  /** Use a textarea instead of a single-line input (e.g. JSON body). */
  multiline?: boolean;
}

const getCategoryIconComponent = (category: FlowVariable['category']) => {
  switch (category) {
    case 'contact': return <User className="w-3 h-3" />;
    case 'message': return <MessageSquare className="w-3 h-3" />;
    case 'system': return <Settings className="w-3 h-3" />;
    case 'flow': return <Workflow className="w-3 h-3" />;
    case 'captured': return <Database className="w-3 h-3" />;
    case 'observed': return <History className="w-3 h-3" />;
    case 'custom': return <Wrench className="w-3 h-3" />;
    default: return <Variable className="w-3 h-3" />;
  }
};

export function EnhancedVariablePicker({ 
  value, 
  onChange, 
  placeholder, 
  className, 
  flowId,
  customVariables,
  disabled = false,
  wrapInBraces = true,
  pickerButtonClassName,
  multiline = false
}: EnhancedVariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const {
    variables,
    capturedVariables,
    loading,
    error,
    fetchCapturedVariables,
    getVariablesByCategory
  } = useFlowVariables(flowId, customVariables);

  const filteredVariables = variables.filter(variable =>
    variable.label.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.value.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.description.toLowerCase().includes(searchValue.toLowerCase())
  );

  const groupedVariables = filteredVariables.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, FlowVariable[]>);

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleFieldSelect = (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    setCursorPosition(target.selectionStart || 0);
  };

  const insertVariable = (variableValue: string) => {
    const currentValue = value || '';
    const beforeCursor = currentValue.substring(0, cursorPosition);
    const afterCursor = currentValue.substring(cursorPosition);
    const insertion = wrapInBraces ? `{{${variableValue}}}` : variableValue;
    const newValue = `${beforeCursor}${insertion}${afterCursor}`;

    onChange(newValue);
    setOpen(false);

    setTimeout(() => {
      const el = multiline ? textareaRef.current : inputRef.current;
      if (el) {
        const newCursorPosition = beforeCursor.length + insertion.length;
        el.focus();
        el.setSelectionRange(newCursorPosition, newCursorPosition);
        setCursorPosition(newCursorPosition);
      }
    }, 0);
  };

  const handleRefresh = () => {
    fetchCapturedVariables();
  };

  return (
    <div className={cn('flex gap-2', multiline && 'items-start')}>
      {multiline ? (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleFieldChange}
          onSelect={handleFieldSelect}
          onKeyUp={handleFieldSelect}
          onClick={handleFieldSelect}
          placeholder={placeholder}
          className={cn('font-mono text-xs min-h-[200px] resize-y', className)}
          disabled={disabled}
        />
      ) : (
        <Input
          ref={inputRef}
          value={value}
          onChange={handleFieldChange}
          onSelect={handleFieldSelect}
          onKeyUp={handleFieldSelect}
          onClick={handleFieldSelect}
          placeholder={placeholder}
          className={cn('font-mono text-xs', className)}
          disabled={disabled}
        />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 px-2 flex items-center gap-1 shrink-0',
              pickerButtonClassName
            )}
            title="Insert variable"
            disabled={disabled}
          >
            <Variable className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <div className="flex items-center gap-2 p-2 border-b">
              <CommandInput
                placeholder="Search variables..."
                value={searchValue}
                onValueChange={setSearchValue}
                className="flex-1"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleRefresh}
                      disabled={loading}
                    >
                      {loading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Refresh captured variables</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <CommandList>
              <CommandEmpty>
                {error ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-red-600">Error loading variables</p>
                    <p className="text-xs text-muted-foreground">{error}</p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs">No variables found.</p>
                  </div>
                )}
              </CommandEmpty>

              {Object.entries(groupedVariables).map(([category, categoryVariables]) => (
                <CommandGroup
                  key={category}
                  heading={
                    <div className="flex items-center gap-2">
                      <span>{getCategoryIcon(category as FlowVariable['category'])}</span>
                      <span>{getCategoryLabel(category as FlowVariable['category'])}</span>
                      {(category === 'captured' || category === 'observed') && categoryVariables.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1">
                          {categoryVariables.length}
                        </Badge>
                      )}
                    </div>
                  }
                >
                  {categoryVariables.map((variable) => (
                    <CommandItem
                      key={variable.value}
                      value={variable.value}
                      onSelect={() => insertVariable(variable.value)}
                      className="flex items-center gap-3 p-3"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {getCategoryIconComponent(variable.category)}
                        <div className="flex-1">
                          <div className="font-medium text-xs">{variable.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {variable.description}
                          </div>
                          {variable.dataType && (
                            <div className="text-[10px] text-blue-600 font-mono">
                              {variable.dataType}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs font-mono">
                          {`{{${variable.value}}}`}
                        </Badge>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
