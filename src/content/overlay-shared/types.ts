export interface ModeDef {
  id: string;
  label: string;
  hint?: string;
}

export interface RecordedEvent {
  id: number;
  action: string;   // 'hover' | 'click' | 'dblclick' | 'change' | 'select' | 'submit' | …
  selector: string; // rawSelector, fallback to tagName or '?'
}
