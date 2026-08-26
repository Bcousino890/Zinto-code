import { useMemo, useState, useEffect } from 'react';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';

export interface FlowVariable {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'contact' | 'message' | 'system' | 'flow' | 'captured' | 'observed' | 'custom';
  dataType?: string;
  nodeId?: string;
}


const BASE_VARIABLES: FlowVariable[] = [

  { value: 'contact.name', label: 'Contact Name', description: 'Full name of the contact', icon: null, category: 'contact' },
  { value: 'contact.phone', label: 'Contact Phone', description: 'Phone number of the contact', icon: null, category: 'contact' },
  { value: 'contact.email', label: 'Contact Email', description: 'Email address of the contact', icon: null, category: 'contact' },
  { value: 'contact.company', label: 'Contact Company', description: 'Company name of the contact', icon: null, category: 'contact' },


  { value: 'message.content', label: 'Message Content', description: 'Text content of the message', icon: null, category: 'message' },
  { value: 'message.type', label: 'Message Type', description: 'Type of message (text, image, etc.)', icon: null, category: 'message' },
  { value: 'message.timestamp', label: 'Message Timestamp', description: 'When the message was sent', icon: null, category: 'message' },


  { value: 'current.timestamp', label: 'Current Timestamp', description: 'Current date and time', icon: null, category: 'system' },
  { value: 'current.date', label: 'Current Date', description: 'Current date (YYYY-MM-DD)', icon: null, category: 'system' },
  { value: 'current.time', label: 'Current Time', description: 'Current time (HH:MM:SS)', icon: null, category: 'system' },


  { value: 'flow.result', label: 'Flow Result', description: 'Result from previous flow node', icon: null, category: 'flow' },
];

export const BASE_VARIABLE_VALUE_SET = new Set(BASE_VARIABLES.map((v) => v.value));

export function useFlowVariables(flowId?: number, customVariables?: FlowCustomVariable[]) {
  const [variables, setVariables] = useState<FlowVariable[]>(BASE_VARIABLES);
  const [capturedVariables, setCapturedVariables] = useState<FlowVariable[]>([]);
  const [fetchedServerCustomVariables, setFetchedServerCustomVariables] = useState<FlowVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variablesWithCustom = useMemo(() => {
    const baseKeys = new Set(BASE_VARIABLES.map((v) => v.value));
    const propNames = new Set((customVariables ?? []).map((v) => v.name));
    const fromProp: FlowVariable[] = (customVariables ?? []).map((v) => ({
      value: v.name,
      label: v.label,
      description: v.description ?? '',
      icon: null,
      category: 'custom' as const,
      dataType: v.dataType,
    }));
    const fromServer = fetchedServerCustomVariables.filter((v) => !propNames.has(v.value));
    const mergedCustom = [...fromProp, ...fromServer].filter((v) => !baseKeys.has(v.value));
    return [...variables, ...mergedCustom];
  }, [variables, customVariables, fetchedServerCustomVariables]);


  const fetchCapturedVariables = async () => {
    if (!flowId) return;

    setLoading(true);
    setError(null);

    try {

      const response = await fetch(`/api/flows/${flowId}/variables`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch flow variables');
      }

      const data = await response.json();
      
      const captured: FlowVariable[] = data.variables?.map((variable: any) => ({
        value: variable.variableKey,
        label: variable.label || variable.variableKey,
        description: variable.description || `Captured variable of type ${variable.variableType}`,
        icon: null,
        category: 'captured' as const,
        dataType: variable.variableType,
        nodeId: variable.nodeId
      })) || [];

      const observed: FlowVariable[] = (data.runtimeVariables || []).map((variable: any) => ({
        value: variable.variableKey,
        label: variable.label || variable.variableKey,
        description: variable.description || 'From a recent flow run',
        icon: null,
        category: 'observed' as const,
        dataType: variable.variableType,
        nodeId: variable.nodeId
      }));

      const baseKeys = new Set(BASE_VARIABLES.map((v) => v.value));
      const capturedKeys = new Set(captured.map((v) => v.value));
      const observedDeduped = observed.filter(
        (v) => !baseKeys.has(v.value) && !capturedKeys.has(v.value)
      );

      const serverCustom: FlowVariable[] = (data.customVariables ?? []).map((entry: any) => ({
        value: entry.variableKey,
        label: entry.label || entry.variableKey,
        description: entry.description ?? '',
        icon: null,
        category: 'custom' as const,
        dataType: entry.variableType,
      }));

      setFetchedServerCustomVariables(serverCustom);
      setCapturedVariables(captured);
      setVariables([...BASE_VARIABLES, ...captured, ...observedDeduped]);
    } catch (err) {
      setFetchedServerCustomVariables([]);
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching flow variables:', err);
    } finally {
      setLoading(false);
    }
  };


  const addCapturedVariable = (variable: Omit<FlowVariable, 'category'>) => {
    const capturedVar: FlowVariable = {
      ...variable,
      category: 'captured'
    };

    setCapturedVariables(prev => {
      const existing = prev.find(v => v.value === variable.value);
      if (existing) {

        return prev.map(v => v.value === variable.value ? capturedVar : v);
      } else {

        return [...prev, capturedVar];
      }
    });

    setVariables(prev => {
      const existing = prev.find(v => v.value === variable.value);
      if (existing) {
        return prev.map(v => v.value === variable.value ? capturedVar : v);
      } else {
        return [...prev, capturedVar];
      }
    });
  };


  const removeCapturedVariable = (variableKey: string) => {
    setCapturedVariables(prev => prev.filter(v => v.value !== variableKey));
    setVariables(prev => prev.filter(v => v.value !== variableKey || v.category !== 'captured'));
  };


  const getVariablesByCategory = (category: FlowVariable['category']) => {
    return variablesWithCustom.filter(v => v.category === category);
  };


  const getVariableKeys = () => {
    return variablesWithCustom.map(v => v.value);
  };


  const hasVariable = (variableKey: string) => {
    return variablesWithCustom.some(v => v.value === variableKey);
  };


  const getVariable = (variableKey: string) => {
    return variablesWithCustom.find(v => v.value === variableKey);
  };

  useEffect(() => {
    fetchCapturedVariables();
  }, [flowId]);

  return {
    variables: variablesWithCustom,
    capturedVariables,
    loading,
    error,
    fetchCapturedVariables,
    addCapturedVariable,
    removeCapturedVariable,
    getVariablesByCategory,
    getVariableKeys,
    hasVariable,
    getVariable
  };
}

export const getCategoryLabel = (category: FlowVariable['category']): string => {
  switch (category) {
    case 'contact': return 'Contact Information';
    case 'message': return 'Message Data';
    case 'system': return 'System Variables';
    case 'flow': return 'Flow Variables';
    case 'captured': return 'Captured Variables';
    case 'observed': return 'Recent run variables';
    case 'custom': return 'Custom Variables';
    default: return 'Other';
  }
};

export const getCategoryIcon = (category: FlowVariable['category']): string => {
  switch (category) {
    case 'contact': return '👤';
    case 'message': return '💬';
    case 'system': return '⚙️';
    case 'flow': return '🔄';
    case 'captured': return '📊';
    case 'observed': return '🔭';
    case 'custom': return '🔧';
    default: return '📝';
  }
};
